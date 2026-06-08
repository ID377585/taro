import { describe, expect, it } from "vitest";
import markerMap from "./data/tarot-vision-mark-v2-map.json";
import { detectMockCard } from "./mockDetector";
import {
  decodeTarotVisionMark,
  decodeTarotVisionMarker,
  readTarotVisionMarkerBits,
  tarotVisionChecksum,
  type TarotVisionCardMetadata,
} from "./tarot-vision-mark";

const cards = markerMap as TarotVisionCardMetadata[];

describe("tarot vision marker decoding", () => {
  it("reads marker bits and decodes a valid card", () => {
    const card = cards[77];
    const bits = readTarotVisionMarkerBits(card.marker);
    const decoded = decodeTarotVisionMarker(card.marker);

    expect(bits.idBits).toEqual([1, 0, 0, 1, 1, 0, 1]);
    expect(decoded).toEqual({
      cardId: 77,
      groupId: 4,
      checksum: 15,
      expectedChecksum: 15,
      isValid: true,
    });
  });

  it("marks invalid checksum as not valid while reporting the expected value", () => {
    const decoded = decodeTarotVisionMark({
      idBits: [0, 0, 0, 0, 0, 0, 1],
      groupBits: [0, 0, 0],
      checksumBits: [0, 0, 0, 0],
    });

    expect(decoded.cardId).toBe(1);
    expect(decoded.checksum).toBe(0);
    expect(decoded.expectedChecksum).toBe(tarotVisionChecksum(1, 0));
    expect(decoded.isValid).toBe(false);
  });

  it("returns the new detection contract from the heuristic detector", () => {
    const [candidate] = detectMockCard("o-mago", { source: "mock" });

    expect(candidate).toMatchObject({
      cardId: 1,
      cardSlug: "o-mago",
      cardName: "O Mago",
      confidence: 0.91,
      source: "mock",
      isValid: true,
    });
    expect(candidate.boundingBox.width).toBeGreaterThan(0);
    expect(candidate.boundingBox.height).toBeGreaterThan(0);
  });
});
