from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import create_api_router
from app.core.config import Settings
from app.core.database import (
    create_database_engine,
    create_session_factory,
    run_migrations,
    session_dependency,
)
from app.core.errors import ApiError


def create_app(
    *,
    database_url: str | None = None,
    upload_dir: Path | None = None,
    allowed_repo_roots: str | None = None,
    claude_projects_root: str | None = None,
    codex_sessions_root: str | None = None,
    pi_sessions_root: str | None = None,
    dsh_sessions_root: str | None = None,
) -> FastAPI:
    overrides = {
        key: value
        for key, value in {
            "database_url": database_url,
            "upload_dir": upload_dir,
            "allowed_repo_roots": allowed_repo_roots,
            "claude_projects_root": claude_projects_root,
            "codex_sessions_root": codex_sessions_root,
            "pi_sessions_root": pi_sessions_root,
            "dsh_sessions_root": dsh_sessions_root,
        }.items()
        if value is not None
    }
    settings = Settings(**overrides)
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        settings.upload_dir.mkdir(parents=True, exist_ok=True)
        run_migrations(settings.database_url)
        yield
        engine.dispose()

    app = FastAPI(
        title="Digital Museum Phase 0 API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_request",
                    "message": "请求内容不符合接口要求",
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "route_not_found",
                        "message": "没有找到这个接口",
                    }
                },
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": "http_error",
                    "message": "请求无法完成",
                }
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "服务暂时无法完成请求",
                }
            },
        )

    app.include_router(create_api_router(session_dependency(session_factory)))
    return app


app = create_app()
