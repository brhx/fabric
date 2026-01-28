import type { CameraControlsImpl } from "@react-three/drei";
import {
  OrthographicCamera as DreiOrthographicCamera,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ComponentPropsWithoutRef, MutableRefObject } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type {
  Camera,
  OrthographicCamera as ThreeOrthographicCamera,
  PerspectiveCamera as ThreePerspectiveCamera,
} from "three";
import { MathUtils, Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera } from "../camera";
import { stopControlsAtCurrent } from "./camera-controls-utils";
import { fovDegForViewHeightAtDistance } from "./camera-math";
import { DEFAULT_PERSPECTIVE_FOV_DEG } from "./constants";
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

export type ProjectionMode = "perspective" | "orthographic";

export type ProjectionCameraPairHandle = {
  getPerspectiveCamera: () => ThreePerspectiveCamera | null;
  getOrthographicCamera: () => ThreeOrthographicCamera | null;
  getActiveCamera: () => Camera | null;
  setProjection: (mode: ProjectionMode) => boolean;
  toggleProjection: (options?: { durationMs?: number }) => boolean;
  cancelProjectionTransition: () => void;
  isProjectionTransitionActive: () => boolean;
};

type PerspectiveCameraProps = Omit<
  ComponentPropsWithoutRef<typeof DreiPerspectiveCamera>,
  "makeDefault" | "ref"
>;

type OrthographicCameraProps = Omit<
  ComponentPropsWithoutRef<typeof DreiOrthographicCamera>,
  "makeDefault" | "ref"
>;

export type ProjectionCameraPairProps = {
  mode?: ProjectionMode;
  makeDefault?: boolean;
  onActiveCameraChange?: (camera: Camera | null) => void;
  controlsRef?: MutableRefObject<CameraControlsImpl | null>;
  inputBlockRef?: MutableRefObject<number>;
  perspectiveRef?: MutableRefObject<ThreePerspectiveCamera | null>;
  orthographicRef?: MutableRefObject<ThreeOrthographicCamera | null>;
  perspectiveProps?: PerspectiveCameraProps;
  orthographicProps?: OrthographicCameraProps;
};

type ProjectionTransitionState = {
  blockToken: number;
  to: ProjectionMode;
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
};

export const ProjectionCameraPair = forwardRef<
  ProjectionCameraPairHandle,
  ProjectionCameraPairProps
