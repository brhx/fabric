import {
  CameraControls,
  CameraControlsImpl,
  GizmoHelper,
  GizmoViewport,
  GizmoViewcube,
  Html,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { LuRotateCcw, LuRotateCw } from "react-icons/lu";
import {
  Camera,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";

const MIN_DISTANCE = 2;
const MAX_DISTANCE = 200;
const ROTATE_SPEED = 0.0022;
const VIEWCUBE_SIZE_PX = 56;
const VIEWCUBE_MARGIN_RIGHT_PX = 84;
const VIEWCUBE_MARGIN_TOP_PX = 18;
const VIEWCUBE_BASE_SIZE_PX = 60;
const VIEWCUBE_AXIS_SCALE = 1.15;
const VIEWCUBE_AXIS_OFFSET_X_PX = -VIEWCUBE_SIZE_PX / 2 - 8;
const VIEWCUBE_AXIS_OFFSET_Y_PX = -VIEWCUBE_SIZE_PX / 2 - 6;
const VIEWCUBE_BUTTON_SIZE_PX = 26;
const VIEWCUBE_BUTTON_OFFSET_X_PX = VIEWCUBE_SIZE_PX / 2 + 18;
const VIEWCUBE_BUTTON_OFFSET_Y_PX = VIEWCUBE_SIZE_PX / 2 - 6;
const VIEWCUBE_RIGHT_EXTENT_PX = VIEWCUBE_BUTTON_OFFSET_X_PX + VIEWCUBE_BUTTON_SIZE_PX / 2;
const VIEWCUBE_TOP_EXTENT_PX = VIEWCUBE_BUTTON_OFFSET_Y_PX + VIEWCUBE_BUTTON_SIZE_PX / 2;

export function Viewport3D(props: { className?: string }) {
  const controlsRef = useRef<CameraControlsImpl | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.updateCameraUp();
    controls.setLookAt(10, -10, 10, 0, 0, 0, false);
    controls.update(0);
  }, []);

  return (
    <div className={["h-full w-full", props.className].filter(Boolean).join(" ")}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0b0c10", 1);
        }}
        camera={{
          position: [10, -10, 10],
          up: [0, 0, 1],
          fov: 45,
          near: 0.1,
          far: 500,
        }}
      >
        <CameraControls
          ref={controlsRef}
          makeDefault
          minDistance={MIN_DISTANCE}
          maxDistance={MAX_DISTANCE}
          minPolarAngle={0.01}
          maxPolarAngle={Math.PI - 0.01}
          mouseButtons={{
            left: CameraControlsImpl.ACTION.ROTATE,
            right: CameraControlsImpl.ACTION.TRUCK,
            middle: CameraControlsImpl.ACTION.NONE,
            wheel: CameraControlsImpl.ACTION.NONE,
          }}
          touches={{
            one: CameraControlsImpl.ACTION.NONE,
            two: CameraControlsImpl.ACTION.NONE,
            three: CameraControlsImpl.ACTION.NONE,
          }}
        />
        <TrackpadControls controls={controlsRef} />
        <MainScene />
        <ViewCube controls={controlsRef} />
      </Canvas>
    </div>
  );
}

function MainScene() {
  return (
    <>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper args={[200, 200, "#2b2b2f", "#1b1b1f"]} />
        <gridHelper args={[200, 20, "#34343a", "#24242a"]} />
      </group>

      <axesHelper args={[6]} />
    </>
  );
}

