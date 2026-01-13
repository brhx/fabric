import { Vector3 } from "three";

const scratch = {
  up: new Vector3(),
  nudge: new Vector3(),
};

export function stabilizePoleDirection(options: {
  direction: Vector3;
  up: Vector3;
  viewVector: Vector3;
  poleThreshold?: number;
  epsilon?: number;
}) {
  const poleThreshold = options.poleThreshold ?? 0.985;
  const epsilon = options.epsilon ?? 0.001;

  scratch.up.copy(options.up);
  if (scratch.up.lengthSq() === 0) scratch.up.set(0, 0, 1);
  scratch.up.normalize();

  if (options.direction.lengthSq() === 0) return;

  const dot = options.direction.dot(scratch.up);
  if (Math.abs(dot) <= poleThreshold) return;

  scratch.nudge.copy(options.viewVector);
  if (scratch.nudge.lengthSq() > 0) {
    const alongUp = scratch.nudge.dot(scratch.up);
    scratch.nudge.addScaledVector(scratch.up, -alongUp);
  }

  if (scratch.nudge.lengthSq() === 0) {
    scratch.nudge.set(1, 0, 0);
    if (Math.abs(scratch.nudge.dot(scratch.up)) > 0.9)
      scratch.nudge.set(0, 1, 0);
  }

  scratch.nudge.normalize();
  options.direction.addScaledVector(scratch.nudge, epsilon).normalize();
}
