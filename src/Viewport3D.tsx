import {
  CameraControlsImpl,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { Plane } from "three";
import { AxesHelper, LineBasicMaterial, Vector3 } from "three";
import { ViewCube } from "./ViewCube";
import { GeoRoot } from "./geo/GeoRoot";
import { useGeoFrame } from "./geo/useGeoFrame";
import { StableCameraControls } from "./viewport/StableCameraControls";
import {
  type OrbitFallbackPlaneContext,
  TrackpadControls,
} from "./viewport/TrackpadControls";
import { ViewportDebugOverlay } from "./viewport/ViewportDebugOverlay";
import {
  AXES_OVERLAY_LENGTH,
  MAX_DISTANCE,
  MIN_DISTANCE,
  PAN_SPEED,
  ROTATE_SPEED,
} from "./viewport/constants";
import { matchDefaultViewShortcut } from "./viewport/defaultViews";
import { useCameraRig } from "./viewport/useCameraRig";

const Z_UP = new Vector3(0, 0, 1);

export function Viewport3D(props: { className?: string }) {
  return (
    <div
      className={["h-full w-full", props.className].filter(Boolean).join(" ")}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
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
  const geo = useGeoFrame();
  const renderOffsetRef = useRef<Vector3>(geo.renderOffset);

  useEffect(() => {
    renderOffsetRef.current = geo.renderOffset;
  }, [geo.renderOffset]);

  const getOrbitFallbackPlane = useCallback(
    (_ctx: OrbitFallbackPlaneContext, out: Plane) => {
      out.setFromNormalAndCoplanarPoint(Z_UP, renderOffsetRef.current);
      return out;
    },
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
      const defaultView = matchDefaultViewShortcut(event);
      if (!defaultView) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      geo.reset();
      rig.requestDefaultView(defaultView.id);
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [geo.reset, gl, rig.requestDefaultView]);

  return (
    <>
      <DreiPerspectiveCamera
        ref={rig.perspectiveCameraRef}
        up={[0, 0, 1]}
        near={0.1}
        far={50000}
      />

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
	        panSpeed={PAN_SPEED}
	        minDistance={MIN_DISTANCE}
	        maxDistance={MAX_DISTANCE}
	        onRenderPan={geo.translateRender}
	        getOrbitFallbackPlane={getOrbitFallbackPlane}
	      />

      <MainScene renderOffset={geo.renderOffset} />
      <GeoRoot frame={geo.frame} />
      <ViewportDebugOverlay
        controlsRef={rig.controlsRef}
        worldUnitsPerPixelRef={rig.worldUnitsPerPixelRef}
        geo={{
          geodetic: geo.geodetic,
          originEcef: geo.originEcef,
          renderOffset: geo.renderOffset,
          frame: geo.frame,
        }}
        enabledByDefault={false}
      />
      <ViewCube
        controls={rig.controlsRef}
        getWorldDirectionFromLocalDirection={
          rig.getWorldDirectionFromLocalDirection
        }
      />
    </>
  );
}

function MainScene(props: { renderOffset: Vector3 }) {
  return (
    <group position={props.renderOffset}>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper args={[200, 200, "#2b2b2f", "#1b1b1f"]} />
        <gridHelper args={[200, 20, "#34343a", "#24242a"]} />
      </group>

      <AxesOverlay size={AXES_OVERLAY_LENGTH} />
    </group>
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