function TrackpadControls(props: { controls: RefObject<CameraControlsImpl | null> }) {
  const { camera, gl, invalidate, scene } = useThree();
  const lastGestureScale = useRef<number | null>(null);
  const lastOrbitAt = useRef<number | null>(null);

  const scratch = useMemo(
    () => ({
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      pivotPlane: new Plane(new Vector3(0, 0, 1), 0),
      tmpTarget: new Vector3(),
      tmpPosition: new Vector3(),
      tmpPivot: new Vector3(),
      tmpOffset: new Vector3(),
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

    const perspectiveCamera = camera as PerspectiveCamera;

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

    const pickPivotAtClientPoint = (clientX: number, clientY: number, out: Vector3) => {
      if (!setPointer(clientX, clientY)) return;

      scratch.raycaster.setFromCamera(scratch.pointer, perspectiveCamera);
      const intersections = scratch.raycaster.intersectObjects(scene.children, true);
      const intersection = intersections.find(({ object }) => !isSceneHelper(object));

      if (intersection) {
        out.copy(intersection.point);
        return;
      }

      if (scratch.raycaster.ray.intersectPlane(scratch.pivotPlane, scratch.tmpPivot)) {
        out.copy(scratch.tmpPivot);
      }
    };

    const orbit = (deltaX: number, deltaY: number) => {
      const controls = props.controls.current;
      if (!controls) return;

      controls.rotate(deltaX * ROTATE_SPEED, deltaY * ROTATE_SPEED, false);
      invalidate();
    };

    const pan = (deltaX: number, deltaY: number) => {
      const controls = props.controls.current;
      if (!controls) return;

      controls.getTarget(scratch.tmpTarget);
      controls.getPosition(scratch.tmpPosition);

      const targetDistance = scratch.tmpPosition.distanceTo(scratch.tmpTarget);
      if (!Number.isFinite(targetDistance) || targetDistance <= 0) return;

      const fovInRadians = (perspectiveCamera.fov * Math.PI) / 180;
      const viewportHeight = Math.max(1, element.clientHeight);
      const distanceScale =
        (2 * targetDistance * Math.tan(fovInRadians / 2)) / viewportHeight;

      const panX = deltaX * distanceScale;
      const panY = deltaY * distanceScale;

      controls.truck(panX, panY, false);
      invalidate();
    };

    const zoomToCursorPlane = (deltaY: number, clientX: number, clientY: number) => {
      const controls = props.controls.current;
      if (!controls) return;

      if (!setPointer(clientX, clientY)) return;

      controls.getTarget(scratch.tmpTarget);
      controls.getPosition(scratch.tmpPosition);

      scratch.raycaster.setFromCamera(scratch.pointer, perspectiveCamera);
      const hitBefore = scratch.raycaster.ray.intersectPlane(
        scratch.pivotPlane,
        scratch.tmpZoomBefore,
      );

      scratch.tmpOffset.copy(scratch.tmpPosition).sub(scratch.tmpTarget);
      const currentDistance = scratch.tmpOffset.length();
      if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;

      const zoomFactor = Math.exp(deltaY * 0.001);
      const nextDistance = MathUtils.clamp(
        currentDistance * zoomFactor,
        MIN_DISTANCE,
        MAX_DISTANCE,
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

      scratch.raycaster.setFromCamera(scratch.pointer, perspectiveCamera);
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
          lastOrbitAt.current === null || now - lastOrbitAt.current > repickAfterMs;

        if (shouldRepick) {
          pickPivotAtClientPoint(event.clientX, event.clientY, scratch.tmpPivot);
          const controls = props.controls.current;
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
  }, [camera, gl, invalidate, props.controls, scene, scratch]);

  return null;
}

function ViewCube(props: { controls: RefObject<CameraControlsImpl | null> }) {
  const { gl, invalidate, camera } = useThree();
  const [margin, setMargin] = useState<[number, number]>(() => [
    VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_RIGHT_EXTENT_PX,
    VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_TOP_EXTENT_PX,
  ]);
  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      normal: new Vector3(),
      quaternion: new Quaternion(),
      nextPosition: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    let frame: number | null = null;

    const update = () => {
      frame = null;

      const canvasRect = element.getBoundingClientRect();
      const viewportElement = doc.querySelector(
        '[data-viewport-area="true"]',
      ) as HTMLElement | null;
      const viewportRect = viewportElement?.getBoundingClientRect() ?? canvasRect;

      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const nextMargin: [number, number] = [
        Math.round(rightInset + VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_RIGHT_EXTENT_PX),
        Math.round(topInset + VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_TOP_EXTENT_PX),
      ];

      setMargin((current) => {
        if (current[0] === nextMargin[0] && current[1] === nextMargin[1]) return current;
        return nextMargin;
      });
      invalidate();
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(update);
    };

    schedule();

    view.addEventListener("resize", schedule);
    view.addEventListener("scroll", schedule, { passive: true, capture: true } as any);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            schedule();
          });

    const viewportElement = doc.querySelector(
      '[data-viewport-area="true"]',
    ) as HTMLElement | null;
    if (resizeObserver && viewportElement) resizeObserver.observe(viewportElement);

    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      view.removeEventListener("resize", schedule);
      view.removeEventListener("scroll", schedule as any, true as any);
      resizeObserver?.disconnect();
    };
  }, [gl, invalidate]);

  const handleClick = (event: any) => {
    event.stopPropagation();

    const controls = props.controls.current;
    if (!controls || !event.face) return null;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

    const radius = scratch.position.distanceTo(scratch.target);
    if (!Number.isFinite(radius) || radius <= 0) return null;

    scratch.normal.copy(event.face.normal);
    if (event.object) {
      event.object.getWorldQuaternion(scratch.quaternion);
      scratch.normal.applyQuaternion(scratch.quaternion).normalize();
    }

    const poleThreshold = 0.98;
    if (Math.abs(scratch.normal.z) > poleThreshold) {
      scratch.normal.x += 0.001 * Math.sign(scratch.normal.z || 1);
      scratch.normal.y += 0.001;
      scratch.normal.normalize();
    }

    scratch.nextPosition.copy(scratch.target).addScaledVector(scratch.normal, radius);
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
    invalidate();
    return null;
  };

  return (
    <GizmoHelper alignment="top-right" margin={margin}>
      <group>
        <group
          scale={VIEWCUBE_SIZE_PX / VIEWCUBE_BASE_SIZE_PX}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <GizmoViewcube
            onClick={handleClick}
            color="#2f323a"
            textColor="rgba(255,255,255,0.9)"
            strokeColor="rgba(255,255,255,0.16)"
            hoverColor="#424552"
            opacity={1}
            font="600 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
          />
        </group>

        <group
          scale={VIEWCUBE_AXIS_SCALE}
          rotation={[Math.PI / 2, 0, 0]}
          position={[VIEWCUBE_AXIS_OFFSET_X_PX, VIEWCUBE_AXIS_OFFSET_Y_PX, -1]}
        >
          <GizmoViewport
            axisColors={["#e15a5a", "#4a7cff", "#4fc07f"]}
            axisScale={[0.8, 0.03, 0.03]}
            hideAxisHeads
            hideNegativeAxes
          />

          <group scale={40}>
            <Html center position={[1.12, 0, 0]}>
              <div
                style={{
                  pointerEvents: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#e15a5a",
                  textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                }}
              >
                X
              </div>
            </Html>

            <Html center position={[0, 1.12, 0]}>
              <div
                style={{
                  pointerEvents: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#4a7cff",
                  textShadow: "0 2px 10px rgba(0,0,0,0.65)",
                }}
              >
                Z
              </div>
            </Html>
          </group>
        </group>

        <ViewCubeButtons controls={props.controls} camera={camera} />
      </group>
    </GizmoHelper>
  );
}

