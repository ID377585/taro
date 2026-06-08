import { describe, expect, it } from "vitest";
import { shouldLockDetection } from "./stability";

const createHistory = (confidence = 0.9) =>
  Array.from({ length: 10 }, (_, index) => ({
    cardId: 0,
    cardSlug: "o-louco",
    cardName: "O Louco",
    confidence,
    boundingBox: { x: 100 + index % 2, y: 120, width: 200, height: 320 },
    source: "manual" as const,
    isValid: true,
    timestamp: index,
  }));

describe("shouldLockDetection", () => {
  it("locks when the same card is stable for enough frames", () => {
    expect(shouldLockDetection(createHistory())).toBe(true);
  });

  it("rejects unstable or low-confidence detections", () => {
    const unstable = createHistory().map((item, index) => ({
      ...item,
      cardSlug: index === 9 ? "o-mago" : item.cardSlug,
    }));
    expect(shouldLockDetection(unstable)).toBe(false);
    expect(shouldLockDetection(createHistory(0.4))).toBe(false);
  });
});
