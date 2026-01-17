import type { CameraControlsImpl } from "@react-three/drei";
import { Vector3 } from "three";

const scratch = {
  position: new Vector3(),
  target: new Vector3(),
  focalOffset: new Vector3(),
};

export function stopControlsAtCurrent(controls: CameraControlsImpl) {
  controls.getPosition(scratch.position, false);
  controls.getTarget(scratch.target, false);
  controls.getFocalOffset(scratch.focalOffset, false);

  void controls.setFocalOffset(
    scratch.focalOffset.x,
    scratch.focalOffset.y,
    scratch.focalOffset.z,
    false,
  );

  void controls.setLookAt(
    scratch.position.x,
    scratch.position.y,
    scratch.position.z,
    scratch.target.x,
    scratch.target.y,
    scratch.target.z,
    false,
  );
  controls.update(0);
}
