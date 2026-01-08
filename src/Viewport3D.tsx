import {
  CameraControls,
  CameraControlsImpl,
  OrthographicCamera as DreiOrthographicCamera,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { isOrthographicCamera, isPerspectiveCamera, type Projection } from "./camera";
import {
  MathUtils,
  AxesHelper,
  LineBasicMaterial,
  Object3D,
  OrthographicCamera as ThreeOrthographicCamera,
  PerspectiveCamera as ThreePerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { ViewCube } from "./ViewCube";

const MIN_DISTANCE = 2;
const MAX_DISTANCE = 20000;
const ROTATE_SPEED = 0.0022;
const DEFAULT_PERSPECTIVE_FOV_DEG = 45;
const MORPH_FOV_MIN_DEG = 1.35;
const PROJECTION_MORPH_DURATION_MS = 260;
const MIN_ORTHO_ZOOM = 0.08;
const MAX_ORTHO_ZOOM = 240;
const ORTHO_SWITCH_TOLERANCE_RADIANS = 0.008;
const ORTHO_SWITCH_TOLERANCE_COS = Math.cos(ORTHO_SWITCH_TOLERANCE_RADIANS);
const ORTHO_SWITCH_IGNORE_MS = 520;
const AXES_OVERLAY_LENGTH = 45000;

export function Viewport3D(props: { className?: string }) {
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
      >
        <Viewport3DContent />
      </Canvas>
    </div>
  );
}

type OrthoLock = {
  direction: Vector3;
  ignoreUntil: number;
  rebindDirectionAfterIgnore: boolean;
};

type ProjectionTransition =
  | {
      kind: "toOrthographic";
      phase: "awaitControlsIdle" | "morph" | "awaitCameraSwap";
      target: Vector3;
      direction: Vector3;
      position: Vector3;
      scale: number;
      startFovDeg: number;
      endFovDeg: number;
      orthoZoom: number;
      startTime: number;
      durationMs: number;
    }
  | {
      kind: "toPerspective";
      phase: "awaitCameraSwap" | "morph";
      target: Vector3;
      direction: Vector3;
      position: Vector3;
      scale: number;
      startFovDeg: number;
      endFovDeg: number;
      startTime: number;
      durationMs: number;
    };

type DefaultViewRequest = {
  phase: "start" | "awaitIdle" | "awaitOrthoIdle";
};

function Viewport3DContent() {
  const { gl, invalidate, size } = useThree();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<ThreeOrthographicCamera | null>(null);

  const [projection, setProjection] = useState<Projection>("perspective");

  const orthoLockRef = useRef<OrthoLock | null>(null);
  const projectionTransitionRef = useRef<ProjectionTransition | null>(null);
  const defaultViewRequestRef = useRef<DefaultViewRequest | null>(null);
  const initializedRef = useRef(false);
  const lastControlsInstanceRef = useRef<CameraControlsImpl | null>(null);

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      direction: new Vector3(),
      nextPosition: new Vector3(),
      tmpDirection: new Vector3(),
      tmpUp: new Vector3(),
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
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== "1" && event.code !== "Digit1") return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      defaultViewRequestRef.current = { phase: "start" };
      invalidate();
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [gl, invalidate]);

  useFrame(() => {
    const transition = projectionTransitionRef.current;
    if (!transition) return;

    const controls = controlsRef.current;
    if (!controls) return;

    invalidate();

    const isPerspective = isPerspectiveCamera(controls.camera);
    const isOrthographic = isOrthographicCamera(controls.camera);

    const ease = (value: number) =>
      value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

    if (transition.kind === "toOrthographic") {
      if (transition.phase === "awaitControlsIdle") {
        if (projection !== "perspective") return;
        if (!isPerspective) return;
        if (controls.active) return;

        controls.getTarget(scratch.target);
        controls.getPosition(scratch.position);
        scratch.direction.copy(scratch.position).sub(scratch.target);
        if (scratch.direction.lengthSq() === 0) return;
        scratch.direction.normalize();

        const radius = scratch.position.distanceTo(scratch.target);
        if (!Number.isFinite(radius) || radius <= 0) return;

        const perspective = perspectiveCameraRef.current;
        const startFovDeg = perspective?.fov ?? DEFAULT_PERSPECTIVE_FOV_DEG;
        const startFovRad = MathUtils.degToRad(startFovDeg);

        transition.target.copy(scratch.target);
        transition.direction.copy(scratch.direction);
        transition.startFovDeg = startFovDeg;
        transition.scale = 2 * radius * Math.tan(startFovRad / 2);

        transition.orthoZoom = MathUtils.clamp(
          size.height / transition.scale,
          MIN_ORTHO_ZOOM,
          MAX_ORTHO_ZOOM,
        );

        const distanceLimitedFovRad = 2 * Math.atan(transition.scale / (2 * MAX_DISTANCE));
        const distanceLimitedFovDeg = MathUtils.radToDeg(distanceLimitedFovRad);
        transition.endFovDeg = Math.min(
          startFovDeg,
          Math.max(MORPH_FOV_MIN_DEG, distanceLimitedFovDeg),
        );

        transition.startTime = performance.now();
        transition.phase = "morph";
        return;
      }

      if (transition.phase === "morph") {
        if (projection !== "perspective") {
          projectionTransitionRef.current = null;
          return;
        }
        if (!isPerspective) return;

        const now = performance.now();
        const raw = (now - transition.startTime) / transition.durationMs;
        const t = MathUtils.clamp(raw, 0, 1);
        const eased = ease(t);

        const nextFovDeg = MathUtils.lerp(transition.startFovDeg, transition.endFovDeg, eased);
        const nextFovRad = MathUtils.degToRad(nextFovDeg);
        const nextDistance = transition.scale / (2 * Math.tan(nextFovRad / 2));

        const perspective = perspectiveCameraRef.current;
        if (perspective) {
          perspective.fov = nextFovDeg;
          perspective.updateProjectionMatrix();
        }

        scratch.nextPosition.copy(transition.target).addScaledVector(transition.direction, nextDistance);

        controls.setLookAt(
          scratch.nextPosition.x,
          scratch.nextPosition.y,
          scratch.nextPosition.z,
          transition.target.x,
          transition.target.y,
          transition.target.z,
          false,
        );
        controls.update(0);

        if (t < 1) return;

        const orthographic = orthographicCameraRef.current;
        if (orthographic) {
          orthographic.position.copy(scratch.nextPosition);
          orthographic.lookAt(transition.target);
          orthographic.zoom = transition.orthoZoom;
          orthographic.updateProjectionMatrix();
        }

        transition.position.copy(scratch.nextPosition);
        transition.phase = "awaitCameraSwap";
        setProjection("orthographic");
        invalidate();
        return;
      }

      if (projection !== "orthographic") return;
      if (!isOrthographic) return;
      if (controls.active) return;

      controls.setLookAt(
        transition.position.x,
        transition.position.y,
        transition.position.z,
        transition.target.x,
        transition.target.y,
        transition.target.z,
        false,
      );
      controls.zoomTo(transition.orthoZoom, false);
      controls.update(0);

      const perspective = perspectiveCameraRef.current;
      if (perspective) {
        perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
        perspective.updateProjectionMatrix();
      }

      projectionTransitionRef.current = null;
      invalidate();
      return;
    }

    if (transition.phase === "awaitCameraSwap") {
      if (projection !== "perspective") return;
      if (!isPerspective) return;
      if (controls.active) return;

      controls.setLookAt(
        transition.position.x,
        transition.position.y,
        transition.position.z,
        transition.target.x,
        transition.target.y,
        transition.target.z,
        false,
      );
      controls.update(0);

      transition.startTime = performance.now();
      transition.phase = "morph";
      return;
    }

    if (projection !== "perspective") {
      invalidate();
      return;
    }
    if (!isPerspective) return;

    const now = performance.now();
    const raw = (now - transition.startTime) / transition.durationMs;
    const t = MathUtils.clamp(raw, 0, 1);
    const eased = ease(t);

    const nextFovDeg = MathUtils.lerp(transition.startFovDeg, transition.endFovDeg, eased);
    const nextFovRad = MathUtils.degToRad(nextFovDeg);
    const nextDistance = transition.scale / (2 * Math.tan(nextFovRad / 2));

    const perspective = perspectiveCameraRef.current;
    if (perspective) {
      perspective.fov = nextFovDeg;
      perspective.updateProjectionMatrix();
    }

    scratch.nextPosition.copy(transition.target).addScaledVector(transition.direction, nextDistance);

    controls.setLookAt(
      scratch.nextPosition.x,
      scratch.nextPosition.y,
      scratch.nextPosition.z,
      transition.target.x,
      transition.target.y,
      transition.target.z,
      false,
    );
    controls.update(0);

    if (t < 1) return;

    projectionTransitionRef.current = null;
    if (perspective) {
      perspective.fov = transition.endFovDeg;
      perspective.updateProjectionMatrix();
    }
    invalidate();
  }, -3);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (controls !== lastControlsInstanceRef.current) {
      lastControlsInstanceRef.current = controls;
      controls.updateCameraUp();
    }

    const defaultRequest = defaultViewRequestRef.current;
    if (defaultRequest) {
      invalidate();

      const defaultTarget: [number, number, number] = [0, 0, 0];
      const defaultPosition: [number, number, number] = [10, -10, 10];

      scratch.target.set(...defaultTarget);
      scratch.position.set(...defaultPosition);

      const defaultRadius = scratch.position.distanceTo(scratch.target);
      const defaultFovRad = MathUtils.degToRad(DEFAULT_PERSPECTIVE_FOV_DEG);
      const defaultScale = 2 * defaultRadius * Math.tan(defaultFovRad / 2);
      const defaultOrthoZoom = MathUtils.clamp(
        size.height / defaultScale,
        MIN_ORTHO_ZOOM,
        MAX_ORTHO_ZOOM,
      );

      const isOrthoCamera = isOrthographicCamera(controls.camera);

      if (defaultRequest.phase === "start") {
        cancelProjectionTransition({ cancelControlsTransition: true });
        orthoLockRef.current = null;

        const perspective = perspectiveCameraRef.current;
        if (perspective) {
          perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
          perspective.updateProjectionMatrix();
        }

        if (isOrthoCamera) {
          controls.setLookAt(
            defaultPosition[0],
            defaultPosition[1],
            defaultPosition[2],
            defaultTarget[0],
            defaultTarget[1],
            defaultTarget[2],
            true,
          );
          controls.zoomTo(defaultOrthoZoom, true);
          controls.update(0);

          defaultViewRequestRef.current = { phase: "awaitOrthoIdle" };
          return;
        }

        if (projection !== "perspective") setProjection("perspective");

        controls.setLookAt(
          defaultPosition[0],
          defaultPosition[1],
          defaultPosition[2],
          defaultTarget[0],
          defaultTarget[1],
          defaultTarget[2],
          true,
        );
        controls.update(0);
        defaultViewRequestRef.current = { phase: "awaitIdle" };
        return;
      }

      if (controls.active) return;

      if (defaultRequest.phase === "awaitIdle") {
        defaultViewRequestRef.current = null;
        return;
      }

      if (!isOrthoCamera) {
        defaultViewRequestRef.current = null;
        return;
      }

      leaveOrthographicView();
      defaultViewRequestRef.current = null;
      return;
    }

    if (!initializedRef.current) {
      controls.setLookAt(10, -10, 10, 0, 0, 0, false);
      controls.update(0);
      initializedRef.current = true;
      invalidate();
    }
  }, -2);

  function cancelProjectionTransition(options?: { cancelControlsTransition?: boolean }) {
    const shouldCancelControls = Boolean(options?.cancelControlsTransition);
    projectionTransitionRef.current = null;

    if (!shouldCancelControls) return;

    const controls = controlsRef.current;
    if (!controls || !controls.active) return;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

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
  }

  const enterOrthographicView = (worldDirection: [number, number, number]) => {
    const controls = controlsRef.current;
    if (!controls) return;

    cancelProjectionTransition({ cancelControlsTransition: true });

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

    const radius = scratch.position.distanceTo(scratch.target);
    if (!Number.isFinite(radius) || radius <= 0) return;

    scratch.direction.set(...worldDirection);
    if (scratch.direction.lengthSq() === 0) return;
    scratch.direction.normalize();

    // If we snap to a pole direction (e.g. top/bottom), the roll/azimuth can be undefined and
    // CameraControls may choose either side. Nudge the direction slightly toward the current
    // horizontal view to keep the resulting orientation stable.
    scratch.tmpUp.copy(controls.camera.up);
    if (scratch.tmpUp.lengthSq() === 0) scratch.tmpUp.set(0, 0, 1);
    scratch.tmpUp.normalize();

    const poleThreshold = 0.985;
    if (Math.abs(scratch.direction.dot(scratch.tmpUp)) > poleThreshold) {
      scratch.tmpDirection.copy(scratch.position).sub(scratch.target);
      if (scratch.tmpDirection.lengthSq() > 0) {
        const alongUp = scratch.tmpDirection.dot(scratch.tmpUp);
        scratch.tmpDirection.addScaledVector(scratch.tmpUp, -alongUp);
      }

      if (scratch.tmpDirection.lengthSq() === 0) {
        scratch.tmpDirection.set(0, 1, 0);
        if (Math.abs(scratch.tmpDirection.dot(scratch.tmpUp)) > 0.9) scratch.tmpDirection.set(1, 0, 0);
      }

      scratch.tmpDirection.normalize();
      scratch.direction.addScaledVector(scratch.tmpDirection, 0.001).normalize();
    }

    scratch.nextPosition.copy(scratch.target).addScaledVector(scratch.direction, radius);

    const now = performance.now();
    const lock: OrthoLock = {
      direction: scratch.direction.clone(),
      ignoreUntil: now + ORTHO_SWITCH_IGNORE_MS,
      rebindDirectionAfterIgnore: true,
    };
    orthoLockRef.current = lock;

    if (projection === "orthographic") {
      const ortho = controls.camera as ThreeOrthographicCamera;
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

    projectionTransitionRef.current = {
      kind: "toOrthographic",
      phase: "awaitControlsIdle",
      target: scratch.target.clone(),
      direction: scratch.direction.clone(),
      position: scratch.nextPosition.clone(),
      scale: 0,
      startFovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
      endFovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
      orthoZoom: 1,
      startTime: 0,
      durationMs: PROJECTION_MORPH_DURATION_MS,
    };
    invalidate();
  };

  const handleRotateAroundUp = (_radians: number) => {
    void _radians;
    const lock = orthoLockRef.current;
    if (!lock || projection !== "orthographic") return;

    lock.ignoreUntil = performance.now() + ORTHO_SWITCH_IGNORE_MS;
    lock.rebindDirectionAfterIgnore = true;
  };

  function leaveOrthographicView() {
    if (projection !== "orthographic") return;
    if (projectionTransitionRef.current) return;

    const controls = controlsRef.current;
    if (!controls) return;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);
    scratch.direction.copy(scratch.position).sub(scratch.target);
    if (scratch.direction.lengthSq() === 0) return;
    scratch.direction.normalize();

    const ortho = controls.camera as ThreeOrthographicCamera;
    const zoom = Math.max(ortho.zoom, 1e-6);
    const scale = size.height / zoom;

    const distanceLimitedFovRad = 2 * Math.atan(scale / (2 * MAX_DISTANCE));
    const distanceLimitedFovDeg = MathUtils.radToDeg(distanceLimitedFovRad);
    const startFovDeg = Math.max(MORPH_FOV_MIN_DEG, distanceLimitedFovDeg);
    const startFovRad = MathUtils.degToRad(startFovDeg);
    const startDistance = scale / (2 * Math.tan(startFovRad / 2));

    scratch.nextPosition.copy(scratch.target).addScaledVector(scratch.direction, startDistance);

    const perspective = perspectiveCameraRef.current;
    if (perspective) {
      perspective.fov = startFovDeg;
      perspective.position.copy(scratch.nextPosition);
      perspective.lookAt(scratch.target);
      perspective.updateProjectionMatrix();
    }

    projectionTransitionRef.current = {
      kind: "toPerspective",
      phase: "awaitCameraSwap",
      target: scratch.target.clone(),
      direction: scratch.direction.clone(),
      position: scratch.nextPosition.clone(),
      scale,
      startFovDeg,
      endFovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
      startTime: 0,
      durationMs: PROJECTION_MORPH_DURATION_MS,
    };

    orthoLockRef.current = null;
    setProjection("perspective");
    invalidate();
  }

  return (
    <>
      <DreiPerspectiveCamera
        ref={(node) => {
          perspectiveCameraRef.current = node;
        }}
        makeDefault={projection === "perspective"}
        position={[10, -10, 10]}
        up={[0, 0, 1]}
        fov={45}
        near={0.1}
        far={50000}
      />
      <DreiOrthographicCamera
        ref={(node) => {
          orthographicCameraRef.current = node;
        }}
        makeDefault={projection === "orthographic"}
        position={[10, -10, 10]}
        up={[0, 0, 1]}
        near={0.1}
        far={50000}
        zoom={1}
      />

      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        minPolarAngle={0.01}
        maxPolarAngle={Math.PI - 0.01}
        mouseButtons={{
          left: CameraControlsImpl.ACTION.NONE,
          right: CameraControlsImpl.ACTION.NONE,
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
      <OrthoProjectionManager
        projection={projection}
        controlsRef={controlsRef}
        orthoLockRef={orthoLockRef}
        onLeaveOrthographic={leaveOrthographicView}
        isTransitioning={() => projectionTransitionRef.current !== null}
      />

      <MainScene />
      <ViewCube
        controls={controlsRef}
        projection={projection}
        onSelectDirection={enterOrthographicView}
        onRotateAroundUp={handleRotateAroundUp}
      />
    </>
  );
}

function OrthoProjectionManager(props: {
  projection: Projection;
  controlsRef: RefObject<CameraControlsImpl | null>;
  orthoLockRef: RefObject<OrthoLock | null>;
  onLeaveOrthographic: () => void;
  isTransitioning: () => boolean;
}) {
  const { invalidate } = useThree();

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      direction: new Vector3(),
      nextPosition: new Vector3(),
    }),
    [],
  );

  useFrame(() => {
    if (props.projection !== "orthographic") return;
    if (props.isTransitioning()) return;
    const lock = props.orthoLockRef.current;
    if (!lock) return;

    const controls = props.controlsRef.current;
    if (!controls) return;

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

    props.onLeaveOrthographic();
    invalidate();
  });

  return null;
}

