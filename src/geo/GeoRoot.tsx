import type { ReactNode } from "react";
import { useMemo } from "react";
import type { LocalEnuFrame } from "./localFrame";

export function GeoRoot(props: { frame: LocalEnuFrame; children?: ReactNode }) {
  const matrix = useMemo(() => {
    // Apply ECEF -> render transform to children authored in ECEF coordinates.
    return props.frame.ecefToRender.clone();
  }, [props.frame.ecefToRender]);

  return (
    // Apply this group alongside any render-space offsets (e.g., renderOffset).
    <group matrixAutoUpdate={false} matrix={matrix}>
      {props.children}
    </group>
  );
}
