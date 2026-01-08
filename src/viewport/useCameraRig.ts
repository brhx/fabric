import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera, type Projection } from "../camera";
import {
  DEFAULT_PERSPECTIVE_FOV_DEG,
  MIN_PERSPECTIVE_FOV_DEG,
  MIN_DISTANCE,
  MAX_DISTANCE,
  MAX_ORTHO_ZOOM,
  MIN_ORTHO_ZOOM,
  ORTHO_SWITCH_IGNORE_MS,
  ORTHO_SWITCH_TOLERANCE_COS,
} from "./constants";
import {
  distanceForViewHeight,
  fovDegForViewHeightAtDistance,
  viewHeightForPerspective,
} from "./cameraMath";
import { DEFAULT_VIEW_ID, getDefaultView, type DefaultViewId } from "./defaultViews";
import { stabilizePoleDirection } from "./poleNudge";
import { type ViewBasis, type WorldFrame, ZUpFrame } from "./worldFrame";

type OrthoLock = {
  direction: Vector3;
  ignoreUntil: number;
  rebindDirectionAfterIgnore: boolean;
  poleLocked?: boolean;
};

type PendingOrthoEnter = {
  direction: Vector3;
  viewHeight: number;
  poleLocked: boolean;
};

type ProjectionBlend = {
  kind: "enter-orthographic" | "exit-orthographic";
  start: number;
  duration: number;
  viewHeight: number;
  fromFovDeg: number;
  toFovDeg: number;
};

