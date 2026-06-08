import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import settings
from routes.search import router as search_router

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="Image Search API")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(search_router)

# Cache-busting token for static assets: newest mtime across CSS/JS. Changes on
# every edit/deploy, so the browser refetches; otherwise it can cache freely.
_STATIC_FILES = ("static/css/style.css", "static/js/main.js")


def _static_version() -> str:
    mtimes = []
    for path in _STATIC_FILES:
        try:
            mtimes.append(Path(path).stat().st_mtime_ns)
        except OSError:
            pass
    return str(max(mtimes)) if mtimes else "0"


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "index.html",
        {"root_path": settings.root_path, "static_version": _static_version()},
    )


@app.get("/health", response_class=JSONResponse)
async def health() -> dict:
    return {"status": "ok"}
