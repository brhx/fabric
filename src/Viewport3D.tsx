import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AmbientLight,
  AxesHelper,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from "three";

export function Viewport3D(props: { className?: string }) {
  const orbitTarget = useRef(new Vector3(0, 0, 0));

  return (
    <div className={["h-full w-full", props.className].filter(Boolean).join(" ")}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0b0c10", 1);
        }}
        camera={{
          position: [10, -10, 10],
          up: [0, 0, 1],
          fov: 45,
          near: 0.1,
          far: 500,
        }}
      >
        <CameraSetup target={orbitTarget} />
        <TrackpadControls target={orbitTarget} />
        <MainScene />
        <ViewCube target={orbitTarget} />
      </Canvas>
    </div>
  );
}

function CameraSetup(props: { target: RefObject<Vector3> }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(props.target.current);
    camera.updateProjectionMatrix();
  }, [camera, props.target]);

  return null;
}

function MainScene() {
  return (
    <>
      <ambientLight intensity={0.6} />

      <group rotation={[Math.PI / 2, 0, 0]}>
        <gridHelper args={[200, 200, "#2b2b2f", "#1b1b1f"]} />
        <gridHelper args={[200, 20, "#34343a", "#24242a"]} />
      </group>

      <axesHelper args={[6]} />
    </>
  );
}

