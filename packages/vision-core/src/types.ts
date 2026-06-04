export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionCandidate {
  cardSlug: string;
  confidence: number;
  boundingBox: BoundingBox;
  timestamp: number;
}

export interface StabilityOptions {
  minStableFrames: number;
  minConfidence: number;
  maxPositionDrift: number;
}
