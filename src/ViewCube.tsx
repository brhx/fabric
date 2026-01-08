import {
  CameraControlsImpl,
  Edges,
  Html,
  Hud,
  PerspectiveCamera,
  RoundedBox,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuRotateCcw, LuRotateCw } from "react-icons/lu";
import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  Quaternion,
  PerspectiveCamera as ThreePerspectiveCamera,
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
const VIEWCUBE_CUBE_RADIUS_PX = 4.4 * VIEWCUBE_SCALE;
const VIEWCUBE_CUBE_LABEL_OFFSET_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 0.8 * VIEWCUBE_SCALE;
const VIEWCUBE_HIT_BAND_PX = 8 * VIEWCUBE_SCALE;
const VIEWCUBE_HOVER_COLOR = "#3b82f6";
const VIEWCUBE_HOVER_OPACITY = 0.86;
const VIEWCUBE_HOVER_BEVEL_MIN_PX = 3 * VIEWCUBE_SCALE;
const VIEWCUBE_HOVER_FACE_OFFSET_PX = 0.32 * VIEWCUBE_SCALE;
const VIEWCUBE_HOVER_EDGE_OFFSET_PX = 0.2 * VIEWCUBE_SCALE;

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
  localDirection: [number, number, number];
  worldDirection: [number, number, number];
};

function localDirectionToWorldDirection(
  direction: [number, number, number],
): [number, number, number] {
  // Local axes are rotated to match the main Z-up world:
  // local X -> world X, local Y -> world Z, local Z -> world -Y.
  const world = new Vector3(direction[0], -direction[2], direction[1]);
  if (world.lengthSq() === 0) return [0, 0, 1];
  world.normalize();
  return [world.x, world.y, world.z];
}

