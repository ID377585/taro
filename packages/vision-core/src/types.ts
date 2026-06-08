export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DetectionSource = "marker" | "mock" | "manual";

export interface DetectionCandidate {
  cardId: number;
  cardSlug: string;
  cardName: string;
  confidence: number;
  boundingBox: BoundingBox;
  source: DetectionSource;
  isValid: boolean;
  timestamp?: number;
}

export interface StabilityOptions {
  minStableFrames: number;
  minConfidence: number;
  maxPositionDrift: number;
}
