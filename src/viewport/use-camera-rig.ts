import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  Vector3,
} from "three";
import { isOrthographicCamera, isPerspectiveCamera } from "../camera";
import { stopControlsAtCurrent } from "./camera-controls-utils";
import { viewHeightForPerspective } from "./camera-math";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./default-views";
import { stabilizePoleDirection } from "./pole-nudge";
import type { ProjectionCameraPairHandle } from "./projection-camera-pair";
import { getOrthographicVisibleHeight } from "./projection-sync";
import { ZUpFrame, type WorldFrame } from "./world-frame";

const Y_UP = new Vector3(0, 1, 0);
const WORLD_UP = new Vector3(0, 0, 1);

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const cameraPairRef = useRef<ProjectionCameraPairHandle | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<OrthographicCamera | null>(null);
  const inputBlockRef = useRef(0);

  const defaultViewRequestRef = useRef<DefaultViewId | null>(null);
  const initializedRef = useRef(false);
  const worldUnitsPerPixelRef = useRef<number>(1);
  const scratch = useMemo(
    () => ({
      cameraMatrix: new Matrix4(),
      cameraXAxis: new Vector3(),
      cameraYAxis: new Vector3(),
      cameraZAxis: new Vector3(),
      focalOffset: new Vector3(),
      focalOffsetWorld: new Vector3(),
      target: new Vector3(),
      position: new Vector3(),
      nudge: new Vector3(),
      worldDirection: new Vector3(),
      orbitUp: new Vector3(),
      orbitOffset: new Vector3(),
      orbitQuaternion: new Quaternion(),
      orbitQuaternionInverse: new Quaternion(),
      orbitSpherical: new Spherical(),
    }),
    [],
  );

  const beginInputBlock = useCallback(() => {
    const next = inputBlockRef.current + 1;
    inputBlockRef.current = next;
    return next;
  }, []);

  const endInputBlock = useCallback((token: number) => {
    if (inputBlockRef.current !== token) return;
    inputBlockRef.current = 0;
  }, []);

  const cancelProjectionTransition = useCallback(() => {
    cameraPairRef.current?.cancelProjectionTransition();
  }, []);

  const interruptInputs = useCallback(() => {
    cancelProjectionTransition();
    const controls = controlsRef.current;
    if (controls) stopControlsAtCurrent(controls);
  }, [cancelProjectionTransition]);

  const setActiveCamera = useCallback(
    (
      mode: "perspective" | "orthographic",
      camera: PerspectiveCamera | OrthographicCamera,
    ) => {
      const handled = cameraPairRef.current?.setProjection(mode);
      if (!handled) set({ camera });
    },
    [set],
  );

  const isProjectionTransitionActive = useCallback(
    () => cameraPairRef.current?.isProjectionTransitionActive() ?? false,
    [],
  );

  useEffect(() => {
    return () => {
      cancelProjectionTransition();
    };
  }, [cancelProjectionTransition]);

  const toggleProjection = useCallback((options?: { durationMs?: number }) => {
    defaultViewRequestRef.current = null;
    return cameraPairRef.current?.toggleProjection(options) ?? false;
  }, []);

  const applyDefaultView = useCallback(
    (viewId: DefaultViewId, enableTransition: boolean) => {
      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;
      if (!controls || !perspective || !orthographic) return false;

      const view = getDefaultView(viewId);

      stopControlsAtCurrent(controls);

      scratch.target.set(...view.target);
      scratch.position.set(...view.position);

      const defaultRadius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(defaultRadius) || defaultRadius <= 0) return false;

      const activeCamera = controls.camera;
      const nextCamera =
        isOrthographicCamera(activeCamera) ? orthographic : perspective;

      const nextMode =
        isOrthographicCamera(nextCamera) ? "orthographic" : "perspective";
      setActiveCamera(nextMode, nextCamera);
      controls.camera = nextCamera;

      nextCamera.up.copy(WORLD_UP);
      controls.updateCameraUp();

      const blockToken = enableTransition ? beginInputBlock() : null;
      const focalPromise = controls.setFocalOffset(0, 0, 0, enableTransition);
      const zoomPromise =
        isOrthographicCamera(nextCamera) ?
          (() => {
            const distance = scratch.position.distanceTo(scratch.target);
            const desiredHeight = viewHeightForPerspective(
              distance,
              DEFAULT_PERSPECTIVE_FOV_DEG,
            );
            const baseHeight = nextCamera.top - nextCamera.bottom;
            if (
              !Number.isFinite(desiredHeight) ||
              desiredHeight <= 0 ||
              !Number.isFinite(baseHeight) ||
              baseHeight <= 0
            ) {
              return Promise.resolve();
            }
            const nextZoom = baseHeight / desiredHeight;
            if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
              return Promise.resolve();
            }
            return controls.zoomTo(nextZoom, enableTransition);
          })()
        : Promise.resolve();
      const lookPromise = controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        enableTransition,
      );
      controls.normalizeRotations();
      if (blockToken !== null) {
        void Promise.all([focalPromise, lookPromise, zoomPromise]).finally(
          () => {
            endInputBlock(blockToken);
          },
        );
      }
      // Apply immediately (frameloop is demand-driven, so we can't rely on the next tick).
      controls.update(0);

      invalidate();
      return true;
    },
    [beginInputBlock, endInputBlock, invalidate, scratch, setActiveCamera],
  );

  const requestDefaultView = useCallback(
    (viewId?: DefaultViewId) => {
      const nextViewId = viewId ?? DEFAULT_VIEW_ID;
      if (isProjectionTransitionActive()) {
        defaultViewRequestRef.current = nextViewId;
        invalidate();
        return;
      }

      interruptInputs();
      const applied = applyDefaultView(nextViewId, true);
      defaultViewRequestRef.current = applied ? null : nextViewId;
      invalidate();
    },
    [
      applyDefaultView,
      interruptInputs,
      invalidate,
      isProjectionTransitionActive,
    ],
  );

  const orbitAroundUp = useCallback(
    (
      azimuthRadians: number,
      polarRadians: number,
      enableTransition: boolean,
    ) => {
      const controls = controlsRef.current;
      if (!controls) return false;

      // User orbit should take over immediately, even if a prior transition is in flight.
      stopControlsAtCurrent(controls);

      controls.getTarget(scratch.target, false);
      // Apply the stopped state to the underlying three.js camera so we can read its
      // actual world-space position (including any focal offset applied by CameraControls).
      // Keep the current camera up while doing this; if we're in a top-down north-up view
      // the camera up may be in the ground plane and switching to orbit-up (Z) too early
      // can hit a lookAt singularity.
      controls.update(0);
      scratch.position.copy(controls.camera.position);

      // CameraControls can apply a focal offset after orbiting (used by `setOrbitPoint()` /
      // dolly-to-cursor behaviors). Its `getPosition()` returns the *pre-offset* position,
      // so for stable orbit we subtract the current offset in world space and orbit that
      // base position. Then CameraControls will re-apply the same focal offset in `update()`.
      controls.getFocalOffset(scratch.focalOffset, false);
      if (scratch.focalOffset.lengthSq() > 0) {
        scratch.cameraMatrix.compose(
          controls.camera.position,
          controls.camera.quaternion,
          controls.camera.scale,
        );
        scratch.cameraXAxis.setFromMatrixColumn(scratch.cameraMatrix, 0);
        scratch.cameraYAxis.setFromMatrixColumn(scratch.cameraMatrix, 1);
        scratch.cameraZAxis.setFromMatrixColumn(scratch.cameraMatrix, 2);

        scratch.focalOffsetWorld
          .copy(scratch.cameraXAxis)
          .multiplyScalar(scratch.focalOffset.x)
          .addScaledVector(scratch.cameraYAxis, -scratch.focalOffset.y)
          .addScaledVector(scratch.cameraZAxis, scratch.focalOffset.z);

        scratch.position.sub(scratch.focalOffsetWorld);
      }

      scratch.orbitOffset.copy(scratch.position).sub(scratch.target);
      if (scratch.orbitOffset.lengthSq() === 0) return false;

      const orbitUp = worldFrame.getUpAt(scratch.target, scratch.orbitUp);
      if (orbitUp.lengthSq() === 0) return false;
      orbitUp.normalize();
      controls.camera.up.copy(WORLD_UP);
      controls.updateCameraUp();

      // Three.js spherical coordinates assume Y-up. To orbit around an arbitrary world up
      // (e.g. Z-up ground plane, or a radial "up" on a globe), rotate into a temporary
      // frame where `orbitUp` becomes +Y, do the spherical math, then rotate back.
      scratch.orbitQuaternion.setFromUnitVectors(orbitUp, Y_UP);
      scratch.orbitQuaternionInverse.copy(scratch.orbitQuaternion).invert();

      scratch.orbitOffset.applyQuaternion(scratch.orbitQuaternion);
      scratch.orbitSpherical.setFromVector3(scratch.orbitOffset);

      const nextTheta = MathUtils.clamp(
        scratch.orbitSpherical.theta + azimuthRadians,
        controls.minAzimuthAngle,
        controls.maxAzimuthAngle,
      );
      const nextPhi = MathUtils.clamp(
        scratch.orbitSpherical.phi + polarRadians,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      );

      scratch.orbitSpherical.theta = nextTheta;
      scratch.orbitSpherical.phi = nextPhi;
      scratch.orbitSpherical.makeSafe();

      scratch.orbitOffset.setFromSpherical(scratch.orbitSpherical);
      scratch.orbitOffset.applyQuaternion(scratch.orbitQuaternionInverse);
      scratch.position.copy(scratch.target).add(scratch.orbitOffset);

      const blockToken = enableTransition ? beginInputBlock() : null;
      const lookPromise = controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        enableTransition,
      );
      controls.normalizeRotations();
      if (blockToken !== null) {
        void lookPromise.finally(() => {
          endInputBlock(blockToken);
        });
      }

      // Whether we're animating or applying immediately, we need to kick the demand-driven
      // render loop so the user sees the effect right away.
      controls.update(0);
      invalidate();

      return true;
    },
    [beginInputBlock, endInputBlock, invalidate, scratch, worldFrame],
  );

  const onOrbitInput = useCallback(
    (azimuthRadians: number, polarRadians: number) => {
      if (isProjectionTransitionActive()) return true;
      return orbitAroundUp(azimuthRadians, polarRadians, false);
    },
    [isProjectionTransitionActive, orbitAroundUp],
  );

  const onRotateAroundUp = useCallback(
    (radians: number) => {
      if (isProjectionTransitionActive()) return true;
      interruptInputs();
      return orbitAroundUp(radians, 0, true);
    },
    [interruptInputs, isProjectionTransitionActive, orbitAroundUp],
  );

  const onSelectDirection = useCallback(
    (worldDirection: [number, number, number]) => {
      const controls = controlsRef.current;
      if (!controls) return;
      if (isProjectionTransitionActive()) return;
      interruptInputs();

      controls.camera.up.copy(WORLD_UP);
      controls.updateCameraUp();

      controls.getTarget(scratch.target, false);
      controls.update(0);
      scratch.position.copy(controls.camera.position);

      controls.getFocalOffset(scratch.focalOffset, false);
      if (scratch.focalOffset.lengthSq() > 0) {
        scratch.cameraMatrix.compose(
          controls.camera.position,
          controls.camera.quaternion,
          controls.camera.scale,
        );
        scratch.cameraXAxis.setFromMatrixColumn(scratch.cameraMatrix, 0);
        scratch.cameraYAxis.setFromMatrixColumn(scratch.cameraMatrix, 1);
        scratch.cameraZAxis.setFromMatrixColumn(scratch.cameraMatrix, 2);

        scratch.focalOffsetWorld
          .copy(scratch.cameraXAxis)
          .multiplyScalar(scratch.focalOffset.x)
          .addScaledVector(scratch.cameraYAxis, -scratch.focalOffset.y)
          .addScaledVector(scratch.cameraZAxis, scratch.focalOffset.z);

        scratch.position.sub(scratch.focalOffsetWorld);
      }

      const radius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(radius) || radius <= 0) return;

      scratch.worldDirection.set(
        worldDirection[0],
        worldDirection[1],
        worldDirection[2],
      );
      if (scratch.worldDirection.lengthSq() === 0) return;
      scratch.worldDirection.normalize();

      scratch.nudge.copy(scratch.position).sub(scratch.target);
      stabilizePoleDirection({
        direction: scratch.worldDirection,
        up: controls.camera.up,
        viewVector: scratch.nudge,
        poleThreshold: 0.98,
      });

      scratch.position
        .copy(scratch.target)
        .addScaledVector(scratch.worldDirection, radius);

      const blockToken = beginInputBlock();
      const focalPromise = controls.setFocalOffset(0, 0, 0, true);

      const lookPromise = controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        true,
      );
      controls.normalizeRotations();
      void Promise.all([focalPromise, lookPromise]).finally(() => {
        endInputBlock(blockToken);
      });
      controls.update(0);
      invalidate();
    },
    [
      beginInputBlock,
      endInputBlock,
      interruptInputs,
      invalidate,
      isProjectionTransitionActive,
      scratch,
    ],
  );

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (isProjectionTransitionActive()) return;

    if (!initializedRef.current) {
      const applied = applyDefaultView(DEFAULT_VIEW_ID, false);
      if (applied) {
        initializedRef.current = true;
      }
      return;
    }

    const viewportHeightPx = Math.max(1, size.height);
    const activeCamera = controls.camera;
    if (isPerspectiveCamera(activeCamera)) {
      controls.getPosition(scratch.position, false);
      controls.getTarget(scratch.target, false);
      const distance = scratch.position.distanceTo(scratch.target);
      if (Number.isFinite(distance) && distance > 0) {
        const nextUnitsPerPixel =
          viewHeightForPerspective(distance, activeCamera.fov) /
          viewportHeightPx;
        if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
          worldUnitsPerPixelRef.current = nextUnitsPerPixel;
        }
      }
    } else if (isOrthographicCamera(activeCamera)) {
      // Keep ortho aspect in sync with the viewport while preserving view height.
      const aspect = size.width / viewportHeightPx;
      const baseHeight = activeCamera.top - activeCamera.bottom;
      const centerX = (activeCamera.left + activeCamera.right) / 2;
      const centerY = (activeCamera.top + activeCamera.bottom) / 2;
      const halfH = baseHeight / 2;
      const halfW = halfH * aspect;
      activeCamera.left = centerX - halfW;
      activeCamera.right = centerX + halfW;
      activeCamera.top = centerY + halfH;
      activeCamera.bottom = centerY - halfH;
      activeCamera.updateProjectionMatrix();

      const visibleH = getOrthographicVisibleHeight(activeCamera);
      const nextUnitsPerPixel = visibleH / viewportHeightPx;
      if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
        worldUnitsPerPixelRef.current = nextUnitsPerPixel;
      }
    }

    const defaultViewId = defaultViewRequestRef.current;
    if (defaultViewId && !isProjectionTransitionActive()) {
      const applied = applyDefaultView(defaultViewId, true);
      if (applied) {
        defaultViewRequestRef.current = null;
      }
    }
  }, -3);

  return {
    worldFrame,
    controlsRef,
    cameraPairRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    worldUnitsPerPixelRef,
    inputBlockRef,
    requestDefaultView,
    onOrbitInput,
    onRotateAroundUp,
    onSelectDirection,
    toggleProjection,
    isProjectionTransitionActive,
  };
}