function getViewCubeHitFromLocalPoint(
  localPoint: Vector3,
  localToWorld: (
    direction: [number, number, number],
  ) => [number, number, number],
): ViewCubeHit {
  const half = VIEWCUBE_CUBE_SIZE_PX / 2;
  const hitThreshold = Math.max(1, VIEWCUBE_HIT_BAND_PX);

  const ax = Math.abs(localPoint.x);
  const ay = Math.abs(localPoint.y);
  const az = Math.abs(localPoint.z);

  const sx = localPoint.x >= 0 ? 1 : -1;
  const sy = localPoint.y >= 0 ? 1 : -1;
  const sz = localPoint.z >= 0 ? 1 : -1;

  const corner: ViewCubeHit = {
    kind: "corner",
    localDirection: [sx, sy, sz],
    worldDirection: localToWorld([sx, sy, sz]),
  };

  // Classify based on the dominant axis (which face we hit), then whether we're near
  // edges of that face for edge/corner snapping.
  if (ax >= ay && ax >= az) {
    const nearY = ay >= half - hitThreshold;
    const nearZ = az >= half - hitThreshold;
    if (nearY && nearZ) return corner;
    if (nearY) {
      const localDirection: [number, number, number] = [sx, sy, 0];
      return {
        kind: "edge",
        localDirection,
        worldDirection: localToWorld(localDirection),
      };
    }
    if (nearZ) {
      const localDirection: [number, number, number] = [sx, 0, sz];
      return {
        kind: "edge",
        localDirection,
        worldDirection: localToWorld(localDirection),
      };
    }

    const localDirection: [number, number, number] = [sx, 0, 0];
    return {
      kind: "face",
      localDirection,
      worldDirection: localToWorld(localDirection),
    };
  }

  if (ay >= ax && ay >= az) {
    const nearX = ax >= half - hitThreshold;
    const nearZ = az >= half - hitThreshold;
    if (nearX && nearZ) return corner;
    if (nearX) {
      const localDirection: [number, number, number] = [sx, sy, 0];
      return {
        kind: "edge",
        localDirection,
        worldDirection: localToWorld(localDirection),
      };
    }
    if (nearZ) {
      const localDirection: [number, number, number] = [0, sy, sz];
      return {
        kind: "edge",
        localDirection,
        worldDirection: localToWorld(localDirection),
      };
    }

    const localDirection: [number, number, number] = [0, sy, 0];
    return {
      kind: "face",
      localDirection,
      worldDirection: localToWorld(localDirection),
    };
  }

  const nearX = ax >= half - hitThreshold;
  const nearY = ay >= half - hitThreshold;
  if (nearX && nearY) return corner;
  if (nearX) {
    const localDirection: [number, number, number] = [sx, 0, sz];
    return {
      kind: "edge",
      localDirection,
      worldDirection: localToWorld(localDirection),
    };
  }
  if (nearY) {
    const localDirection: [number, number, number] = [0, sy, sz];
    return {
      kind: "edge",
      localDirection,
      worldDirection: localToWorld(localDirection),
    };
  }

  const localDirection: [number, number, number] = [0, 0, sz];
  return {
    kind: "face",
    localDirection,
    worldDirection: localToWorld(localDirection),
  };
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
  const { gl, invalidate, size } = useThree();
  const [margin, setMargin] = useState<[number, number]>(() => [
    VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX / 2,
    VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_WIDGET_HEIGHT_PX / 2,
  ]);

  const hudPerspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const cubeRef = useRef<Mesh | null>(null);
  const orientationRef = useRef<Group | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    didDrag: boolean;
    snapDirection: [number, number, number];
  } | null>(null);

  const [hoverHit, setHoverHit] = useState<ViewCubeHit | null>(null);

  const localToWorldDirection =
    props.getWorldDirectionFromLocalDirection ?? localDirectionToWorldDirection;
  const scratch = useMemo(
    () => ({
      quaternion: new Quaternion(),
      worldDirection: new Vector3(),
      target: new Vector3(),
      position: new Vector3(),
      localPoint: new Vector3(),
      nudge: new Vector3(),
    }),
    [],
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
    const sourceCamera = props.controls.current?.camera ?? camera;
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
  });

  const moveCameraToWorldDirection = (worldDirection: Vector3) => {
    const controls = props.controls.current;
    if (!controls) return;

    controls.getTarget(scratch.target);
    controls.getPosition(scratch.position);

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
  };

  const startCubeInteraction = (
    event: any,
    snapDirection: [number, number, number],
  ) => {
    event.stopPropagation();
    event.target?.setPointerCapture?.(event.pointerId);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX ?? 0,
      startY: event.clientY ?? 0,
      lastX: event.clientX ?? 0,
      lastY: event.clientY ?? 0,
      didDrag: false,
      snapDirection,
    };
  };

  const onCubePointerMove = (event: any) => {
    const state = dragStateRef.current;
    if (state) {
      if (state.pointerId !== event.pointerId) return;

      event.stopPropagation();

      const clientX = event.clientX ?? 0;
      const clientY = event.clientY ?? 0;
      const dx = clientX - state.lastX;
      const dy = clientY - state.lastY;
      state.lastX = clientX;
      state.lastY = clientY;

      if (!state.didDrag) {
        const totalDx = clientX - state.startX;
        const totalDy = clientY - state.startY;
        if (Math.hypot(totalDx, totalDy) >= VIEWCUBE_DRAG_THRESHOLD_PX)
          state.didDrag = true;
      }

      if (!state.didDrag) return;

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

    const cube = cubeRef.current;
    if (!cube) return;

    scratch.localPoint.copy(event.point);
    cube.worldToLocal(scratch.localPoint);

    setHoverHit(
      getViewCubeHitFromLocalPoint(scratch.localPoint, localToWorldDirection),
    );
    invalidate();
  };

  const onFacePointerMove = (event: any) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    onCubePointerMove(event);
  };

  const onCubePointerUp = (event: any) => {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (!state || state.pointerId !== event.pointerId) return;

    event.stopPropagation();
    event.target?.releasePointerCapture?.(event.pointerId);

    if (state.didDrag) return;

    if (props.onSelectDirection) {
      props.onSelectDirection(state.snapDirection);
      return;
    }

    scratch.worldDirection.set(...state.snapDirection);
    moveCameraToWorldDirection(scratch.worldDirection);
  };

  const onCubePointerCancel = (event: any) => {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (!state || state.pointerId !== event.pointerId) return;
    event.target?.releasePointerCapture?.(event.pointerId);
  };

  const handleCubePointerDown = (event: any) => {
    const cube = cubeRef.current;
    if (!cube) return;

    scratch.localPoint.copy(event.point);
    cube.worldToLocal(scratch.localPoint);

    const hit = getViewCubeHitFromLocalPoint(
      scratch.localPoint,
      localToWorldDirection,
    );
    setHoverHit(hit);
    startCubeInteraction(event, hit.worldDirection);
    invalidate();
  };

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
    <Hud renderPriority={1}>
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
            <RoundedBox
              ref={(node) => {
                cubeRef.current = node;
              }}
              args={[
                VIEWCUBE_CUBE_SIZE_PX,
                VIEWCUBE_CUBE_SIZE_PX,
                VIEWCUBE_CUBE_SIZE_PX,
              ]}
              radius={VIEWCUBE_CUBE_RADIUS_PX}
              smoothness={4}
              bevelSegments={3}
              creaseAngle={0.36}
              onPointerDown={handleCubePointerDown}
              onPointerMove={onCubePointerMove}
              onPointerUp={onCubePointerUp}
              onPointerCancel={onCubePointerCancel}
              onPointerOut={() => {
                if (dragStateRef.current) return;
                setHoverHit(null);
                invalidate();
              }}
            >
              <meshStandardMaterial
                color="#4a4d55"
                metalness={0.05}
                roughness={0.82}
                emissive="#0a0b0f"
                emissiveIntensity={0.18}
              />
              <Edges scale={1.006} color="#ffffff" transparent opacity={0.12} />
            </RoundedBox>

            <ViewCubeHoverHighlight hit={hoverHit} />

            {FACE_LABELS.map(({ key, localNormal }) => (
              <mesh
                key={key}
                position={[
                  localNormal.x * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                  localNormal.y * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                  localNormal.z * VIEWCUBE_CUBE_LABEL_OFFSET_PX,
                ]}
                rotation={normalToPlaneRotation(localNormal)}
                onPointerDown={(event) => {
                  startCubeInteraction(
                    event,
                    localToWorldDirection([
                      localNormal.x,
                      localNormal.y,
                      localNormal.z,
                    ]),
                  );
                }}
                onPointerOver={() => {
                  const [wx, wy, wz] = localToWorldDirection([
                    localNormal.x,
                    localNormal.y,
                    localNormal.z,
                  ]);
                  setHoverHit({
                    kind: "face",
                    localDirection: [
                      localNormal.x,
                      localNormal.y,
                      localNormal.z,
                    ],
                    worldDirection: [wx, wy, wz],
                  });
                  invalidate();
                }}
                onPointerMove={onFacePointerMove}
                onPointerUp={onCubePointerUp}
                onPointerCancel={onCubePointerCancel}
                onPointerOut={() => {
                  if (dragStateRef.current) return;
                  setHoverHit(null);
                  invalidate();
                }}
              >
                <planeGeometry
                  args={[
                    VIEWCUBE_CUBE_SIZE_PX * 0.78,
                    VIEWCUBE_CUBE_SIZE_PX * 0.78,
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
                length={VIEWCUBE_AXIS_LENGTH_PX * 0.62}
                radius={VIEWCUBE_AXIS_RADIUS_PX}
                color={COLOR_AXIS_Y}
              />
              <AxisLine
                direction={[0, 1, 0]}
                length={VIEWCUBE_AXIS_LENGTH_PX}
                radius={VIEWCUBE_AXIS_RADIUS_PX}
                color={COLOR_AXIS_Z}
              />

              <mesh raycast={() => null}>
                <sphereGeometry
                  args={[VIEWCUBE_AXIS_SPHERE_RADIUS_PX, 16, 16]}
                />
                <meshBasicMaterial color={COLOR_AXIS_Y} />
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
    </Hud>
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

function ViewCubeHoverHighlight(props: { hit: ViewCubeHit | null }) {
  const hit = props.hit;
  if (!hit) return null;

  const [lx, ly, lz] = hit.localDirection;
  const half = VIEWCUBE_CUBE_SIZE_PX / 2;
  const bevel = Math.max(
    VIEWCUBE_HOVER_BEVEL_MIN_PX,
    Math.min(VIEWCUBE_HIT_BAND_PX, half * 0.5),
  );

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

  if (hit.kind === "face") {
    const normal = new Vector3(lx, ly, lz).normalize();
    const position = normal
      .clone()
      .multiplyScalar(half + VIEWCUBE_HOVER_FACE_OFFSET_PX)
      .toArray() as [number, number, number];
    return (
      <mesh
        raycast={() => null}
        position={position}
        rotation={normalToPlaneRotation(normal)}
        renderOrder={2}
      >
        <planeGeometry
          args={[VIEWCUBE_CUBE_SIZE_PX * 0.96, VIEWCUBE_CUBE_SIZE_PX * 0.96]}
        />
        <meshBasicMaterial {...materialProps} />
      </mesh>
    );
  }

  if (hit.kind === "edge") {
    const thickness = bevel * 0.72;
    const edgeOffset = half - thickness / 2 + VIEWCUBE_HOVER_EDGE_OFFSET_PX;

    const alongX = lx === 0;
    const alongY = ly === 0;
    const alongZ = lz === 0;

    let size: [number, number, number] = [thickness, thickness, thickness];
    let position: [number, number, number] = [0, 0, 0];

    if (alongX) {
      size = [VIEWCUBE_CUBE_SIZE_PX, thickness, thickness];
      position = [0, ly * edgeOffset, lz * edgeOffset];
    } else if (alongY) {
      size = [thickness, VIEWCUBE_CUBE_SIZE_PX, thickness];
      position = [lx * edgeOffset, 0, lz * edgeOffset];
    } else if (alongZ) {
      size = [thickness, thickness, VIEWCUBE_CUBE_SIZE_PX];
      position = [lx * edgeOffset, ly * edgeOffset, 0];
    }

    return (
      <mesh raycast={() => null} position={position} renderOrder={2}>
        <boxGeometry args={size} />
        <meshBasicMaterial {...materialProps} />
      </mesh>
    );
  }

  const cornerSize = bevel * 0.92;
  const cornerOffset = half - cornerSize / 2 + VIEWCUBE_HOVER_EDGE_OFFSET_PX;
  const position: [number, number, number] = [
    lx * cornerOffset,
    ly * cornerOffset,
    lz * cornerOffset,
  ];

  return (
    <mesh raycast={() => null} position={position} renderOrder={2}>
      <boxGeometry args={[cornerSize, cornerSize, cornerSize]} />
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
    <mesh raycast={() => null} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[props.radius, props.radius, props.length, 10]} />
      <meshBasicMaterial color={props.color} />
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
    <sprite raycast={() => null} position={props.position} scale={props.scale}>
      <spriteMaterial
        map={props.texture}
        transparent
        opacity={0.92}
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
