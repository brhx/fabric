import type { CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { Camera } from "three";
import { MathUtils, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import { isPerspectiveCamera } from "../camera";
import type { WorldFrame } from "./worldFrame";

export type OrbitFallbackPlaneContext = {
  target: Vector3;
  camera: Camera;
  worldFrame: WorldFrame;
};

export function TrackpadControls(props: {
  controlsRef: RefObject<CameraControlsImpl | null>;
  worldFrame: WorldFrame;
  rotateSpeed: number;
  panSpeed: number;
  minDistance: number;
  maxDistance: number;
  onOrbitInput?: (azimuthRadians: number, polarRadians: number) => boolean;
  onRenderPan?: (deltaRender: Vector3) => void;
  getOrbitFallbackPlane?: (
    ctx: OrbitFallbackPlaneContext,
    out: Plane,
  ) => Plane | null;
}) {
  const {
    controlsRef,
    worldFrame,
    rotateSpeed,
    panSpeed,
    minDistance,
    maxDistance,
    onOrbitInput,
    onRenderPan,
    getOrbitFallbackPlane,
  } = props;
  const { camera, gl, invalidate, scene } = useThree();
  const lastGestureScale = useRef<number | null>(null);
  const lastOrbitAt = useRef<number | null>(null);

  const scratch = useMemo(
    () => ({
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      pivotPlane: new Plane(),
      orbitPlane: new Plane(),
      viewPlane: new Plane(),
      tmpTarget: new Vector3(),
      tmpPosition: new Vector3(),
      tmpPivot: new Vector3(),
      tmpOffset: new Vector3(),
      tmpViewNormal: new Vector3(),
      tmpZoomBefore: new Vector3(),
      tmpZoomAfter: new Vector3(),
      tmpNextPosition: new Vector3(),
      tmpDelta: new Vector3(),
      tmpPlaneHit: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const getActiveCamera = () => controlsRef.current?.camera ?? camera;

    const isSceneHelper = (object: Object3D | null) => {
      let current: Object3D | null = object;
      while (current) {
        if (current.type === "GridHelper" || current.type === "AxesHelper")
          return true;
        current = current.parent;
      }
      return false;
    };

    const isChromeTarget = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element &&
      Boolean(eventTarget.closest?.('[data-ui-chrome="true"]'));

    const isOverChrome = (
      clientX: number,
      clientY: number,
      eventTarget: EventTarget | null,
    ) => {
      if (isChromeTarget(eventTarget)) return true;
      const underPointer = doc.elementFromPoint(clientX, clientY);
      return Boolean(underPointer?.closest?.('[data-ui-chrome="true"]'));
    };

    const setPointer = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      scratch.pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      );

      return true;
    };

    const setPivotPlaneAtTarget = (target: Vector3) => {
      worldFrame.setPivotPlaneAt(target, scratch.pivotPlane);
    };

    const pickPivotAtClientPoint = (
      clientX: number,
      clientY: number,
      out: Vector3,
    ) => {
      const controls = controlsRef.current;
      if (controls) controls.getTarget(scratch.tmpTarget);
      else scratch.tmpTarget.set(0, 0, 0);

      out.copy(scratch.tmpTarget);

      if (!setPointer(clientX, clientY)) return;

      const activeCamera = getActiveCamera();
      scratch.raycaster.setFromCamera(scratch.pointer, activeCamera);
      const intersections = scratch.raycaster.intersectObjects(
        scene.children,
        true,
      );
      const intersection = intersections.find(
        ({ object }) => !isSceneHelper(object),
      );

      const objectDistance =
        intersection && Number.isFinite(intersection.distance) ?
          intersection.distance
        : null;

      let planeDistance: number | null = null;
      if (getOrbitFallbackPlane) {
        const plane = getOrbitFallbackPlane(
          {
            target: scratch.tmpTarget,
            camera: activeCamera,
            worldFrame: worldFrame,
          },
          scratch.orbitPlane,
        );
        if (
          plane &&
          scratch.raycaster.ray.intersectPlane(plane, scratch.tmpPlaneHit)
        ) {
          planeDistance = scratch.raycaster.ray.origin.distanceTo(
            scratch.tmpPlaneHit,
          );
        }
      }

      if (
        objectDistance !== null &&
        (planeDistance === null || objectDistance <= planeDistance)
      ) {
        out.copy(intersection!.point);
        return;
      }

      if (planeDistance !== null) {
        out.copy(scratch.tmpPlaneHit);
      }
    };

    const orbit = (deltaX: number, deltaY: number) => {
      const controls = controlsRef.current;
      if (!controls) return;

      const azimuth = deltaX * rotateSpeed;
      const polar = deltaY * rotateSpeed;
      const handled = onOrbitInput?.(azimuth, polar);
      if (handled) return;

      void controls.rotate(azimuth, polar, false);
      invalidate();
    };

    const pan = (deltaX: number, deltaY: number) => {
      const controls = controlsRef.current;
      if (!controls) return;

      // NOTE: If/when orthographic views return, pan must be view‑plane relative:
      // - Treat the camera as fixed‑orientation; do NOT orbit or reorient on pan.
      // - Move camera + target together along the plane perpendicular to the view
      //   direction, using the camera's right/up vectors as the axes.
      // - Scale should come from ortho height/zoom (constant units per pixel),
      //   so dragging right/up always translates along camera right/up.
      // This keeps ortho panning consistent from any view cube face/corner and
      // avoids "tangent to globe" behavior that feels wrong for oblique ortho views.

      const viewportHeight = Math.max(1, element.clientHeight);

      let distanceScale = 0;
      const activeCamera = getActiveCamera();
      if (!isPerspectiveCamera(activeCamera)) return;
      controls.getTarget(scratch.tmpTarget);
      controls.getPosition(scratch.tmpPosition);

      const targetDistance = scratch.tmpPosition.distanceTo(scratch.tmpTarget);
      if (!Number.isFinite(targetDistance) || targetDistance <= 0) return;

      const fovInRadians = (activeCamera.fov * Math.PI) / 180;
      distanceScale =
        (2 * targetDistance * Math.tan(fovInRadians / 2)) / viewportHeight;

      const panX = deltaX * distanceScale * panSpeed;
      const panY = deltaY * distanceScale * panSpeed;

      const shouldRebase = Boolean(onRenderPan);
      if (shouldRebase) {
        controls.getTarget(scratch.tmpTarget);
        scratch.tmpPivot.copy(scratch.tmpTarget);
      }

      void controls.truck(panX, panY, false);
      if (shouldRebase) {
        controls.update(0);
        controls.getTarget(scratch.tmpTarget);
        scratch.tmpDelta.copy(scratch.tmpTarget).sub(scratch.tmpPivot);

        if (scratch.tmpDelta.lengthSq() > 0) {
          onRenderPan?.(scratch.tmpDelta);
          controls.getPosition(scratch.tmpPosition);
          scratch.tmpPosition.sub(scratch.tmpDelta);
          scratch.tmpTarget.sub(scratch.tmpDelta);
          void controls.setLookAt(
            scratch.tmpPosition.x,
            scratch.tmpPosition.y,
            scratch.tmpPosition.z,
            scratch.tmpTarget.x,
            scratch.tmpTarget.y,
            scratch.tmpTarget.z,
            false,
          );
          controls.update(0);
        }
      }
      invalidate();
    };

    const zoomToCursorPlane = (
      deltaY: number,
      clientX: number,
      clientY: number,
    ) => {
      const controls = controlsRef.current;
      if (!controls) return;

      if (!setPointer(clientX, clientY)) return;

      controls.getTarget(scratch.tmpTarget);
      controls.getPosition(scratch.tmpPosition);

      setPivotPlaneAtTarget(scratch.tmpTarget);

      const activeCamera = getActiveCamera();
      scratch.raycaster.setFromCamera(scratch.pointer, activeCamera);
      const hitBefore = scratch.raycaster.ray.intersectPlane(
        scratch.pivotPlane,
        scratch.tmpZoomBefore,
      );

      if (!isPerspectiveCamera(activeCamera)) return;
      scratch.tmpOffset.copy(scratch.tmpPosition).sub(scratch.tmpTarget);
      const currentDistance = scratch.tmpOffset.length();
      if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;

      const zoomFactor = Math.exp(deltaY * 0.001);
      const nextDistance = MathUtils.clamp(
        currentDistance * zoomFactor,
        minDistance,
        maxDistance,
      );

      scratch.tmpOffset.normalize();
      scratch.tmpNextPosition
        .copy(scratch.tmpTarget)
        .addScaledVector(scratch.tmpOffset, nextDistance);

      void controls.setLookAt(
        scratch.tmpNextPosition.x,
        scratch.tmpNextPosition.y,
        scratch.tmpNextPosition.z,
        scratch.tmpTarget.x,
        scratch.tmpTarget.y,
        scratch.tmpTarget.z,
        false,
      );
      controls.update(0);

      if (!hitBefore) {
        invalidate();
        return;
      }

      scratch.raycaster.setFromCamera(scratch.pointer, activeCamera);
      const hitAfter = scratch.raycaster.ray.intersectPlane(
        scratch.pivotPlane,
        scratch.tmpZoomAfter,
      );

      if (!hitAfter) {
        invalidate();
        return;
      }

      scratch.tmpDelta.copy(scratch.tmpZoomBefore).sub(scratch.tmpZoomAfter);

      void controls.setLookAt(
        scratch.tmpNextPosition.x + scratch.tmpDelta.x,
        scratch.tmpNextPosition.y + scratch.tmpDelta.y,
        scratch.tmpNextPosition.z + scratch.tmpDelta.z,
        scratch.tmpTarget.x + scratch.tmpDelta.x,
        scratch.tmpTarget.y + scratch.tmpDelta.y,
        scratch.tmpTarget.z + scratch.tmpDelta.z,
        false,
      );
      controls.update(0);
      invalidate();
    };

    const onWheel = (event: WheelEvent) => {
      if (isOverChrome(event.clientX, event.clientY, event.target)) return;

      event.preventDefault();

      if (event.ctrlKey) {
        lastOrbitAt.current = null;
        zoomToCursorPlane(event.deltaY, event.clientX, event.clientY);
      } else if (event.shiftKey) {
        const now = view.performance?.now?.() ?? Date.now();
        const repickAfterMs = 180;
        const shouldRepick =
          lastOrbitAt.current === null ||
          now - lastOrbitAt.current > repickAfterMs;

        if (shouldRepick) {
          pickPivotAtClientPoint(
            event.clientX,
            event.clientY,
            scratch.tmpPivot,
          );
          const controls = controlsRef.current;
          if (controls) {
            controls.setOrbitPoint(
              scratch.tmpPivot.x,
              scratch.tmpPivot.y,
              scratch.tmpPivot.z,
            );
          }
        }

        lastOrbitAt.current = now;
        orbit(event.deltaX, event.deltaY);
      } else {
        lastOrbitAt.current = null;
        pan(event.deltaX, event.deltaY);
      }
    };

    const onGestureStart = (event: Event) => {
      const gestureEvent = event as any;
      const clientX = Number(gestureEvent?.clientX ?? 0);
      const clientY = Number(gestureEvent?.clientY ?? 0);
      if (isOverChrome(clientX, clientY, gestureEvent?.target ?? null)) return;

      gestureEvent.preventDefault?.();
      lastGestureScale.current = Number(gestureEvent?.scale ?? 1);
    };

    const onGestureChange = (event: Event) => {
      const gestureEvent = event as any;
      const clientX = Number(gestureEvent?.clientX ?? 0);
      const clientY = Number(gestureEvent?.clientY ?? 0);
      if (isOverChrome(clientX, clientY, gestureEvent?.target ?? null)) return;

      gestureEvent.preventDefault?.();
      const scale = Number(gestureEvent?.scale ?? 1);
      if (!Number.isFinite(scale) || scale === 0) return;

      const previous = lastGestureScale.current ?? scale;
      const delta = scale / previous;
      lastGestureScale.current = scale;

      lastOrbitAt.current = null;
      zoomToCursorPlane(Math.log(1 / delta) / 0.001, clientX, clientY);
    };

    const onGestureEnd = () => {
      lastGestureScale.current = null;
    };

    view.addEventListener("wheel", onWheel, { passive: false });
    view.addEventListener("gesturestart", onGestureStart, {
      passive: false,
    } as any);
    view.addEventListener("gesturechange", onGestureChange, {
      passive: false,
    } as any);
    view.addEventListener("gestureend", onGestureEnd, { passive: true } as any);

    return () => {
      view.removeEventListener("wheel", onWheel as any);
      view.removeEventListener("gesturestart", onGestureStart as any);
      view.removeEventListener("gesturechange", onGestureChange as any);
      view.removeEventListener("gestureend", onGestureEnd as any);
    };
  }, [
    camera,
    gl,
    invalidate,
    controlsRef,
    maxDistance,
    minDistance,
    panSpeed,
    rotateSpeed,
    onOrbitInput,
    onRenderPan,
    getOrbitFallbackPlane,
    worldFrame,
    scene,
    scratch,
  ]);

  return null;
}
