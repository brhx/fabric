import type { CameraControlsImpl } from "@react-three/drei";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spherical, Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera } from "../camera";
import { matchDefaultViewShortcut } from "./default-views";
import { getOrthographicVisibleHeight } from "./projection-sync";
import {
  VIEWCUBE_MARGIN_RIGHT_PX,
  VIEWCUBE_MARGIN_TOP_PX,
  VIEWCUBE_WIDGET_WIDTH_PX,
} from "./viewcube/constants";

function formatNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "NaN";
  return value.toFixed(decimals);
}

function formatVec3(v: Vector3, decimals = 3) {
  return `(${formatNumber(v.x, decimals)}, ${formatNumber(v.y, decimals)}, ${formatNumber(v.z, decimals)})`;
}

const POS_JUMP_THRESHOLD_MIN = 0.5;
const POS_JUMP_THRESHOLD_RATIO = 0.05;
const FOCAL_JUMP_THRESHOLD = 0.25;
const ANGLE_JUMP_THRESHOLD = 0.1;
const JUMP_MEMORY_MS = 2000;

function angleDelta(current: number, previous: number) {
  const delta = current - previous;
  const twoPi = Math.PI * 2;
  const wrapped = ((((delta + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return Math.abs(wrapped);
}

export function ViewportDebugOverlay(props: {
  controlsRef: RefObject<CameraControlsImpl | null>;
  worldUnitsPerPixelRef: MutableRefObject<number>;
  enabledByDefault?: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const fallbackCamera = useThree((state) => state.camera);
  const [enabled, setEnabled] = useState(props.enabledByDefault ?? true);
  const [layout, setLayout] = useState(() => ({ rightPx: 8, topPx: 8 }));
  const portalRef = useRef<HTMLElement>(null as unknown as HTMLElement);
  const [portalReady, setPortalReady] = useState(false);
  const preRef = useRef<HTMLPreElement | null>(null);
  const lastDefaultViewAtRef = useRef<number | null>(null);
  const lastJumpRef = useRef<{
    label: string;
    at: number;
    value: number;
  } | null>(null);
  const prevRef = useRef<{
    hasPrev: boolean;
    camPos: Vector3;
    ctrlPos: Vector3;
    ctrlFocal: Vector3;
    sphRadius: number;
    sphPhi: number;
    sphTheta: number;
  }>({
    hasPrev: false,
    camPos: new Vector3(),
    ctrlPos: new Vector3(),
    ctrlFocal: new Vector3(),
    sphRadius: 0,
    sphPhi: 0,
    sphTheta: 0,
  });

  const scratch = useMemo(
    () => ({
      cameraWorldPosition: new Vector3(),
      position: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      focalOffset: new Vector3(),
      spherical: new Spherical(),
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
    portalRef.current = root;
    setPortalReady(true);

    let frame: number | null = null;

    const updateLayout = () => {
      frame = null;

      const canvasRect = element.getBoundingClientRect();
      const viewportElement = doc.querySelector('[data-viewport-area="true"]');
      const viewportRect =
        viewportElement?.getBoundingClientRect() ?? canvasRect;

      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const gapPx = 12;
      const next = {
        rightPx: Math.round(
          rightInset +
            VIEWCUBE_MARGIN_RIGHT_PX +
            VIEWCUBE_WIDGET_WIDTH_PX +
            gapPx,
        ),
        topPx: Math.round(topInset + VIEWCUBE_MARGIN_TOP_PX),
      };

      setLayout((current) => {
        if (current.rightPx === next.rightPx && current.topPx === next.topPx)
          return current;
        return next;
      });
    };

    const scheduleLayout = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(updateLayout);
    };

    scheduleLayout();

    view.addEventListener("resize", scheduleLayout);
    view.addEventListener("scroll", scheduleLayout, {
      passive: true,
      capture: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : (
        new ResizeObserver(() => {
          scheduleLayout();
        })
      );

    const viewportElement = doc.querySelector('[data-viewport-area="true"]');
    if (resizeObserver && viewportElement)
      resizeObserver.observe(viewportElement);

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
      setEnabled((prev) => {
        const next = !prev;
        if (next) invalidate();
        return next;
      });
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      view.removeEventListener("resize", scheduleLayout);
      view.removeEventListener("scroll", scheduleLayout, {
        capture: true,
      } as any);
      resizeObserver?.disconnect();
      view.removeEventListener("keydown", onKeyDown, { capture: true } as any);

      root.remove();
      setPortalReady(false);
      if (computed.position === "static")
        parent.style.position = previousPosition;
    };
  }, [gl, invalidate]);

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const match = matchDefaultViewShortcut(event);
      if (!match) return;
      lastDefaultViewAtRef.current = view.performance?.now?.() ?? Date.now();
      lastJumpRef.current = null;
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true } as any);
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
    const isPersp = isPerspectiveCamera(activeCamera);
    const isOrtho = isOrthographicCamera(activeCamera);
    const now = (globalThis.performance?.now?.() ?? Date.now()) as number;

    activeCamera.getWorldPosition(scratch.cameraWorldPosition);
    if (controls) {
      controls.getPosition(scratch.position, false);
      controls.getTarget(scratch.target, false);
      controls.getFocalOffset(scratch.focalOffset, false);
      controls.getSpherical(scratch.spherical, false);
    } else {
      scratch.position.copy(activeCamera.position);
      scratch.target.set(0, 0, 0);
      scratch.focalOffset.set(0, 0, 0);
      scratch.spherical.set(0, 0, 0);
    }
    scratch.up.copy(activeCamera.up);

    const distance = scratch.cameraWorldPosition.distanceTo(scratch.target);
    const unitsPerPixel = props.worldUnitsPerPixelRef.current;
    const posJumpThreshold = Math.max(
      POS_JUMP_THRESHOLD_MIN,
      distance * POS_JUMP_THRESHOLD_RATIO,
    );

    const prev = prevRef.current;
    let deltaCamPos = 0;
    let deltaCtrlPos = 0;
    let deltaCtrlFocal = 0;
    let deltaSphRadius = 0;
    let deltaSphPhi = 0;
    let deltaSphTheta = 0;

    if (prev.hasPrev) {
      deltaCamPos = prev.camPos.distanceTo(scratch.cameraWorldPosition);
      deltaCtrlPos = prev.ctrlPos.distanceTo(scratch.position);
      deltaCtrlFocal = prev.ctrlFocal.distanceTo(scratch.focalOffset);
      deltaSphRadius = Math.abs(scratch.spherical.radius - prev.sphRadius);
      deltaSphPhi = angleDelta(scratch.spherical.phi, prev.sphPhi);
      deltaSphTheta = angleDelta(scratch.spherical.theta, prev.sphTheta);

      if (deltaCtrlPos > posJumpThreshold) {
        lastJumpRef.current = {
          label: "ctrl.pos",
          at: now,
          value: deltaCtrlPos,
        };
      } else if (deltaCtrlFocal > FOCAL_JUMP_THRESHOLD) {
        lastJumpRef.current = {
          label: "ctrl.focal",
          at: now,
          value: deltaCtrlFocal,
        };
      } else if (
        deltaSphPhi > ANGLE_JUMP_THRESHOLD ||
        deltaSphTheta > ANGLE_JUMP_THRESHOLD
      ) {
        lastJumpRef.current = {
          label: "ctrl.sph",
          at: now,
          value: Math.max(deltaSphPhi, deltaSphTheta),
        };
      }
    }

    prev.camPos.copy(scratch.cameraWorldPosition);
    prev.ctrlPos.copy(scratch.position);
    prev.ctrlFocal.copy(scratch.focalOffset);
    prev.sphRadius = scratch.spherical.radius;
    prev.sphPhi = scratch.spherical.phi;
    prev.sphTheta = scratch.spherical.theta;
    prev.hasPrev = true;

    const lines: string[] = [];
    lines.push("Viewport Debug  (toggle: D)");
    lines.push("");
    lines.push(
      `camera: ${
        isPersp ? "perspective"
        : isOrtho ? "orthographic"
        : "unknown"
      }`,
    );
    if (isPersp) lines.push(`fov: ${formatNumber(activeCamera.fov, 2)}°`);
    if (isOrtho) {
      lines.push(`zoom: ${formatNumber(activeCamera.zoom, 4)}`);
      lines.push(
        `ortho.height: ${formatNumber(getOrthographicVisibleHeight(activeCamera), 4)}`,
      );
    }
    lines.push(`cam.pos: ${formatVec3(scratch.cameraWorldPosition, 3)}`);
    lines.push(`cam.up:  ${formatVec3(scratch.up, 3)}`);
    lines.push(`cam.dist: ${formatNumber(distance, 3)}`);
    lines.push(`ctrl.pos: ${formatVec3(scratch.position, 3)}`);
    lines.push(`ctrl.focal: ${formatVec3(scratch.focalOffset, 3)}`);
    lines.push(
      `ctrl.sph: (r=${formatNumber(scratch.spherical.radius, 3)}, phi=${formatNumber(scratch.spherical.phi, 3)}, theta=${formatNumber(scratch.spherical.theta, 3)})`,
    );
    lines.push(`d.cam.pos: ${formatNumber(deltaCamPos, 4)}`);
    lines.push(`d.ctrl.pos: ${formatNumber(deltaCtrlPos, 4)}`);
    lines.push(`d.ctrl.focal: ${formatNumber(deltaCtrlFocal, 4)}`);
    lines.push(
      `d.ctrl.sph: (dr=${formatNumber(deltaSphRadius, 4)}, dphi=${formatNumber(deltaSphPhi, 4)}, dtheta=${formatNumber(deltaSphTheta, 4)})`,
    );
    lines.push(`jump.thresh.pos: ${formatNumber(posJumpThreshold, 3)}`);
    if (lastDefaultViewAtRef.current) {
      lines.push(
        `last cmd1: ${formatNumber(now - lastDefaultViewAtRef.current, 0)} ms`,
      );
    } else {
      lines.push("last cmd1: n/a");
    }
    const lastJump = lastJumpRef.current;
    if (lastJump && now - lastJump.at < JUMP_MEMORY_MS) {
      lines.push(
        `last jump: ${lastJump.label} Δ${formatNumber(lastJump.value, 4)} (${formatNumber(now - lastJump.at, 0)} ms ago)`,
      );
    } else {
      lines.push("last jump: n/a");
    }
    if (controls) {
      lines.push(`smoothTime: ${formatNumber(controls.smoothTime, 3)}`);
      lines.push(
        `draggingSmoothTime: ${formatNumber(controls.draggingSmoothTime, 3)}`,
      );
    } else {
      lines.push("smoothTime: n/a");
      lines.push("draggingSmoothTime: n/a");
    }
    lines.push(`units/px: ${formatNumber(unitsPerPixel, 6)}`);

    pre.textContent = lines.join("\n");
  }, -100);

  if (!portalReady) return null;

  return (
    <Html
      fullscreen
      portal={portalRef}
      calculatePosition={() => [size.width / 2, size.height / 2]}
    >
      <div
        data-testid="viewport-debug"
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
        <pre
          ref={preRef}
          data-testid="viewport-debug-text"
          style={{ margin: 0 }}
        />
      </div>
    </Html>
  );
}
