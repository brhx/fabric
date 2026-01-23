import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";

const scratch = {
  camPos: new Vector3(),
  forward: new Vector3(),
  toPlane: new Vector3(),
};

export function getOrthographicVisibleHeight(camera: OrthographicCamera) {
  return (camera.top - camera.bottom) / camera.zoom;
}

export function getOrthographicVisibleWidth(camera: OrthographicCamera) {
  return (camera.right - camera.left) / camera.zoom;
}

export function getPerspectiveViewSizeAtPlanePoint(
  camera: PerspectiveCamera,
  planePoint: Vector3,
) {
  camera.getWorldPosition(scratch.camPos);
  camera.getWorldDirection(scratch.forward);
  scratch.toPlane.subVectors(planePoint, scratch.camPos);
  const distance = scratch.toPlane.dot(scratch.forward);
  if (!Number.isFinite(distance) || distance <= 0) return null;

  const fovRad = MathUtils.degToRad(camera.fov);
  const height = 2 * distance * Math.tan(fovRad / 2);
  const width = height * camera.aspect;

  if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0)
    return null;

  return { distance, width, height };
}

export function syncOrthographicCameraFromPerspective(options: {
  perspective: PerspectiveCamera;
  orthographic: OrthographicCamera;
  target: Vector3;
}) {
  const { perspective, orthographic, target } = options;

  const viewSize = getPerspectiveViewSizeAtPlanePoint(perspective, target);
  if (!viewSize) return false;

  const halfW = viewSize.width / 2;
  const halfH = viewSize.height / 2;

  orthographic.left = -halfW;
  orthographic.right = halfW;
  orthographic.top = halfH;
  orthographic.bottom = -halfH;
  orthographic.zoom = 1;

  // Match the active camera pose so swapping projections is seamless.
  orthographic.position.copy(perspective.position);
  orthographic.quaternion.copy(perspective.quaternion);
  orthographic.up.copy(perspective.up);

  orthographic.updateProjectionMatrix();
  orthographic.updateMatrixWorld();

  return true;
}

export function syncPerspectiveCameraFromOrthographic(options: {
  orthographic: OrthographicCamera;
  perspective: PerspectiveCamera;
  target: Vector3;
  fovDeg: number;
}) {
  const { orthographic, perspective, target, fovDeg } = options;

  const visibleH = getOrthographicVisibleHeight(orthographic);
  if (!Number.isFinite(visibleH) || visibleH <= 0) return false;

  const fovRad = MathUtils.degToRad(fovDeg);
  const distance = visibleH / (2 * Math.tan(fovRad / 2));
  if (!Number.isFinite(distance) || distance <= 0) return false;

  // Match the active camera pose so swapping projections is seamless.
  perspective.fov = fovDeg;
  perspective.quaternion.copy(orthographic.quaternion);
  perspective.up.copy(orthographic.up);

  // Place the perspective camera so the plane through `target` perpendicular to the view
  // direction has the same visible height as the orthographic view.
  scratch.forward.set(0, 0, -1).applyQuaternion(perspective.quaternion).normalize();
  perspective.position.copy(target).addScaledVector(scratch.forward, -distance);

  perspective.updateProjectionMatrix();
  perspective.updateMatrixWorld();

  return true;
}

