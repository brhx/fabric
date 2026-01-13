import type { CameraControlsImpl } from "@react-three/drei";
import { Hud } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import type { Camera } from "three";
import { ViewCubeHud } from "./view-cube-hud";

export type ViewCubeProps = {
  controls: RefObject<CameraControlsImpl | null>;
  onSelectDirection?: (worldDirection: [number, number, number]) => void;
  onRotateAroundUp?: (radians: number) => boolean;
  onOrbitInput?: (azimuthRadians: number, polarRadians: number) => boolean;
  getWorldDirectionFromLocalDirection?: (
    localDirection: [number, number, number],
  ) => [number, number, number];
};

export function ViewCube(props: ViewCubeProps) {
  const fallbackCamera = useThree((state) => state.camera);
  return (
    <Hud renderPriority={1}>
      <ViewCubeHud {...props} fallbackCamera={fallbackCamera as Camera} />
    </Hud>
  );
}
