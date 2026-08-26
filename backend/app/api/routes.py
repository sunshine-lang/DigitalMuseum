import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.domain.schemas import (
    AgentSessionProjectOut,
    ArchiveSyncOut,
    CoverageOut,
    DataEnvelope,
    EventOut,
    HealthOut,
    ReviewCreate,
    StageCreate,
    StageOut,
    StageUpdate,
)
from app.services import (
    archive_service,
    claude_session_evidence_service,
    codex_session_evidence_service,
    museum_service,
)

ALLOWED_SUFFIXES = {".md": "text/markdown", ".txt": "text/plain"}
ALLOWED_DECLARED_MEDIA_TYPES = {
    ".md": {"text/markdown", "text/plain", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
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

    @router.get("/archive/export")
    def export_archive(request: Request, session: SessionDependency):
        # 整库只读快照（ZIP：archive.json + blobs/ 原文），本地下载留存，
        # 对抗阶段级联删除的不可逆丢失。
        zip_bytes = archive_service.export_archive(
            session, upload_dir=request.app.state.settings.upload_dir
        )
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="digital-museum-archive-{stamp}.zip"'
                )
            },
        )

    @router.post(
        "/archive/import",
        status_code=201,
    )
    async def import_archive(
        request: Request,
        file: FileDependency,
        session: SessionDependency,
    ) -> dict:
        # 恢复为全新数据：所有行换新 id，blob 按内容哈希校验后写回或复用，
        # 绝不覆盖或合并既有内容。
        if file.size is not None and file.size > archive_service.MAX_ARCHIVE_BYTES:
            raise ApiError(
                422, "archive_too_large", "备份文件超过 200 MiB 上限"
            )
        archive_bytes = await file.read()
        summary = archive_service.import_archive(
            session,
            archive_bytes,
            upload_dir=request.app.state.settings.upload_dir,
        )
        return {"data": summary}

    @router.post("/archive/sync", response_model=DataEnvelope[ArchiveSyncOut])
    def sync_archive(request: Request, session: SessionDependency) -> dict:
        # 档案库一键同步（ADR-0001）：只读扫描本机全部 Agent 会话项目，
        # source_key 内容寻址幂等 upsert——内容不变跳过、有变化换快照。
        return {
            "data": museum_service.sync_archive(
                session,
                upload_dir=request.app.state.settings.upload_dir,
                allowed_repo_roots=request.app.state.settings.allowed_repo_roots,
                claude_projects_root=request.app.state.settings.claude_projects_root,
                codex_sessions_root=request.app.state.settings.codex_sessions_root,
            )
        }

    @router.get("/archive/events", response_model=DataEnvelope[list[EventOut]])
    def archive_events(session: SessionDependency) -> dict:
        return {"data": museum_service.list_archive_events(session)}

    @router.get("/archive/coverage", response_model=DataEnvelope[list[CoverageOut]])
    def archive_coverage(session: SessionDependency) -> dict:
        return {"data": museum_service.list_coverage(session)}

    @router.delete("/archive", response_model=DataEnvelope[dict])
    def wipe_archive(request: Request, session: SessionDependency) -> dict:
        # 清空档案库是唯一的破坏性数据操作（ADR-0001）：删全部数据行并
        # 回收 blob 文件；阶段视图一并清除。
        return {
            "data": museum_service.wipe_archive(
                session, upload_dir=request.app.state.settings.upload_dir
            )
        }

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
    def delete_stage(stage_id: str, session: SessionDependency) -> dict:
        museum_service.delete_stage(session, stage_id)
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

    @router.get(
        "/claude-sessions/projects",
        response_model=DataEnvelope[list[AgentSessionProjectOut]],
    )
    def discover_claude_projects(request: Request) -> dict:
        # 发现面板：只读列举 projects 根下有会话文件的项目，不读会话内容。
        return {
            "data": claude_session_evidence_service.list_claude_projects(
                request.app.state.settings.claude_projects_root,
            )
        }

    @router.get(
        "/codex-sessions/projects",
        response_model=DataEnvelope[list[AgentSessionProjectOut]],
    )
    def discover_codex_projects(request: Request) -> dict:
        # 发现面板：只读全部 rollout 首行的项目归属（真人会话计数），不读正文。
        return {
            "data": codex_session_evidence_service.list_codex_projects(
                request.app.state.settings.codex_sessions_root,
            )
        }

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

    return router
