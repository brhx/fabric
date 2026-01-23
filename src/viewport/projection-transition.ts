import { MathUtils } from "three";
import { distanceForViewHeight, fovDegForViewHeightAtDistance } from "./camera-math";

export function easeInOutCubic(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function solvePerspectiveDistanceForViewHeight(options: {
  viewHeight: number;
  fovDeg: number;
  minDistance: number;
  maxDistance: number;
}) {
  const { viewHeight, fovDeg, minDistance, maxDistance } = options;

  if (!Number.isFinite(viewHeight) || viewHeight <= 0) return null;
  if (!Number.isFinite(fovDeg) || fovDeg <= 0) return null;

  const distanceUnclamped = distanceForViewHeight(
    viewHeight,
    MathUtils.degToRad(fovDeg),
  );
  if (!Number.isFinite(distanceUnclamped) || distanceUnclamped <= 0) return null;

  const distance = MathUtils.clamp(distanceUnclamped, minDistance, maxDistance);
  if (!Number.isFinite(distance) || distance <= 0) return null;

  const fov =
    distance === distanceUnclamped ? fovDeg : fovDegForViewHeightAtDistance(viewHeight, distance);

  if (!Number.isFinite(fov) || fov <= 0) return null;

  return { distance, fovDeg: fov };
}

