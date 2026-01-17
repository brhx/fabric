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

const waitForRecentCmd1 = async (target: Page, timeoutMs: number) => {
  await waitForDebugPredicate(
    target,
    (lines) => {
      const line = findLine(lines, "last cmd1:");
      if (!line) return false;
      const match = line.match(/last cmd1: (\d+) ms/);
      if (!match) return false;
      const ageMs = Number(match[1]);
      return Number.isFinite(ageMs) && ageMs < 750;
    },
    timeoutMs,
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

      await page.keyboard.press("Meta+Digit1");

      await waitForRecentCmd1(page, 2000);

      const jumpLine = await waitForDebugLine(page, "last jump:", 2000);

      expect(jumpLine).toBe("last jump: n/a");
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
