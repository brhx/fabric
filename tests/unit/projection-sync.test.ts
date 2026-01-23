// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import {
  getOrthographicVisibleHeight,
  getOrthographicVisibleWidth,
  getPerspectiveViewSizeAtPlanePoint,
  syncOrthographicCameraFromPerspective,
  syncPerspectiveCameraFromOrthographic,
} from "../../src/viewport/projection-sync";

describe("projection-sync", () => {
  it("syncs orthographic frustum to match perspective view size at the target plane (fov=45)", () => {
    const target = new Vector3(5, 2, -3);

    const perspective = new PerspectiveCamera(45, 16 / 9, 0.1, 10000);
    perspective.position.set(10, -10, 10);
    perspective.up.set(0, 0, 1);
    perspective.lookAt(target);
    perspective.updateProjectionMatrix();
    perspective.updateMatrixWorld();

    const viewSize = getPerspectiveViewSizeAtPlanePoint(perspective, target);
    expect(viewSize).not.toBeNull();
    if (!viewSize) throw new Error("expected viewSize");

    const orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    const ok = syncOrthographicCameraFromPerspective({
      perspective,
      orthographic,
      target,
    });
    expect(ok).toBe(true);

    expect(orthographic.zoom).toBe(1);
    expect(orthographic.left).toBeCloseTo(-viewSize.width / 2, 6);
    expect(orthographic.right).toBeCloseTo(viewSize.width / 2, 6);
    expect(orthographic.top).toBeCloseTo(viewSize.height / 2, 6);
    expect(orthographic.bottom).toBeCloseTo(-viewSize.height / 2, 6);

    expect(getOrthographicVisibleWidth(orthographic)).toBeCloseTo(viewSize.width, 6);
    expect(getOrthographicVisibleHeight(orthographic)).toBeCloseTo(
      viewSize.height,
      6,
    );

    expect(orthographic.position.x).toBeCloseTo(perspective.position.x, 6);
    expect(orthographic.position.y).toBeCloseTo(perspective.position.y, 6);
    expect(orthographic.position.z).toBeCloseTo(perspective.position.z, 6);
  });

  it("round-trips perspective -> orthographic -> perspective while preserving view height (fov=45)", () => {
    const target = new Vector3(-2, 7, 1);

    const p0 = new PerspectiveCamera(45, 1.25, 0.1, 10000);
    p0.position.set(18, -4, 6);
    p0.up.set(0, 0, 1);
    p0.lookAt(target);
    p0.updateProjectionMatrix();
    p0.updateMatrixWorld();

    const ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    expect(
      syncOrthographicCameraFromPerspective({
        perspective: p0,
        orthographic: ortho,
        target,
      }),
    ).toBe(true);

    // Change ortho zoom (zoom in).
    ortho.zoom = 2.5;
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld();

    const p1 = new PerspectiveCamera(1, p0.aspect, 0.1, 10000);
    expect(
      syncPerspectiveCameraFromOrthographic({
        orthographic: ortho,
        perspective: p1,
        target,
        fovDeg: 45,
      }),
    ).toBe(true);

    expect(p1.fov).toBe(45);
    p1.updateProjectionMatrix();
    p1.updateMatrixWorld();

    const viewSize = getPerspectiveViewSizeAtPlanePoint(p1, target);
    expect(viewSize).not.toBeNull();
    if (!viewSize) throw new Error("expected viewSize");

    expect(viewSize.height).toBeCloseTo(getOrthographicVisibleHeight(ortho), 6);
    expect(viewSize.width).toBeCloseTo(getOrthographicVisibleWidth(ortho), 6);
  });

  it("is reversible when ortho zoom=1 (perspective at 45deg)", () => {
    const target = new Vector3(0, 0, 0);

    const p0 = new PerspectiveCamera(45, 2, 0.1, 10000);
    p0.position.set(0, -12, 4);
    p0.up.set(0, 0, 1);
    p0.lookAt(target);
    p0.updateProjectionMatrix();
    p0.updateMatrixWorld();

    const ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
    expect(
      syncOrthographicCameraFromPerspective({
        perspective: p0,
        orthographic: ortho,
        target,
      }),
    ).toBe(true);

    const p1 = new PerspectiveCamera(1, p0.aspect, 0.1, 10000);
    expect(
      syncPerspectiveCameraFromOrthographic({
        orthographic: ortho,
        perspective: p1,
        target,
        fovDeg: 45,
      }),
    ).toBe(true);

    expect(p1.position.x).toBeCloseTo(p0.position.x, 6);
    expect(p1.position.y).toBeCloseTo(p0.position.y, 6);
    expect(p1.position.z).toBeCloseTo(p0.position.z, 6);
  });
});

