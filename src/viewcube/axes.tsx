import { useMemo } from "react";
import { CanvasTexture, Quaternion, Vector3 } from "three";
import { vector3ToTuple } from "./vector-utils";

export function AxisLine(props: {
  direction: [number, number, number];
  length: number;
  radius: number;
  color: string;
}) {
  const quaternion = useMemo(() => {
    const dir = new Vector3(...props.direction).normalize();
    const q = new Quaternion();
    q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    return q;
  }, [props.direction]);

  const position = useMemo(() => {
    const dir = new Vector3(...props.direction).normalize();
    return vector3ToTuple(dir.multiplyScalar(props.length / 2));
  }, [props.direction, props.length]);

  return (
    <mesh
      raycast={() => null}
      position={position}
      quaternion={quaternion}
      renderOrder={2}
    >
      <cylinderGeometry args={[props.radius, props.radius, props.length, 10]} />
      <meshBasicMaterial color={props.color} depthWrite={false} />
    </mesh>
  );
}

export function AxisLabel(props: {
  texture: CanvasTexture | null;
  position: [number, number, number];
  scale: number;
}) {
  if (!props.texture) return null;
  return (
    <sprite
      raycast={() => null}
      position={props.position}
      scale={props.scale}
      renderOrder={0}
    >
      <spriteMaterial
        map={props.texture}
        transparent
        opacity={0.92}
        depthTest
        depthWrite={false}
      />
    </sprite>
  );
}
