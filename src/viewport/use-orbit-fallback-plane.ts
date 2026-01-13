import { useCallback, useEffect, useRef } from "react";
import type { Plane } from "three";
import { Vector3 } from "three";
import type { OrbitFallbackPlaneContext } from "./trackpad-controls";

const Z_UP = new Vector3(0, 0, 1);

export function useOrbitFallbackPlane(renderOffset: Vector3) {
  const renderOffsetRef = useRef<Vector3>(renderOffset);

  useEffect(() => {
    renderOffsetRef.current = renderOffset;
  }, [renderOffset]);

  return useCallback((_ctx: OrbitFallbackPlaneContext, out: Plane) => {
    out.setFromNormalAndCoplanarPoint(Z_UP, renderOffsetRef.current);
    return out;
  }, []);
}
