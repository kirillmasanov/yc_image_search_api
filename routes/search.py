from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from models.schemas import SearchResponse
from services.yandex_search import yandex_client

router = APIRouter(prefix="/api")

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/search", response_model=SearchResponse)
async def search_images(
    file: Optional[UploadFile] = File(default=None),
    url: Optional[str] = Form(default=None),
    site: Optional[str] = Form(default=None),
    limit: int = Form(default=20, ge=1, le=100),
) -> SearchResponse:
    if file is None and not url:
        raise HTTPException(422, "Укажите файл или URL изображения.")
    if file is not None and url:
        raise HTTPException(422, "Укажите файл ИЛИ URL, но не оба.")

    normalized_site: str | None = None
    if site and site.strip():
        s = site.strip().removeprefix("https://").removeprefix("http://").split("/")[0]
        normalized_site = s or None

    try:
        if file is not None:
            image_bytes = await file.read()
            if len(image_bytes) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "Файл слишком большой (макс. 20 МБ).")
            results, req_payload, resp_raw = await yandex_client.search_by_file(image_bytes, normalized_site, limit)
        else:
            results, req_payload, resp_raw = await yandex_client.search_by_url(url.strip(), normalized_site, limit)  # type: ignore[union-attr]
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get("message", str(exc))
        except Exception:
            detail = str(exc)
        raise HTTPException(exc.response.status_code, detail)
    except httpx.RequestError as exc:
        raise HTTPException(503, f"Сетевая ошибка: {exc}")

    return SearchResponse(results=results, total=len(results), request_payload=req_payload, response_raw=resp_raw)


_PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">'
    '<rect width="400" height="300" fill="#eef0f3"/>'
    '<g opacity=".4" transform="translate(160,100)">'
    '<rect x="0" y="20" width="80" height="60" rx="4" fill="none" stroke="#aab" stroke-width="4"/>'
    '<circle cx="22" cy="38" r="8" fill="#aab"/>'
    '<polyline points="0,80 28,52 52,68 68,48 80,60" fill="none" stroke="#aab" stroke-width="4"/>'
    '</g>'
    '</svg>'
).encode()


@router.get("/proxy")
async def proxy_image(url: str = Query(...)) -> StreamingResponse:
    image_url = unquote(url)
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            response = await client.get(
                image_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                return StreamingResponse(iter([_PLACEHOLDER_SVG]), media_type="image/svg+xml")
    except Exception:
        return StreamingResponse(iter([_PLACEHOLDER_SVG]), media_type="image/svg+xml")

    return StreamingResponse(iter([response.content]), media_type=content_type)