function ViewCubeButtons(props: {
  controls: RefObject<CameraControlsImpl | null>;
  camera: Camera;
}) {
  const groupRef = useRef<Object3D | null>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.quaternion.copy(props.camera.quaternion);
  });

  return (
    <group ref={groupRef}>
      <Html center position={[-VIEWCUBE_BUTTON_OFFSET_X_PX, VIEWCUBE_BUTTON_OFFSET_Y_PX, 2]}>
        <button
          type="button"
          data-ui-chrome="true"
          aria-label="Rotate view left"
          onClick={() => {
            const controls = props.controls.current;
            if (!controls) return;
            controls.rotate(Math.PI / 2, 0, true);
          }}
          style={{
            width: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
            height: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(16,18,24,0.92)",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.82)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
          }}
        >
          <LuRotateCcw size={14} />
        </button>
      </Html>

      <Html center position={[VIEWCUBE_BUTTON_OFFSET_X_PX, VIEWCUBE_BUTTON_OFFSET_Y_PX, 2]}>
        <button
          type="button"
          data-ui-chrome="true"
          aria-label="Rotate view right"
          onClick={() => {
            const controls = props.controls.current;
            if (!controls) return;
            controls.rotate(-Math.PI / 2, 0, true);
          }}
          style={{
            width: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
            height: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(16,18,24,0.92)",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.82)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
          }}
        >
          <LuRotateCw size={14} />
        </button>
      </Html>
    </group>
  );
}
