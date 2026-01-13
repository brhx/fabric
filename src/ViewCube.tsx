import {
  CameraControlsImpl,
  Edges,
  Html,
  Hud,
  PerspectiveCamera,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuRotateCcw, LuRotateCw } from "react-icons/lu";
import {
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  MathUtils,
  type Mesh,
  Quaternion,
  Raycaster,
  PerspectiveCamera as ThreePerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { isPerspectiveCamera } from "./camera";
import { stabilizePoleDirection } from "./viewport/poleNudge";

const VIEWCUBE_SCALE = 0.75;

export const VIEWCUBE_MARGIN_RIGHT_PX = 52;
export const VIEWCUBE_MARGIN_TOP_PX = 24;

const VIEWCUBE_DRAG_ROTATE_SPEED = 0.0042;
const VIEWCUBE_DRAG_THRESHOLD_PX = 3;

const VIEWCUBE_CUBE_SIZE_PX = 42 * VIEWCUBE_SCALE;
const VIEWCUBE_CHAMFER_PX = VIEWCUBE_CUBE_SIZE_PX * 0.2;
const VIEWCUBE_SAFE_CHAMFER_PX = Math.min(
  VIEWCUBE_CHAMFER_PX,
  VIEWCUBE_CUBE_SIZE_PX * 0.24,
);
const VIEWCUBE_FACE_SIZE_PX =
  VIEWCUBE_CUBE_SIZE_PX - 2 * VIEWCUBE_SAFE_CHAMFER_PX;
const VIEWCUBE_FACE_LABEL_SIZE_PX = VIEWCUBE_FACE_SIZE_PX * 0.82;
const VIEWCUBE_CUBE_LABEL_OFFSET_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 0.8 * VIEWCUBE_SCALE;
const VIEWCUBE_HOVER_COLOR = "#3b82f6";
const VIEWCUBE_HOVER_OPACITY = 0.86;
const VIEWCUBE_HOVER_OFFSET_PX = 0.28 * VIEWCUBE_SCALE;

const VIEWCUBE_AXIS_SCALE = 0.62;
const VIEWCUBE_AXIS_LENGTH_PX = 36 * VIEWCUBE_SCALE;
const VIEWCUBE_AXIS_RADIUS_PX = 1.0 * VIEWCUBE_SCALE;
const VIEWCUBE_AXIS_CORNER_GAP_PX = 3.6 * VIEWCUBE_SCALE;
const VIEWCUBE_AXIS_SPHERE_RADIUS_PX = 2.2 * VIEWCUBE_SCALE;
const VIEWCUBE_AXIS_LABEL_OFFSET_PX = 10 * VIEWCUBE_SCALE;
const VIEWCUBE_AXIS_LABEL_SCALE = 20 * VIEWCUBE_SCALE;

const VIEWCUBE_BUTTON_SIZE_PX = 26 * VIEWCUBE_SCALE;
const VIEWCUBE_BUTTON_OFFSET_X_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 25 * VIEWCUBE_SCALE;
const VIEWCUBE_BUTTON_OFFSET_Y_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 20 * VIEWCUBE_SCALE;
const VIEWCUBE_BUTTON_ICON_SIZE_PX = 18 * VIEWCUBE_SCALE;

const VIEWCUBE_CONTENT_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0];
const VIEWCUBE_PERSPECTIVE_DISTANCE_SCALE = 0.7;
const VIEWCUBE_WIDGET_GAP_PX = 16 * VIEWCUBE_SCALE;

export const VIEWCUBE_WIDGET_WIDTH_PX =
  VIEWCUBE_BUTTON_OFFSET_X_PX * 2 + VIEWCUBE_BUTTON_SIZE_PX;
export const VIEWCUBE_WIDGET_HEIGHT_PX =
  VIEWCUBE_BUTTON_OFFSET_Y_PX +
  VIEWCUBE_BUTTON_SIZE_PX / 2 +
  (VIEWCUBE_CUBE_SIZE_PX / 2 + VIEWCUBE_WIDGET_GAP_PX) +
  (VIEWCUBE_AXIS_LENGTH_PX * VIEWCUBE_AXIS_SCALE) / 2;

