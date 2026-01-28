import { useEffect, useRef } from "react";
import { AxesHelper, GridHelper } from "three";
import { AXES_OVERLAY_LENGTH } from "./constants";

export function MainScene() {
  const axesRef = useRef<AxesHelper | null>(null);
  const majorGridRef = useRef<GridHelper | null>(null);
  const minorGridRef = useRef<GridHelper | null>(null);

  useEffect(() => {
    const axes = axesRef.current;
    if (axes) {
      axes.renderOrder = 1;

      const materials = Array.isArray(axes.material)
        ? axes.material
        : [axes.material];
      for (const material of materials) {
        material.depthTest = true;
        material.depthWrite = true;
      }
    }

    const grids = [majorGridRef.current, minorGridRef.current].filter(
      Boolean,
    ) as GridHelper[];
    for (const grid of grids) {
      const materials = Array.isArray(grid.material)
        ? grid.material
        : [grid.material];
      for (const material of materials) {
        material.depthWrite = false;
      }
    }
  }, []);

  return (
    <group>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper
          ref={majorGridRef}
          args={[200, 200, "#2b2b2f", "#1b1b1f"]}
        />
        <gridHelper
          ref={minorGridRef}
          args={[200, 20, "#34343a", "#24242a"]}
        />
      </group>

      <mesh position={[0, 0, 1.5]}>
        <boxGeometry args={[3, 3, 3]} />
        <meshNormalMaterial />
      </mesh>

      <axesHelper ref={axesRef} args={[AXES_OVERLAY_LENGTH]} />
    </group>
  );
}
