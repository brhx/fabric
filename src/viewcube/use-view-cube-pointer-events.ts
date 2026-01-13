import type { CameraControlsImpl } from "@react-three/drei";
import type { MutableRefObject, RefObject } from "react";
import { useEffect } from "react";
import { Vector3 } from "three";
import {
  VIEWCUBE_DRAG_ROTATE_SPEED,
  VIEWCUBE_DRAG_THRESHOLD_PX,
} from "./constants";
import type { ViewCubeHit } from "./hit-test";
import { tupleToVector3 } from "./vector-utils";

export type ViewCubeDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  didDrag: boolean;
  snapHit: ViewCubeHit | null;
};

export function useViewCubePointerEvents(options: {
  element: HTMLCanvasElement | null;
  controlsRef: RefObject<CameraControlsImpl | null>;
  getCubeHitFromClientPoint: (
    clientX: number,
    clientY: number,
  ) => ViewCubeHit | null;
  updateHoverHit: (hit: ViewCubeHit | null) => void;
  dragStateRef: MutableRefObject<ViewCubeDragState | null>;
  pointerClientRef: MutableRefObject<{ x: number; y: number } | null>;
  localToWorldDirection: (
    localDirection: readonly [number, number, number],
  ) => [number, number, number];
  onOrbitInput?: (azimuthRadians: number, polarRadians: number) => boolean;
  onSelectDirection?: (worldDirection: [number, number, number]) => void;
  moveCameraToWorldDirection: (worldDirection: Vector3) => void;
  scratchWorldDirection: Vector3;
  invalidate: () => void;
}) {
  const {
    element,
    controlsRef,
    getCubeHitFromClientPoint,
    updateHoverHit,
    dragStateRef,
    pointerClientRef,
    localToWorldDirection,
    onOrbitInput,
    onSelectDirection,
    moveCameraToWorldDirection,
    scratchWorldDirection,
    invalidate,
  } = options;

  useEffect(() => {
    if (!element) return;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    const captureOptions = { capture: true } as const;

    const stopIfHandled = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const isOverUiChrome = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('button[data-ui-chrome="true"]'));
    };

    const updatePointerClient = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (state && state.pointerId !== event.pointerId) return;
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
    };

    const clearPointerClient = () => {
      pointerClientRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (isOverUiChrome(event)) {
        clearPointerClient();
        updateHoverHit(null);
        return;
      }
      updatePointerClient(event);

      const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
      if (!hit) return;

      stopIfHandled(event);
      element.setPointerCapture?.(event.pointerId);

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        didDrag: false,
        snapHit: hit,
      };

      updateHoverHit(hit);
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (state) {
        if (state.pointerId !== event.pointerId) return;

        updatePointerClient(event);
        stopIfHandled(event);

        if (event.pointerType === "mouse" && event.buttons === 0) {
          dragStateRef.current = null;
          element.releasePointerCapture?.(event.pointerId);
          updateHoverHit(null);
          return;
        }

        const dx = event.clientX - state.lastX;
        const dy = event.clientY - state.lastY;
        state.lastX = event.clientX;
        state.lastY = event.clientY;

        const wasDragging = state.didDrag;
        if (!state.didDrag) {
          const totalDx = event.clientX - state.startX;
          const totalDy = event.clientY - state.startY;
          if (Math.hypot(totalDx, totalDy) >= VIEWCUBE_DRAG_THRESHOLD_PX)
            state.didDrag = true;
        }

        if (!wasDragging && state.didDrag) updateHoverHit(null);

        if (!state.didDrag) {
          const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
          if (hit) state.snapHit = hit;
          updateHoverHit(hit);
          return;
        }

        const controls = controlsRef.current;
        if (!controls) return;

        const azimuth = -dx * VIEWCUBE_DRAG_ROTATE_SPEED;
        const polar = -dy * VIEWCUBE_DRAG_ROTATE_SPEED;
        const handled = onOrbitInput?.(azimuth, polar);
        if (!handled) {
          void controls.rotate(azimuth, polar, false);
        }
        invalidate();
        return;
      }

      if (isOverUiChrome(event)) {
        clearPointerClient();
        updateHoverHit(null);
        return;
      }

      updatePointerClient(event);
      const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
      if (hit) stopIfHandled(event);
      updateHoverHit(hit);
    };

    const onPointerUp = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;

      updatePointerClient(event);
      stopIfHandled(event);
      element.releasePointerCapture?.(event.pointerId);

      if (state.didDrag) return;

      const releaseHit = getCubeHitFromClientPoint(
        event.clientX,
        event.clientY,
      );
      const snapLocal =
        releaseHit?.localDirection ?? state.snapHit?.localDirection;
      const snap = snapLocal ? localToWorldDirection(snapLocal) : null;
      if (!snap) return;

      if (onSelectDirection) {
        onSelectDirection(snap);
        return;
      }

      tupleToVector3(snap, scratchWorldDirection);
      moveCameraToWorldDirection(scratchWorldDirection);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;

      updatePointerClient(event);
      stopIfHandled(event);
      element.releasePointerCapture?.(event.pointerId);
      updateHoverHit(null);
    };

    const onLostPointerCapture = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;
      updateHoverHit(null);
    };

    const onMouseLeave = () => {
      if (dragStateRef.current) return;
      clearPointerClient();
      updateHoverHit(null);
    };

    const onBlur = () => {
      dragStateRef.current = null;
      clearPointerClient();
      updateHoverHit(null);
    };

    const onVisibilityChange = () => {
      if (doc.visibilityState !== "visible") onBlur();
    };

    doc.addEventListener("pointerdown", onPointerDown, captureOptions);
    doc.addEventListener("pointermove", onPointerMove, captureOptions);
    doc.addEventListener("pointerup", onPointerUp, captureOptions);
    doc.addEventListener("pointercancel", onPointerCancel, captureOptions);
    element.addEventListener("lostpointercapture", onLostPointerCapture);
    element.addEventListener("mouseleave", onMouseLeave);
    view.addEventListener("blur", onBlur);
    doc.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, captureOptions);
      doc.removeEventListener("pointermove", onPointerMove, captureOptions);
      doc.removeEventListener("pointerup", onPointerUp, captureOptions);
      doc.removeEventListener("pointercancel", onPointerCancel, captureOptions);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      element.removeEventListener("mouseleave", onMouseLeave);
      view.removeEventListener("blur", onBlur);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    controlsRef,
    element,
    getCubeHitFromClientPoint,
    invalidate,
    localToWorldDirection,
    moveCameraToWorldDirection,
    onOrbitInput,
    onSelectDirection,
    pointerClientRef,
    dragStateRef,
    scratchWorldDirection,
    updateHoverHit,
  ]);
}