const COLOR_AXIS_X = "#e15a5a";
const COLOR_AXIS_Y = "#4fc07f";
const COLOR_AXIS_Z = "#4a7cff";

const FACE_LABELS = [
  { key: "right", label: "Right", localNormal: new Vector3(1, 0, 0) },
  { key: "left", label: "Left", localNormal: new Vector3(-1, 0, 0) },
  { key: "top", label: "Top", localNormal: new Vector3(0, 1, 0) },
  { key: "bottom", label: "Bottom", localNormal: new Vector3(0, -1, 0) },
  { key: "front", label: "Front", localNormal: new Vector3(0, 0, 1) },
  { key: "back", label: "Back", localNormal: new Vector3(0, 0, -1) },
] as const;

type ViewCubeHit = {
  kind: "face" | "edge" | "corner";
  localDirection: readonly [number, number, number];
};

type ViewCubeHitKey = `${ViewCubeHit["kind"]}:${number},${number},${number}`;

function getViewCubeHitKey(
  kind: ViewCubeHit["kind"],
  localDirection: readonly [number, number, number],
): ViewCubeHitKey {
  return `${kind}:${localDirection[0]},${localDirection[1]},${localDirection[2]}`;
}

function localDirectionToWorldDirection(
  direction: readonly [number, number, number],
): [number, number, number] {
  // Local axes are rotated to match the main Z-up world:
  // local X -> world X, local Y -> world Z, local Z -> world -Y.
  const world = new Vector3(direction[0], -direction[2], direction[1]);
  if (world.lengthSq() === 0) return [0, 0, 1];
  world.normalize();
  return [world.x, world.y, world.z];
}

function isSameViewCubeHit(a: ViewCubeHit | null, b: ViewCubeHit | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.localDirection[0] === b.localDirection[0] &&
    a.localDirection[1] === b.localDirection[1] &&
    a.localDirection[2] === b.localDirection[2]
  );
}

type ViewCubeTriangleHit = Pick<ViewCubeHit, "kind" | "localDirection">;

function getViewCubeHitFromFaceIndex(
  faceIndex: number | null | undefined,
  triangleHits: ViewCubeTriangleHit[],
): ViewCubeHit | null {
  if (faceIndex === null || faceIndex === undefined) return null;
  const meta = triangleHits[faceIndex];
  if (!meta) return null;
  return { kind: meta.kind, localDirection: meta.localDirection };
}

function createChamferedCubeGeometry(size: number, chamfer: number) {
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

type ViewCubeProps = {
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
      <ViewCubeHud {...props} fallbackCamera={fallbackCamera} />
    </Hud>
  );
}

