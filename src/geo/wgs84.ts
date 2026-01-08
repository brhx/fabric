import { MathUtils, Vector3 } from "three";

// WGS84 reference ellipsoid.
// Units: meters.
export const WGS84_A = 6378137.0; // semi-major axis (equatorial radius)
export const WGS84_F = 1 / 298.257223563; // flattening
export const WGS84_B = WGS84_A * (1 - WGS84_F); // semi-minor axis (polar radius)

export const WGS84_E2 = WGS84_F * (2 - WGS84_F); // first eccentricity squared
export const WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B); // second eccentricity squared

export type Geodetic = {
  latRad: number;
  lonRad: number;
  heightMeters: number;
};

export function geodeticToEcef(geo: Geodetic, out: Vector3 = new Vector3()) {
  const lat = geo.latRad;
  const lon = geo.lonRad;
  const h = geo.heightMeters;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  const x = (N + h) * cosLat * cosLon;
  const y = (N + h) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + h) * sinLat;

  return out.set(x, y, z);
}

export function ecefToGeodetic(ecef: Vector3): Geodetic {
  const x = ecef.x;
  const y = ecef.y;
  const z = ecef.z;

  const p = Math.hypot(x, y);
  const lon = p > 0 ? Math.atan2(y, x) : 0;

  if (p === 0) {
    const lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const height = Math.abs(z) - WGS84_B;
    return { latRad: lat, lonRad: lon, heightMeters: height };
  }

  // Bowring's method.
  const theta = Math.atan2(z * WGS84_A, p * WGS84_B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const lat = Math.atan2(
    z + WGS84_EP2 * WGS84_B * sinTheta * sinTheta * sinTheta,
    p - WGS84_E2 * WGS84_A * cosTheta * cosTheta * cosTheta,
  );

  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const height = p / Math.cos(lat) - N;

  return { latRad: lat, lonRad: lon, heightMeters: height };
}

export function normalizeLongitudeRad(lonRad: number) {
  return MathUtils.euclideanModulo(lonRad + Math.PI, 2 * Math.PI) - Math.PI;
}

export function enuBasisFromGeodetic(
  geo: Pick<Geodetic, "latRad" | "lonRad">,
  outEast: Vector3,
  outNorth: Vector3,
  outUp: Vector3,
) {
  const lat = geo.latRad;
  const lon = geo.lonRad;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  // ECEF axes: X = lon 0, Y = lon 90E, Z = north pole.
  // ENU tangent basis at (lat, lon), right-handed.
  outEast.set(-sinLon, cosLon, 0);
  outNorth.set(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  outUp.set(cosLat * cosLon, cosLat * sinLon, sinLat);

  return { east: outEast, north: outNorth, up: outUp };
}

