import time
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field


class DetectionRequest(BaseModel):
    image_base64: Optional[str] = None
    card_hint: Optional[str] = Field(default="o-louco")


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class DetectionCandidate(BaseModel):
    cardSlug: str
    confidence: float
    boundingBox: BoundingBox
    timestamp: int


app = FastAPI(title="Taro Vision Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "vision-service"}


@app.post("/detect", response_model=List[DetectionCandidate])
def detect(request: DetectionRequest):
    card_slug = request.card_hint or "o-louco"
    return [
        DetectionCandidate(
            cardSlug=card_slug,
            confidence=0.91,
            boundingBox=BoundingBox(x=120, y=80, width=220, height=340),
            timestamp=int(time.time() * 1000),
        )
    ]