function ViewCubeHud(
  props: ViewCubeProps & {
    fallbackCamera: Camera;
  },
) {
  const { gl, invalidate, size } = useThree();
  const [margin, setMargin] = useState<[number, number]>(() => [
    VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX / 2,
    VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_WIDGET_HEIGHT_PX / 2,
  ]);

  const hudPerspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const orientationRef = useRef<Group | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    didDrag: boolean;
    snapHit: ViewCubeHit | null;
  } | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);

  const [hoverHit, setHoverHit] = useState<ViewCubeHit | null>(null);

  const localToWorldDirection = useMemo(() => {
    if (!props.getWorldDirectionFromLocalDirection)
      return localDirectionToWorldDirection;
    return (direction: readonly [number, number, number]) =>
      props.getWorldDirectionFromLocalDirection!([
        direction[0],
        direction[1],
        direction[2],
      ]);
  }, [props.getWorldDirectionFromLocalDirection]);

  const cubeMeshRef = useRef<Mesh | null>(null);
  const scratch = useMemo(
    () => ({
      quaternion: new Quaternion(),
      worldDirection: new Vector3(),
      target: new Vector3(),
      position: new Vector3(),
      nudge: new Vector3(),
      raycaster: new Raycaster(),
      pointerNdc: new Vector2(),
    }),
    [],
  );

  const cubeModel = useMemo(
    () =>
      createChamferedCubeGeometry(
        VIEWCUBE_CUBE_SIZE_PX,
        VIEWCUBE_SAFE_CHAMFER_PX,
      ),
    [],
  );

  useEffect(() => {
    return () => {
      cubeModel.geometry.dispose();
      Object.values(cubeModel.highlightGeometries).forEach((highlight) =>
        highlight.dispose(),
      );
    };
  }, [cubeModel]);

  const updateHoverHit = useCallback(
    (nextHit: ViewCubeHit | null) => {
      setHoverHit((current) => {
        if (isSameViewCubeHit(current, nextHit)) return current;
        invalidate();
        return nextHit;
      });
    },
    [invalidate],
  );

  const getCubeHitFromClientPoint = useCallback(
    (clientX: number, clientY: number): ViewCubeHit | null => {
      const mesh = cubeMeshRef.current;
      const hudCamera = hudPerspectiveCameraRef.current;
      if (!mesh || !hudCamera) return null;

      const rect = gl.domElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return null;

      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }

      scratch.pointerNdc.set(
        ((clientX - rect.left) / width) * 2 - 1,
        -((clientY - rect.top) / height) * 2 + 1,
      );

      // Ensure matrices are up-to-date (pointer events can fire between renders).
      mesh.updateWorldMatrix(true, false);
      hudCamera.updateMatrixWorld();

      scratch.raycaster.setFromCamera(scratch.pointerNdc, hudCamera);
      const [intersection] = scratch.raycaster.intersectObject(mesh, false);

      return getViewCubeHitFromFaceIndex(
        intersection?.faceIndex,
        cubeModel.triangleHits,
      );
    },
    [cubeModel.triangleHits, gl, scratch],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    let frame: number | null = null;

    const update = () => {
      frame = null;

      const canvasRect = element.getBoundingClientRect();
      const viewportElement = doc.querySelector(
        '[data-viewport-area="true"]',
      ) as HTMLElement | null;
      const viewportRect =
        viewportElement?.getBoundingClientRect() ?? canvasRect;

      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const nextMargin: [number, number] = [
        Math.round(
          rightInset + VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX / 2,
        ),
        Math.round(
          topInset + VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_WIDGET_HEIGHT_PX / 2,
        ),
      ];

      setMargin((current) => {
        if (current[0] === nextMargin[0] && current[1] === nextMargin[1])
          return current;
        return nextMargin;
      });
      invalidate();
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(update);
    };

    schedule();

    view.addEventListener("resize", schedule);
    view.addEventListener("scroll", schedule, { passive: true, capture: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : (
        new ResizeObserver(() => {
          schedule();
        })
      );

    const viewportElement = doc.querySelector(
      '[data-viewport-area="true"]',
    ) as HTMLElement | null;
    if (resizeObserver && viewportElement)
      resizeObserver.observe(viewportElement);

    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      view.removeEventListener("resize", schedule);
      view.removeEventListener("scroll", schedule, { capture: true });
      resizeObserver?.disconnect();
    };
  }, [gl, invalidate]);

  useFrame(({ camera }) => {
    const orientation = orientationRef.current;
    if (!orientation) return;
    const sourceCamera =
      props.controls.current?.camera ?? props.fallbackCamera ?? camera;
    sourceCamera.getWorldQuaternion(scratch.quaternion);
    scratch.quaternion.invert();
    orientation.quaternion.copy(scratch.quaternion);

    const canvasWidth = size.width;
    const canvasHeight = size.height;
    if (canvasWidth > 0 && canvasHeight > 0) {
      const viewOffsetX = margin[0] - canvasWidth / 2;
      const viewOffsetY = canvasHeight / 2 - margin[1];

      const hudPerspective = hudPerspectiveCameraRef.current;
      if (hudPerspective) {
        hudPerspective.setViewOffset(
          canvasWidth,
          canvasHeight,
          viewOffsetX,
          viewOffsetY,
          canvasWidth,
          canvasHeight,
        );
      }
    }
    if (isPerspectiveCamera(sourceCamera)) {
      const hudPerspective = hudPerspectiveCameraRef.current;
      if (!hudPerspective) return;

      const mainFovDeg = sourceCamera.fov;
      if (!Number.isFinite(mainFovDeg) || mainFovDeg <= 0) return;

      const viewCubeFovDeg = MathUtils.clamp(mainFovDeg + 25, 55, 95);

      const fovRad = MathUtils.degToRad(viewCubeFovDeg);
      const denom = 2 * Math.tan(fovRad / 2);
      if (!Number.isFinite(denom) || denom === 0) return;

      const distance =
        (size.height / denom) * VIEWCUBE_PERSPECTIVE_DISTANCE_SCALE;
      if (!Number.isFinite(distance) || distance <= 0) return;

      hudPerspective.fov = viewCubeFovDeg;
      hudPerspective.position.set(0, 0, distance);
      hudPerspective.lookAt(0, 0, 0);
      hudPerspective.updateProjectionMatrix();
    }

    const drag = dragStateRef.current;
    const pointer = pointerClientRef.current;
    if (!drag && pointer) {
      updateHoverHit(getCubeHitFromClientPoint(pointer.x, pointer.y));
    }
  });

  const moveCameraToWorldDirection = useCallback(
    (worldDirection: Vector3) => {
      const controls = props.controls.current;
      if (!controls) return;

      // Use the *current* camera state (not transition end values) so the ViewCube
      // can smoothly retarget without snapping to a previous orbit end-state.
      controls.getTarget(scratch.target, false);
      controls.getPosition(scratch.position, false);

      const radius = scratch.position.distanceTo(scratch.target);
      if (!Number.isFinite(radius) || radius <= 0) return;

      scratch.worldDirection.copy(worldDirection).normalize();

      scratch.nudge.copy(scratch.position).sub(scratch.target);
      stabilizePoleDirection({
        direction: scratch.worldDirection,
        up: controls.camera.up,
        viewVector: scratch.nudge,
        poleThreshold: 0.98,
      });

      scratch.position
        .copy(scratch.target)
        .addScaledVector(scratch.worldDirection, radius);

      controls.setLookAt(
        scratch.position.x,
        scratch.position.y,
        scratch.position.z,
        scratch.target.x,
        scratch.target.y,
        scratch.target.z,
        true,
      );
      controls.update(0);
      invalidate();
    },
    [invalidate, props.controls, scratch],
  );

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    const captureOptions = { capture: true } as const;

    const stopIfHandled = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const isOverUiChrome = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('button[data-ui-chrome="true"]'));
    };

    const updatePointerClient = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (state && state.pointerId !== event.pointerId) return;
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
    };

    const clearPointerClient = () => {
      pointerClientRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (isOverUiChrome(event)) {
        clearPointerClient();
        updateHoverHit(null);
        return;
      }
      updatePointerClient(event);

      const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
      if (!hit) return;

      stopIfHandled(event);
      element.setPointerCapture?.(event.pointerId);

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        didDrag: false,
        snapHit: hit,
      };

      updateHoverHit(hit);
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (state) {
        if (state.pointerId !== event.pointerId) return;

        updatePointerClient(event);
        stopIfHandled(event);

        if (event.pointerType === "mouse" && event.buttons === 0) {
          dragStateRef.current = null;
          element.releasePointerCapture?.(event.pointerId);
          updateHoverHit(null);
          return;
        }

        const dx = event.clientX - state.lastX;
        const dy = event.clientY - state.lastY;
        state.lastX = event.clientX;
        state.lastY = event.clientY;

        const wasDragging = state.didDrag;
        if (!state.didDrag) {
          const totalDx = event.clientX - state.startX;
          const totalDy = event.clientY - state.startY;
          if (Math.hypot(totalDx, totalDy) >= VIEWCUBE_DRAG_THRESHOLD_PX)
            state.didDrag = true;
        }

        if (!wasDragging && state.didDrag) updateHoverHit(null);

        if (!state.didDrag) {
          const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
          if (hit) state.snapHit = hit;
          updateHoverHit(hit);
          return;
        }

        const controls = props.controls.current;
        if (!controls) return;

        const azimuth = -dx * VIEWCUBE_DRAG_ROTATE_SPEED;
        const polar = -dy * VIEWCUBE_DRAG_ROTATE_SPEED;
        const handled = props.onOrbitInput?.(azimuth, polar);
        if (!handled) {
          controls.rotate(azimuth, polar, false);
        }
        invalidate();
        return;
      }

      if (isOverUiChrome(event)) {
        clearPointerClient();
        updateHoverHit(null);
        return;
      }

      updatePointerClient(event);
      const hit = getCubeHitFromClientPoint(event.clientX, event.clientY);
      if (hit) stopIfHandled(event);
      updateHoverHit(hit);
    };

    const onPointerUp = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;

      updatePointerClient(event);
      stopIfHandled(event);
      element.releasePointerCapture?.(event.pointerId);

      if (state.didDrag) return;

      const releaseHit = getCubeHitFromClientPoint(
        event.clientX,
        event.clientY,
      );
      const snapLocal =
        releaseHit?.localDirection ?? state.snapHit?.localDirection;
      const snap = snapLocal ? localToWorldDirection(snapLocal) : null;
      if (!snap) return;

      if (props.onSelectDirection) {
        props.onSelectDirection(snap);
        return;
      }

      scratch.worldDirection.set(...snap);
      moveCameraToWorldDirection(scratch.worldDirection);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;

      updatePointerClient(event);
      stopIfHandled(event);
      element.releasePointerCapture?.(event.pointerId);
      updateHoverHit(null);
    };

    const onLostPointerCapture = (event: PointerEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      if (!state || state.pointerId !== event.pointerId) return;
      updateHoverHit(null);
    };

    const onMouseLeave = () => {
      if (dragStateRef.current) return;
      clearPointerClient();
      updateHoverHit(null);
    };

    const onBlur = () => {
      dragStateRef.current = null;
      clearPointerClient();
      updateHoverHit(null);
    };

    const onVisibilityChange = () => {
      if (doc.visibilityState !== "visible") onBlur();
    };

    doc.addEventListener("pointerdown", onPointerDown, captureOptions);
    doc.addEventListener("pointermove", onPointerMove, captureOptions);
    doc.addEventListener("pointerup", onPointerUp, captureOptions);
    doc.addEventListener("pointercancel", onPointerCancel, captureOptions);
    element.addEventListener("lostpointercapture", onLostPointerCapture);
    element.addEventListener("mouseleave", onMouseLeave);
    view.addEventListener("blur", onBlur);
    doc.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, captureOptions);
      doc.removeEventListener("pointermove", onPointerMove, captureOptions);
      doc.removeEventListener("pointerup", onPointerUp, captureOptions);
      doc.removeEventListener("pointercancel", onPointerCancel, captureOptions);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      element.removeEventListener("mouseleave", onMouseLeave);
      view.removeEventListener("blur", onBlur);
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    getCubeHitFromClientPoint,
    invalidate,
    moveCameraToWorldDirection,
    props.controls,
    props.onOrbitInput,
    props.onSelectDirection,
    scratch,
    updateHoverHit,
  ]);

  const faceTextures = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy() || 1;
    const makeTexture = (label: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font =
        "600 56px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 10;
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
      return texture;
    };

    return Object.fromEntries(
      FACE_LABELS.map(({ key, label }) => [key, makeTexture(label)]),
    ) as Record<(typeof FACE_LABELS)[number]["key"], CanvasTexture | null>;
  }, [gl]);

  const axisCornerPosition = useMemo(() => {
    const half = VIEWCUBE_CUBE_SIZE_PX / 2;
    const corner = new Vector3(-half, -half, half);
    const len = corner.length();
    if (len > 0)
      corner.addScaledVector(corner, VIEWCUBE_AXIS_CORNER_GAP_PX / len);
    return corner.toArray() as [number, number, number];
  }, []);

  const axisLabelTextures = useMemo(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy() || 1;
    const makeTexture = (label: string, color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font =
        "800 72px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8;
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
      return texture;
    };

    return {
      x: makeTexture("X", COLOR_AXIS_X),
      y: makeTexture("Y", COLOR_AXIS_Y),
      z: makeTexture("Z", COLOR_AXIS_Z),
    };
  }, [gl]);

  useEffect(() => {
    return () => {
      Object.values(faceTextures).forEach((texture) => texture?.dispose());
      Object.values(axisLabelTextures).forEach((texture) => texture?.dispose());
    };
  }, [axisLabelTextures, faceTextures]);

  return (
    <>
      <PerspectiveCamera
        ref={(node) => {
          hudPerspectiveCameraRef.current = node;
        }}
        makeDefault
        position={[0, 0, 2000]}
        fov={45}
        near={0.1}
        far={50000}
      />

      <group>
        <group ref={orientationRef}>
          <group rotation={VIEWCUBE_CONTENT_ROTATION}>
            <mesh
              ref={cubeMeshRef}
              geometry={cubeModel.geometry}
              renderOrder={1}
            >
              <meshStandardMaterial
                color="#4a4d55"
                metalness={0.05}
                roughness={0.82}
                emissive="#0a0b0f"
                emissiveIntensity={0.18}
              />
              <Edges
                scale={1.006}
                color="#ffffff"
                transparent
                opacity={0.12}
                raycast={() => null}
                renderOrder={3}
              />
            </mesh>

            <ViewCubeHoverHighlight
              hit={hoverHit}
              highlightGeometries={cubeModel.highlightGeometries}
            />

            {FACE_LABELS.map(({ key, localNormal }) => (
              <mesh
                key={key}
                position={[
                  localNormal.x * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                  localNormal.y * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                  localNormal.z * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                ]}
                rotation={normalToPlaneRotation(localNormal)}
                raycast={() => null}
                renderOrder={2}
              >
                <planeGeometry
                  args={[
                    VIEWCUBE_FACE_LABEL_SIZE_PX,
                    VIEWCUBE_FACE_LABEL_SIZE_PX,
                  ]}
                />
                <meshBasicMaterial
                  map={faceTextures[key] ?? undefined}
                  transparent
                  opacity={0.95}
                  depthWrite={false}
                />
              </mesh>
            ))}

            <group position={axisCornerPosition} scale={VIEWCUBE_AXIS_SCALE}>
              <AxisLine
                direction={[1, 0, 0]}
                length={VIEWCUBE_AXIS_LENGTH_PX}
                radius={VIEWCUBE_AXIS_RADIUS_PX}
                color={COLOR_AXIS_X}
              />
              <AxisLine
                direction={[0, 0, -1]}
                length={VIEWCUBE_AXIS_LENGTH_PX}
                radius={VIEWCUBE_AXIS_RADIUS_PX}
                color={COLOR_AXIS_Y}
              />
              <AxisLine
                direction={[0, 1, 0]}
                length={VIEWCUBE_AXIS_LENGTH_PX}
                radius={VIEWCUBE_AXIS_RADIUS_PX}
                color={COLOR_AXIS_Z}
              />

              <mesh raycast={() => null} renderOrder={2}>
                <sphereGeometry
                  args={[VIEWCUBE_AXIS_SPHERE_RADIUS_PX, 16, 16]}
                />
                <meshBasicMaterial color={COLOR_AXIS_Y} depthWrite={false} />
              </mesh>

              <AxisLabel
                texture={axisLabelTextures.z}
                position={[
                  0,
                  VIEWCUBE_AXIS_LENGTH_PX + VIEWCUBE_AXIS_LABEL_OFFSET_PX,
                  0,
                ]}
                scale={VIEWCUBE_AXIS_LABEL_SCALE}
              />
              <AxisLabel
                texture={axisLabelTextures.x}
                position={[
                  VIEWCUBE_AXIS_LENGTH_PX + VIEWCUBE_AXIS_LABEL_OFFSET_PX,
                  0,
                  0,
                ]}
                scale={VIEWCUBE_AXIS_LABEL_SCALE}
              />
              <AxisLabel
                texture={axisLabelTextures.y}
                position={[
                  0,
                  0,
                  -(VIEWCUBE_AXIS_LENGTH_PX + VIEWCUBE_AXIS_LABEL_OFFSET_PX),
                ]}
                scale={VIEWCUBE_AXIS_LABEL_SCALE}
              />
            </group>
          </group>
        </group>

        <Html
          transform
          position={[
            -VIEWCUBE_BUTTON_OFFSET_X_PX,
            VIEWCUBE_BUTTON_OFFSET_Y_PX,
            0,
          ]}
          zIndexRange={[10, 0]}
        >
          <ViewCubeButton
            label="Rotate view left"
            onClick={() => {
              const controls = props.controls.current;
              if (!controls) return;
              const handled = props.onRotateAroundUp?.(Math.PI / 2);
              if (handled) return;
              controls.rotate(Math.PI / 2, 0, true);
            }}
          >
            <LuRotateCcw size={VIEWCUBE_BUTTON_ICON_SIZE_PX} />
          </ViewCubeButton>
        </Html>

        <Html
          transform
          position={[
            VIEWCUBE_BUTTON_OFFSET_X_PX,
            VIEWCUBE_BUTTON_OFFSET_Y_PX,
            0,
          ]}
          zIndexRange={[10, 0]}
        >
          <ViewCubeButton
            label="Rotate view right"
            onClick={() => {
              const controls = props.controls.current;
              if (!controls) return;
              const handled = props.onRotateAroundUp?.(-Math.PI / 2);
              if (handled) return;
              controls.rotate(-Math.PI / 2, 0, true);
            }}
          >
            <LuRotateCw size={VIEWCUBE_BUTTON_ICON_SIZE_PX} />
          </ViewCubeButton>
        </Html>
      </group>

      <ambientLight intensity={0.9} />
      <directionalLight position={[90, 120, 140]} intensity={0.65} />
      <directionalLight position={[-120, -80, 160]} intensity={0.35} />
    </>
  );
}

function normalToPlaneRotation(normal: Vector3): [number, number, number] {
  // PlaneGeometry faces +Z by default.
  if (normal.x === 1) return [0, Math.PI / 2, 0];
  if (normal.x === -1) return [0, -Math.PI / 2, 0];
  if (normal.y === 1) return [-Math.PI / 2, 0, 0];
  if (normal.y === -1) return [Math.PI / 2, 0, 0];
  if (normal.z === 1) return [0, 0, 0];
  return [0, Math.PI, 0];
}

function ViewCubeHoverHighlight(props: {
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

  const position = normal
    .clone()
    .multiplyScalar(VIEWCUBE_HOVER_OFFSET_PX)
    .toArray() as [number, number, number];
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

function AxisLine(props: {
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
    return dir.multiplyScalar(props.length / 2).toArray() as [
      number,
      number,
      number,
    ];
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

function AxisLabel(props: {
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

function ViewCubeButton(props: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ui-chrome="true"
      aria-label={props.label}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      style={{
        width: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
        height: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
        borderRadius: "999px",
        border: "none",
        background: "rgba(84,86,96,0.78)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        color: "rgba(255,255,255,0.92)",
        pointerEvents: "auto",
      }}
    >
      {props.children}
    </button>
  );
}