function TrackpadControls(props: { target: RefObject<Vector3> }) {
  const { camera, gl, invalidate, scene } = useThree();
  const spherical = useRef(new Spherical());
  const lastGestureScale = useRef<number | null>(null);
  const lastOrbitAt = useRef<number | null>(null);

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const perspectiveCamera = camera as PerspectiveCamera;
    const minDistance = 2;
    const maxDistance = 200;
    const tmpOffset = new Vector3();
    const tmpRight = new Vector3();
    const tmpUp = new Vector3();
    const tmpPanOffset = new Vector3();
    const tmpPivot = new Vector3();
    const tmpOffsetYUp = new Vector3();
    const tmpZoomBefore = new Vector3();
    const tmpZoomAfter = new Vector3();
    const tmpZoomDelta = new Vector3();
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const pivotPlane = new Plane(new Vector3(0, 0, 1), 0);

    const isSceneHelper = (object: Object3D | null) => {
      let current: Object3D | null = object;
      while (current) {
        if (current.type === "GridHelper" || current.type === "AxesHelper") return true;
        current = current.parent;
      }
      return false;
    };

    const pickPivotAtClientPoint = (clientX: number, clientY: number, out: Vector3) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      );

      raycaster.setFromCamera(pointer, perspectiveCamera);
      const intersections = raycaster.intersectObjects(scene.children, true);

      const intersection = intersections.find(({ object }) => !isSceneHelper(object));

      if (intersection) {
        out.copy(intersection.point);
        return;
      }

      if (raycaster.ray.intersectPlane(pivotPlane, tmpPivot)) {
        out.copy(tmpPivot);
      }
    };

    const updateSpherical = () => {
      tmpOffset.copy(camera.position).sub(props.target.current);
      // `Spherical` assumes Y-up. We use Z-up in our scene, so rotate the vector by -90° around X:
      // world (x, y, z) -> y-up space (x, z, -y)
      tmpOffsetYUp.set(tmpOffset.x, tmpOffset.z, -tmpOffset.y);
      spherical.current.setFromVector3(tmpOffsetYUp);
    };

    const applySpherical = () => {
      tmpOffsetYUp.setFromSpherical(spherical.current);
      // Inverse rotation (+90° around X): y-up space (x, y, z) -> world (x, -z, y)
      tmpOffset.set(tmpOffsetYUp.x, -tmpOffsetYUp.z, tmpOffsetYUp.y);
      camera.position.copy(props.target.current).add(tmpOffset);
      camera.lookAt(props.target.current);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };

    const isChromeTarget = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element &&
      Boolean(eventTarget.closest?.('[data-ui-chrome="true"]'));

    const isOverChrome = (
      clientX: number,
      clientY: number,
      eventTarget: EventTarget | null,
    ) => {
      if (isChromeTarget(eventTarget)) return true;
      const underPointer = doc.elementFromPoint(clientX, clientY);
      return Boolean(underPointer?.closest?.('[data-ui-chrome="true"]'));
    };

    const dolly = (deltaY: number) => {
      updateSpherical();
      const currentDistance = spherical.current.radius;
      if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;

      const zoomFactor = Math.exp(deltaY * 0.001);
      spherical.current.radius = Math.min(
        maxDistance,
        Math.max(minDistance, currentDistance * zoomFactor),
      );
      applySpherical();
    };

    const zoomToCursorPlane = (deltaY: number, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        dolly(deltaY);
        return;
      }

      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      );

      raycaster.setFromCamera(pointer, perspectiveCamera);
      const hitBefore = raycaster.ray.intersectPlane(pivotPlane, tmpZoomBefore);

      dolly(deltaY);

      if (!hitBefore) return;

      raycaster.setFromCamera(pointer, perspectiveCamera);
      const hitAfter = raycaster.ray.intersectPlane(pivotPlane, tmpZoomAfter);
      if (!hitAfter) return;

      tmpZoomDelta.copy(tmpZoomBefore).sub(tmpZoomAfter);
      props.target.current.add(tmpZoomDelta);
      camera.position.add(tmpZoomDelta);
      camera.lookAt(props.target.current);
      camera.updateMatrixWorld();
    };

    const orbit = (deltaX: number, deltaY: number) => {
      updateSpherical();
      const rotateSpeed = 0.0022;
      // Invert orbit direction to match trackpad gesture expectations.
      spherical.current.theta += deltaX * rotateSpeed;
      spherical.current.phi += deltaY * rotateSpeed;
      spherical.current.phi = MathUtils.clamp(
        spherical.current.phi,
        0.01,
        Math.PI - 0.01,
      );
      applySpherical();
    };

    const pan = (deltaX: number, deltaY: number) => {
      camera.updateMatrixWorld();
      const offset = camera.position.clone().sub(props.target.current);
      const targetDistance = offset.length();
      if (!Number.isFinite(targetDistance) || targetDistance <= 0) return;

      const fovInRadians = (perspectiveCamera.fov * Math.PI) / 180;
      const viewportHeight = Math.max(1, element.clientHeight);
      const distanceScale =
        (2 * targetDistance * Math.tan(fovInRadians / 2)) / viewportHeight;

      const panX = deltaX * distanceScale;
      const panY = deltaY * distanceScale;

      tmpRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      tmpUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      tmpPanOffset
        .copy(tmpRight)
        .multiplyScalar(panX)
        .addScaledVector(tmpUp, -panY);

      props.target.current.add(tmpPanOffset);
      camera.position.add(tmpPanOffset);
      camera.lookAt(props.target.current);
      camera.updateMatrixWorld();
    };

    const onWheel = (event: WheelEvent) => {
      if (isOverChrome(event.clientX, event.clientY, event.target)) return;

      event.preventDefault();

      if (event.ctrlKey) {
        lastOrbitAt.current = null;
        zoomToCursorPlane(event.deltaY, event.clientX, event.clientY);
      } else if (event.shiftKey) {
        const now = view.performance?.now?.() ?? Date.now();
        const repickAfterMs = 180;
        const shouldRepick =
          lastOrbitAt.current === null || now - lastOrbitAt.current > repickAfterMs;

        if (shouldRepick) {
          pickPivotAtClientPoint(event.clientX, event.clientY, tmpPivot);
          props.target.current.copy(tmpPivot);
        }

        lastOrbitAt.current = now;
        orbit(event.deltaX, event.deltaY);
      } else {
        lastOrbitAt.current = null;
        pan(event.deltaX, event.deltaY);
      }

      invalidate();
    };

    const onGestureStart = (event: any) => {
      const clientX = Number(event?.clientX ?? 0);
      const clientY = Number(event?.clientY ?? 0);
      if (isOverChrome(clientX, clientY, event?.target ?? null)) return;

      event.preventDefault?.();
      lastGestureScale.current = Number(event?.scale ?? 1);
    };

    const onGestureChange = (event: any) => {
      const clientX = Number(event?.clientX ?? 0);
      const clientY = Number(event?.clientY ?? 0);
      if (isOverChrome(clientX, clientY, event?.target ?? null)) return;

      event.preventDefault?.();
      const scale = Number(event?.scale ?? 1);
      if (!Number.isFinite(scale) || scale === 0) return;

      const previous = lastGestureScale.current ?? scale;
      const delta = scale / previous;
      lastGestureScale.current = scale;

      lastOrbitAt.current = null;
      zoomToCursorPlane(Math.log(1 / delta) / 0.001, clientX, clientY);
      invalidate();
    };

    const onGestureEnd = () => {
      lastGestureScale.current = null;
    };

    view.addEventListener("wheel", onWheel, { passive: false });
    view.addEventListener("gesturestart", onGestureStart, { passive: false } as any);
    view.addEventListener("gesturechange", onGestureChange, { passive: false } as any);
    view.addEventListener("gestureend", onGestureEnd, { passive: true } as any);

    return () => {
      view.removeEventListener("wheel", onWheel as any);
      view.removeEventListener("gesturestart", onGestureStart as any);
      view.removeEventListener("gesturechange", onGestureChange as any);
      view.removeEventListener("gestureend", onGestureEnd as any);
    };
  }, [camera, gl, invalidate, props.target, scene]);

  return null;
}

