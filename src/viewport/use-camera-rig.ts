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
import { fovDegForViewHeightAtDistance, viewHeightForPerspective } from "./camera-math";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
import {
  DEFAULT_VIEW_ID,
  getDefaultView,
  type DefaultViewId,
} from "./default-views";
import { stabilizePoleDirection } from "./pole-nudge";
import {
  getOrthographicVisibleHeight,
  getPerspectiveViewSizeAtPlanePoint,
  syncOrthographicCameraFromPerspective,
  syncPerspectiveCameraFromOrthographic,
} from "./projection-sync";
import {
  easeInOutCubic,
  solvePerspectiveDistanceForViewHeight,
} from "./projection-transition";
import { ZUpFrame, type WorldFrame } from "./world-frame";

const Y_UP = new Vector3(0, 1, 0);
const WORLD_UP = new Vector3(0, 0, 1);

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<OrthographicCamera | null>(null);
  const inputBlockRef = useRef(0);
  const projectionTransitionRef = useRef<{
    blockToken: number;
    to: "perspective" | "orthographic";
    startedAt: number;
    durationMs: number;
    viewHeight: number;
    fovStart: number;
    fovEnd: number;
    minDistance: number;
    maxDistance: number;
    target: Vector3;
    focalOffset: Vector3;
    dir: Vector3;
    position: Vector3;
  } | null>(null);

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
    const state = projectionTransitionRef.current;
    if (!state) return;
    endInputBlock(state.blockToken);
    projectionTransitionRef.current = null;
  }, [endInputBlock]);

  const interruptInputs = useCallback(() => {
    cancelProjectionTransition();
    const controls = controlsRef.current;
    if (controls) stopControlsAtCurrent(controls);
  }, [cancelProjectionTransition]);

  useEffect(() => {
    return () => {
      cancelProjectionTransition();
    };
  }, [cancelProjectionTransition]);

  const toggleProjection = useCallback(
    (options?: { durationMs?: number }) => {
      const durationMs = options?.durationMs ?? 420;

      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;
      if (!controls || !perspective || !orthographic) return false;

      defaultViewRequestRef.current = null;
      cancelProjectionTransition();

      // Freeze any in-flight transitions so we can read a consistent state.
      stopControlsAtCurrent(controls);

      controls.getTarget(scratch.target, false);
      controls.getPosition(scratch.position, false);
      controls.getFocalOffset(scratch.focalOffset, false);
      controls.update(0);

      const minDistance =
        Number.isFinite(controls.minDistance) ? Math.max(0, controls.minDistance) : 0;
      const maxDistance =
        Number.isFinite(controls.maxDistance) ? controls.maxDistance : Infinity;

      const minMorphFovDeg = 1;

      const activeCamera = controls.camera;

      if (isPerspectiveCamera(activeCamera)) {
        if (durationMs <= 0) {
          const synced = syncOrthographicCameraFromPerspective({
            perspective,
            orthographic,
            target: scratch.target,
          });
          if (!synced) return false;

          set({ camera: orthographic });
          controls.camera = orthographic;

          void controls.zoomTo(1, false);
          void controls.setFocalOffset(
            scratch.focalOffset.x,
            scratch.focalOffset.y,
            scratch.focalOffset.z,
            false,
          );
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
          invalidate();
          return true;
        }

        const fovStart = activeCamera.fov;
        const viewSize = getPerspectiveViewSizeAtPlanePoint(
          activeCamera,
          scratch.target,
        );
        if (!viewSize) return false;
        const viewHeight = viewSize.height;

        const maxDistanceActual =
          maxDistance === Infinity ? Infinity : maxDistance + scratch.focalOffset.z;
        const fovEnd = Math.max(
          minMorphFovDeg,
          fovDegForViewHeightAtDistance(viewHeight, maxDistanceActual),
        );

        activeCamera.getWorldDirection(scratch.worldDirection);
        scratch.nudge.copy(scratch.worldDirection).multiplyScalar(-1);
        if (scratch.nudge.lengthSq() === 0) return false;

        const blockToken = beginInputBlock();
        projectionTransitionRef.current = {
          blockToken,
          to: "orthographic",
          startedAt: globalThis.performance?.now?.() ?? Date.now(),
          durationMs,
          viewHeight,
          fovStart,
          fovEnd,
          minDistance,
          maxDistance,
          target: scratch.target.clone(),
          focalOffset: scratch.focalOffset.clone(),
          dir: scratch.nudge.clone(),
          position: new Vector3(),
        };

        void controls.setFocalOffset(
          scratch.focalOffset.x,
          scratch.focalOffset.y,
          scratch.focalOffset.z,
          false,
        );

        invalidate();
        return true;
      }

      if (isOrthographicCamera(activeCamera)) {
        const viewHeight = getOrthographicVisibleHeight(activeCamera);
        if (!Number.isFinite(viewHeight) || viewHeight <= 0) return false;

        const offsetZ = scratch.focalOffset.z;
        const minDistanceActual = Math.max(0, minDistance + offsetZ);
        const maxDistanceActual =
          maxDistance === Infinity ?
            Infinity
          : Math.max(minDistanceActual, maxDistance + offsetZ);

        if (durationMs <= 0) {
          const solvedStart = solvePerspectiveDistanceForViewHeight({
            viewHeight,
            fovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
            minDistance: minDistanceActual,
            maxDistance: maxDistanceActual,
          });
          if (!solvedStart) return false;

          const synced = syncPerspectiveCameraFromOrthographic({
            orthographic: activeCamera,
            perspective,
            target: scratch.target,
            fovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
          });
          if (!synced) return false;

          perspective.getWorldDirection(scratch.worldDirection);
          scratch.nudge.copy(scratch.worldDirection).multiplyScalar(-1);
          const baseDistance = solvedStart.distance - offsetZ;
          if (!Number.isFinite(baseDistance) || baseDistance <= 0) return false;
          perspective.position
            .copy(scratch.target)
            .addScaledVector(scratch.nudge, baseDistance);

          set({ camera: perspective });
          controls.camera = perspective;

          void controls.zoomTo(1, false);
          void controls.setFocalOffset(
            scratch.focalOffset.x,
            scratch.focalOffset.y,
            scratch.focalOffset.z,
            false,
          );
          void controls.setLookAt(
            perspective.position.x,
            perspective.position.y,
            perspective.position.z,
            scratch.target.x,
            scratch.target.y,
            scratch.target.z,
            false,
          );
          controls.update(0);
          invalidate();
          return true;
        }

        const fovStartRaw = Math.max(
          minMorphFovDeg,
          fovDegForViewHeightAtDistance(viewHeight, maxDistanceActual),
        );
        const solvedStart = solvePerspectiveDistanceForViewHeight({
          viewHeight,
          fovDeg: fovStartRaw,
          minDistance: minDistanceActual,
          maxDistance: maxDistanceActual,
        });
        if (!solvedStart) return false;

        const fovStart = solvedStart.fovDeg;
        const fovEnd = DEFAULT_PERSPECTIVE_FOV_DEG;

        // Start in a near-ortho telephoto perspective that matches ortho framing,
        // then widen the FOV while dollying in to keep the view height stable.
        const synced = syncPerspectiveCameraFromOrthographic({
          orthographic: activeCamera,
          perspective,
          target: scratch.target,
          fovDeg: fovStart,
        });
        if (!synced) return false;

        perspective.getWorldDirection(scratch.worldDirection);
        scratch.nudge.copy(scratch.worldDirection).multiplyScalar(-1);
        const baseDistance = solvedStart.distance - offsetZ;
        if (!Number.isFinite(baseDistance) || baseDistance <= 0) return false;
        perspective.position
          .copy(scratch.target)
          .addScaledVector(scratch.nudge, baseDistance);

        set({ camera: perspective });
        controls.camera = perspective;

        void controls.zoomTo(1, false);
        void controls.setFocalOffset(
          scratch.focalOffset.x,
          scratch.focalOffset.y,
          scratch.focalOffset.z,
          false,
        );
        void controls.setLookAt(
          perspective.position.x,
          perspective.position.y,
          perspective.position.z,
          scratch.target.x,
          scratch.target.y,
          scratch.target.z,
          false,
        );
        controls.update(0);

        scratch.nudge.copy(perspective.position).sub(scratch.target);
        if (scratch.nudge.lengthSq() === 0) return false;
        scratch.nudge.normalize();

        const blockToken = beginInputBlock();
        projectionTransitionRef.current = {
          blockToken,
          to: "perspective",
          startedAt: globalThis.performance?.now?.() ?? Date.now(),
          durationMs,
          viewHeight,
          fovStart,
          fovEnd,
          minDistance,
          maxDistance,
          target: scratch.target.clone(),
          focalOffset: scratch.focalOffset.clone(),
          dir: scratch.nudge.clone(),
          position: new Vector3(),
        };

        invalidate();
        return true;
      }

      return false;
    },
    [beginInputBlock, cancelProjectionTransition, invalidate, scratch, set],
  );

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

      set({ camera: nextCamera });
      controls.camera = nextCamera;

      nextCamera.up.copy(WORLD_UP);
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
      controls.normalizeRotations();
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
      const nextViewId = viewId ?? DEFAULT_VIEW_ID;
      if (projectionTransitionRef.current !== null) {
        defaultViewRequestRef.current = nextViewId;
        invalidate();
        return;
      }

      interruptInputs();
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
      if (projectionTransitionRef.current !== null) return true;
      return orbitAroundUp(azimuthRadians, polarRadians, false);
    },
    [orbitAroundUp],
  );

  const onRotateAroundUp = useCallback(
    (radians: number) => {
      if (projectionTransitionRef.current !== null) return true;
      interruptInputs();
      return orbitAroundUp(radians, 0, true);
    },
    [interruptInputs, orbitAroundUp],
  );

  const onSelectDirection = useCallback(
    (worldDirection: [number, number, number]) => {
      const controls = controlsRef.current;
      if (!controls) return;
      if (projectionTransitionRef.current !== null) return;
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
    [beginInputBlock, endInputBlock, interruptInputs, invalidate, scratch],
  );

  const isProjectionTransitionActive = useCallback(
    () => projectionTransitionRef.current !== null,
    [],
  );

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const projectionTransition = projectionTransitionRef.current;
    if (projectionTransition) {
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;
      if (!perspective || !orthographic) {
        cancelProjectionTransition();
        return;
      }

      const now = (globalThis.performance?.now?.() ?? Date.now()) as number;
      const t =
        projectionTransition.durationMs <= 0 ?
          1
        : MathUtils.clamp(
            (now - projectionTransition.startedAt) /
              projectionTransition.durationMs,
            0,
            1,
          );
      const eased = easeInOutCubic(t);

      const desiredFov = MathUtils.lerp(
        projectionTransition.fovStart,
        projectionTransition.fovEnd,
        eased,
      );

      const offsetZ = projectionTransition.focalOffset.z;
      const minDistanceActual = Math.max(
        0,
        projectionTransition.minDistance + offsetZ,
      );
      const maxDistanceActual =
        projectionTransition.maxDistance === Infinity ?
          Infinity
        : Math.max(minDistanceActual, projectionTransition.maxDistance + offsetZ);

      const solved = solvePerspectiveDistanceForViewHeight({
        viewHeight: projectionTransition.viewHeight,
        fovDeg: desiredFov,
        minDistance: minDistanceActual,
        maxDistance: maxDistanceActual,
      });
      if (!solved) {
        cancelProjectionTransition();
        return;
      }

      perspective.fov = solved.fovDeg;
      perspective.updateProjectionMatrix();

      const baseDistance = solved.distance - offsetZ;
      if (!Number.isFinite(baseDistance) || baseDistance <= 0) {
        cancelProjectionTransition();
        return;
      }

      projectionTransition.position
        .copy(projectionTransition.target)
        .addScaledVector(projectionTransition.dir, baseDistance);

      void controls.setLookAt(
        projectionTransition.position.x,
        projectionTransition.position.y,
        projectionTransition.position.z,
        projectionTransition.target.x,
        projectionTransition.target.y,
        projectionTransition.target.z,
        false,
      );
      controls.update(0);

      if (t >= 1) {
        if (projectionTransition.to === "orthographic") {
          const synced = syncOrthographicCameraFromPerspective({
            perspective,
            orthographic,
            target: projectionTransition.target,
          });
          if (synced) {
            set({ camera: orthographic });
            controls.camera = orthographic;

            void controls.zoomTo(1, false);
            void controls.setFocalOffset(
              projectionTransition.focalOffset.x,
              projectionTransition.focalOffset.y,
              projectionTransition.focalOffset.z,
              false,
            );
            void controls.setLookAt(
              projectionTransition.position.x,
              projectionTransition.position.y,
              projectionTransition.position.z,
              projectionTransition.target.x,
              projectionTransition.target.y,
              projectionTransition.target.z,
              false,
            );
            controls.update(0);
          }
        } else {
          // Ensure exact final perspective FOV.
          perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
          perspective.updateProjectionMatrix();
        }

        endInputBlock(projectionTransition.blockToken);
        projectionTransitionRef.current = null;
      } else {
        invalidate();
      }

      // Demand-driven render loop: keep drawing while animating, and refresh once on completion.
      invalidate();
      return;
    }

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
    if (defaultViewId && projectionTransitionRef.current === null) {
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