function MainScene() {
  return (
    <>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper args={[200, 200, "#2b2b2f", "#1b1b1f"]} />
        <gridHelper args={[200, 20, "#34343a", "#24242a"]} />
      </group>

      <AxesOverlay size={AXES_OVERLAY_LENGTH} />
    </>
  );
}

function AxesOverlay(props: { size: number }) {
  const ref = useRef<AxesHelper | null>(null);

  useEffect(() => {
    const axes = ref.current;
    if (!axes) return;

    axes.renderOrder = 10;

    const material = axes.material as LineBasicMaterial | LineBasicMaterial[];
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) {
      m.depthTest = false;
      m.depthWrite = false;
      m.toneMapped = false;
    }
  }, []);

  return <axesHelper ref={ref} args={[props.size]} />;
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
      const controls = props.controls.current;
      if (controls) controls.getTarget(out);
      else out.set(0, 0, 0);

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
      const controls = props.controls.current;
      if (!controls) return;

      controls.rotate(deltaX * ROTATE_SPEED, deltaY * ROTATE_SPEED, false);
      invalidate();
    };

    const pan = (deltaX: number, deltaY: number) => {
      const controls = props.controls.current;
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

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
      const hitBefore = scratch.raycaster.ray.intersectPlane(
        scratch.pivotPlane,
        scratch.tmpZoomBefore,
      );

      if (isOrthographic) {
        if (!orthographicCamera) return;
        const zoomFactor = Math.exp(deltaY * 0.001);
        const nextZoom = MathUtils.clamp(
          orthographicCamera.zoom / zoomFactor,
          MIN_ORTHO_ZOOM,
          MAX_ORTHO_ZOOM,
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

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
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
