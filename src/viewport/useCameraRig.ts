import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera } from "../camera";
import { distanceForViewHeight, viewHeightForPerspective } from "./cameraMath";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./defaultViews";
import { stabilizePoleDirection } from "./poleNudge";
import { ZUpFrame, type ViewBasis, type WorldFrame } from "./worldFrame";

const ORTHO_FRUSTUM_HEIGHT = 1;

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<OrthographicCamera | null>(null);

  const defaultViewRequestRef = useRef<DefaultViewId | null>(null);
  const initializedRef = useRef(false);
  const projectionModeRef = useRef<"perspective" | "orthographic">(
    "perspective",
  );
  const worldUnitsPerPixelRef = useRef<number>(1);

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      worldDirection: new Vector3(),
      viewVector: new Vector3(),
      viewBasis: {
        right: new Vector3(),
        up: new Vector3(),
        forward: new Vector3(),
      } satisfies ViewBasis,
    }),
    [],
  );

  const applyCameraUp = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.getTarget(scratch.target);
    worldFrame.getUpAt(scratch.target, scratch.worldDirection);
    if (scratch.worldDirection.lengthSq() === 0) return;
    scratch.worldDirection.normalize();

    controls.camera.up.copy(scratch.worldDirection);
    perspectiveCameraRef.current?.up.copy(scratch.worldDirection);
    orthographicCameraRef.current?.up.copy(scratch.worldDirection);
    controls.updateCameraUp();
  }, [scratch, worldFrame]);

  const syncOrthoFrustum = useCallback(
    (camera: OrthographicCamera) => {
      const viewportHeight = Math.max(1, size.height);
      const aspect = size.width / viewportHeight;
      const halfHeight = ORTHO_FRUSTUM_HEIGHT / 2;
      const halfWidth = halfHeight * aspect;

      if (
        camera.top !== halfHeight ||
        camera.bottom !== -halfHeight ||
        camera.left !== -halfWidth ||
        camera.right !== halfWidth
      ) {
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.updateProjectionMatrix();
      }
    },
    [size.height, size.width],
  );

  const setActiveCamera = useCallback(
    (nextCamera: PerspectiveCamera | OrthographicCamera) => {
      set({ camera: nextCamera });
      const controls = controlsRef.current;
      if (controls) controls.camera = nextCamera;
    },
    [set],
  );

  const applyDefaultView = useCallback(
    (viewId: DefaultViewId) => {
      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      if (!controls || !perspective) return false;

      const view = getDefaultView(viewId);

      controls.stop();

      scratch.target.set(...view.target);
      scratch.position.set(...view.position);

      const defaultRadius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(defaultRadius) || defaultRadius <= 0) return false;

      perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
      perspective.updateProjectionMatrix();

      projectionModeRef.current = "perspective";
      setActiveCamera(perspective);

      controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        false,
      );
      controls.update(0);

      applyCameraUp();
      invalidate();
      return true;
    },
    [applyCameraUp, invalidate, scratch, set],
  );

  const requestDefaultView = useCallback(
    (viewId?: DefaultViewId) => {
      defaultViewRequestRef.current = viewId ?? DEFAULT_VIEW_ID;
      invalidate();
    },
    [invalidate],
  );

  const enterOrthographicView = useCallback(
    (direction: [number, number, number]) => {
      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;
      if (!controls || !perspective || !orthographic) return false;

      controls.stop();

      controls.getTarget(scratch.target);
      controls.getPosition(scratch.position);

      const radius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(radius) || radius <= 0) return false;

      const viewHeight = viewHeightForPerspective(
        radius,
        perspective.fov ?? DEFAULT_PERSPECTIVE_FOV_DEG,
      );

      syncOrthoFrustum(orthographic);

      const orthoHeight = orthographic.top - orthographic.bottom;
      if (!Number.isFinite(orthoHeight) || orthoHeight <= 0) return false;
      if (!Number.isFinite(viewHeight) || viewHeight <= 0) return false;

      const nextZoom = orthoHeight / viewHeight;
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) return false;

      orthographic.zoom = nextZoom;
      orthographic.updateProjectionMatrix();

      orthographic.position.copy(scratch.position);
      orthographic.up.copy(perspective.up);
      orthographic.lookAt(scratch.target);

      scratch.worldDirection.set(...direction);
      if (scratch.worldDirection.lengthSq() === 0) {
        scratch.worldDirection.set(0, 0, 1);
      } else {
        scratch.worldDirection.normalize();
      }

      scratch.viewVector.copy(scratch.position).sub(scratch.target);
      stabilizePoleDirection({
        direction: scratch.worldDirection,
        up: controls.camera.up,
        viewVector: scratch.viewVector,
        poleThreshold: 0.98,
      });

      scratch.position
        .copy(scratch.target)
        .addScaledVector(scratch.worldDirection, radius);

      projectionModeRef.current = "orthographic";
      setActiveCamera(orthographic);
      applyCameraUp();

      controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        true,
      );
      controls.update(0);
      invalidate();
      return true;
    },
    [applyCameraUp, invalidate, scratch, setActiveCamera, syncOrthoFrustum],
  );

  const exitOrthographicView = useCallback(() => {
    const controls = controlsRef.current;
    const perspective = perspectiveCameraRef.current;
    const orthographic = orthographicCameraRef.current;
    if (!controls || !perspective || !orthographic) return false;

    if (projectionModeRef.current !== "orthographic") return false;

    controls.stop();

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

    const viewHeight =
      (orthographic.top - orthographic.bottom) / orthographic.zoom;
    if (!Number.isFinite(viewHeight) || viewHeight <= 0) return false;

    scratch.worldDirection.copy(scratch.position).sub(scratch.target);
    if (scratch.worldDirection.lengthSq() === 0) {
      scratch.worldDirection.set(0, 0, 1);
    } else {
      scratch.worldDirection.normalize();
    }

    const fovRad = (perspective.fov * Math.PI) / 180;
    const distance = distanceForViewHeight(viewHeight, fovRad);
    if (!Number.isFinite(distance) || distance <= 0) return false;

    scratch.position
      .copy(scratch.target)
      .addScaledVector(scratch.worldDirection, distance);

    projectionModeRef.current = "perspective";
    setActiveCamera(perspective);
    applyCameraUp();

    controls.setLookAt(
      scratch.position.x,
      scratch.position.y,
      scratch.position.z,
      scratch.target.x,
      scratch.target.y,
      scratch.target.z,
      false,
    );
    controls.update(0);
    invalidate();
    return true;
  }, [applyCameraUp, invalidate, scratch, setActiveCamera]);

  const handleOrbitInput = useCallback(
    (azimuthRadians: number, polarRadians: number) => {
      if (projectionModeRef.current !== "orthographic") return false;
      const handled = exitOrthographicView();
      const controls = controlsRef.current;
      if (!controls || !handled) return true;
      controls.rotate(azimuthRadians, polarRadians, false);
      invalidate();
      return true;
    },
    [exitOrthographicView, invalidate],
  );

  const handleRotateAroundUp = useCallback(
    (radians: number) => {
      if (projectionModeRef.current !== "orthographic") return false;
      const handled = exitOrthographicView();
      const controls = controlsRef.current;
      if (!controls || !handled) return true;
      controls.rotate(radians, 0, true);
      invalidate();
      return true;
    },
    [exitOrthographicView, invalidate],
  );

  const getWorldDirectionFromLocalDirection = useCallback(
    (localDirection: [number, number, number]): [number, number, number] => {
      const controls = controlsRef.current;
      if (!controls) return [0, 0, 1];

      controls.getTarget(scratch.target);
      worldFrame.getBasisAt(scratch.target, scratch.viewBasis);

      scratch.worldDirection
        .copy(scratch.viewBasis.right)
        .multiplyScalar(localDirection[0])
        .addScaledVector(scratch.viewBasis.up, localDirection[1])
        .addScaledVector(scratch.viewBasis.forward, localDirection[2]);

      if (scratch.worldDirection.lengthSq() === 0)
        scratch.worldDirection.copy(scratch.viewBasis.up);
      scratch.worldDirection.normalize();
      return [
        scratch.worldDirection.x,
        scratch.worldDirection.y,
        scratch.worldDirection.z,
      ];
    },
    [scratch, worldFrame],
  );

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!initializedRef.current) {
      const applied = applyDefaultView(DEFAULT_VIEW_ID);
      if (applied) {
        initializedRef.current = true;
      }
      return;
    }

    const viewportHeightPx = Math.max(1, size.height);
    const orthographic = orthographicCameraRef.current;
    if (orthographic) syncOrthoFrustum(orthographic);
    if (isPerspectiveCamera(controls.camera)) {
      controls.getPosition(scratch.position);
      controls.getTarget(scratch.target);
      const distance = scratch.position.distanceTo(scratch.target);
      if (Number.isFinite(distance) && distance > 0) {
        const nextUnitsPerPixel =
          viewHeightForPerspective(distance, controls.camera.fov) /
          viewportHeightPx;
        if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
          worldUnitsPerPixelRef.current = nextUnitsPerPixel;
        }
      }
    } else if (isOrthographicCamera(controls.camera)) {
      const viewHeight =
        (controls.camera.top - controls.camera.bottom) / controls.camera.zoom;
      if (Number.isFinite(viewHeight) && viewHeight > 0) {
        const nextUnitsPerPixel = viewHeight / viewportHeightPx;
        if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
          worldUnitsPerPixelRef.current = nextUnitsPerPixel;
        }
      }
    }

    const defaultViewId = defaultViewRequestRef.current;
    if (defaultViewId) {
      const applied = applyDefaultView(defaultViewId);
      if (applied) {
        defaultViewRequestRef.current = null;
      }
    }
  }, -3);

  return {
    worldFrame,
    controlsRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    worldUnitsPerPixelRef,
    requestDefaultView,
    getWorldDirectionFromLocalDirection,
    enterOrthographicView,
    exitOrthographicView,
    handleOrbitInput,
    handleRotateAroundUp,
  };
}
