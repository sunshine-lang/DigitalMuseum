import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.domain.schemas import (
    ClaudeSessionCreate,
    ClaudeSessionImportOut,
    ClaudeSessionPreviewOut,
    CodexSessionCreate,
    CodexSessionImportOut,
    CodexSessionPreviewOut,
    CoverageOut,
    DataEnvelope,
    EventOut,
    GitImportOut,
    GitRepoCreate,
    GitRepoPreviewOut,
    HealthOut,
    MergeCreate,
    MergeOut,
    NoteImportOut,
    PhotoImportOut,
    ReviewCreate,
    SplitOut,
    StageCreate,
    StageOut,
    StageUpdate,
)
from app.services import (
    claude_session_evidence_service,
    codex_session_evidence_service,
    git_evidence_service,
    museum_service,
)
from app.services.note_parser import parse_note

ALLOWED_SUFFIXES = {".md": "text/markdown", ".txt": "text/plain"}
ALLOWED_DECLARED_MEDIA_TYPES = {
    ".md": {"text/markdown", "text/plain", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
}
PHOTO_SUFFIX_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}
PHOTO_DECLARED_MEDIA_TYPES = {
    ".jpg": {"image/jpeg", "image/jpg", "application/octet-stream"},
    ".jpeg": {"image/jpeg", "image/jpg", "application/octet-stream"},
    ".png": {"image/png", "application/octet-stream"},
}
KNOWN_BINARY_PREFIXES = (
    b"%PDF-",
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"GIF87a",
    b"GIF89a",
    b"PK\x03\x04",
    b"\x1f\x8b",
)
BLOB_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def create_api_router(session_provider) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    SessionDependency = Annotated[Session, Depends(session_provider)]
    FileDependency = Annotated[UploadFile, File()]

    @router.get("/health", response_model=DataEnvelope[HealthOut])
    def health() -> dict:
        return {"data": {"status": "ok", "phase": "phase-0-aggregation"}}

    @router.post("/stages", status_code=201, response_model=DataEnvelope[StageOut])
    def create_stage(
        payload: StageCreate,
        session: SessionDependency,
    ) -> dict:
        return {"data": museum_service.create_stage(session, payload)}

    @router.get("/stages", response_model=DataEnvelope[list[StageOut]])
    def stages(session: SessionDependency) -> dict:
        return {"data": museum_service.list_stages(session)}

    @router.get("/stages/{stage_id}", response_model=DataEnvelope[StageOut])
    def get_stage(stage_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.get_stage(session, stage_id)}

    @router.patch("/stages/{stage_id}", response_model=DataEnvelope[StageOut])
    def rename_stage(
        stage_id: str,
        payload: StageUpdate,
        session: SessionDependency,
    ) -> dict:
        return {"data": museum_service.rename_stage(session, stage_id, payload)}

    @router.delete("/stages/{stage_id}", response_model=DataEnvelope[dict])
    def delete_stage(stage_id: str, request: Request, session: SessionDependency) -> dict:
        museum_service.delete_stage(
            session,
            stage_id,
            upload_dir=request.app.state.settings.upload_dir,
        )
        return {"data": {"id": stage_id}}

    @router.get("/blobs/{sha256}")
    def get_blob_media(
        sha256: str,
        request: Request,
        session: SessionDependency,
    ) -> FileResponse:
        # 内容寻址只读端点：哈希严格 fail closed 校验（防路径穿越），文件路径
        # 只从 DB 的 relative_path 解析；无列举、无删除能力。
        if BLOB_SHA256_RE.fullmatch(sha256) is None:
            raise ApiError(422, "invalid_blob_id", "文件指纹必须是 64 位小写十六进制")
        path, media_type = museum_service.resolve_blob_media(
            session,
            sha256,
            request.app.state.settings.upload_dir,
        )
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    @router.post(
        "/stages/{stage_id}/notes",
        status_code=201,
        response_model=DataEnvelope[NoteImportOut],
    )
    async def import_note(
        stage_id: str,
        request: Request,
        file: FileDependency,
        session: SessionDependency,
    ) -> dict:
        museum_service.require_stage(session, stage_id)
        filename = _display_filename(file.filename)
        occurrence_id: str | None = None
        failure_step = "stored_locally"
        try:
            filename = _safe_filename(file.filename)
            suffix = Path(filename).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                raise ApiError(415, "unsupported_note_type", "只支持 Markdown 或 TXT 文件")

            declared_media_type = (file.content_type or "").split(";", 1)[0].strip().lower()
            if declared_media_type not in ALLOWED_DECLARED_MEDIA_TYPES[suffix]:
                raise ApiError(415, "invalid_note_media_type", "文件类型与笔记格式不匹配")

            max_upload_bytes: int = request.app.state.settings.max_upload_bytes
            content = await file.read(max_upload_bytes + 1)
            if len(content) > max_upload_bytes:
                raise ApiError(413, "note_too_large", "笔记文件超过当前上传上限")
            if content.startswith(KNOWN_BINARY_PREFIXES):
                raise ApiError(415, "invalid_note_content", "笔记必须是 UTF-8 纯文本")
            text = content.decode("utf-8")
            if _contains_disallowed_control(text):
                raise ApiError(415, "invalid_note_content", "笔记必须是 UTF-8 纯文本")

            occurrence = museum_service.start_note_import(
                session,
                stage_id=stage_id,
                original_filename=filename,
                media_type=ALLOWED_SUFFIXES[suffix],
                content=content,
                upload_dir=request.app.state.settings.upload_dir,
            )
            occurrence_id = occurrence.id
            failure_step = "parsed_locally"
            parsed = parse_note(text, filename)
            failure_step = "candidate_generated"
            result = museum_service.persist_note_candidate(
                session,
                occurrence_id=occurrence_id,
                parsed=parsed,
            )
        except UnicodeDecodeError as exc:
            error = ApiError(415, "invalid_note_content", "笔记必须是 UTF-8 纯文本")
            museum_service.record_failed_import(
                session,
                stage_id=stage_id,
                original_filename=filename,
                step=failure_step,
                error_code=error.code,
            )
            raise error from exc
        except ApiError as exc:
            if occurrence_id is None:
                museum_service.record_failed_import(
                    session,
                    stage_id=stage_id,
                    original_filename=filename,
                    step=failure_step,
                    error_code=exc.code,
                )
            else:
                museum_service.mark_import_failed(
                    session,
                    occurrence_id=occurrence_id,
                    step=failure_step,
                    error_code=exc.code,
                )
            raise
        return {"data": result}

    @router.get(
        "/git-repos/preview",
        response_model=DataEnvelope[GitRepoPreviewOut],
    )
    def preview_git_repo(request: Request, path: str = "") -> dict:
        # 十秒开馆冷启动：只读预览仓库的最早/最晚提交与数量，帮用户预填建馆
        # 表单。路径安全与只读约束与 git-evidence-v1 完全一致，且不落库。
        return {
            "data": git_evidence_service.preview_git_repository(
                path,
                allowed_roots=request.app.state.settings.allowed_repo_roots,
            )
        }

    @router.post(
        "/stages/{stage_id}/git-repos",
        status_code=201,
        response_model=DataEnvelope[GitImportOut],
    )
    def import_git_repo(
        stage_id: str,
        payload: GitRepoCreate,
        request: Request,
        session: SessionDependency,
    ) -> dict:
        return {
            "data": museum_service.import_git_evidence(
                session,
                stage_id=stage_id,
                repo_path=payload.path,
                upload_dir=request.app.state.settings.upload_dir,
                allowed_repo_roots=request.app.state.settings.allowed_repo_roots,
            )
        }

    @router.get(
        "/claude-sessions/preview",
        response_model=DataEnvelope[ClaudeSessionPreviewOut],
    )
    def preview_claude_sessions(request: Request, path: str = "") -> dict:
        # 只读预览项目的会话最早/最晚日期与数量，帮用户预填建馆表单。
        # 目录定位、解析与安全约束与 claude-code-evidence-v1 导入完全一致，不落库。
        return {
            "data": claude_session_evidence_service.preview_claude_sessions(
                path,
                allowed_roots=request.app.state.settings.allowed_repo_roots,
                projects_root=request.app.state.settings.claude_projects_root,
            )
        }

    @router.post(
        "/stages/{stage_id}/claude-sessions",
        status_code=201,
        response_model=DataEnvelope[ClaudeSessionImportOut],
    )
    def import_claude_sessions(
        stage_id: str,
        payload: ClaudeSessionCreate,
        request: Request,
        session: SessionDependency,
    ) -> dict:
        return {
            "data": museum_service.import_claude_sessions(
                session,
                stage_id=stage_id,
                path=payload.path,
                upload_dir=request.app.state.settings.upload_dir,
                allowed_repo_roots=request.app.state.settings.allowed_repo_roots,
                claude_projects_root=request.app.state.settings.claude_projects_root,
            )
        }

    @router.get(
        "/codex-sessions/preview",
        response_model=DataEnvelope[CodexSessionPreviewOut],
    )
    def preview_codex_sessions(request: Request, path: str = "") -> dict:
        # 只读预览项目全部 Codex 会话的最早/最晚日期与数量；解析与安全约束
        # 与 codex-evidence-v1 导入完全一致（含 subagent 线程排除），不落库。
        return {
            "data": codex_session_evidence_service.preview_codex_sessions(
                path,
                allowed_roots=request.app.state.settings.allowed_repo_roots,
                sessions_root=request.app.state.settings.codex_sessions_root,
            )
        }

    @router.post(
        "/stages/{stage_id}/codex-sessions",
        status_code=201,
        response_model=DataEnvelope[CodexSessionImportOut],
    )
    def import_codex_sessions(
        stage_id: str,
        payload: CodexSessionCreate,
        request: Request,
        session: SessionDependency,
    ) -> dict:
        return {
            "data": museum_service.import_codex_sessions(
                session,
                stage_id=stage_id,
                path=payload.path,
                upload_dir=request.app.state.settings.upload_dir,
                allowed_repo_roots=request.app.state.settings.allowed_repo_roots,
                codex_sessions_root=request.app.state.settings.codex_sessions_root,
            )
        }

    @router.post(
        "/stages/{stage_id}/photos",
        status_code=201,
        response_model=DataEnvelope[PhotoImportOut],
    )
    async def import_photo(
        stage_id: str,
        request: Request,
        file: FileDependency,
        session: SessionDependency,
    ) -> dict:
        museum_service.require_stage(session, stage_id)
        filename = _display_filename(file.filename)
        suffix = ""
        try:
            filename = _safe_filename(file.filename)
            suffix = Path(filename).suffix.lower()
            if suffix not in PHOTO_SUFFIX_MEDIA_TYPES:
                raise ApiError(415, "unsupported_photo_type", "只支持 JPEG 或 PNG 照片")

            declared_media_type = (file.content_type or "").split(";", 1)[0].strip().lower()
            if declared_media_type not in PHOTO_DECLARED_MEDIA_TYPES[suffix]:
                raise ApiError(415, "invalid_photo_media_type", "文件类型与照片格式不匹配")

            max_photo_bytes: int = request.app.state.settings.max_photo_bytes
            content = await file.read(max_photo_bytes + 1)
            if len(content) > max_photo_bytes:
                raise ApiError(413, "photo_too_large", "照片文件超过当前上传上限")
        except ApiError as exc:
            museum_service.record_failed_import(
                session,
                stage_id=stage_id,
                original_filename=filename,
                step="stored_locally",
                error_code=exc.code,
            )
            raise
        return {
            "data": museum_service.import_photo_evidence(
                session,
                stage_id=stage_id,
                filename=filename,
                media_type=PHOTO_SUFFIX_MEDIA_TYPES[suffix],
                content=content,
                upload_dir=request.app.state.settings.upload_dir,
            )
        }

    @router.get(
        "/stages/{stage_id}/coverage",
        response_model=DataEnvelope[list[CoverageOut]],
    )
    def coverage(stage_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.list_coverage(session, stage_id)}

    @router.get(
        "/stages/{stage_id}/events",
        response_model=DataEnvelope[list[EventOut]],
    )
    def events(stage_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.list_events(session, stage_id)}

    @router.get("/events/{event_id}", response_model=DataEnvelope[EventOut])
    def event(event_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.get_event(session, event_id)}

    @router.post("/events/{event_id}/reviews", response_model=DataEnvelope[EventOut])
    def review(
        event_id: str,
        payload: ReviewCreate,
        session: SessionDependency,
    ) -> dict:
        return {"data": museum_service.review_event(session, event_id, payload)}

    @router.post(
        "/stages/{stage_id}/events/merge",
        response_model=DataEnvelope[MergeOut],
    )
    def merge_events(
        stage_id: str,
        payload: MergeCreate,
        session: SessionDependency,
    ) -> dict:
        return {"data": museum_service.merge_events(session, stage_id, payload)}

    @router.post("/events/{event_id}/split", response_model=DataEnvelope[SplitOut])
    def split_event(event_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.split_event(session, event_id)}

    return router


def _safe_filename(raw_filename: str | None) -> str:
    if not raw_filename:
        raise ApiError(422, "missing_filename", "上传文件必须包含文件名")
    normalized = raw_filename.replace("\\", "/")
    filename = Path(normalized).name.strip()
    if filename != normalized or filename in {"", ".", ".."}:
        raise ApiError(422, "unsafe_filename", "文件名包含不安全路径")
    return filename[:255]


def _display_filename(raw_filename: str | None) -> str:
    if not raw_filename:
        return "未命名上传"
    filename = Path(raw_filename.replace("\\", "/")).name.strip()
    return (filename or "未命名上传")[:255]


def _contains_disallowed_control(text: str) -> bool:
    allowed = {"\n", "\r", "\t"}
    return any(
        character not in allowed and (ord(character) < 32 or 127 <= ord(character) <= 159)
        for character in text
    )