function ViewCube(props: { target: RefObject<Vector3> }) {
  const { camera: mainCamera, gl, invalidate, size } = useThree();

  const {
    viewScene,
    viewCamera,
    viewRoot,
    cube,
    raycaster,
    pointer,
    viewport,
    cubeSizePx,
    marginRightPx,
    marginTopPx,
  } = useMemo(() => {
    const viewScene = new Scene();
    viewScene.background = null;

    const viewCamera = new OrthographicCamera(-2, 2, 2, -2, 0, 10);
    viewCamera.position.set(0, 0, 4);

    const viewRoot = new Group();
    viewScene.add(viewRoot);

    const baseColor = new Color("#5c5c64");
    const edgeColor = new Color("#0a0a0d");

    const createFaceTexture = (label: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#5c5c64";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font =
        "700 44px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      return texture;
    };

    const textureRight = createFaceTexture("Right");
    const textureLeft = createFaceTexture("Left");
    const textureTop = createFaceTexture("Top");
    const textureBottom = createFaceTexture("Bottom");
    const textureFront = createFaceTexture("Front");
    const textureBack = createFaceTexture("Back");

    const makeMaterial = (map: CanvasTexture | null) =>
      new MeshStandardMaterial({
        color: baseColor,
        metalness: 0.05,
        roughness: 0.65,
        map: map ?? undefined,
        transparent: true,
      });

    const materials = [
      makeMaterial(textureRight),
      makeMaterial(textureLeft),
      makeMaterial(textureTop),
      makeMaterial(textureBottom),
      makeMaterial(textureFront),
      makeMaterial(textureBack),
    ];

    const cube = new Mesh(new BoxGeometry(1, 1, 1), materials);
    cube.rotation.x = Math.PI / 2;

    const edges = new LineSegments(
      new EdgesGeometry(cube.geometry, 20),
      new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.9 }),
    );
    cube.add(edges);

    viewRoot.add(cube);

    const lightA = new AmbientLight(0xffffff, 0.85);
    viewRoot.add(lightA);

    const lightB = new DirectionalLight(0xffffff, 0.9);
    lightB.position.set(1.4, 1.1, 2.6);
    viewRoot.add(lightB);

    const axes = new AxesHelper(1.6);
    viewRoot.add(axes);

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const viewport = new Vector4();

    return {
      viewScene,
      viewCamera,
      viewRoot,
      cube,
      raycaster,
      pointer,
      viewport,
      cubeSizePx: 112,
      marginRightPx: 76,
      marginTopPx: 20,
    };
  }, []);

  const getCubeRect = () => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const canvasRect = element.getBoundingClientRect();

    const viewportElement = doc.querySelector(
      '[data-viewport-area="true"]',
    ) as HTMLElement | null;
    const viewportRect = viewportElement?.getBoundingClientRect() ?? canvasRect;

    const areaTop = viewportRect.top - canvasRect.top;
    const areaRight = viewportRect.right - canvasRect.left;

    const left = areaRight - marginRightPx - cubeSizePx;
    const top = areaTop + marginTopPx;

    return { canvasRect, left, top, size: cubeSizePx };
  };

  useEffect(() => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    const element = gl.domElement;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const isChromeTarget = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element &&
      Boolean(eventTarget.closest?.('[data-ui-chrome="true"]'));

    const onPointerDown = (event: PointerEvent) => {
      if (isChromeTarget(event.target)) return;

      const rect = element.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      const cubeRect = getCubeRect();
      const vx = cubeRect.left;
      const vy = cubeRect.top;

      const within =
        localX >= vx &&
        localX <= vx + cubeRect.size &&
        localY >= vy &&
        localY <= vy + cubeRect.size;

      if (!within) return;

      event.preventDefault();

      pointer.set(
        ((localX - vx) / cubeRect.size) * 2 - 1,
        -((localY - vy) / cubeRect.size) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, viewCamera);

      const hit = raycaster.intersectObject(cube, false)[0];
      const materialIndex = hit?.face?.materialIndex;
      if (materialIndex === undefined || materialIndex === null) return;

      const radius = mainCamera.position.distanceTo(props.target.current);
      if (!Number.isFinite(radius) || radius <= 0) return;

      const direction = new Vector3();
      switch (materialIndex) {
        case 0:
          direction.set(1, 0, 0);
          break;
        case 1:
          direction.set(-1, 0, 0);
          break;
        case 2:
          direction.set(0, 0, 1);
          break;
        case 3:
          direction.set(0, 0, -1);
          break;
        case 4:
          direction.set(0, -1, 0);
          break;
        case 5:
          direction.set(0, 1, 0);
          break;
        default:
          return;
      }

      if (Math.abs(direction.z) > 0.5) {
        mainCamera.up.set(0, 1, 0);
      } else {
        mainCamera.up.set(0, 0, 1);
      }

      mainCamera.position.copy(props.target.current).addScaledVector(direction, radius);
      mainCamera.lookAt(props.target.current);
      mainCamera.updateProjectionMatrix();
      mainCamera.updateMatrixWorld();
      invalidate();
    };

    view.addEventListener("pointerdown", onPointerDown, { passive: false });

    return () => {
      view.removeEventListener("pointerdown", onPointerDown as any);
    };
  }, [
    cube,
    cubeSizePx,
    gl,
    invalidate,
    mainCamera,
    marginRightPx,
    marginTopPx,
    props.target,
    pointer,
    raycaster,
    viewCamera,
  ]);

  useFrame((state) => {
    gl.getViewport(viewport);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(state.scene, state.camera);

    viewRoot.quaternion.copy(mainCamera.quaternion).invert();
    viewRoot.updateMatrixWorld();

    const cubeRect = getCubeRect();
    const dim = cubeRect.size;
    const x = cubeRect.left;
    const y = size.height - cubeRect.top - dim;

    const previousAutoClear = gl.autoClear;
    const previousAutoClearColor = gl.autoClearColor;
    const previousAutoClearDepth = gl.autoClearDepth;
    const previousAutoClearStencil = gl.autoClearStencil;

    gl.autoClear = false;
    gl.autoClearColor = false;
    gl.autoClearDepth = false;
    gl.autoClearStencil = false;

    gl.clearDepth();
    gl.setViewport(Math.round(x), Math.round(y), Math.round(dim), Math.round(dim));
    gl.render(viewScene, viewCamera);
    gl.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);

    gl.autoClear = previousAutoClear;
    gl.autoClearColor = previousAutoClearColor;
    gl.autoClearDepth = previousAutoClearDepth;
    gl.autoClearStencil = previousAutoClearStencil;
  }, 1);

  useEffect(() => {
    return () => {
      viewScene.traverse((object: Object3D) => {
        if (object instanceof Mesh) {
          object.geometry?.dispose?.();

          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              const map = (mat as MeshStandardMaterial).map;
              map?.dispose?.();
              mat.dispose?.();
            });
          } else {
            const map = (material as MeshStandardMaterial).map;
            map?.dispose?.();
            material.dispose?.();
          }
        }

        if (object instanceof LineSegments) {
          object.geometry?.dispose?.();
          object.material?.dispose?.();
        }

        if (object instanceof AmbientLight || object instanceof DirectionalLight) {
          // no-op
        }
      });
    };
  }, [viewScene]);

  return null;
}
