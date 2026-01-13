import { MathUtils } from "three";

export function distanceForViewHeight(viewHeight: number, fovRad: number) {
  return viewHeight / (2 * Math.tan(fovRad / 2));
}

export function viewHeightForPerspective(distance: number, fovDeg: number) {
  return 2 * distance * Math.tan(MathUtils.degToRad(fovDeg) / 2);
}

export function fovDegForViewHeightAtDistance(
  viewHeight: number,
  distance: number,
) {
  const fovRad = 2 * Math.atan(viewHeight / (2 * distance));
  return MathUtils.radToDeg(fovRad);
}
