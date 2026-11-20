from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("ryoko.errors")


class ProblemField(BaseModel):
    field: str
    code: str
    message: str


class ProblemException(Exception):
    def __init__(
        self,
        *,
        status: int,
        title: str,
        detail: str,
        type_slug: str = "problem",
        errors: list[ProblemField] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.title = title
        self.detail = detail
        self.type_slug = type_slug
        self.errors = errors or []
        self.headers = headers or {}


def problem_response(
    request: Request,
    *,
    status: int,
    title: str,
    detail: str,
    type_slug: str = "problem",
    errors: Iterable[ProblemField] | None = None,
    error_base_url: str = "https://api.ryuheirg.dev/errors",
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "req_unknown")
    body: dict[str, Any] = {
        "type": f"{error_base_url.rstrip('/')}/{type_slug}",
        "title": title,
        "status": status,
        "detail": detail,
        "instance": request.url.path,
        "request_id": request_id,
    }
    error_list = list(errors or [])
    if error_list:
        body["errors"] = [error.model_dump() for error in error_list]
    merged_headers = {"content-type": "application/problem+json"}
    if headers:
        merged_headers.update(headers)
    return JSONResponse(status_code=status, content=body, headers=merged_headers)


def _validation_errors(exc: RequestValidationError) -> list[ProblemField]:
    fields: list[ProblemField] = []
    for error in exc.errors():
        location = ".".join(
            str(part) for part in error.get("loc", ()) if part not in {"body", "query", "path"}
        )
        fields.append(
            ProblemField(
                field=location or "request",
                code=str(error.get("type", "invalid")),
                message=str(error.get("msg", "Valor inválido.")),
            )
        )
    return fields


def install_error_handlers(app: FastAPI, *, error_base_url: str) -> None:
    @app.exception_handler(ProblemException)
    async def handle_problem(request: Request, exc: ProblemException) -> JSONResponse:
        return problem_response(
            request,
            status=exc.status,
            title=exc.title,
            detail=exc.detail,
            type_slug=exc.type_slug,
            errors=exc.errors,
            error_base_url=error_base_url,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return problem_response(
            request,
            status=422,
            title="Validation error",
            detail="La solicitud contiene campos inválidos.",
            type_slug="validation",
            errors=_validation_errors(exc),
            error_base_url=error_base_url,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "La solicitud no se pudo completar."
        title = {
            400: "Bad request",
            401: "Unauthorized",
            403: "Forbidden",
            404: "Not found",
            405: "Method not allowed",
            409: "Conflict",
            429: "Too many requests",
        }.get(exc.status_code, "HTTP error")
        return problem_response(
            request,
            status=exc.status_code,
            title=title,
            detail=detail,
            type_slug=f"http-{exc.status_code}",
            error_base_url=error_base_url,
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_exception",
            extra={
                "request_id": getattr(request.state, "request_id", None),
                "path": request.url.path,
            },
        )
        return problem_response(
            request,
            status=500,
            title="Internal server error",
            detail="Ocurrió un error inesperado. Revisa el request_id en los logs.",
            type_slug="internal",
            error_base_url=error_base_url,
        )