export function useCameraRig(options?: { worldFrame?: WorldFrame }) {
  const worldFrame = options?.worldFrame ?? ZUpFrame;
  const { invalidate, set, size } = useThree();

  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<OrthographicCamera | null>(null);

  const [projection, setProjection] = useState<Projection>("perspective");

  const orthoLockRef = useRef<OrthoLock | null>(null);
  const pendingOrthoEnterRef = useRef<PendingOrthoEnter | null>(null);
  const projectionBlendRef = useRef<ProjectionBlend | null>(null);
  const defaultViewRequestRef = useRef<DefaultViewId | null>(null);
  const initializedRef = useRef(false);
  const worldUnitsPerPixelRef = useRef<number>(1);
  const polarClampRef = useRef<{ min: number; max: number } | null>(null);
  const upBlendRef = useRef<{
    from: Vector3;
    to: Vector3;
    start: number;
    duration: number;
  } | null>(null);

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      direction: new Vector3(),
      nextPosition: new Vector3(),
      tmpUp: new Vector3(),
      tmpUpBlend: new Vector3(),
      viewBasis: {
        right: new Vector3(),
        up: new Vector3(),
        forward: new Vector3(),
      } satisfies ViewBasis,
      worldDirection: new Vector3(),
    }),
    [],
  );

  const cancelProjectionTransitions = useCallback(() => {
    pendingOrthoEnterRef.current = null;
    projectionBlendRef.current = null;
  }, []);

  const computeOrthoBlendFovDeg = useCallback((viewHeight: number) => {
    const safeViewHeight = Math.max(1e-6, viewHeight);
    const maxDistance = Math.max(1e-6, MAX_DISTANCE);
    const minFovByMaxDistance = fovDegForViewHeightAtDistance(safeViewHeight, maxDistance);
    const next = Math.max(MIN_PERSPECTIVE_FOV_DEG, minFovByMaxDistance);
    return MathUtils.clamp(next, MIN_PERSPECTIVE_FOV_DEG, 175);
  }, []);

  const applyCameraUp = useCallback((nextUp: Vector3) => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.camera.up.copy(nextUp);
    perspectiveCameraRef.current?.up.copy(nextUp);
    orthographicCameraRef.current?.up.copy(nextUp);
    controls.updateCameraUp();
  }, []);

  const relaxPolarClamp = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!polarClampRef.current) {
      polarClampRef.current = {
        min: controls.minPolarAngle,
        max: controls.maxPolarAngle,
      };
    }

    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
  }, []);

  const restorePolarClamp = useCallback(() => {
    const controls = controlsRef.current;
    const saved = polarClampRef.current;
    if (!controls || !saved) return;

    controls.minPolarAngle = saved.min;
    controls.maxPolarAngle = saved.max;
    polarClampRef.current = null;
  }, []);

  const clearOrthoLock = useCallback(() => {
    restorePolarClamp();
    orthoLockRef.current = null;
  }, [restorePolarClamp]);

  const startUpBlendToWorldUp = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.getTarget(scratch.target);
    worldFrame.getUpAt(scratch.target, scratch.tmpUp);
    if (scratch.tmpUp.lengthSq() === 0) return;
    scratch.tmpUp.normalize();

    upBlendRef.current = {
      from: controls.camera.up.clone(),
      to: scratch.tmpUp.clone(),
      start: performance.now(),
      duration: 160,
    };
  }, [scratch, worldFrame]);

  const applyPoleRoll = useCallback(
    (radians: number) => {
      const controls = controlsRef.current;
      const lock = orthoLockRef.current;
      if (!controls || !lock?.poleLocked) return false;

      if (lock.direction.lengthSq() === 0) return false;

      scratch.tmpUp.copy(controls.camera.up);
      if (scratch.tmpUp.lengthSq() === 0) scratch.tmpUp.set(0, 1, 0);
      scratch.tmpUp.applyAxisAngle(lock.direction, radians).normalize();

      applyCameraUp(scratch.tmpUp);
      controls.update(0);
      invalidate();
      return true;
    },
    [applyCameraUp, invalidate, scratch],
  );

  const setActiveProjection = useCallback(
    (next: Projection) => {
      const controls = controlsRef.current;
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;

      if (next === "perspective") {
        if (!perspective) return;
        set({ camera: perspective });
        if (controls) controls.camera = perspective;
        setProjection("perspective");
        invalidate();
        return;
      }

      if (!orthographic) return;
      set({ camera: orthographic });
      if (controls) controls.camera = orthographic;
      setProjection("orthographic");
      invalidate();
      if (perspective && perspective.fov !== DEFAULT_PERSPECTIVE_FOV_DEG) {
        perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
        perspective.updateProjectionMatrix();
      }
    },
    [invalidate, set],
  );

  const applyDefaultView = useCallback(
    (viewId: DefaultViewId) => {
      const controls = controlsRef.current;
      if (!controls) return false;

      const view = getDefaultView(viewId);
      const needsOrtho = view.projection === "orthographic";

      if (needsOrtho && !orthographicCameraRef.current) return false;
      if (!needsOrtho && !perspectiveCameraRef.current) return false;

      cancelProjectionTransitions();
      clearOrthoLock();
      controls.stop();

      scratch.target.set(...view.target);
      scratch.position.set(...view.position);

      const defaultRadius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(defaultRadius) || defaultRadius <= 0) return false;

      const defaultScale = viewHeightForPerspective(defaultRadius, DEFAULT_PERSPECTIVE_FOV_DEG);
      const orthoHeight = orthographicCameraRef.current
        ? orthographicCameraRef.current.top - orthographicCameraRef.current.bottom
        : size.height;
      const defaultOrthoZoom = MathUtils.clamp(
        orthoHeight / Math.max(1e-6, defaultScale),
        MIN_ORTHO_ZOOM,
        MAX_ORTHO_ZOOM,
      );

      const perspective = perspectiveCameraRef.current;
      if (perspective && !needsOrtho) {
        perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
        perspective.updateProjectionMatrix();
      }

      if (needsOrtho) {
        setActiveProjection("orthographic");
        controls.setLookAt(
          scratch.position.x,
          scratch.position.y,
          scratch.position.z,
          scratch.target.x,
          scratch.target.y,
          scratch.target.z,
          false,
        );
        controls.zoomTo(defaultOrthoZoom, false);
        controls.update(0);
        invalidate();
        return true;
      }

      setActiveProjection("perspective");
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
    },
    [cancelProjectionTransitions, clearOrthoLock, invalidate, scratch, setActiveProjection, size.height],
  );

  const requestDefaultView = useCallback(
    (viewId?: DefaultViewId) => {
      defaultViewRequestRef.current = viewId ?? DEFAULT_VIEW_ID;
      invalidate();
    },
    [invalidate],
  );

  const handleRotateAroundUp = useCallback(
    (radians: number) => {
      const lock = orthoLockRef.current;
      if (projection === "orthographic" && lock?.poleLocked) {
        return applyPoleRoll(radians);
      }

      if (!lock || projection !== "orthographic") return false;
      lock.ignoreUntil = performance.now() + ORTHO_SWITCH_IGNORE_MS;
      lock.rebindDirectionAfterIgnore = true;
      return false;
    },
    [applyPoleRoll, projection],
  );

  const enterOrthographicView = useCallback(
    (worldDirection: [number, number, number]) => {
      const controls = controlsRef.current;
      if (!controls) return;
      cancelProjectionTransitions();
      controls.stop();

      controls.getTarget(scratch.target);
      controls.getPosition(scratch.position);

      const radius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(radius) || radius <= 0) return;

      let viewHeight = 0;
      if (isPerspectiveCamera(controls.camera)) {
        viewHeight = viewHeightForPerspective(radius, controls.camera.fov);
      } else if (isOrthographicCamera(controls.camera)) {
        const zoom = Math.max(controls.camera.zoom, 1e-6);
        const orthoHeight = controls.camera.top - controls.camera.bottom;
        viewHeight = orthoHeight / zoom;
      } else {
        return;
      }

      if (!Number.isFinite(viewHeight) || viewHeight <= 0) return;

      scratch.direction.set(...worldDirection);
      if (scratch.direction.lengthSq() === 0) return;
      scratch.direction.normalize();

      worldFrame.getUpAt(scratch.target, scratch.tmpUp);
      if (scratch.tmpUp.lengthSq() > 0) scratch.tmpUp.normalize();

      const poleLockThreshold = 0.999999;
      const isPoleLocked = scratch.direction.dot(scratch.tmpUp) > poleLockThreshold;

      if (isPoleLocked) {
        relaxPolarClamp();
        scratch.direction.copy(scratch.tmpUp);
      } else {
        restorePolarClamp();
        stabilizePoleDirection({
          direction: scratch.direction,
          up: scratch.tmpUp,
          viewVector: scratch.worldDirection.copy(scratch.position).sub(scratch.target),
        });
      }

      scratch.nextPosition.copy(scratch.target).addScaledVector(scratch.direction, radius);

      const now = performance.now();
      orthoLockRef.current = {
        direction: scratch.direction.clone(),
        ignoreUntil: now + ORTHO_SWITCH_IGNORE_MS,
        rebindDirectionAfterIgnore: !isPoleLocked,
        poleLocked: isPoleLocked,
      };

      if (isPoleLocked) {
        worldFrame.getBasisAt(scratch.target, scratch.viewBasis);
        scratch.tmpUp.copy(scratch.viewBasis.forward);
        if (scratch.direction.dot(scratch.viewBasis.up) >= 0) {
          scratch.tmpUp.multiplyScalar(-1);
        }
        if (Math.abs(scratch.tmpUp.dot(scratch.direction)) > 0.999) {
          scratch.tmpUp.copy(scratch.viewBasis.right);
        }
        if (scratch.tmpUp.lengthSq() === 0) scratch.tmpUp.set(0, 1, 0);
        scratch.tmpUp.normalize();
        applyCameraUp(scratch.tmpUp);
        controls.update(0);
      }

      const currentCamera = controls.camera;
      if (isOrthographicCamera(currentCamera)) {
        const ortho = currentCamera;

        controls.setLookAt(
          scratch.nextPosition.x,
          scratch.nextPosition.y,
          scratch.nextPosition.z,
          scratch.target.x,
          scratch.target.y,
          scratch.target.z,
          true,
        );
        controls.zoomTo(ortho.zoom, true);
        controls.update(0);
        invalidate();
        return;
      }

      controls.setLookAt(
        scratch.nextPosition.x,
        scratch.nextPosition.y,
        scratch.nextPosition.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        true,
      );
      controls.update(0);

      pendingOrthoEnterRef.current = {
        direction: scratch.direction.clone(),
        viewHeight,
        poleLocked: isPoleLocked,
      };
      invalidate();
    },
    [
      applyCameraUp,
      cancelProjectionTransitions,
      invalidate,
      relaxPolarClamp,
      restorePolarClamp,
      scratch,
      worldFrame,
    ],
  );

  const leaveOrthographicView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const orthoCamera = controls.camera;
    if (!isOrthographicCamera(orthoCamera)) return;

    const wasPoleLocked = orthoLockRef.current?.poleLocked;

    cancelProjectionTransitions();
    controls.stop();

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

    scratch.direction.copy(scratch.position).sub(scratch.target);
    if (scratch.direction.lengthSq() === 0) return;
    scratch.direction.normalize();

    const zoom = Math.max(orthoCamera.zoom, 1e-6);
    const orthoHeight = orthoCamera.top - orthoCamera.bottom;
    const viewHeight = orthoHeight / zoom;
    if (!Number.isFinite(viewHeight) || viewHeight <= 0) return;

    const defaultDistance = distanceForViewHeight(viewHeight, MathUtils.degToRad(DEFAULT_PERSPECTIVE_FOV_DEG));
    const targetDistance = MathUtils.clamp(defaultDistance, MIN_DISTANCE, MAX_DISTANCE);
    const targetFovDeg =
      targetDistance === defaultDistance
        ? DEFAULT_PERSPECTIVE_FOV_DEG
        : Math.max(
            MIN_PERSPECTIVE_FOV_DEG,
            fovDegForViewHeightAtDistance(viewHeight, Math.max(MIN_DISTANCE, targetDistance)),
          );

    const fromFovDeg = computeOrthoBlendFovDeg(viewHeight);
    const fromDistance = MathUtils.clamp(
      distanceForViewHeight(viewHeight, MathUtils.degToRad(fromFovDeg)),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );

    scratch.nextPosition.copy(scratch.target).addScaledVector(scratch.direction, fromDistance);

    const perspective = perspectiveCameraRef.current;
    if (!perspective) return;

    perspective.fov = fromFovDeg;
    perspective.position.copy(scratch.nextPosition);
    perspective.up.copy(orthoCamera.up);
    perspective.lookAt(scratch.target);
    perspective.updateProjectionMatrix();

    setActiveProjection("perspective");

    controls.setLookAt(
      scratch.nextPosition.x,
      scratch.nextPosition.y,
      scratch.nextPosition.z,
      scratch.target.x,
      scratch.target.y,
      scratch.target.z,
      false,
    );
    controls.update(0);

    if (wasPoleLocked) startUpBlendToWorldUp();
    clearOrthoLock();

    const duration = 180;
    if (Math.abs(targetFovDeg - fromFovDeg) > 1e-4) {
      projectionBlendRef.current = {
        kind: "exit-orthographic",
        start: performance.now(),
        duration,
        viewHeight,
        fromFovDeg,
        toFovDeg: targetFovDeg,
      };
    }

    invalidate();
  }, [
    cancelProjectionTransitions,
    clearOrthoLock,
    computeOrthoBlendFovDeg,
    invalidate,
    scratch,
    setActiveProjection,
    startUpBlendToWorldUp,
  ]);

  const handleOrbitInput = useCallback(
    (azimuthRadians: number, polarRadians: number) => {
      const lock = orthoLockRef.current;
      if (!lock?.poleLocked || projection !== "orthographic") return false;

      const absPolar = Math.abs(polarRadians);
      const absAzimuth = Math.abs(azimuthRadians);
      const tiltThreshold = 0.0012;
      const tiltRatio = 0.35;
      const tiltIntent = absPolar > tiltThreshold && absPolar > absAzimuth * tiltRatio;

      if (tiltIntent) {
        leaveOrthographicView();
        return false;
      }

      return applyPoleRoll(azimuthRadians);
    },
    [applyPoleRoll, leaveOrthographicView, projection],
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

      if (scratch.worldDirection.lengthSq() === 0) scratch.worldDirection.copy(scratch.viewBasis.up);
      scratch.worldDirection.normalize();
      return [scratch.worldDirection.x, scratch.worldDirection.y, scratch.worldDirection.z];
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

    controls.getTarget(scratch.target);
    worldFrame.getUpAt(scratch.target, scratch.tmpUp);
    if (scratch.tmpUp.lengthSq() > 0) scratch.tmpUp.normalize();

    const lock = orthoLockRef.current;
    const isPoleLocked = Boolean(lock?.poleLocked);
    const upBlend = upBlendRef.current;
    if (upBlend) {
      const now = performance.now();
      const t = MathUtils.clamp((now - upBlend.start) / upBlend.duration, 0, 1);
      scratch.tmpUpBlend.copy(upBlend.from).lerp(upBlend.to, t);
      if (scratch.tmpUpBlend.lengthSq() > 0) scratch.tmpUpBlend.normalize();
      applyCameraUp(scratch.tmpUpBlend);
      if (t >= 1) upBlendRef.current = null;
    } else if (!isPoleLocked) {
      const upDot = controls.camera.up.dot(scratch.tmpUp);
      if (Number.isFinite(upDot) && upDot < 0.999999) {
        applyCameraUp(scratch.tmpUp);
      }
    }

    const viewportHeightPx = Math.max(1, size.height);
    let nextUnitsPerPixel = worldUnitsPerPixelRef.current;
    if (isPerspectiveCamera(controls.camera)) {
      controls.getPosition(scratch.position);
      const distance = scratch.position.distanceTo(scratch.target);
      if (Number.isFinite(distance) && distance > 0) {
        nextUnitsPerPixel = viewHeightForPerspective(distance, controls.camera.fov) / viewportHeightPx;
      }
    } else if (isOrthographicCamera(controls.camera)) {
      const zoom = Math.max(controls.camera.zoom, 1e-6);
      const orthoHeight = controls.camera.top - controls.camera.bottom;
      nextUnitsPerPixel = orthoHeight / zoom / viewportHeightPx;
    }

    if (Number.isFinite(nextUnitsPerPixel) && nextUnitsPerPixel > 0) {
      worldUnitsPerPixelRef.current = nextUnitsPerPixel;
    }

    const defaultViewId = defaultViewRequestRef.current;
    if (defaultViewId) {
      const applied = applyDefaultView(defaultViewId);
      if (applied) {
        defaultViewRequestRef.current = null;
      }
      return;
    }

    const pendingEnter = pendingOrthoEnterRef.current;
    if (pendingEnter && !projectionBlendRef.current) {
      const perspectiveCamera = controls.camera;
      if (!isPerspectiveCamera(perspectiveCamera)) {
        pendingOrthoEnterRef.current = null;
      } else if (!controls.active) {

        const toFovDeg = computeOrthoBlendFovDeg(pendingEnter.viewHeight);
        const fromFovDeg = perspectiveCamera.fov;
        const duration = 180;
        const start = performance.now();

        projectionBlendRef.current = {
          kind: "enter-orthographic",
          start: Math.abs(toFovDeg - fromFovDeg) <= 1e-4 ? start - duration : start,
          duration,
          viewHeight: pendingEnter.viewHeight,
          fromFovDeg,
          toFovDeg,
        };

        invalidate();
      }
    }

    const blend = projectionBlendRef.current;
    if (blend) {
      const perspectiveCamera = controls.camera;
      if (!isPerspectiveCamera(perspectiveCamera)) {
        projectionBlendRef.current = null;
        pendingOrthoEnterRef.current = null;
        return;
      }

      const now = performance.now();
      const t = MathUtils.clamp((now - blend.start) / Math.max(1, blend.duration), 0, 1);
      const eased = t * t * (3 - 2 * t);
      const fovDeg = MathUtils.lerp(blend.fromFovDeg, blend.toFovDeg, eased);

      perspectiveCamera.fov = fovDeg;
      perspectiveCamera.updateProjectionMatrix();

      const distance = MathUtils.clamp(
        distanceForViewHeight(blend.viewHeight, MathUtils.degToRad(fovDeg)),
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
      controls.dollyTo(distance, false);
      controls.update(0);
      invalidate();

      if (t < 1) return;

      if (blend.kind === "enter-orthographic") {
        const orthographic = orthographicCameraRef.current;
        if (!orthographic) {
          projectionBlendRef.current = null;
          pendingOrthoEnterRef.current = null;
          return;
        }

        controls.getTarget(scratch.target);

        const orthoHeight = orthographic.top - orthographic.bottom;
        const orthoZoom = MathUtils.clamp(
          orthoHeight / Math.max(1e-6, blend.viewHeight),
          MIN_ORTHO_ZOOM,
          MAX_ORTHO_ZOOM,
        );

        orthographic.position.copy(perspectiveCamera.position);
        orthographic.quaternion.copy(perspectiveCamera.quaternion);
        orthographic.up.copy(perspectiveCamera.up);
        orthographic.zoom = orthoZoom;
        orthographic.updateProjectionMatrix();

        setActiveProjection("orthographic");
        controls.setLookAt(
          orthographic.position.x,
          orthographic.position.y,
          orthographic.position.z,
          scratch.target.x,
          scratch.target.y,
          scratch.target.z,
          false,
        );
        controls.zoomTo(orthoZoom, false);
        controls.update(0);
      }

      projectionBlendRef.current = null;
      pendingOrthoEnterRef.current = null;
      invalidate();
      return;
    }

    if (projection !== "orthographic") return;

    if (!lock) return;

    if (lock.poleLocked) return;

    const now = performance.now();

    if (lock.rebindDirectionAfterIgnore) {
      if (controls.active) return;

      controls.getTarget(scratch.target);
      controls.getPosition(scratch.position);
      scratch.direction.copy(scratch.position).sub(scratch.target);
      if (scratch.direction.lengthSq() === 0) return;
      scratch.direction.normalize();

      lock.direction.copy(scratch.direction);
      lock.rebindDirectionAfterIgnore = false;
      lock.ignoreUntil = now + 80;
      invalidate();
      return;
    }

    if (now < lock.ignoreUntil) return;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);
    scratch.direction.copy(scratch.position).sub(scratch.target);
    if (scratch.direction.lengthSq() === 0) return;
    scratch.direction.normalize();

    const dot = scratch.direction.dot(lock.direction);
    if (dot >= ORTHO_SWITCH_TOLERANCE_COS) return;

    leaveOrthographicView();
    invalidate();
  }, -3);

  return {
    projection,
    worldFrame,
    controlsRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    worldUnitsPerPixelRef,
    enterOrthographicView,
    leaveOrthographicView,
    handleRotateAroundUp,
    handleOrbitInput,
    requestDefaultView,
    getWorldDirectionFromLocalDirection,
  };
}
