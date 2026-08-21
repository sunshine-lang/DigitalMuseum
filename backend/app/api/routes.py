from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.domain.schemas import (
    CoverageOut,
    DataEnvelope,
    EventOut,
    NoteImportOut,
    ReviewCreate,
    StageCreate,
    StageOut,
)
from app.services import museum_service
from app.services.note_parser import parse_note

ALLOWED_SUFFIXES = {".md": "text/markdown", ".markdown": "text/markdown", ".txt": "text/plain"}


def create_api_router(session_provider) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    SessionDependency = Annotated[Session, Depends(session_provider)]
    FileDependency = Annotated[UploadFile, File()]

    @router.get("/health")
    def health() -> dict:
        return {"data": {"status": "ok", "phase": "phase-0-note-tracer"}}

    @router.post("/stages", status_code=201, response_model=DataEnvelope[StageOut])
    def create_stage(
        payload: StageCreate,
        session: SessionDependency,
    ) -> dict:
        return {"data": museum_service.create_stage(session, payload)}

    @router.get("/stages/{stage_id}", response_model=DataEnvelope[StageOut])
    def get_stage(stage_id: str, session: SessionDependency) -> dict:
        return {"data": museum_service.get_stage(session, stage_id)}

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
        filename = _safe_filename(file.filename)
        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise ApiError(415, "unsupported_note_type", "只支持 Markdown 或 TXT 文件")

        max_upload_bytes: int = request.app.state.settings.max_upload_bytes
        content = await file.read(max_upload_bytes + 1)
        if len(content) > max_upload_bytes:
            raise ApiError(413, "note_too_large", "笔记文件超过当前 2 MiB 上限")
        if b"\x00" in content:
            raise ApiError(415, "invalid_note_content", "笔记必须是 UTF-8 纯文本")
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ApiError(415, "invalid_note_content", "笔记必须是 UTF-8 纯文本") from exc

        parsed = parse_note(text, filename)
        result = museum_service.persist_note_candidate(
            session,
            stage_id=stage_id,
            original_filename=filename,
            media_type=ALLOWED_SUFFIXES[suffix],
            content=content,
            parsed=parsed,
            upload_dir=request.app.state.settings.upload_dir,
        )
        return {"data": result}

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

    return router


def _safe_filename(raw_filename: str | None) -> str:
    if not raw_filename:
        raise ApiError(422, "missing_filename", "上传文件必须包含文件名")
    normalized = raw_filename.replace("\\", "/")
    filename = Path(normalized).name.strip()
    if filename != normalized or filename in {"", ".", ".."}:
        raise ApiError(422, "unsafe_filename", "文件名包含不安全路径")
    return filename[:255]
