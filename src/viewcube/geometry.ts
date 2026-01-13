import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import {
  getViewCubeHitKey,
  type ViewCubeHit,
  type ViewCubeHitKey,
  type ViewCubeTriangleHit,
} from "./hitTest";

export function createChamferedCubeGeometry(size: number, chamfer: number) {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const triangleHits: ViewCubeTriangleHit[] = [];

  const half = size / 2;
  const safeChamfer = Math.min(Math.max(0, chamfer), half * 0.48);
  const inset = half - safeChamfer;

  const addFace = (verts: Vector3[], normal: Vector3) => {
    const desired = normal.clone().normalize();
    const localDirection: [number, number, number] = [
      Math.sign(normal.x),
      Math.sign(normal.y),
      Math.sign(normal.z),
    ];
    const nonZero = localDirection.filter((value) => value !== 0).length;
    const kind: ViewCubeHit["kind"] =
      nonZero === 1 ? "face"
      : nonZero === 2 ? "edge"
      : "corner";
    const computed = new Vector3()
      .subVectors(verts[1], verts[0])
      .cross(new Vector3().subVectors(verts[2], verts[0]))
      .normalize();
    const orientedVerts =
      computed.dot(desired) < 0 ?
        [verts[0], ...verts.slice(1).reverse()]
      : verts;

    const baseIndex = positions.length / 3;
    for (const vertex of orientedVerts) {
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(desired.x, desired.y, desired.z);
    }

    if (orientedVerts.length === 4) {
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex,
        baseIndex + 2,
        baseIndex + 3,
      );
      triangleHits.push({ kind, localDirection }, { kind, localDirection });
    } else if (orientedVerts.length === 3) {
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
      triangleHits.push({ kind, localDirection });
    }
  };

  const signs = [-1, 1];

  for (const sx of signs) {
    addFace(
      [
        new Vector3(sx * half, inset, inset),
        new Vector3(sx * half, inset, -inset),
        new Vector3(sx * half, -inset, -inset),
        new Vector3(sx * half, -inset, inset),
      ],
      new Vector3(sx, 0, 0),
    );
  }

  for (const sy of signs) {
    addFace(
      [
        new Vector3(inset, sy * half, inset),
        new Vector3(inset, sy * half, -inset),
        new Vector3(-inset, sy * half, -inset),
        new Vector3(-inset, sy * half, inset),
      ],
      new Vector3(0, sy, 0),
    );
  }

  for (const sz of signs) {
    addFace(
      [
        new Vector3(inset, inset, sz * half),
        new Vector3(-inset, inset, sz * half),
        new Vector3(-inset, -inset, sz * half),
        new Vector3(inset, -inset, sz * half),
      ],
      new Vector3(0, 0, sz),
    );
  }

  for (const sx of signs) {
    for (const sy of signs) {
      addFace(
        [
          new Vector3(sx * half, sy * inset, inset),
          new Vector3(sx * half, sy * inset, -inset),
          new Vector3(sx * inset, sy * half, -inset),
          new Vector3(sx * inset, sy * half, inset),
        ],
        new Vector3(sx, sy, 0),
      );
    }
  }

  for (const sx of signs) {
    for (const sz of signs) {
      addFace(
        [
          new Vector3(sx * half, inset, sz * inset),
          new Vector3(sx * half, -inset, sz * inset),
          new Vector3(sx * inset, -inset, sz * half),
          new Vector3(sx * inset, inset, sz * half),
        ],
        new Vector3(sx, 0, sz),
      );
    }
  }

  for (const sy of signs) {
    for (const sz of signs) {
      addFace(
        [
          new Vector3(inset, sy * half, sz * inset),
          new Vector3(-inset, sy * half, sz * inset),
          new Vector3(-inset, sy * inset, sz * half),
          new Vector3(inset, sy * inset, sz * half),
        ],
        new Vector3(0, sy, sz),
      );
    }
  }

  for (const sx of signs) {
    for (const sy of signs) {
      for (const sz of signs) {
        addFace(
          [
            new Vector3(sx * half, sy * inset, sz * inset),
            new Vector3(sx * inset, sy * half, sz * inset),
            new Vector3(sx * inset, sy * inset, sz * half),
          ],
          new Vector3(sx, sy, sz),
        );
      }
    }
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const highlightPositionsByKey: Partial<Record<ViewCubeHitKey, number[]>> = {};
  for (
    let triangleIndex = 0;
    triangleIndex < triangleHits.length;
    triangleIndex++
  ) {
    const meta = triangleHits[triangleIndex];
    const key = getViewCubeHitKey(meta.kind, meta.localDirection);
    const dest = highlightPositionsByKey[key] ?? [];

    const i0 = indices[triangleIndex * 3];
    const i1 = indices[triangleIndex * 3 + 1];
    const i2 = indices[triangleIndex * 3 + 2];
    dest.push(
      positions[i0 * 3],
      positions[i0 * 3 + 1],
      positions[i0 * 3 + 2],
      positions[i1 * 3],
      positions[i1 * 3 + 1],
      positions[i1 * 3 + 2],
      positions[i2 * 3],
      positions[i2 * 3 + 1],
      positions[i2 * 3 + 2],
    );

    highlightPositionsByKey[key] = dest;
  }

  const highlightGeometries = {} as Record<ViewCubeHitKey, BufferGeometry>;
  for (const [key, verts] of Object.entries(highlightPositionsByKey)) {
    if (!verts || verts.length === 0) continue;
    const highlight = new BufferGeometry();
    highlight.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(verts), 3),
    );
    highlight.computeBoundingSphere();
    highlightGeometries[key as ViewCubeHitKey] = highlight;
  }

  return { geometry, triangleHits, highlightGeometries };
}
