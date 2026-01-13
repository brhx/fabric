import { useEffect, useRef } from "react";
import { AxesHelper, LineBasicMaterial, Vector3 } from "three";
import { AXES_OVERLAY_LENGTH } from "./constants";

export function MainScene(props: { renderOffset: Vector3 }) {
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
