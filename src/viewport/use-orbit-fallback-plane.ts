import { useCallback } from "react";
import type { Plane } from "three";
import { Vector3 } from "three";
import type { OrbitFallbackPlaneContext } from "./trackpad-controls";

const Z_UP = new Vector3(0, 0, 1);
const ORIGIN = new Vector3(0, 0, 0);

export function useOrbitFallbackPlane() {
  return useCallback((_ctx: OrbitFallbackPlaneContext, out: Plane) => {
    out.setFromNormalAndCoplanarPoint(Z_UP, ORIGIN);
    return out;
  }, []);
}
