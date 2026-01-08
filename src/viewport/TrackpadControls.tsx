import type { CameraControlsImpl } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { MathUtils, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera } from "../camera";
import type { WorldFrame } from "./worldFrame";

export function TrackpadControls(props: {
  controlsRef: RefObject<CameraControlsImpl | null>;
  worldFrame: WorldFrame;
  rotateSpeed: number;
  panSpeed: number;
  minDistance: number;
  maxDistance: number;
  minOrthoZoom: number;
  maxOrthoZoom: number;
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

    const orthographicCamera = isOrthographicCamera(camera) ? camera : null;
    const perspectiveCamera = isPerspectiveCamera(camera) ? camera : null;
    const isOrthographic = orthographicCamera !== null;

    const isSceneHelper = (object: Object3D | null) => {
      let current: Object3D | null = object;
      while (current) {
        if (current.type === "GridHelper" || current.type === "AxesHelper") return true;
        current = current.parent;
      }
      return false;
    };

    const isChromeTarget = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element &&
      Boolean(eventTarget.closest?.('[data-ui-chrome="true"]'));

    const isOverChrome = (clientX: number, clientY: number, eventTarget: EventTarget | null) => {
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

    const pickPivotAtClientPoint = (clientX: number, clientY: number, out: Vector3) => {
      const controls = props.controlsRef.current;
      if (controls) controls.getTarget(out);
      else out.set(0, 0, 0);

      setPivotPlaneAtTarget(out);

      if (!setPointer(clientX, clientY)) return;

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
      const intersections = scratch.raycaster.intersectObjects(scene.children, true);
      const intersection = intersections.find(({ object }) => !isSceneHelper(object));

      if (intersection) {
        out.copy(intersection.point);
        return;
      }

      camera.getWorldDirection(scratch.tmpViewNormal).normalize();
      const gridFacing = Math.abs(scratch.tmpViewNormal.dot(scratch.pivotPlane.normal)) >= 0.12;
      if (gridFacing && scratch.raycaster.ray.intersectPlane(scratch.pivotPlane, scratch.tmpPivot)) {
        out.copy(scratch.tmpPivot);
        return;
      }

      scratch.viewPlane.setFromNormalAndCoplanarPoint(scratch.tmpViewNormal, out);
      if (scratch.raycaster.ray.intersectPlane(scratch.viewPlane, scratch.tmpPivot)) {
        out.copy(scratch.tmpPivot);
      }
    };

    const orbit = (deltaX: number, deltaY: number) => {
      const controls = props.controlsRef.current;
      if (!controls) return;

      controls.rotate(deltaX * props.rotateSpeed, deltaY * props.rotateSpeed, false);
      invalidate();
    };

    const pan = (deltaX: number, deltaY: number) => {
      const controls = props.controlsRef.current;
      if (!controls) return;

      const viewportHeight = Math.max(1, element.clientHeight);

      let distanceScale = 0;
      if (isOrthographic) {
        if (!orthographicCamera) return;
        const zoom = Math.max(orthographicCamera.zoom, 1e-6);
        const orthoHeight = orthographicCamera.top - orthographicCamera.bottom;
        distanceScale = orthoHeight / zoom / viewportHeight;
      } else {
        if (!perspectiveCamera) return;
        controls.getTarget(scratch.tmpTarget);
        controls.getPosition(scratch.tmpPosition);

        const targetDistance = scratch.tmpPosition.distanceTo(scratch.tmpTarget);
        if (!Number.isFinite(targetDistance) || targetDistance <= 0) return;

        const fovInRadians = (perspectiveCamera.fov * Math.PI) / 180;
        distanceScale = (2 * targetDistance * Math.tan(fovInRadians / 2)) / viewportHeight;
      }

      const panX = deltaX * distanceScale * props.panSpeed;
      const panY = deltaY * distanceScale * props.panSpeed;

      controls.truck(panX, panY, false);
      invalidate();
    };

    const zoomToCursorPlane = (deltaY: number, clientX: number, clientY: number) => {
      const controls = props.controlsRef.current;
      if (!controls) return;

      if (!setPointer(clientX, clientY)) return;

      controls.getTarget(scratch.tmpTarget);
      controls.getPosition(scratch.tmpPosition);

      setPivotPlaneAtTarget(scratch.tmpTarget);

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
      const hitBefore = scratch.raycaster.ray.intersectPlane(scratch.pivotPlane, scratch.tmpZoomBefore);

      if (isOrthographic) {
        if (!orthographicCamera) return;
        const zoomFactor = Math.exp(deltaY * 0.001);
        const nextZoom = MathUtils.clamp(
          orthographicCamera.zoom / zoomFactor,
          props.minOrthoZoom,
          props.maxOrthoZoom,
        );

        controls.getTarget(scratch.tmpTarget);
        controls.getPosition(scratch.tmpPosition);

        controls.zoomTo(nextZoom, false);
        controls.update(0);

        if (!hitBefore) {
          invalidate();
          return;
        }

        scratch.raycaster.setFromCamera(scratch.pointer, camera);
        const hitAfter = scratch.raycaster.ray.intersectPlane(scratch.pivotPlane, scratch.tmpZoomAfter);

        if (!hitAfter) {
          invalidate();
          return;
        }

        scratch.tmpDelta.copy(scratch.tmpZoomBefore).sub(scratch.tmpZoomAfter);

        controls.setLookAt(
          scratch.tmpPosition.x + scratch.tmpDelta.x,
          scratch.tmpPosition.y + scratch.tmpDelta.y,
          scratch.tmpPosition.z + scratch.tmpDelta.z,
          scratch.tmpTarget.x + scratch.tmpDelta.x,
          scratch.tmpTarget.y + scratch.tmpDelta.y,
          scratch.tmpTarget.z + scratch.tmpDelta.z,
          false,
        );
        controls.update(0);
        invalidate();
        return;
      }

      if (!perspectiveCamera) return;
      scratch.tmpOffset.copy(scratch.tmpPosition).sub(scratch.tmpTarget);
      const currentDistance = scratch.tmpOffset.length();
      if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;

      const zoomFactor = Math.exp(deltaY * 0.001);
      const nextDistance = MathUtils.clamp(currentDistance * zoomFactor, props.minDistance, props.maxDistance);

      scratch.tmpOffset.normalize();
      scratch.tmpNextPosition.copy(scratch.tmpTarget).addScaledVector(scratch.tmpOffset, nextDistance);

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

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
      const hitAfter = scratch.raycaster.ray.intersectPlane(scratch.pivotPlane, scratch.tmpZoomAfter);

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
        const shouldRepick = lastOrbitAt.current === null || now - lastOrbitAt.current > repickAfterMs;

        if (shouldRepick) {
          pickPivotAtClientPoint(event.clientX, event.clientY, scratch.tmpPivot);
          const controls = props.controlsRef.current;
          if (controls) {
            controls.setOrbitPoint(scratch.tmpPivot.x, scratch.tmpPivot.y, scratch.tmpPivot.z);
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
    view.addEventListener("gesturestart", onGestureStart, { passive: false } as any);
    view.addEventListener("gesturechange", onGestureChange, { passive: false } as any);
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
    props.maxOrthoZoom,
    props.minDistance,
    props.minOrthoZoom,
    props.panSpeed,
    props.rotateSpeed,
    props.worldFrame,
    scene,
    scratch,
  ]);

  return null;
}
