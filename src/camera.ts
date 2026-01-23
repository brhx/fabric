import type { Camera, OrthographicCamera, PerspectiveCamera } from "three";

export function isPerspectiveCamera(
  camera: Camera | null | undefined,
): camera is PerspectiveCamera {
  return Boolean(camera && (camera as any).isPerspectiveCamera === true);
}

export function isOrthographicCamera(
  camera: Camera | null | undefined,
): camera is OrthographicCamera {
  return Boolean(camera && (camera as any).isOrthographicCamera === true);
}
