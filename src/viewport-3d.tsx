import {
  CameraControlsImpl,
  PerspectiveCamera as DreiPerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  CONTROLS_DRAGGING_SMOOTH_TIME,
  CONTROLS_SMOOTH_TIME,
  MAX_DISTANCE,
  MIN_DISTANCE,
  PAN_SPEED,
  ROTATE_SPEED,
} from "./viewport/constants";
import { MainScene } from "./viewport/scene-helpers";
import { StableCameraControls } from "./viewport/stable-camera-controls";
import { TrackpadControls } from "./viewport/trackpad-controls";
import { useCameraRig } from "./viewport/use-camera-rig";
import { useDefaultViewShortcuts } from "./viewport/use-default-view-shortcuts";
import { useOrbitFallbackPlane } from "./viewport/use-orbit-fallback-plane";
import { ViewCube } from "./viewport/viewcube/view-cube";
import { ViewportDebugOverlay } from "./viewport/viewport-debug-overlay";

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
  const getOrbitFallbackPlane = useOrbitFallbackPlane();

  useDefaultViewShortcuts({
    element: gl.domElement,
    onSelectDefaultView: (id) => {
      rig.requestDefaultView(id);
    },
  });

  return (
    <>
      <DreiPerspectiveCamera
        ref={rig.perspectiveCameraRef}
        up={[0, 0, 1]}
        near={0.1}
        far={50000}
        fov={45}
      />

      <StableCameraControls
        ref={rig.controlsRef}
        makeDefault
        smoothTime={CONTROLS_SMOOTH_TIME}
        draggingSmoothTime={CONTROLS_DRAGGING_SMOOTH_TIME}
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
        inputBlockRef={rig.inputBlockRef}
        worldFrame={rig.worldFrame}
        rotateSpeed={ROTATE_SPEED}
        panSpeed={PAN_SPEED}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        onOrbitInput={rig.onOrbitInput}
        getOrbitFallbackPlane={getOrbitFallbackPlane}
      />

      <MainScene />
      <ViewportDebugOverlay
        controlsRef={rig.controlsRef}
        worldUnitsPerPixelRef={rig.worldUnitsPerPixelRef}
        enabledByDefault={false}
      />
      <ViewCube
        controls={rig.controlsRef}
        // Route ViewCube face clicks through the camera rig so snaps establish a
        // consistent orbit plane (worldFrame up) and don't regress into CameraControls'
        // default rotate behavior (which can feel like orbiting around the wrong plane
        // after top-down/north-up views).
        onSelectDirection={rig.onSelectDirection}
        onOrbitInput={rig.onOrbitInput}
        onRotateAroundUp={rig.onRotateAroundUp}
      />
    </>
  );
}
