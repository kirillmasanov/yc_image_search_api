import base64

import httpx

from config import settings
from models.schemas import ImageResult

YANDEX_SEARCH_URL = (
    "https://searchapi.api.cloud.yandex.net"
    "/v2/image/search_by_image"
)


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
            response = await client.post(
                YANDEX_SEARCH_URL,
                json=payload,
                headers=self._headers,
            )
            response.raise_for_status()
            raw = response.json()
            # Truncate base64 data in displayed payload to keep it readable
            display_payload = {
                **payload,
                **({"data": payload["data"][:40] + "…"} if "data" in payload else {}),
            }
            return self._parse(raw, limit), display_payload, raw

    def _parse(self, data: dict, limit: int = 20) -> list[ImageResult]:
        results = []
        for item in data.get("images", []):
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
