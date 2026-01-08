import type { CameraControlsImpl } from "@react-three/drei";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { Vector3 } from "three";
import { isOrthographicCamera, isPerspectiveCamera, type Projection } from "../camera";
import type { LocalEnuFrame } from "../geo/localFrame";
import type { Geodetic } from "../geo/wgs84";
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

  return (
    <Html fullscreen>
      <div
        style={{
          display: enabled ? "block" : "none",
          position: "absolute",
          top: 8,
          left: 8,
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
      </div>
    </Html>
  );
}
