import asyncio
import base64
import math

import httpx

from config import settings
from models.schemas import ImageResult

YANDEX_SEARCH_URL = (
    "https://searchapi.api.cloud.yandex.net"
    "/v2/image/search_by_image"
)
PAGE_SIZE = 40  # fixed by Yandex API


class YandexImageSearchClient:
    def __init__(self) -> None:
        self._headers = {
            "Authorization": f"Api-Key {settings.yandex_api_key}",
            "Content-Type": "application/json",
        }

    async def search_by_url(
        self, image_url: str, site: str | None = None, limit: int = 20
    ) -> tuple[list[ImageResult], dict, dict]:
        payload: dict = {"folderId": settings.yandex_folder_id, "url": image_url}
        if site:
            payload["site"] = site
        return await self._call(payload, limit)

    async def search_by_file(
        self, image_bytes: bytes, site: str | None = None, limit: int = 20
    ) -> tuple[list[ImageResult], dict, dict]:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload: dict = {"folderId": settings.yandex_folder_id, "data": b64}
        if site:
            payload["site"] = site
        return await self._call(payload, limit)

    async def _call(self, payload: dict, limit: int = 20) -> tuple[list[ImageResult], dict, dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Always fetch page 0 first to learn maxPage
            first = await self._fetch_page(client, payload, page=0)
            first.raise_for_status()
            first_raw = first.json()

            max_page = int(first_raw.get("maxPage", 1))
            pages_needed = min(math.ceil(limit / PAGE_SIZE), max_page)

            # Fetch remaining pages in parallel if needed
            if pages_needed > 1:
                tasks = [
                    self._fetch_page(client, payload, page=p)
                    for p in range(1, pages_needed)
                ]
                responses = await asyncio.gather(*tasks)
                extra_images = [
                    img
                    for r in responses
                    for img in r.json().get("images", [])
                ]
            else:
                extra_images = []

        all_images = first_raw.get("images", []) + extra_images
        combined_raw = {**first_raw, "images": all_images, "pagesFetched": pages_needed}

        display_payload = {
            **payload,
            **({"data": payload["data"][:40] + "…"} if "data" in payload else {}),
        }
        return self._parse(all_images, limit), display_payload, combined_raw

    async def _fetch_page(
        self, client: httpx.AsyncClient, payload: dict, page: int
    ) -> httpx.Response:
        return await client.post(
            YANDEX_SEARCH_URL,
            json={**payload, "page": page},
            headers=self._headers,
        )

    def _parse(self, images: list, limit: int = 20) -> list[ImageResult]:
        results = []
        for item in images:
            image_url = item.get("url")
            results.append(
                ImageResult(
                    title=item.get("pageTitle", ""),
                    snippet=item.get("passage", ""),
                    source_url=item.get("pageUrl", ""),
                    thumbnail_url=image_url,
                    image_url=image_url,
                    domain=item.get("host"),
                )
            )
            if len(results) >= limit:
                break
        return results


yandex_client = YandexImageSearchClient()
