import markerMapJson from "./data/tarot-vision-mark-v2-map.json";
import {
  decodeTarotVisionMarker,
  findTarotVisionCardByDecodedMark,
  findTarotVisionCardBySlug,
  type TarotVisionCardMetadata,
} from "./tarot-vision-mark";
import type { DetectionCandidate, DetectionSource } from "./types";

const markerMap = markerMapJson as TarotVisionCardMetadata[];

const markerBoxToBoundingBox = (bbox: [number, number, number, number]) => ({
  x: bbox[0],
  y: bbox[1],
  width: bbox[2] - bbox[0],
  height: bbox[3] - bbox[1],
});

export const getTarotVisionMarkerMap = () => markerMap;

export const getTarotVisionCardBySlug = (cardSlug: string) =>
  findTarotVisionCardBySlug(markerMap, cardSlug);

export const detectMockCard = (
  cardSlug = "o-louco",
  options: { source?: DetectionSource; confidence?: number } = {},
): DetectionCandidate[] => {
  const fallbackCard = markerMap[0];
  if (!fallbackCard) return [];

  const matched = getTarotVisionCardBySlug(cardSlug) ?? fallbackCard;
  const decoded = decodeTarotVisionMarker(matched.marker);
  const card = findTarotVisionCardByDecodedMark(markerMap, decoded) ?? matched;
  const bbox = matched.marker.bbox_px ?? [0, 0, 1, 1];

  return [
    {
      cardId: decoded.cardId,
      cardSlug: card.slug,
      cardName: card.title,
      confidence: options.confidence ?? 0.91,
      boundingBox: markerBoxToBoundingBox(bbox),
      source: options.source ?? "mock",
      isValid: decoded.isValid && card.id === decoded.cardId,
      timestamp: Date.now(),
    },
  ];
};
