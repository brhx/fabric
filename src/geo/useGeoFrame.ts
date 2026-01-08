import { useCallback, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { createLocalEnuFrameAtEcef, type LocalEnuFrame } from "./localFrame";
import { ecefToGeodetic, geodeticToEcef, type Geodetic } from "./wgs84";

export function useGeoFrame(initial?: Partial<Geodetic>) {
  const initialGeodeticRef = useRef<Geodetic | null>(null);
  if (!initialGeodeticRef.current) {
    initialGeodeticRef.current = {
      // Default: equator, prime meridian, sea level.
      latRad: initial?.latRad ?? 0,
      lonRad: initial?.lonRad ?? 0,
      heightMeters: initial?.heightMeters ?? 0,
    };
  }
  const initialGeodetic = initialGeodeticRef.current;

  const [originEcef, setOriginEcef] = useState<Vector3>(() =>
    geodeticToEcef(initialGeodetic, new Vector3()),
  );
  const [renderOffset, setRenderOffset] = useState<Vector3>(() => new Vector3());

  const geodetic = useMemo(() => ecefToGeodetic(originEcef), [originEcef]);

  const frame: LocalEnuFrame = useMemo(() => {
    return createLocalEnuFrameAtEcef(originEcef);
  }, [originEcef]);

  const setGeodetic = useCallback((next: Geodetic) => {
    setOriginEcef(geodeticToEcef(next, new Vector3()));
  }, []);

  const translateRender = useCallback((deltaRender: Vector3) => {
    const dx = deltaRender.x;
    const dy = deltaRender.y;
    const dz = deltaRender.z;
    const magnitudeSq = dx * dx + dy * dy + dz * dz;
    if (!Number.isFinite(magnitudeSq) || magnitudeSq === 0) return;

    setOriginEcef((prev) => {
      const next = prev.clone();
      const basis = createLocalEnuFrameAtEcef(prev);
      next
        .addScaledVector(basis.eastEcef, dx)
        .addScaledVector(basis.northEcef, dy)
        .addScaledVector(basis.upEcef, dz);
      return next;
    });

    setRenderOffset((prev) => {
      const next = prev.clone();
      next.set(prev.x - dx, prev.y - dy, prev.z - dz);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setOriginEcef(geodeticToEcef(initialGeodetic, new Vector3()));
    setRenderOffset(new Vector3());
  }, [initialGeodetic]);

  return {
    geodetic,
    originEcef,
    renderOffset,
    frame,
    setGeodetic,
    setOriginEcef,
    translateRender,
    reset,
  };
}
