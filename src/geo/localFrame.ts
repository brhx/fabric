import { Matrix3, Matrix4, Vector3 } from "three";
import {
  ecefToGeodetic,
  enuBasisFromGeodetic,
  geodeticToEcef,
  type Geodetic,
} from "./wgs84";

export type LocalEnuFrame = {
  originEcef: Vector3;
  eastEcef: Vector3;
  northEcef: Vector3;
  upEcef: Vector3;
  renderToEcef: Matrix4;
  ecefToRender: Matrix4;
};

export function createLocalEnuFrameAtGeodetic(geo: Geodetic): LocalEnuFrame {
  const originEcef = geodeticToEcef(geo, new Vector3());
  return createLocalEnuFrameAtEcef(originEcef);
}

export function createLocalEnuFrameAtEcef(
  originEcefInput: Vector3,
): LocalEnuFrame {
  const originEcef = originEcefInput.clone();

  const geo = ecefToGeodetic(originEcef);
  const eastEcef = new Vector3();
  const northEcef = new Vector3();
  const upEcef = new Vector3();
  enuBasisFromGeodetic(geo, eastEcef, northEcef, upEcef);

  // Render space convention:
  // +X = East, +Y = North, +Z = Up.
  // Then an ECEF point can be expressed as:
  // ecef = origin + east*x + north*y + up*z.
  const renderToEcef = new Matrix4()
    .makeBasis(eastEcef, northEcef, upEcef)
    .setPosition(originEcef);
  const ecefToRender = renderToEcef.clone().invert();

  return {
    originEcef,
    eastEcef,
    northEcef,
    upEcef,
    renderToEcef,
    ecefToRender,
  };
}

export function ecefPointToRender(
  frame: LocalEnuFrame,
  ecef: Vector3,
  out: Vector3 = new Vector3(),
) {
  return out.copy(ecef).applyMatrix4(frame.ecefToRender);
}

export function renderPointToEcef(
  frame: LocalEnuFrame,
  render: Vector3,
  out: Vector3 = new Vector3(),
) {
  return out.copy(render).applyMatrix4(frame.renderToEcef);
}

export function ecefDirToRender(
  frame: LocalEnuFrame,
  ecefDir: Vector3,
  out: Vector3 = new Vector3(),
) {
  const rotation = new Matrix3().setFromMatrix4(frame.ecefToRender);
  return out.copy(ecefDir).applyMatrix3(rotation);
}
