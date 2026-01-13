import { Edges, Html, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuRotateCcw, LuRotateCw } from "react-icons/lu";
import {
  type Camera,
  Group,
  MathUtils,
  type Mesh,
  Quaternion,
  Raycaster,
  PerspectiveCamera as ThreePerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { isPerspectiveCamera } from "../camera";
import { stabilizePoleDirection } from "../viewport/pole-nudge";
import { AxisLabel, AxisLine } from "./axes";
import {
  COLOR_AXIS_X,
  COLOR_AXIS_Y,
  COLOR_AXIS_Z,
  FACE_LABELS,
  VIEWCUBE_AXIS_CORNER_GAP_PX,
  VIEWCUBE_AXIS_LABEL_OFFSET_PX,
  VIEWCUBE_AXIS_LABEL_SCALE,
  VIEWCUBE_AXIS_LENGTH_PX,
  VIEWCUBE_AXIS_RADIUS_PX,
  VIEWCUBE_AXIS_SCALE,
  VIEWCUBE_AXIS_SPHERE_RADIUS_PX,
  VIEWCUBE_BUTTON_ICON_SIZE_PX,
  VIEWCUBE_BUTTON_OFFSET_X_PX,
  VIEWCUBE_BUTTON_OFFSET_Y_PX,
  VIEWCUBE_CONTENT_ROTATION,
  VIEWCUBE_CUBE_LABEL_OFFSET_PX,
  VIEWCUBE_CUBE_SIZE_PX,
  VIEWCUBE_FACE_LABEL_SIZE_PX,
  VIEWCUBE_PERSPECTIVE_DISTANCE_SCALE,
  VIEWCUBE_SAFE_CHAMFER_PX,
} from "./constants";
import { createChamferedCubeGeometry } from "./geometry";
import {
  getViewCubeHitFromFaceIndex,
  isSameViewCubeHit,
  localDirectionToWorldDirection,
  type ViewCubeHit,
} from "./hit-test";
import { useAxisLabelTextures, useFaceLabelTextures } from "./textures";
import { useViewCubeMargins } from "./use-view-cube-margins";
import {
  useViewCubePointerEvents,
  type ViewCubeDragState,
} from "./use-view-cube-pointer-events";
import { vector3ToTuple } from "./vector-utils";
import type { ViewCubeProps } from "./view-cube";
import { ViewCubeButton } from "./view-cube-button";
import { ViewCubeHoverHighlight } from "./view-cube-highlight";

export function ViewCubeHud(
  props: ViewCubeProps & {
    fallbackCamera: Camera;
  },
) {
  const { gl, invalidate, size } = useThree();
  const margin = useViewCubeMargins(gl.domElement, invalidate);

  const hudPerspectiveCameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const orientationRef = useRef<Group | null>(null);
  const dragStateRef = useRef<ViewCubeDragState | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);

  const [hoverHit, setHoverHit] = useState<ViewCubeHit | null>(null);
  const getWorldDirectionFromLocalDirection =
    props.getWorldDirectionFromLocalDirection;

  const localToWorldDirection = useMemo(() => {
    if (!getWorldDirectionFromLocalDirection)
      return localDirectionToWorldDirection;
    return (direction: readonly [number, number, number]) =>
      getWorldDirectionFromLocalDirection!([
        direction[0],
        direction[1],
        direction[2],
      ]);
  }, [getWorldDirectionFromLocalDirection]);

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

      // If the user was orbiting with damping/inertia, cancel that motion first
      // so the ViewCube transition starts smoothly without an initial "jump".
      controls.stop();

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

      void controls.setLookAt(
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

  useViewCubePointerEvents({
    element: gl.domElement,
    controlsRef: props.controls,
    getCubeHitFromClientPoint,
    updateHoverHit,
    dragStateRef,
    pointerClientRef,
    localToWorldDirection: localToWorldDirection,
    onOrbitInput: props.onOrbitInput,
    onSelectDirection: props.onSelectDirection,
    moveCameraToWorldDirection,
    scratchWorldDirection: scratch.worldDirection,
    invalidate,
  });

  const faceTextures = useFaceLabelTextures(gl);
  const axisLabelTextures = useAxisLabelTextures(gl);

  const axisCornerPosition = useMemo(() => {
    const half = VIEWCUBE_CUBE_SIZE_PX / 2;
    const corner = new Vector3(-half, -half, half);
    const len = corner.length();
    if (len > 0)
      corner.addScaledVector(corner, VIEWCUBE_AXIS_CORNER_GAP_PX / len);
    return vector3ToTuple(corner);
  }, []);

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
              void controls.rotate(Math.PI / 2, 0, true);
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
              void controls.rotate(-Math.PI / 2, 0, true);
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
