// @vitest-environment node
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  VIEWCUBE_MARGIN_RIGHT_PX,
  VIEWCUBE_MARGIN_TOP_PX,
  VIEWCUBE_WIDGET_HEIGHT_PX,
  VIEWCUBE_WIDGET_WIDTH_PX,
} from "../../src/viewport/viewcube/constants";

const DEV_SERVER_PORT = 1420;
const TEST_TIMEOUT_MS = 120000;

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let viteServer: ViteDevServer | null = null;
let devServerUrl = "";

const isHeadless =
  process.env.HEADLESS === "1" || process.env.HEADLESS === "true";
const isDarwin = process.platform === "darwin";

const readDebugText = async (target: Page) => {
  const text = await target
    .locator('[data-testid="viewport-debug-text"]')
    .textContent();
  return text ?? "";
};

const readDebugLines = async (target: Page) => {
  const text = await readDebugText(target);
  const lines = text.split("\n");
  return { text, lines };
};

const findLine = (lines: string[], prefix: string) =>
  lines.find((entry) => entry.startsWith(prefix));

const ensureDebugEnabled = async (target: Page) => {
  await target.bringToFront();
  await target.click("canvas");
  const debugContainer = target.locator('[data-testid="viewport-debug"]');
  const isVisible = await debugContainer.isVisible().catch(() => false);
  if (!isVisible) {
    await target.keyboard.press("d");
    await debugContainer.waitFor({ state: "visible", timeout: 5000 });
  }
  await waitForDebugLine(target, "camera:", 5000);
};

const waitForDebugLine = async (
  target: Page,
  linePrefix: string,
  timeoutMs: number,
) => {
  const startedAt = Date.now();
  let lastText = "";

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await readDebugLines(target);
    lastText = snapshot.text;
    const line = findLine(snapshot.lines, linePrefix);
    if (line) return line;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    "timeout waiting for debug line " + linePrefix + "\n" + lastText,
  );
};

const waitForDebugPredicate = async (
  target: Page,
  predicate: (lines: string[]) => boolean,
  timeoutMs: number,
) => {
  const startedAt = Date.now();
  let lastText = "";
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await readDebugLines(target);
    lastText = snapshot.text;
    if (predicate(snapshot.lines)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timeout waiting for debug predicate\n" + lastText);
};

const readDefaultViewSeq = async (target: Page) => {
  const line = await waitForDebugLine(target, "default view seq:", 5000);
  const match = line.match(/^default view seq: (\d+)$/);
  if (!match) throw new Error("failed to parse " + line);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error("failed to parse " + line);
  return value;
};

const DEFAULT_VIEW_ID_BY_SHORTCUT = {
  Digit1: "home",
  Digit2: "front-right-top",
} as const;

const pressDefaultViewShortcut = async (
  target: Page,
  shortcut: keyof typeof DEFAULT_VIEW_ID_BY_SHORTCUT,
) => {
  const expectedId = DEFAULT_VIEW_ID_BY_SHORTCUT[shortcut];
  const seqBefore = await readDefaultViewSeq(target);

  await target.keyboard.press("Meta+" + shortcut);

  await waitForDebugPredicate(
    target,
    (lines) => {
      const idLine = findLine(lines, "default view:");
      const seqLine = findLine(lines, "default view seq:");
      if (!idLine || !seqLine) return false;

      const idMatch = idLine.match(/^default view: (.+)$/);
      const seqMatch = seqLine.match(/^default view seq: (\d+)$/);
      if (!idMatch || !seqMatch) return false;

      const id = idMatch[1].trim();
      const seq = Number(seqMatch[1]);
      return id === expectedId && Number.isFinite(seq) && seq > seqBefore;
    },
    5000,
  );
};

const parseVec3 = (line: string) => {
  const match = line.match(/\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((value) => Number(value.trim()));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value)))
    return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
};

const vecLength = (vec: { x: number; y: number; z: number }) =>
  Math.hypot(vec.x, vec.y, vec.z);

const waitForFocalLengthBelow = async (
  target: Page,
  threshold: number,
  timeoutMs: number,
) => {
  await waitForDebugPredicate(
    target,
    (lines) => {
      const line = findLine(lines, "ctrl.focal:");
      if (!line) return false;
      const focal = parseVec3(line);
      return Boolean(focal && vecLength(focal) < threshold);
    },
    timeoutMs,
  );
};

