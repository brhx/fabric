import { useMemo, useState } from "react";
import { createLocalEnuFrameAtGeodetic, type LocalEnuFrame } from "./localFrame";
import type { Geodetic } from "./wgs84";

export function useGeoFrame(initial?: Partial<Geodetic>) {
  const [geodetic, setGeodetic] = useState<Geodetic>(() => ({
    // Default: equator, prime meridian, sea level.
    latRad: initial?.latRad ?? 0,
    lonRad: initial?.lonRad ?? 0,
    heightMeters: initial?.heightMeters ?? 0,
  }));

  const frame: LocalEnuFrame = useMemo(() => {
    return createLocalEnuFrameAtGeodetic(geodetic);
  }, [geodetic]);

  return { geodetic, setGeodetic, frame };
}

