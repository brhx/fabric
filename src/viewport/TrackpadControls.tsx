import type { CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import { isPerspectiveCamera } from "../camera";
import type { WorldFrame } from "./worldFrame";

export function TrackpadControls(props: {
  controlsRef: RefObject<CameraControlsImpl | null>;
  worldFrame: WorldFrame;
  rotateSpeed: number;
  panSpeed: number;
  minDistance: number;
  maxDistance: number;
  onOrbitInput?: (azimuthRadians: number, polarRadians: number) => boolean;
  onRenderPan?: (deltaRender: Vector3) => void;
}) {
  const { camera, gl, invalidate, scene } = useThree();
  const lastGestureScale = useRef<number | null>(null);
  const lastOrbitAt = useRef<number | null>(null);

  const scratch = useMemo(
    () => ({
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      pivotPlane: new Plane(),
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
    }),
    [],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const getActiveCamera = () => props.controlsRef.current?.camera ?? camera;

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
      props.worldFrame.setPivotPlaneAt(target, scratch.pivotPlane);
    };

    const pickPivotAtClientPoint = (
      clientX: number,
      clientY: number,
      out: Vector3,
    ) => {
      const controls = props.controlsRef.current;
      if (controls) controls.getTarget(out);
      else out.set(0, 0, 0);

      setPivotPlaneAtTarget(out);

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

      if (intersection) {
        out.copy(intersection.point);
        return;
      }

      activeCamera.getWorldDirection(scratch.tmpViewNormal).normalize();
      const gridFacing =
        Math.abs(scratch.tmpViewNormal.dot(scratch.pivotPlane.normal)) >= 0.12;
      if (
        gridFacing &&
        scratch.raycaster.ray.intersectPlane(
          scratch.pivotPlane,
          scratch.tmpPivot,
        )
      ) {
        out.copy(scratch.tmpPivot);
        return;
      }

      scratch.viewPlane.setFromNormalAndCoplanarPoint(
        scratch.tmpViewNormal,
        out,
      );
      if (
        scratch.raycaster.ray.intersectPlane(
          scratch.viewPlane,
          scratch.tmpPivot,
        )
      ) {
        out.copy(scratch.tmpPivot);
      }
    };

    const orbit = (deltaX: number, deltaY: number) => {
      const controls = props.controlsRef.current;
      if (!controls) return;

      const azimuth = deltaX * props.rotateSpeed;
      const polar = deltaY * props.rotateSpeed;
      const handled = props.onOrbitInput?.(azimuth, polar);
      if (handled) return;

      controls.rotate(azimuth, polar, false);
      invalidate();
    };

    const pan = (deltaX: number, deltaY: number) => {
      const controls = props.controlsRef.current;
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

      const panX = deltaX * distanceScale * props.panSpeed;
      const panY = deltaY * distanceScale * props.panSpeed;

      const shouldRebase = Boolean(props.onRenderPan);
      if (shouldRebase) {
        controls.getTarget(scratch.tmpTarget);
        scratch.tmpPivot.copy(scratch.tmpTarget);
      }

      controls.truck(panX, panY, false);
      if (shouldRebase) {
        controls.update(0);
        controls.getTarget(scratch.tmpTarget);
        scratch.tmpDelta.copy(scratch.tmpTarget).sub(scratch.tmpPivot);

        if (scratch.tmpDelta.lengthSq() > 0) {
          props.onRenderPan?.(scratch.tmpDelta);
          controls.getPosition(scratch.tmpPosition);
          scratch.tmpPosition.sub(scratch.tmpDelta);
          scratch.tmpTarget.sub(scratch.tmpDelta);
          controls.setLookAt(
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
      const controls = props.controlsRef.current;
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
        props.minDistance,
        props.maxDistance,
      );

      scratch.tmpOffset.normalize();
      scratch.tmpNextPosition
        .copy(scratch.tmpTarget)
        .addScaledVector(scratch.tmpOffset, nextDistance);

      controls.setLookAt(
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

      controls.setLookAt(
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
          const controls = props.controlsRef.current;
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
    props.controlsRef,
    props.maxDistance,
    props.minDistance,
    props.panSpeed,
    props.rotateSpeed,
    props.onOrbitInput,
    props.onRenderPan,
    props.worldFrame,
    scene,
    scratch,
  ]);

  return null;
}
