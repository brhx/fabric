import type { CameraControlsImpl } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { createPortal } from "react-dom";
import { Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera, type Projection } from "../camera";
import type { LocalEnuFrame } from "../geo/localFrame";
import type { Geodetic } from "../geo/wgs84";
import { VIEWCUBE_MARGIN_RIGHT_PX, VIEWCUBE_MARGIN_TOP_PX, VIEWCUBE_WIDGET_WIDTH_PX } from "../ViewCube";
import type { CameraRigDebugRefs } from "./useCameraRig";

function formatNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "NaN";
  return value.toFixed(decimals);
}

function formatVec3(v: Vector3, decimals = 3) {
  return `(${formatNumber(v.x, decimals)}, ${formatNumber(v.y, decimals)}, ${formatNumber(v.z, decimals)})`;
}

function radToDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

export function ViewportDebugOverlay(props: {
  controlsRef: RefObject<CameraControlsImpl | null>;
  projection: Projection;
  worldUnitsPerPixelRef: MutableRefObject<number>;
  rigDebug: CameraRigDebugRefs;
  geo: { geodetic: Geodetic; originEcef: Vector3; renderOffset: Vector3; frame: LocalEnuFrame };
  enabledByDefault?: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const fallbackCamera = useThree((state) => state.camera);
  const [enabled, setEnabled] = useState(props.enabledByDefault ?? true);
  const [layout, setLayout] = useState(() => ({ rightPx: 8, topPx: 8 }));
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const scratch = useMemo(
    () => ({
      position: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      tmp: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const parent = element.parentElement ?? doc.body;
    const root = doc.createElement("div");
    root.style.position = "absolute";
    root.style.inset = "0";
    root.style.pointerEvents = "none";
    root.style.zIndex = "50";

    const computed = view.getComputedStyle(parent);
    const previousPosition = parent.style.position;
    if (computed.position === "static") parent.style.position = "relative";

    parent.appendChild(root);
    setPortalRoot(root);

    let frame: number | null = null;

    const updateLayout = () => {
      frame = null;

      const canvasRect = element.getBoundingClientRect();
      const viewportElement = doc.querySelector('[data-viewport-area="true"]') as HTMLElement | null;
      const viewportRect = viewportElement?.getBoundingClientRect() ?? canvasRect;

      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const gapPx = 12;
      const next = {
        rightPx: Math.round(rightInset + VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX + gapPx),
        topPx: Math.round(topInset + VIEWCUBE_MARGIN_TOP_PX),
      };

      setLayout((current) => {
        if (current.rightPx === next.rightPx && current.topPx === next.topPx) return current;
        return next;
      });
    };

    const scheduleLayout = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(updateLayout);
    };

    scheduleLayout();

    view.addEventListener("resize", scheduleLayout);
    view.addEventListener("scroll", scheduleLayout, { passive: true, capture: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleLayout();
          });

    const viewportElement = doc.querySelector('[data-viewport-area="true"]') as HTMLElement | null;
    if (resizeObserver && viewportElement) resizeObserver.observe(viewportElement);

    const isEditableTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return false;
      const editable = eventTarget.closest?.(
        'input,textarea,select,[contenteditable="true"],[contenteditable=""]',
      );
      return Boolean(editable);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "d" && event.key !== "D") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setEnabled((prev) => !prev);
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      view.removeEventListener("resize", scheduleLayout);
      view.removeEventListener("scroll", scheduleLayout, { capture: true } as any);
      resizeObserver?.disconnect();
      view.removeEventListener("keydown", onKeyDown, { capture: true } as any);

      root.remove();
      setPortalRoot(null);
      if (computed.position === "static") parent.style.position = previousPosition;
    };
  }, [gl]);

  useFrame(() => {
    const pre = preRef.current;
    if (!pre) return;
    if (!enabled) {
      pre.textContent = "";
      return;
    }

    const controls = props.controlsRef.current;
    const activeCamera = controls?.camera ?? fallbackCamera;
    const isOrtho = isOrthographicCamera(activeCamera);
    const isPersp = isPerspectiveCamera(activeCamera);

    if (controls) {
      controls.getPosition(scratch.position);
      controls.getTarget(scratch.target);
    } else {
      scratch.position.copy(activeCamera.position);
      scratch.target.set(0, 0, 0);
    }
    scratch.up.copy(activeCamera.up);

    const distance = scratch.position.distanceTo(scratch.target);
    const unitsPerPixel = props.worldUnitsPerPixelRef.current;

    const lock = props.rigDebug.orthoLockRef.current;
    const pending = props.rigDebug.pendingOrthoEnterRef.current;
    const lastPerspective = props.rigDebug.lastPerspectiveRef.current;

    const { geodetic, originEcef, renderOffset, frame } = props.geo;

    const latDeg = radToDeg(geodetic.latRad);
    const lonDeg = radToDeg(geodetic.lonRad);

    const lines: string[] = [];
    lines.push("Viewport Debug  (toggle: D)");
    lines.push("");
    lines.push(`projection: ${props.projection}`);
    lines.push(`camera: ${isPersp ? "perspective" : isOrtho ? "orthographic" : "unknown"}`);
    if (isPersp) lines.push(`fov: ${formatNumber(activeCamera.fov, 2)}°`);
    if (isOrtho) lines.push(`zoom: ${formatNumber(activeCamera.zoom, 4)}`);
    lines.push(`pos: ${formatVec3(scratch.position, 3)}`);
    lines.push(`tgt: ${formatVec3(scratch.target, 3)}`);
    lines.push(`up:  ${formatVec3(scratch.up, 3)}`);
    lines.push(`distance: ${formatNumber(distance, 3)}`);
    lines.push(`units/px: ${formatNumber(unitsPerPixel, 6)}`);
    lines.push("");
    lines.push(
      `orthoLock: ${lock ? "yes" : "no"}${lock?.poleLocked ? " (poleLocked)" : ""}`,
    );
    if (lock) lines.push(`lockDir: ${formatVec3(lock.direction, 4)}`);
    if (pending) lines.push(`pendingOrthoEnter.viewHeight: ${formatNumber(pending.viewHeight, 4)}`);
    if (lastPerspective) {
      scratch.tmp.copy(lastPerspective.position).sub(lastPerspective.target);
      lines.push(`lastPerspective.fov: ${formatNumber(lastPerspective.fov, 2)}°`);
      lines.push(`lastPerspective.distance: ${formatNumber(scratch.tmp.length(), 3)}`);
    }
    lines.push("");
    lines.push(`WGS84 lat/lon: ${formatNumber(latDeg, 6)}°, ${formatNumber(lonDeg, 6)}°`);
    lines.push(`WGS84 height: ${formatNumber(geodetic.heightMeters, 3)} m`);
    lines.push(`originEcef (m): ${formatVec3(originEcef, 3)}`);
    lines.push(`renderOffset (m): ${formatVec3(renderOffset, 3)}`);
    lines.push(`enu.eastEcef: ${formatVec3(frame.eastEcef, 4)}`);
    lines.push(`enu.northEcef: ${formatVec3(frame.northEcef, 4)}`);
    lines.push(`enu.upEcef: ${formatVec3(frame.upEcef, 4)}`);

    pre.textContent = lines.join("\n");
  }, -100);

  if (!portalRoot) return null;

  return createPortal(
    <div
      style={{
        display: enabled ? "block" : "none",
        position: "absolute",
        top: layout.topPx,
        right: layout.rightPx,
        padding: "10px 12px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.6)",
        color: "rgba(255,255,255,0.92)",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        fontSize: 12,
        lineHeight: 1.25,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      <pre ref={preRef} style={{ margin: 0 }} />
    </div>,
    portalRoot,
  );
}
