import type { DetectionCandidate, StabilityOptions } from "./types";

const DEFAULT_OPTIONS: StabilityOptions = {
  minStableFrames: 10,
  minConfidence: 0.75,
  maxPositionDrift: 24,
};

const hasStableBox = (history: DetectionCandidate[], maxPositionDrift: number) => {
  const reference = history[0]?.boundingBox;
  if (!reference) return false;
  return history.every(item => {
    const box = item.boundingBox;
    return (
      Math.abs(box.x - reference.x) <= maxPositionDrift &&
      Math.abs(box.y - reference.y) <= maxPositionDrift &&
      Math.abs(box.width - reference.width) <= maxPositionDrift &&
      Math.abs(box.height - reference.height) <= maxPositionDrift
    );
  });
};

export const shouldLockDetection = (
  history: DetectionCandidate[],
  options: Partial<StabilityOptions> = {},
) => {
  const finalOptions = { ...DEFAULT_OPTIONS, ...options };
  const recent = history.slice(-finalOptions.minStableFrames);
  if (recent.length < finalOptions.minStableFrames) return false;

  const cardSlug = recent[0]?.cardSlug;
  if (!cardSlug || !recent.every(item => item.cardSlug === cardSlug)) return false;

  const averageConfidence =
    recent.reduce((total, item) => total + item.confidence, 0) / recent.length;

  return (
    averageConfidence >= finalOptions.minConfidence &&
    hasStableBox(recent, finalOptions.maxPositionDrift)
  );
};
