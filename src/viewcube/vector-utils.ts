import { Vector3 } from "three";

export function vector3ToTuple(vec: Vector3): [number, number, number] {
  return [vec.x, vec.y, vec.z];
}

export function tupleToVector3(
  tuple: readonly [number, number, number],
  out: Vector3 = new Vector3(),
) {
  return out.set(tuple[0], tuple[1], tuple[2]);
}
