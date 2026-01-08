import type { Camera, PerspectiveCamera } from "three";

export function isPerspectiveCamera(camera: Camera | null | undefined): camera is PerspectiveCamera {
  return Boolean(camera && (camera as any).isPerspectiveCamera === true);
}
