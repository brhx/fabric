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
import { viewHeightForPerspective } from "./camera-math";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./default-views";
import { ZUpFrame, type ViewBasis, type WorldFrame } from "./world-frame";

const Y_UP = new Vector3(0, 1, 0);

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);

  const defaultViewRequestRef = useRef<DefaultViewId | null>(null);
  const initializedRef = useRef(false);
  const worldUnitsPerPixelRef = useRef<number>(1);
  const orbitStateRef = useRef({
    theta: 0,
    phi: 0,
    // Cached orbit angles so we can keep rotation continuous across the -π/π wrap,
    // and so we can reset cleanly when the world's up axis changes (e.g. globe mode).
    valid: false,
    up: new Vector3(),
  });

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
      worldDirection: new Vector3(),
      orbitUp: new Vector3(),
      orbitOffset: new Vector3(),
      orbitQuaternion: new Quaternion(),
      orbitQuaternionInverse: new Quaternion(),
      orbitSpherical: new Spherical(),
      viewBasis: {
        right: new Vector3(),
        up: new Vector3(),
        forward: new Vector3(),
      } satisfies ViewBasis,
    }),
    [],
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

      // Ensure a known camera config for "default views" so:
      // - zoom/pan scaling derived from FOV is deterministic
      // - we don't carry over previous camera state when switching views
      perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
      perspective.updateProjectionMatrix();

      const orbitUp = worldFrame.getUpAt(scratch.target, scratch.orbitUp);
      if (orbitUp.lengthSq() === 0) return false;
      orbitUp.normalize();

      // CameraControls uses `camera.up` as its orbit "up axis" (via `updateCameraUp()`).
      // Default views are allowed to set a view-specific `up` (e.g. to make top-down be
      // "north-up"). Orbiting itself still uses `worldFrame.getUpAt(...)` (ground-plane up).
      let viewUp = orbitUp;
      if (view.up) {
        viewUp = scratch.viewBasis.up.set(...view.up);
        if (viewUp.lengthSq() === 0) return false;
        viewUp.normalize();
      }

      perspective.up.copy(viewUp);
      set({ camera: perspective });
      controls.camera = perspective;
      // Keep CameraControls' internal up-space transform in sync with `camera.up`.
      // Without this, subsequent `setLookAt/getPosition/rotate` will behave incorrectly.
      controls.updateCameraUp();

      void controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        false,
      );
      // Clear any "orbit point"/dolly-to-cursor offset when jumping to a canonical view.
      void controls.setFocalOffset(0, 0, 0, false);
      // Apply immediately (frameloop is demand-driven, so we can't rely on the next tick).
      controls.update(0);

      orbitStateRef.current.valid = false;

      invalidate();
      return true;
    },
    [invalidate, scratch, set, worldFrame],
  );

  const requestDefaultView = useCallback(
    (viewId?: DefaultViewId) => {
      defaultViewRequestRef.current = viewId ?? DEFAULT_VIEW_ID;
      orbitStateRef.current.valid = false;
      invalidate();
    },
    [invalidate],
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
      controls.stop();

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

      // Ensure CameraControls' up-space matches the orbit axis we want (ground-plane up).
      // This is especially important when the default view uses a view-specific up (north-up).
      const cameraUpDot = controls.camera.up.dot(orbitUp);
      const didChangeUp = cameraUpDot < 0.999;
      if (didChangeUp) {
        controls.camera.up.copy(orbitUp);
        controls.updateCameraUp();
      }
      const enableTransitionEffective = enableTransition && !didChangeUp;

      // Three.js spherical coordinates assume Y-up. To orbit around an arbitrary world up
      // (e.g. Z-up ground plane, or a radial "up" on a globe), rotate into a temporary
      // frame where `orbitUp` becomes +Y, do the spherical math, then rotate back.
      scratch.orbitQuaternion.setFromUnitVectors(orbitUp, Y_UP);
      scratch.orbitQuaternionInverse.copy(scratch.orbitQuaternion).invert();

      scratch.orbitOffset.applyQuaternion(scratch.orbitQuaternion);
      scratch.orbitSpherical.setFromVector3(scratch.orbitOffset);

      const orbitState = orbitStateRef.current;
      const upDot = orbitState.valid ? orbitState.up.dot(orbitUp) : 0;
      if (!orbitState.valid || upDot < 0.999) {
        orbitState.valid = true;
        orbitState.up.copy(orbitUp);
        orbitState.theta = scratch.orbitSpherical.theta;
        orbitState.phi = scratch.orbitSpherical.phi;
      } else {
        // Avoid theta wrapping discontinuities so repeated small deltas keep rotating
        // in the expected direction (instead of jumping ~2π at the branch cut).
        const theta = scratch.orbitSpherical.theta;
        const delta = theta - orbitState.theta;
        if (delta > Math.PI) scratch.orbitSpherical.theta = theta - Math.PI * 2;
        else if (delta < -Math.PI)
          scratch.orbitSpherical.theta = theta + Math.PI * 2;
      }

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

      void controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        enableTransitionEffective,
      );

      if (enableTransitionEffective) {
        orbitState.valid = false;
      } else {
        orbitState.valid = true;
        orbitState.theta = nextTheta;
        orbitState.phi = scratch.orbitSpherical.phi;
        orbitState.up.copy(orbitUp);
      }

      // Whether we're animating or applying immediately, we need to kick the demand-driven
      // render loop so the user sees the effect right away.
      controls.update(0);
      invalidate();

      return true;
    },
    [invalidate, scratch, worldFrame],
  );

  const onOrbitInput = useCallback(
    (azimuthRadians: number, polarRadians: number) =>
      orbitAroundUp(azimuthRadians, polarRadians, false),
    [orbitAroundUp],
  );

  const onRotateAroundUp = useCallback(
    (radians: number) => orbitAroundUp(radians, 0, true),
    [orbitAroundUp],
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
    onOrbitInput,
    onRotateAroundUp,
  };
}
