import { BufferGeometry, Vector3 } from "three";
import {
  VIEWCUBE_HOVER_COLOR,
  VIEWCUBE_HOVER_OFFSET_PX,
  VIEWCUBE_HOVER_OPACITY,
} from "./constants";
import {
  getViewCubeHitKey,
  type ViewCubeHit,
  type ViewCubeHitKey,
} from "./hit-test";
import { vector3ToTuple } from "./vector-utils";

export function ViewCubeHoverHighlight(props: {
  hit: ViewCubeHit | null;
  highlightGeometries: Record<ViewCubeHitKey, BufferGeometry>;
}) {
  const hit = props.hit;
  if (!hit) return null;

  const key = getViewCubeHitKey(hit.kind, hit.localDirection);
  const geometry = props.highlightGeometries[key];
  if (!geometry) return null;

  const [lx, ly, lz] = hit.localDirection;
  const normal = new Vector3(lx, ly, lz).normalize();

  const materialProps = {
    color: VIEWCUBE_HOVER_COLOR,
    transparent: true,
    opacity: VIEWCUBE_HOVER_OPACITY,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;

  const position = vector3ToTuple(
    normal.clone().multiplyScalar(VIEWCUBE_HOVER_OFFSET_PX),
  );
  return (
    <mesh
      raycast={() => null}
      position={position}
      geometry={geometry}
      renderOrder={4}
    >
      <meshBasicMaterial {...materialProps} />
    </mesh>
  );
}
