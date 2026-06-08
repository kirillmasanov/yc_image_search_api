import asyncio
import base64
import math
import xml.etree.ElementTree as ET

import httpx

from config import settings
from models.schemas import ImageResult

YANDEX_SEARCH_URL = (
    "https://searchapi.api.cloud.yandex.net"
    "/v2/image/search_by_image"
)
YANDEX_TEXT_SEARCH_URL = (
    "https://searchapi.api.cloud.yandex.net"
    "/v2/image/search"
)
PAGE_SIZE = 40  # fixed by the search_by_image API
TEXT_PAGE_SIZE = 60  # docsOnPage max for the text search API (range 1–60)
DEFAULT_SEARCH_TYPE = "SEARCH_TYPE_RU"


class YandexImageSearchClient:
    def __init__(self) -> None:
        self._headers = {
            "Authorization": f"Api-Key {settings.yandex_api_key}",
            "Content-Type": "application/json",
        }

    async def search_by_url(
        self, image_url: str, site: str | None = None, limit: int = 20,
        family_mode: str | None = None,
    ) -> tuple[list[ImageResult], dict, dict]:
        payload: dict = {"folderId": settings.yandex_folder_id, "url": image_url}
        if family_mode:
            payload["familyMode"] = family_mode
        if site:
            payload["site"] = site
        return await self._call(payload, limit)

    async def search_by_file(
        self, image_bytes: bytes, site: str | None = None, limit: int = 20,
        family_mode: str | None = None,
    ) -> tuple[list[ImageResult], dict, dict]:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload: dict = {"folderId": settings.yandex_folder_id, "data": b64}
        if family_mode:
            payload["familyMode"] = family_mode
        if site:
            payload["site"] = site
        return await self._call(payload, limit)

    async def search_by_text(
        self,
        query_text: str,
        site: str | None = None,
        limit: int = 20,
        image_spec: dict | None = None,
        family_mode: str = "FAMILY_MODE_MODERATE",
        search_type: str = DEFAULT_SEARCH_TYPE,
        fix_typo_mode: str = "FIX_TYPO_MODE_ON",
    ) -> tuple[list[ImageResult], dict | list, dict]:
        docs_on_page = min(limit, TEXT_PAGE_SIZE)
        pages_needed = math.ceil(limit / docs_on_page)

        def build_payload(page: int) -> dict:
            payload: dict = {
                "query": {
                    "searchType": search_type,
                    "queryText": query_text,
                    "familyMode": family_mode,
                    "fixTypoMode": fix_typo_mode,
                    "page": page,
                },
                "docsOnPage": docs_on_page,
                "folderId": settings.yandex_folder_id,
            }
            if image_spec:
                payload["imageSpec"] = image_spec
            if site:
                payload["site"] = site
            return payload

        async with httpx.AsyncClient(timeout=30.0) as client:
            first = await client.post(
                YANDEX_TEXT_SEARCH_URL, json=build_payload(0), headers=self._headers
            )
            first.raise_for_status()
            first_xml = base64.b64decode(first.json()["rawData"])

            xml_pages = [first_xml]
            if pages_needed > 1:
                tasks = [
                    client.post(
                        YANDEX_TEXT_SEARCH_URL,
                        json=build_payload(p),
                        headers=self._headers,
                    )
                    for p in range(1, pages_needed)
                ]
                responses = await asyncio.gather(*tasks)
                for r in responses:
                    r.raise_for_status()
                    xml_pages.append(base64.b64decode(r.json()["rawData"]))

        results: list[ImageResult] = []
        for xml in xml_pages:
            results.extend(self._parse_xml(xml, limit))
            if len(results) >= limit:
                break
        results = results[:limit]

        pages_fetched = len(xml_pages)
        combined_xml = b"\n".join(xml_pages).decode("utf-8", errors="replace")
        response_raw = {"rawDataDecoded": combined_xml, "pagesFetched": pages_fetched}

        if pages_fetched == 1:
            display_payload: dict | list = build_payload(0)
        else:
            display_payload = [build_payload(p) for p in range(pages_fetched)]
        return results, display_payload, response_raw

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

        base = {
            **payload,
            **({"data": payload["data"][:40] + "…"} if "data" in payload else {}),
        }
        if pages_needed == 1:
            display_payload = {**base, "page": 0}
        else:
            display_payload = [
                {**base, "page": p} for p in range(pages_needed)
            ]
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

    def _parse_xml(self, xml_bytes: bytes, limit: int = 20) -> list[ImageResult]:
        root = ET.fromstring(xml_bytes)

        def text(parent: ET.Element | None, tag: str) -> str | None:
            if parent is None:
                return None
            el = parent.find(tag)
            return el.text if el is not None and el.text else None

        results: list[ImageResult] = []
        for doc in root.iterfind(".//results/grouping/group/doc"):
            props = doc.find("image-properties")
            page_url = text(props, "html-link") or text(doc, "url") or ""
            if page_url and not page_url.startswith(("http://", "https://")):
                page_url = "https://" + page_url
            results.append(
                ImageResult(
                    title=text(doc, "title") or "",
                    snippet=text(doc, "passages/passage") or "",
                    source_url=page_url,
                    thumbnail_url=text(props, "thumbnail-link") or text(doc, "url"),
                    image_url=text(doc, "url"),
                    domain=text(doc, "domain"),
                )
            )
            if len(results) >= limit:
                break
        return results


yandex_client = YandexImageSearchClient()
