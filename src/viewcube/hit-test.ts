import { Vector3 } from "three";

export type ViewCubeHit = {
  kind: "face" | "edge" | "corner";
  localDirection: readonly [number, number, number];
};

export type ViewCubeHitKey =
  `${ViewCubeHit["kind"]}:${number},${number},${number}`;

export type ViewCubeTriangleHit = Pick<ViewCubeHit, "kind" | "localDirection">;

export function getViewCubeHitKey(
  kind: ViewCubeHit["kind"],
  localDirection: readonly [number, number, number],
): ViewCubeHitKey {
  return `${kind}:${localDirection[0]},${localDirection[1]},${localDirection[2]}`;
}

export function isSameViewCubeHit(
  a: ViewCubeHit | null,
  b: ViewCubeHit | null,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.localDirection[0] === b.localDirection[0] &&
    a.localDirection[1] === b.localDirection[1] &&
    a.localDirection[2] === b.localDirection[2]
  );
}

export function getViewCubeHitFromFaceIndex(
  faceIndex: number | null | undefined,
  triangleHits: ViewCubeTriangleHit[],
): ViewCubeHit | null {
  if (faceIndex === null || faceIndex === undefined) return null;
  const meta = triangleHits[faceIndex];
  if (!meta) return null;
  return { kind: meta.kind, localDirection: meta.localDirection };
}

export function localDirectionToWorldDirection(
  direction: readonly [number, number, number],
): [number, number, number] {
  // Local axes are rotated to match the main Z-up world:
  // local X -> world X, local Y -> world Z, local Z -> world -Y.
  const world = new Vector3(direction[0], -direction[2], direction[1]);
  if (world.lengthSq() === 0) return [0, 0, 1];
  world.normalize();
  return [world.x, world.y, world.z];
}