>(function ProjectionCameraPair(props, ref) {
  const { invalidate, set } = useThree();
  const {
    mode,
    makeDefault = false,
    onActiveCameraChange,
    controlsRef,
    inputBlockRef,
    perspectiveRef,
    orthographicRef,
    perspectiveProps,
    orthographicProps,
  } = props;

  const perspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<ThreeOrthographicCamera | null>(null);
  const activeCameraRef = useRef<Camera | null>(null);
  const desiredModeRef = useRef<ProjectionMode>(mode ?? "perspective");
  const projectionTransitionRef = useRef<ProjectionTransitionState | null>(
    null,
  );

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      focalOffset: new Vector3(),
      worldDirection: new Vector3(),
      nudge: new Vector3(),
    }),
    [],
  );

  const beginInputBlock = useCallback(() => {
    if (!inputBlockRef) return 0;
    const next = inputBlockRef.current + 1;
    inputBlockRef.current = next;
    return next;
  }, [inputBlockRef]);

  const endInputBlock = useCallback(
    (token: number) => {
      if (!inputBlockRef) return;
      if (inputBlockRef.current !== token) return;
      inputBlockRef.current = 0;
    },
    [inputBlockRef],
  );

  const cancelProjectionTransition = useCallback(() => {
    const state = projectionTransitionRef.current;
    if (!state) return;
    endInputBlock(state.blockToken);
    projectionTransitionRef.current = null;
  }, [endInputBlock]);

  const isProjectionTransitionActive = useCallback(
    () => projectionTransitionRef.current !== null,
    [],
  );

  const applyProjection = useCallback(
    (nextMode: ProjectionMode) => {
      desiredModeRef.current = nextMode;
      const nextCamera =
        nextMode === "orthographic" ?
          orthographicCameraRef.current
        : perspectiveCameraRef.current;
      if (!nextCamera) return false;
      if (activeCameraRef.current === nextCamera) return true;

      activeCameraRef.current = nextCamera;
      if (makeDefault) set({ camera: nextCamera });
      onActiveCameraChange?.(nextCamera);
      return true;
    },
    [makeDefault, onActiveCameraChange, set],
  );

  const setProjection = useCallback(
    (nextMode: ProjectionMode) => {
      cancelProjectionTransition();
      return applyProjection(nextMode);
    },
    [applyProjection, cancelProjectionTransition],
  );

  useLayoutEffect(() => {
    applyProjection(desiredModeRef.current);
  }, [applyProjection]);

  useLayoutEffect(() => {
    if (!mode) return;
    setProjection(mode);
  }, [setProjection, mode]);

  const setPerspectiveCamera = useCallback(
    (node: ThreePerspectiveCamera | null) => {
      perspectiveCameraRef.current = node;
      if (perspectiveRef) {
        perspectiveRef.current = node;
      }
      if (node) applyProjection(desiredModeRef.current);
    },
    [applyProjection, perspectiveRef],
  );

  const setOrthographicCamera = useCallback(
    (node: ThreeOrthographicCamera | null) => {
      orthographicCameraRef.current = node;
      if (orthographicRef) {
        orthographicRef.current = node;
      }
      if (node) applyProjection(desiredModeRef.current);
    },
    [applyProjection, orthographicRef],
  );

  const toggleProjection = useCallback(
    (options?: { durationMs?: number }) => {
      const durationMs = options?.durationMs ?? 420;

      const controls = controlsRef?.current ?? null;
      const perspective = perspectiveCameraRef.current;
      const orthographic = orthographicCameraRef.current;
      if (!controls || !perspective || !orthographic) return false;

      cancelProjectionTransition();

      // Freeze any in-flight transitions so we can read a consistent state.
      stopControlsAtCurrent(controls);

      controls.getTarget(scratch.target, false);
      controls.getPosition(scratch.position, false);
      controls.getFocalOffset(scratch.focalOffset, false);
      controls.update(0);

      const minDistance =
        Number.isFinite(controls.minDistance) ?
          Math.max(0, controls.minDistance)
        : 0;
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

          applyProjection("orthographic");
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
          maxDistance === Infinity ? Infinity : (
            maxDistance + scratch.focalOffset.z
          );
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
          maxDistance === Infinity ? Infinity : (
            Math.max(minDistanceActual, maxDistance + offsetZ)
          );

        if (durationMs <= 0) {
          const solvedStart = solvePerspectiveDistanceForViewHeight({
            viewHeight,
            fovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
            minDistance: minDistanceActual,
            maxDistance: maxDistanceActual,
          });
          if (!solvedStart) return false;

          const fovStart = solvedStart.fovDeg;
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

          applyProjection("perspective");
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

        applyProjection("perspective");
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
    [
      applyProjection,
      beginInputBlock,
      cancelProjectionTransition,
      controlsRef,
      invalidate,
      scratch,
    ],
  );

  useEffect(() => {
    return () => {
      cancelProjectionTransition();
    };
  }, [cancelProjectionTransition]);

  useFrame(() => {
    const projectionTransition = projectionTransitionRef.current;
    if (!projectionTransition) return;

    const controls = controlsRef?.current ?? null;
    const perspective = perspectiveCameraRef.current;
    const orthographic = orthographicCameraRef.current;
    if (!controls || !perspective || !orthographic) {
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
          applyProjection("orthographic");
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
  });

  useImperativeHandle(
    ref,
    () => ({
      getPerspectiveCamera: () => perspectiveCameraRef.current,
      getOrthographicCamera: () => orthographicCameraRef.current,
      getActiveCamera: () =>
        activeCameraRef.current ??
        perspectiveCameraRef.current ??
        orthographicCameraRef.current,
      setProjection,
      toggleProjection,
      cancelProjectionTransition,
      isProjectionTransitionActive,
    }),
    [
      cancelProjectionTransition,
      isProjectionTransitionActive,
      setProjection,
      toggleProjection,
    ],
  );

  return (
    <>
      <DreiPerspectiveCamera
        {...perspectiveProps}
        ref={setPerspectiveCamera}
        makeDefault={false}
      />
      <DreiOrthographicCamera
        {...orthographicProps}
        ref={setOrthographicCamera}
        makeDefault={false}
      />
    </>
  );
});
