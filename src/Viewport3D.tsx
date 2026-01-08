import {
  CameraControlsImpl,
  OrthographicCamera as DreiOrthographicCamera,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { AxesHelper, LineBasicMaterial } from "three";
import { ViewCube } from "./ViewCube";
import { StableCameraControls } from "./viewport/StableCameraControls";
import { TrackpadControls } from "./viewport/TrackpadControls";
import {
  AXES_OVERLAY_LENGTH,
  MAX_DISTANCE,
  MAX_ORTHO_ZOOM,
  MIN_DISTANCE,
  MIN_ORTHO_ZOOM,
  ROTATE_SPEED,
} from "./viewport/constants";
import { useCameraRig } from "./viewport/useCameraRig";
import { matchDefaultViewShortcut } from "./viewport/defaultViews";

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

function Viewport3DContent() {
  const gl = useThree((state) => state.gl);
  const rig = useCameraRig();

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
      const defaultView = matchDefaultViewShortcut(event);
      if (!defaultView) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      rig.requestDefaultView(defaultView.id);
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [gl, rig.requestDefaultView]);

  return (
    <>
      <DreiPerspectiveCamera ref={rig.perspectiveCameraRef} up={[0, 0, 1]} near={0.1} far={50000} />
      <DreiOrthographicCamera ref={rig.orthographicCameraRef} up={[0, 0, 1]} near={0.1} far={50000} />

      <StableCameraControls
        ref={rig.controlsRef}
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

      <TrackpadControls
        controlsRef={rig.controlsRef}
        worldFrame={rig.worldFrame}
        rotateSpeed={ROTATE_SPEED}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        minOrthoZoom={MIN_ORTHO_ZOOM}
        maxOrthoZoom={MAX_ORTHO_ZOOM}
      />

      <MainScene />
      <ViewCube
        controls={rig.controlsRef}
        projection={rig.projection}
        onSelectDirection={rig.enterOrthographicView}
        onRotateAroundUp={rig.handleRotateAroundUp}
        getWorldDirectionFromLocalDirection={rig.getWorldDirectionFromLocalDirection}
      />
    </>
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
