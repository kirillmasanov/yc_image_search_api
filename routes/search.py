import ipaddress
import logging
import socket
from typing import Optional
from urllib.parse import unquote, urljoin, urlparse

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from models.schemas import SearchResponse
from services.yandex_search import yandex_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Yandex caps the base64 `data` field at 3_145_728 chars (~2.25 MB raw). Keep a
# margin below that so the base64-encoded payload stays within the API limit.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB


def _normalize_site(site: Optional[str]) -> str | None:
    if site and site.strip():
        s = site.strip().removeprefix("https://").removeprefix("http://").split("/")[0]
        return s or None
    return None


async def _run_search(coro) -> SearchResponse:
    """Await a yandex_client search coroutine and map errors to HTTP responses."""
    try:
        results, req_payload, resp_raw = await coro
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

    return SearchResponse(
        results=results, total=len(results), request_payload=req_payload, response_raw=resp_raw
    )


@router.post("/search", response_model=SearchResponse)
async def search_images(
    file: Optional[UploadFile] = File(default=None),
    url: Optional[str] = Form(default=None),
    site: Optional[str] = Form(default=None),
    limit: int = Form(default=20, ge=1, le=500),
    family: str = Form(default="FAMILY_MODE_MODERATE"),
) -> SearchResponse:
    if file is None and not url:
        raise HTTPException(422, "Укажите файл или URL изображения.")
    if file is not None and url:
        raise HTTPException(422, "Укажите файл ИЛИ URL, но не оба.")

    normalized_site = _normalize_site(site)

    if file is not None:
        image_bytes = await file.read()
        if len(image_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Файл слишком большой (макс. 2 МБ).")
        return await _run_search(
            yandex_client.search_by_file(image_bytes, normalized_site, limit, family_mode=family)
        )
    return await _run_search(
        yandex_client.search_by_url(url.strip(), normalized_site, limit, family_mode=family)  # type: ignore[union-attr]
    )


@router.post("/search/text", response_model=SearchResponse)
async def search_images_by_text(
    query: str = Form(...),
    site: Optional[str] = Form(default=None),
    limit: int = Form(default=20, ge=1, le=500),
    img_format: Optional[str] = Form(default=None),
    img_size: Optional[str] = Form(default=None),
    img_orientation: Optional[str] = Form(default=None),
    img_color: Optional[str] = Form(default=None),
    family: str = Form(default="FAMILY_MODE_MODERATE"),
    search_type: str = Form(default="SEARCH_TYPE_RU"),
    fix_typo: str = Form(default="FIX_TYPO_MODE_ON"),
) -> SearchResponse:
    query_text = query.strip()
    if not query_text:
        raise HTTPException(422, "Укажите текстовый запрос.")
    if len(query_text) > 400:
        raise HTTPException(422, "Запрос слишком длинный (макс. 400 символов).")

    image_spec = {
        key: value
        for key, value in (
            ("format", img_format),
            ("size", img_size),
            ("orientation", img_orientation),
            ("color", img_color),
        )
        if value and value.strip()
    }

    return await _run_search(
        yandex_client.search_by_text(
            query_text,
            site=_normalize_site(site),
            limit=limit,
            image_spec=image_spec or None,
            family_mode=family,
            search_type=search_type,
            fix_typo_mode=fix_typo,
        )
    )


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


_BASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "ru,en;q=0.9",
}


_MAX_REDIRECTS = 3


def _is_safe_target(url: str) -> bool:
    """Reject non-http(s) URLs and any host resolving to a private/internal address.

    Guards the proxy against SSRF: localhost, loopback, link-local (cloud metadata
    at 169.254.169.254), private ranges, and other reserved/non-routable addresses.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False

    host = parsed.hostname
    addrs: list[str] = []
    try:
        # IP literal — check directly without DNS.
        ipaddress.ip_address(host)
        addrs = [host]
    except ValueError:
        try:
            addrs = [info[4][0] for info in socket.getaddrinfo(host, None)]
        except socket.gaierror:
            return False

    for addr in addrs:
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


async def _fetch_image(client: httpx.AsyncClient, image_url: str, referer: str | None) -> httpx.Response | None:
    """Fetch an image, following redirects manually so each hop is SSRF-validated."""
    headers = dict(_BASE_HEADERS)
    if referer:
        headers["Referer"] = referer

    current = image_url
    try:
        for _ in range(_MAX_REDIRECTS + 1):
            if not _is_safe_target(current):
                logger.warning("proxy: blocked unsafe target %s", current)
                return None
            response = await client.get(current, headers=headers)
            if response.is_redirect and "location" in response.headers:
                current = urljoin(current, response.headers["location"])
                continue
            response.raise_for_status()
            if not response.headers.get("content-type", "").startswith("image/"):
                logger.debug("proxy: non-image content-type for %s", current)
                return None
            return response
        logger.warning("proxy: too many redirects for %s", image_url)
        return None
    except httpx.HTTPError as exc:
        logger.debug("proxy: fetch failed for %s: %s", current, exc)
        return None


@router.get("/proxy")
async def proxy_image(
    url: str = Query(...),
    ref: Optional[str] = Query(default=None),
) -> StreamingResponse:
    image_url = unquote(url)
    ref_url = unquote(ref) if ref else None

    parsed = urlparse(image_url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "URL должен использовать http или https.")
    origin = f"{parsed.scheme}://{parsed.netloc}/"

    candidates: list[str | None] = []
    if ref_url:
        candidates.append(ref_url)
    if origin not in candidates:
        candidates.append(origin)
    candidates.append(None)

    # follow_redirects=False: redirects are followed manually in _fetch_image so
    # every hop passes the SSRF check (a public URL could redirect to an internal one).
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        for referer in candidates:
            response = await _fetch_image(client, image_url, referer)
            if response is not None:
                return StreamingResponse(
                    iter([response.content]),
                    media_type=response.headers.get("content-type", "image/jpeg"),
                )

    logger.warning("proxy: all candidates failed for %s", image_url)
    return StreamingResponse(iter([_PLACEHOLDER_SVG]), media_type="image/svg+xml")
