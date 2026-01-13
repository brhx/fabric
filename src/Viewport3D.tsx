import {
  CameraControlsImpl,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { ViewCube } from "./ViewCube";
import { GeoRoot } from "./geo/GeoRoot";
import { useGeoFrame } from "./geo/useGeoFrame";
import { MainScene } from "./viewport/SceneHelpers";
import { StableCameraControls } from "./viewport/StableCameraControls";
import { TrackpadControls } from "./viewport/TrackpadControls";
import { ViewportDebugOverlay } from "./viewport/ViewportDebugOverlay";
import {
  MAX_DISTANCE,
  MIN_DISTANCE,
  PAN_SPEED,
  ROTATE_SPEED,
} from "./viewport/constants";
import { useCameraRig } from "./viewport/useCameraRig";
import { useDefaultViewShortcuts } from "./viewport/useDefaultViewShortcuts";
import { useOrbitFallbackPlane } from "./viewport/useOrbitFallbackPlane";

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
        <ViewportScene />
      </Canvas>
    </div>
  );
}

function ViewportScene() {
  const gl = useThree((state) => state.gl);
  const rig = useCameraRig();
  const geo = useGeoFrame();
  const getOrbitFallbackPlane = useOrbitFallbackPlane(geo.renderOffset);

  useDefaultViewShortcuts({
    element: gl.domElement,
    reset: geo.reset,
    requestDefaultView: rig.requestDefaultView,
  });

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
