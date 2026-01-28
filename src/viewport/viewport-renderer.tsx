import { createContext, useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject, ReactNode } from "react";
import type { Camera, Scene } from "three";

export type ViewCubeRenderState = {
  scene: Scene;
  camera: Camera | null;
};

const ViewCubeRenderContext =
  createContext<MutableRefObject<ViewCubeRenderState | null> | null>(null);

export function ViewportRenderProvider(props: { children: ReactNode }) {
  const viewCubeRef = useRef<ViewCubeRenderState | null>(null);

  return (
    <ViewCubeRenderContext.Provider value={viewCubeRef}>
      {props.children}
      <ViewportRenderer viewCubeRef={viewCubeRef} />
    </ViewCubeRenderContext.Provider>
  );
}

export function useViewCubeRenderSlot() {
  const slot = useContext(ViewCubeRenderContext);
  if (!slot) {
    throw new Error(
      "useViewCubeRenderSlot must be used within ViewportRenderProvider",
    );
  }
  return slot;
}

function ViewportRenderer(props: {
  viewCubeRef: MutableRefObject<ViewCubeRenderState | null>;
}) {
  const { gl, scene, camera, size } = useThree();

  useFrame(() => {
    if (size.width <= 0 || size.height <= 0) return;

    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));

    const previousAutoClear = gl.autoClear;

    gl.autoClear = true;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, width, height);
    gl.render(scene, camera);

    const viewCube = props.viewCubeRef.current;
    if (viewCube?.scene && viewCube.camera) {
      gl.autoClear = false;
      gl.clearDepth();
      gl.setViewport(0, 0, width, height);
      gl.render(viewCube.scene, viewCube.camera);
    }

    gl.setScissorTest(false);
    gl.autoClear = previousAutoClear;
  }, 1);

  return null;
}
