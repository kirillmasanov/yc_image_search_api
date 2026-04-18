from pydantic import BaseModel
from typing import Optional


class ImageResult(BaseModel):
    title: str
    snippet: str
    source_url: str
    thumbnail_url: Optional[str] = None
    image_url: Optional[str] = None
    domain: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[ImageResult]
    total: int
    request_payload: dict
    response_raw: dict
