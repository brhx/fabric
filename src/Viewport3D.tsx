import {
  CameraControls,
  CameraControlsImpl,
  OrthographicCamera as DreiOrthographicCamera,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
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
const ORTHO_SWITCH_IGNORE_MS = 520;

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

type PendingView = {
  position: Vector3;
  target: Vector3;
  zoom: number | null;
  enableTransition: boolean;
};

type OrthoLock = {
  direction: Vector3;
  ignoreUntil: number;
  rebindDirectionAfterIgnore: boolean;
};

type ProjectionMorph =
  | {
      kind: "perspectiveToOrthographic";
      phase: "awaitRest" | "morph";
      direction: Vector3;
      target: Vector3;
      scale: number;
      startFovDeg: number;
      endFovDeg: number;
      orthoZoom: number;
      startTime: number;
      durationMs: number;
    }
  | {
      kind: "orthographicToPerspective";
      phase: "awaitSwap" | "morph";
      direction: Vector3;
      target: Vector3;
      scale: number;
      startFovDeg: number;
      endFovDeg: number;
      startTime: number;
      durationMs: number;
    };

function Viewport3DContent() {
  const { invalidate, size } = useThree();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const perspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<ThreeOrthographicCamera | null>(null);

  const [projection, setProjection] = useState<"perspective" | "orthographic">("perspective");

  const pendingViewRef = useRef<PendingView | null>(null);
  const orthoLockRef = useRef<OrthoLock | null>(null);
  const projectionMorphRef = useRef<ProjectionMorph | null>(null);
  const initializedRef = useRef(false);
  const lastControlsInstanceRef = useRef<CameraControlsImpl | null>(null);

  const scratch = useMemo(
    () => ({
      target: new Vector3(),
      position: new Vector3(),
      direction: new Vector3(),
      nextPosition: new Vector3(),
    }),
    [],
  );

  useEffect(() => {
    if (projection !== "orthographic") return;

    const perspective = perspectiveCameraRef.current;
    if (!perspective) return;

    if (perspective.fov !== DEFAULT_PERSPECTIVE_FOV_DEG) {
      perspective.fov = DEFAULT_PERSPECTIVE_FOV_DEG;
      perspective.updateProjectionMatrix();
    }
  }, [projection]);

  useFrame(() => {
    const morph = projectionMorphRef.current;
    if (!morph) return;

    const controls = controlsRef.current;
    if (!controls) return;

    invalidate();

    if (morph.kind === "perspectiveToOrthographic") {
      if (projection !== "perspective") {
        projectionMorphRef.current = null;
        return;
      }

      if (morph.phase === "awaitRest") {
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

        morph.target.copy(scratch.target);
        morph.direction.copy(scratch.direction);
        morph.startFovDeg = startFovDeg;
        morph.scale = 2 * radius * Math.tan(startFovRad / 2);
        morph.orthoZoom = size.height / morph.scale;

        const distanceLimitedFovRad = 2 * Math.atan(morph.scale / (2 * MAX_DISTANCE));
        const distanceLimitedFovDeg = MathUtils.radToDeg(distanceLimitedFovRad);
        morph.endFovDeg = Math.min(startFovDeg, Math.max(MORPH_FOV_MIN_DEG, distanceLimitedFovDeg));

        morph.startTime = performance.now();
        morph.phase = "morph";
        return;
      }

      const now = performance.now();
      const raw = (now - morph.startTime) / morph.durationMs;
      const t = MathUtils.clamp(raw, 0, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const nextFovDeg = MathUtils.lerp(morph.startFovDeg, morph.endFovDeg, eased);
      const nextFovRad = MathUtils.degToRad(nextFovDeg);
      const nextDistance = morph.scale / (2 * Math.tan(nextFovRad / 2));

      const perspective = perspectiveCameraRef.current;
      if (perspective) {
        perspective.fov = nextFovDeg;
        perspective.updateProjectionMatrix();
      }

      scratch.nextPosition.copy(morph.target).addScaledVector(morph.direction, nextDistance);

      controls.setLookAt(
        scratch.nextPosition.x,
        scratch.nextPosition.y,
        scratch.nextPosition.z,
        morph.target.x,
        morph.target.y,
        morph.target.z,
        false,
      );
      controls.update(0);

      if (t < 1) return;

      const orthographic = orthographicCameraRef.current;
      if (orthographic) {
        orthographic.position.copy(scratch.nextPosition);
        orthographic.lookAt(morph.target);
        orthographic.zoom = morph.orthoZoom;
        orthographic.updateProjectionMatrix();
      }

      pendingViewRef.current = {
        position: scratch.nextPosition.clone(),
        target: morph.target.clone(),
        zoom: morph.orthoZoom,
        enableTransition: false,
      };

      projectionMorphRef.current = null;
      setProjection("orthographic");
      invalidate();
      return;
    }

    const perspective = perspectiveCameraRef.current;
    if (!perspective) return;

    if (projection !== "perspective") {
      invalidate();
      return;
    }

    if (morph.phase === "awaitSwap") {
      if ((controls.camera as any)?.isPerspectiveCamera !== true) return;
      if (pendingViewRef.current !== null) return;
      if (controls.active) return;

      controls.getTarget(scratch.target);
      controls.getPosition(scratch.position);
      scratch.direction.copy(scratch.position).sub(scratch.target);
      if (scratch.direction.lengthSq() === 0) return;
      scratch.direction.normalize();

      const radius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(radius) || radius <= 0) return;

      const startFovDeg = perspective.fov;
      const startFovRad = MathUtils.degToRad(startFovDeg);

      morph.target.copy(scratch.target);
      morph.direction.copy(scratch.direction);
      morph.startFovDeg = startFovDeg;
      morph.scale = 2 * radius * Math.tan(startFovRad / 2);
      morph.startTime = performance.now();
      morph.phase = "morph";
      return;
    }

    const now = performance.now();
    const raw = (now - morph.startTime) / morph.durationMs;
    const t = MathUtils.clamp(raw, 0, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const nextFovDeg = MathUtils.lerp(morph.startFovDeg, morph.endFovDeg, eased);
    const nextFovRad = MathUtils.degToRad(nextFovDeg);
    const nextDistance = morph.scale / (2 * Math.tan(nextFovRad / 2));

    if (perspective) {
      perspective.fov = nextFovDeg;
      perspective.updateProjectionMatrix();
    }

    scratch.nextPosition.copy(morph.target).addScaledVector(morph.direction, nextDistance);

    controls.setLookAt(
      scratch.nextPosition.x,
      scratch.nextPosition.y,
      scratch.nextPosition.z,
      morph.target.x,
      morph.target.y,
      morph.target.z,
      false,
    );
    controls.update(0);

    if (t < 1) return;
    projectionMorphRef.current = null;
    if (perspective) {
      perspective.fov = morph.endFovDeg;
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

    const pending = pendingViewRef.current;
    if (pending) {
      const wantsOrthographic = pending.zoom !== null;
      const isOrthographic = (controls.camera as any)?.isOrthographicCamera === true;

      if (wantsOrthographic !== isOrthographic) {
        invalidate();
        return;
      }

      pendingViewRef.current = null;

      controls.setLookAt(
        pending.position.x,
        pending.position.y,
        pending.position.z,
        pending.target.x,
        pending.target.y,
        pending.target.z,
        pending.enableTransition,
      );

      if (isOrthographic && pending.zoom !== null) {
        controls.zoomTo(pending.zoom, pending.enableTransition);
      }

      controls.update(0);
      invalidate();

      return;
    }

    if (!initializedRef.current) {
      controls.setLookAt(10, -10, 10, 0, 0, 0, false);
      controls.update(0);
      initializedRef.current = true;
      invalidate();
    }
  }, -2);

  const enterOrthographicView = (worldDirection: [number, number, number]) => {
    const controls = controlsRef.current;
    if (!controls) return;

    projectionMorphRef.current = null;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

    const radius = scratch.position.distanceTo(scratch.target);
    if (!Number.isFinite(radius) || radius <= 0) return;

    scratch.direction.set(...worldDirection);
    if (scratch.direction.lengthSq() === 0) return;
    scratch.direction.normalize();

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

    const perspective = perspectiveCameraRef.current;
    const startFovDeg = perspective?.fov ?? DEFAULT_PERSPECTIVE_FOV_DEG;
    const startFovRad = MathUtils.degToRad(startFovDeg);
    const scale = 2 * radius * Math.tan(startFovRad / 2);

    projectionMorphRef.current = {
      kind: "perspectiveToOrthographic",
      phase: "awaitRest",
      direction: scratch.direction.clone(),
      target: scratch.target.clone(),
      scale,
      startFovDeg,
      endFovDeg: MORPH_FOV_MIN_DEG,
      orthoZoom: size.height / scale,
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

  const leaveOrthographicView = () => {
    if (projection !== "orthographic") return;
    if (projectionMorphRef.current) return;

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

    pendingViewRef.current = {
      position: scratch.nextPosition.clone(),
      target: scratch.target.clone(),
      zoom: null,
      enableTransition: false,
    };

    projectionMorphRef.current = {
      kind: "orthographicToPerspective",
      phase: "awaitSwap",
      direction: scratch.direction.clone(),
      target: scratch.target.clone(),
      scale,
      startFovDeg,
      endFovDeg: DEFAULT_PERSPECTIVE_FOV_DEG,
      startTime: 0,
      durationMs: PROJECTION_MORPH_DURATION_MS,
    };

    orthoLockRef.current = null;
    setProjection("perspective");
    invalidate();
  };

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
        isTransitioning={() => projectionMorphRef.current !== null}
      />

      <MainScene />
      <ViewCube
        controls={controlsRef}
        onSelectDirection={enterOrthographicView}
        onRotateAroundUp={handleRotateAroundUp}
      />
    </>
  );
}

function OrthoProjectionManager(props: {
  projection: "perspective" | "orthographic";
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

    const angle = scratch.direction.angleTo(lock.direction);
    if (angle <= ORTHO_SWITCH_TOLERANCE_RADIANS) return;

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

      <AxesOverlay size={6} />
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

    const isOrthographic = (camera as any)?.isOrthographicCamera === true;
    const perspectiveCamera = camera as ThreePerspectiveCamera;
    const orthographicCamera = camera as ThreeOrthographicCamera;

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

      scratch.raycaster.setFromCamera(scratch.pointer, camera);
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

      const viewportHeight = Math.max(1, element.clientHeight);

      let distanceScale = 0;
      if (isOrthographic) {
        const zoom = Math.max(orthographicCamera.zoom, 1e-6);
        const orthoHeight = orthographicCamera.top - orthographicCamera.bottom;
        distanceScale = orthoHeight / zoom / viewportHeight;
      } else {
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
