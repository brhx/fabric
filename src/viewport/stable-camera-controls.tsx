import { CameraControlsImpl } from "@react-three/drei";
import { type ThreeElement, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useMemo } from "react";
import * as THREE from "three";

CameraControlsImpl.install({ THREE });

export type StableCameraControlsProps = {
  makeDefault?: boolean;
} & Omit<ThreeElement<typeof CameraControlsImpl>, "ref" | "args">;

export const StableCameraControls = forwardRef<
  CameraControlsImpl,
  StableCameraControlsProps
>(function StableCameraControls(props, ref) {
  const { makeDefault, ...restProps } = props;
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const events = useThree((state) => state.events);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);

  const domElement = events.connected || gl.domElement;

  const controls = useMemo(() => new CameraControlsImpl(camera), [camera]);

  useEffect(() => {
    controls.camera = camera;
  }, [controls, camera]);

  useEffect(() => {
    controls.connect(domElement);
    return () => {
      controls.disconnect();
    };
  }, [controls, domElement]);

  useEffect(() => {
    return () => {
      controls.dispose();
    };
  }, [controls]);

  useEffect(() => {
    if (!makeDefault) return;
    const old = get().controls;
    set({ controls: controls as any });
    return () => set({ controls: old as any });
  }, [makeDefault, controls, get, set]);

  useFrame((_state, delta) => {
    const safeDelta = Number.isFinite(delta) ? Math.min(delta, 1 / 60) : 0;
    if (controls.update(safeDelta)) invalidate();
  }, -1);

  return <primitive ref={ref} object={controls} {...restProps} />;
});