const parseScalarLine = (line: string) => {
  const match = line.match(/: ([+-]?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const waitForCameraMode = async (
  target: Page,
  mode: "perspective" | "orthographic",
  timeoutMs: number,
) => {
  await waitForDebugPredicate(
    target,
    (lines) => findLine(lines, "camera:") === `camera: ${mode}`,
    timeoutMs,
  );
};

const ensureCameraMode = async (
  target: Page,
  mode: "perspective" | "orthographic",
) => {
  const line = await waitForDebugLine(target, "camera:", 5000);
  if (line !== `camera: ${mode}`) {
    await target.keyboard.press("Meta+Digit0");
    await waitForCameraMode(target, mode, 5000);
  }
};

const waitForFov = async (target: Page, fov: number, timeoutMs: number) => {
  await waitForDebugPredicate(
    target,
    (lines) => {
      const line = findLine(lines, "fov:");
      if (!line) return false;
      const value = parseScalarLine(line);
      if (value === null) return false;
      return Math.abs(value - fov) <= 0.05;
    },
    timeoutMs,
  );
};

const waitForControlsSettled = async (target: Page, timeoutMs: number) => {
  await waitForDebugPredicate(
    target,
    (lines) => {
      const pos = findLine(lines, "d.ctrl.pos:");
      const focal = findLine(lines, "d.ctrl.focal:");
      const sph = findLine(lines, "d.ctrl.sph:");
      if (!pos || !focal || !sph) return false;
      const posDelta = parseScalarLine(pos) ?? Infinity;
      const focalDelta = parseScalarLine(focal) ?? Infinity;
      const sphMatch = sph.match(
        /dr=([+-]?\d+(?:\.\d+)?), dphi=([+-]?\d+(?:\.\d+)?), dtheta=([+-]?\d+(?:\.\d+)?)/,
      );
      if (!sphMatch) return false;
      const sphDelta = {
        dr: Number(sphMatch[1]),
        dphi: Number(sphMatch[2]),
        dtheta: Number(sphMatch[3]),
      };
      if (!Number.isFinite(posDelta) || !Number.isFinite(focalDelta))
        return false;
      if (
        !Number.isFinite(sphDelta.dr) ||
        !Number.isFinite(sphDelta.dphi) ||
        !Number.isFinite(sphDelta.dtheta)
      ) {
        return false;
      }
      const threshold = 0.005;
      return (
        Math.abs(posDelta) <= threshold &&
        Math.abs(focalDelta) <= threshold &&
        Math.abs(sphDelta.dr) <= threshold &&
        Math.abs(sphDelta.dphi) <= threshold &&
        Math.abs(sphDelta.dtheta) <= threshold
      );
    },
    timeoutMs,
  );
};

const readUnitsPerPixel = async (target: Page) => {
  const line = await waitForDebugLine(target, "units/px:", 5000);
  const value = parseScalarLine(line);
  if (value === null) throw new Error("failed to parse " + line);
  return value;
};

const zoomOut = async (target: Page) => {
  const before = await readUnitsPerPixel(target);
  const canvas = target.locator("canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("canvas bounds unavailable");

  await target.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );

  await target.keyboard.down("Control");
  for (let i = 0; i < 3; i += 1) {
    await target.mouse.wheel(0, 240);
  }
  await target.keyboard.up("Control");

  await waitForDebugPredicate(
    target,
    (lines) => {
      const line = findLine(lines, "units/px:");
      if (!line) return false;
      const value = parseScalarLine(line);
      if (value === null) return false;
      return Math.abs(value - before) > before * 0.01;
    },
    2000,
  );
};

const readCamPos = async (target: Page) => {
  const line = await waitForDebugLine(target, "cam.pos:", 5000);
  const vec = parseVec3(line);
  if (!vec) throw new Error("failed to parse " + line);
  return vec;
};

const getViewCubeCenter = async (target: Page) =>
  target.evaluate(
    ({
      marginRight,
      marginTop,
      widgetWidth,
      widgetHeight,
    }: {
      marginRight: number;
      marginTop: number;
      widgetWidth: number;
      widgetHeight: number;
    }) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const viewportElement = document.querySelector<HTMLElement>(
        '[data-viewport-area="true"]',
      );
      const viewportRect =
        viewportElement?.getBoundingClientRect() ?? canvasRect;
      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const centerX =
        canvasRect.right - (rightInset + marginRight + widgetWidth / 2);
      const centerY =
        canvasRect.top + (topInset + marginTop + widgetHeight / 2);

      return { x: centerX, y: centerY };
    },
    {
      marginRight: VIEWCUBE_MARGIN_RIGHT_PX,
      marginTop: VIEWCUBE_MARGIN_TOP_PX,
      widgetWidth: VIEWCUBE_WIDGET_WIDTH_PX,
      widgetHeight: VIEWCUBE_WIDGET_HEIGHT_PX,
    },
  );

beforeAll(async () => {
  const { createServer } = await import("vite");
  viteServer = await createServer({
    root: process.cwd(),
    logLevel: "info",
    server: {
      port: DEV_SERVER_PORT,
      strictPort: false,
    },
  });
  await viteServer.listen();
  viteServer.printUrls();
  const address = viteServer.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to resolve dev server address");
  }
  devServerUrl = `http://localhost:${address.port}`;

  browser = await chromium.launch({
    headless: isHeadless,
    slowMo: isHeadless ? 0 : 50,
  });
  context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  page = await context.newPage();
  await page.goto(devServerUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  if (page) await page.close();
  if (context) await context.close();
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  if (!page) return;
  await page.goto(devServerUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
});

describe.skipIf(!isDarwin)("viewport reset jumpiness", () => {
  it(
    "preserves perspective camera position after ortho zoom across repeated toggles",
    async () => {
      if (!page) throw new Error("page not ready");

      await ensureDebugEnabled(page);

      await page.keyboard.press("Meta+Digit0");
      await waitForCameraMode(page, "orthographic", 5000);

      const zoomLineBefore = await waitForDebugLine(page, "zoom:", 5000);
      const zoomBefore = parseScalarLine(zoomLineBefore);
      if (zoomBefore === null)
        throw new Error("failed to parse " + zoomLineBefore);

      const canvas = page.locator("canvas");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("canvas bounds unavailable");

      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );

      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -220);
      await page.keyboard.up("Control");

      const zoomLineAfter = await waitForDebugLine(page, "zoom:", 5000);
      const zoomAfter = parseScalarLine(zoomLineAfter);
      if (zoomAfter === null)
        throw new Error("failed to parse " + zoomLineAfter);
      if (Math.abs(zoomAfter - zoomBefore) < 0.001) {
        throw new Error(
          "expected ortho zoom to change, before=" +
            zoomBefore +
            " after=" +
            zoomAfter,
        );
      }

      await page.keyboard.press("Meta+Digit0");
      await waitForCameraMode(page, "perspective", 5000);
      await waitForFov(page, 45, 5000);
      await waitForControlsSettled(page, 4000);

      const baselinePos = await readCamPos(page);

      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press("Meta+Digit0");
        await waitForCameraMode(page, "orthographic", 5000);

        await page.keyboard.press("Meta+Digit0");
        await waitForCameraMode(page, "perspective", 5000);
        await waitForFov(page, 45, 5000);
        await waitForControlsSettled(page, 4000);

        const nextPos = await readCamPos(page);
        const delta = vecLength({
          x: nextPos.x - baselinePos.x,
          y: nextPos.y - baselinePos.y,
          z: nextPos.z - baselinePos.z,
        });
        expect(delta).toBeLessThan(0.02);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "toggles cmd-0 between perspective (45deg) and orthographic with stable units/px",
    async () => {
      if (!page) throw new Error("page not ready");

      await ensureDebugEnabled(page);

      const cameraLine0 = await waitForDebugLine(page, "camera:", 5000);
      expect(cameraLine0).toBe("camera: perspective");

      const fovLine0 = await waitForDebugLine(page, "fov:", 5000);
      const fov0 = parseScalarLine(fovLine0);
      expect(fov0).not.toBeNull();
      expect(Math.abs((fov0 ?? 0) - 45)).toBeLessThanOrEqual(0.05);

      const canvas = page.locator("canvas");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("canvas bounds unavailable");

      const pivotX = bounds.x + bounds.width / 2 + 180;
      const pivotY = bounds.y + bounds.height / 2 + 100;
      await page.mouse.move(pivotX, pivotY);

      await page.keyboard.down("Shift");
      await page.mouse.wheel(0, 160);
      await page.keyboard.up("Shift");

      const focalLine0 = await waitForDebugLine(page, "ctrl.focal:", 2000);
      const focal0 = parseVec3(focalLine0);
      if (!focal0 || vecLength(focal0) <= 0.01) {
        throw new Error(
          "expected non-zero focal offset before toggle, got: " + focalLine0,
        );
      }

      const unitsLine0 = await waitForDebugLine(page, "units/px:", 5000);
      const units0 = parseScalarLine(unitsLine0);
      if (units0 === null) throw new Error("failed to parse " + unitsLine0);

      await page.keyboard.press("Meta+Digit0");
      await waitForCameraMode(page, "orthographic", 5000);
      await waitForDebugLine(page, "zoom:", 5000);
      await waitForDebugLine(page, "ortho.height:", 5000);
      await waitForControlsSettled(page, 4000);

      const unitsLine1 = await waitForDebugLine(page, "units/px:", 5000);
      const units1 = parseScalarLine(unitsLine1);
      if (units1 === null) throw new Error("failed to parse " + unitsLine1);
      expect(Math.abs(units1 - units0)).toBeLessThan(units0 * 0.01);

      await page.keyboard.press("Meta+Digit0");
      await waitForCameraMode(page, "perspective", 5000);
      await waitForFov(page, 45, 5000);
      await waitForControlsSettled(page, 4000);

      const unitsLine2 = await waitForDebugLine(page, "units/px:", 5000);
      const units2 = parseScalarLine(unitsLine2);
      if (units2 === null) throw new Error("failed to parse " + unitsLine2);
      expect(Math.abs(units2 - units0)).toBeLessThan(units0 * 0.01);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps cmd-1 reset smooth after orbit + pan",
    async () => {
      if (!page) throw new Error("page not ready");

      await ensureDebugEnabled(page);

      const canvas = page.locator("canvas");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("canvas bounds unavailable");

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      await page.mouse.move(centerX, centerY);

      await page.keyboard.down("Shift");
      await page.mouse.wheel(180, -160);
      await page.keyboard.up("Shift");

      await page.mouse.wheel(240, 0);

      await pressDefaultViewShortcut(page, "Digit1");
      await waitForControlsSettled(page, 4000);

      const jumpLine = await waitForDebugLine(page, "last jump:", 2000);

      expect(jumpLine).toBe("last jump: n/a");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps default views cmd-1/cmd-2 ortho zoom aligned with perspective",
    async () => {
      if (!page) throw new Error("page not ready");

      await ensureDebugEnabled(page);

      const viewShortcuts = ["Digit1", "Digit2"] as const;

      for (const viewShortcut of viewShortcuts) {
        await ensureCameraMode(page, "perspective");
        await waitForFov(page, 45, 5000);
        await waitForControlsSettled(page, 4000);
        await zoomOut(page);

        await pressDefaultViewShortcut(page, viewShortcut);
        await waitForControlsSettled(page, 4000);

        const unitsPerspective = await readUnitsPerPixel(page);

        await ensureCameraMode(page, "orthographic");
        await waitForDebugLine(page, "zoom:", 5000);
        await waitForControlsSettled(page, 4000);
        await zoomOut(page);

        await pressDefaultViewShortcut(page, viewShortcut);
        await waitForControlsSettled(page, 4000);

        await ensureCameraMode(page, "perspective");
        await waitForFov(page, 45, 5000);
        await waitForControlsSettled(page, 4000);

        const unitsOrthographic = await readUnitsPerPixel(page);
        expect(Math.abs(unitsOrthographic - unitsPerspective)).toBeLessThan(
          unitsPerspective * 0.01,
        );
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "clears focal offset after snapping view cube following orbit point",
    async () => {
      if (!page) throw new Error("page not ready");

      await ensureDebugEnabled(page);

      const canvas = page.locator("canvas");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("canvas bounds unavailable");

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      const pivotX = centerX + 180;
      const pivotY = centerY + 100;
      await page.mouse.move(pivotX, pivotY);

      await page.keyboard.down("Shift");
      await page.mouse.wheel(0, 160);
      await page.keyboard.up("Shift");

      const focalLineBefore = await waitForDebugLine(page, "ctrl.focal:", 2000);
      const focalBefore = parseVec3(focalLineBefore);
      if (!focalBefore || vecLength(focalBefore) <= 0.01) {
        throw new Error(
          "expected non-zero focal offset after orbit point, got: " +
            focalLineBefore,
        );
      }

      const viewCubeCenter = await getViewCubeCenter(page);
      if (!viewCubeCenter)
        throw new Error("failed to resolve view cube center");

      await page.mouse.click(viewCubeCenter.x, viewCubeCenter.y);

      await waitForFocalLengthBelow(page, 0.01, 2000);
    },
    TEST_TIMEOUT_MS,
  );
});
