import { useMemo } from "react";
import { Color, Vector3 } from "three";
import type { LocalEnuFrame } from "./localFrame";

export function GeoFrameDebug(props: {
  frame: LocalEnuFrame;
  sizeMeters?: number;
}) {
  const size = props.sizeMeters ?? 100;

  const points = useMemo(() => {
    const origin = props.frame.originEcef;
    const east = props.frame.eastEcef;
    const north = props.frame.northEcef;
    const up = props.frame.upEcef;

    const o = origin.clone();
    return {
      origin: o,
      east: o.clone().addScaledVector(east, size),
      north: o.clone().addScaledVector(north, size),
      up: o.clone().addScaledVector(up, size),
    };
  }, [props.frame, size]);

  return (
    <group>
      <Dot position={points.origin} color="#ffffff" />
      <Dot position={points.east} color="#4a7cff" />
      <Dot position={points.north} color="#4fc07f" />
      <Dot position={points.up} color="#e15a5a" />
    </group>
  );
}

function Dot(props: { position: Vector3; color: string }) {
  const color = useMemo(() => new Color(props.color), [props.color]);
  return (
    <mesh
      position={props.position.toArray() as [number, number, number]}
      raycast={() => null}
    >
      <sphereGeometry args={[5, 10, 10]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
  );
}
