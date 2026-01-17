import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import {
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  Vector3,
} from "three";
import { isPerspectiveCamera } from "../camera";
import { stopControlsAtCurrent } from "./camera-controls-utils";
import { viewHeightForPerspective } from "./camera-math";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./default-views";
import { stabilizePoleDirection } from "./pole-nudge";
import { ZUpFrame, type WorldFrame } from "./world-frame";

const Y_UP = new Vector3(0, 1, 0);
const WORLD_UP = new Vector3(0, 0, 1);

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);
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

  const interruptInputs = useCallback(() => {
    const controls = controlsRef.current;
    if (controls) stopControlsAtCurrent(controls);
  }, []);

  const applyDefaultView = useCallback(
    (viewId: DefaultViewId, enableTransition: boolean) => {
      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      if (!controls || !perspective) return false;

      const view = getDefaultView(viewId);

      stopControlsAtCurrent(controls);

      scratch.target.set(...view.target);
      scratch.position.set(...view.position);

      const defaultRadius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(defaultRadius) || defaultRadius <= 0) return false;

      set({ camera: perspective });
      controls.camera = perspective;

      perspective.up.copy(WORLD_UP);
      controls.updateCameraUp();

      const blockToken = enableTransition ? beginInputBlock() : null;
      const focalPromise = controls.setFocalOffset(0, 0, 0, enableTransition);
      const lookPromise = controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        enableTransition,
      );
      if (blockToken !== null) {
        void Promise.all([focalPromise, lookPromise]).finally(() => {
          endInputBlock(blockToken);
        });
      }
      // Apply immediately (frameloop is demand-driven, so we can't rely on the next tick).
      controls.update(0);

      invalidate();
      return true;
    },
    [beginInputBlock, endInputBlock, invalidate, scratch, set],
  );

  const requestDefaultView = useCallback(
    (viewId?: DefaultViewId) => {
      interruptInputs();
      const nextViewId = viewId ?? DEFAULT_VIEW_ID;
      const applied = applyDefaultView(nextViewId, true);
      defaultViewRequestRef.current = applied ? null : nextViewId;
      invalidate();
    },
    [applyDefaultView, interruptInputs, invalidate],
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
    (azimuthRadians: number, polarRadians: number) =>
      orbitAroundUp(azimuthRadians, polarRadians, false),
    [orbitAroundUp],
  );

  const onRotateAroundUp = useCallback(
    (radians: number) => {
      interruptInputs();
      return orbitAroundUp(radians, 0, true);
    },
    [interruptInputs, orbitAroundUp],
  );

  const onSelectDirection = useCallback(
    (worldDirection: [number, number, number]) => {
      const controls = controlsRef.current;
      if (!controls) return;
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
      void Promise.all([focalPromise, lookPromise]).finally(() => {
        endInputBlock(blockToken);
      });
      controls.update(0);
      invalidate();
    },
    [beginInputBlock, endInputBlock, interruptInputs, invalidate, scratch],
  );

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!initializedRef.current) {
      const applied = applyDefaultView(DEFAULT_VIEW_ID, false);
      if (applied) {
        initializedRef.current = true;
      }
      return;
    }

    const viewportHeightPx = Math.max(1, size.height);
    if (isPerspectiveCamera(controls.camera)) {
      controls.getPosition(scratch.position, false);
      controls.getTarget(scratch.target, false);
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
      const applied = applyDefaultView(defaultViewId, true);
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
    inputBlockRef,
    requestDefaultView,
    onOrbitInput,
    onRotateAroundUp,
    onSelectDirection,
  };
}
