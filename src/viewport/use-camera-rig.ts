import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { isPerspectiveCamera } from "../camera";
import { viewHeightForPerspective } from "./camera-math";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./default-views";
import { ZUpFrame, type ViewBasis, type WorldFrame } from "./world-frame";

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);

  const defaultViewRequestRef = useRef<DefaultViewId | null>(null);
  const initializedRef = useRef(false);
  const worldUnitsPerPixelRef = useRef<number>(1);

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      worldDirection: new Vector3(),
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
    controls.updateCameraUp();
  }, [scratch, worldFrame]);

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

      set({ camera: perspective });
      controls.camera = perspective;

      void controls.setLookAt(
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
    worldUnitsPerPixelRef,
    requestDefaultView,
    getWorldDirectionFromLocalDirection,
  };
}
