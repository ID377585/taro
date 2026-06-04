import markerMap from "../data/tarot_vision_mark_v2_map.json";
import type { DetectionCandidate } from "./types";

export const detectMockCard = (cardSlug = "o-louco"): DetectionCandidate[] => {
  const fallbackCard = markerMap.cards[0];
  const matched =
    markerMap.cards.find(item => item.title_pt.toLowerCase().replace(/\s+/g, "-") === cardSlug) ??
    fallbackCard;

  return [
    {
      cardSlug,
      confidence: 0.91,
      boundingBox: {
        x: matched.marker.bbox_px[0],
        y: matched.marker.bbox_px[1],
        width: matched.marker.bbox_px[2] - matched.marker.bbox_px[0],
        height: matched.marker.bbox_px[3] - matched.marker.bbox_px[1],
      },
      timestamp: Date.now(),
    },
  ];
};
