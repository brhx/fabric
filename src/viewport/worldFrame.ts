import { Plane, Vector3 } from "three";

export type ViewBasis = {
  right: Vector3;
  up: Vector3;
  forward: Vector3;
};

export type WorldFrame = {
  getUpAt: (target: Vector3, out: Vector3) => Vector3;
  getBasisAt: (target: Vector3, basis: ViewBasis) => void;
  setPivotPlaneAt: (target: Vector3, out: Plane) => Plane;
};

const Z_UP = new Vector3(0, 0, 1);
const X_RIGHT = new Vector3(1, 0, 0);
const Y_FORWARD = new Vector3(0, -1, 0);
const WORLD_NORTH_AXIS = new Vector3(0, 0, 1);
const WORLD_EAST_FALLBACK = new Vector3(1, 0, 0);
const scratch = {
  east: new Vector3(),
  up: new Vector3(),
};

function radialUpAt(target: Vector3, out: Vector3) {
  if (target.lengthSq() === 0) return out.copy(Z_UP);
  return out.copy(target).normalize();
}

export const ZUpFrame: WorldFrame = {
  getUpAt(_target, out) {
    return out.copy(Z_UP);
  },
  getBasisAt(_target, basis) {
    basis.right.copy(X_RIGHT);
    basis.up.copy(Z_UP);
    basis.forward.copy(Y_FORWARD);
  },
  setPivotPlaneAt(target, out) {
    out.setFromNormalAndCoplanarPoint(Z_UP, target);
    return out;
  },
};

export const RadialUpFrame: WorldFrame = {
  getUpAt(target, out) {
    return radialUpAt(target, out);
  },
  getBasisAt(target, basis) {
    radialUpAt(target, basis.up);

    scratch.east.copy(WORLD_NORTH_AXIS).cross(basis.up);
    if (scratch.east.lengthSq() === 0) scratch.east.copy(WORLD_EAST_FALLBACK).cross(basis.up);
    if (scratch.east.lengthSq() === 0) scratch.east.copy(X_RIGHT);
    scratch.east.normalize();

    basis.right.copy(scratch.east);
    basis.forward.copy(basis.up).cross(basis.right).normalize();
  },
  setPivotPlaneAt(target, out) {
    radialUpAt(target, scratch.up);
    out.setFromNormalAndCoplanarPoint(scratch.up, target);
    return out;
  },
};
