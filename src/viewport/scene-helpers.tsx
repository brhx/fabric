import { AXES_OVERLAY_LENGTH } from "./constants";

export function MainScene() {
  return (
    <group>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper args={[200, 200, "#2b2b2f", "#1b1b1f"]} />
        <gridHelper args={[200, 20, "#34343a", "#24242a"]} />
      </group>

      <mesh position={[3, 1.5, 1.2]}>
        <boxGeometry args={[6, 3, 2.4]} />
        <meshNormalMaterial />
      </mesh>

      <axesHelper args={[AXES_OVERLAY_LENGTH]} />
    </group>
  );
}
