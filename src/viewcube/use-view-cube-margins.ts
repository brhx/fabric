import { useEffect, useState } from "react";
import {
  VIEWCUBE_MARGIN_RIGHT_PX,
  VIEWCUBE_MARGIN_TOP_PX,
  VIEWCUBE_WIDGET_HEIGHT_PX,
  VIEWCUBE_WIDGET_WIDTH_PX,
} from "./constants";

export function useViewCubeMargins(
  element: HTMLCanvasElement | null,
  invalidate: () => void,
) {
  const [margin, setMargin] = useState<[number, number]>(() => [
    VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX / 2,
    VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_WIDGET_HEIGHT_PX / 2,
  ]);

  useEffect(() => {
    if (!element) return;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    let frame: number | null = null;

    const update = () => {
      frame = null;

      const canvasRect = element.getBoundingClientRect();
      const viewportElement = doc.querySelector(
        '[data-viewport-area="true"]',
      ) as HTMLElement | null;
      const viewportRect =
        viewportElement?.getBoundingClientRect() ?? canvasRect;

      const rightInset = Math.max(0, canvasRect.right - viewportRect.right);
      const topInset = Math.max(0, viewportRect.top - canvasRect.top);

      const nextMargin: [number, number] = [
        Math.round(
          rightInset + VIEWCUBE_MARGIN_RIGHT_PX + VIEWCUBE_WIDGET_WIDTH_PX / 2,
        ),
        Math.round(
          topInset + VIEWCUBE_MARGIN_TOP_PX + VIEWCUBE_WIDGET_HEIGHT_PX / 2,
        ),
      ];

      setMargin((current) => {
        if (current[0] === nextMargin[0] && current[1] === nextMargin[1])
          return current;
        return nextMargin;
      });
      invalidate();
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = view.requestAnimationFrame(update);
    };

    schedule();

    view.addEventListener("resize", schedule);
    view.addEventListener("scroll", schedule, { passive: true, capture: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : (
        new ResizeObserver(() => {
          schedule();
        })
      );

    const viewportElement = doc.querySelector(
      '[data-viewport-area="true"]',
    ) as HTMLElement | null;
    if (resizeObserver && viewportElement)
      resizeObserver.observe(viewportElement);

    return () => {
      if (frame !== null) view.cancelAnimationFrame(frame);
      view.removeEventListener("resize", schedule);
      view.removeEventListener("scroll", schedule, { capture: true });
      resizeObserver?.disconnect();
    };
  }, [element, invalidate]);

  return margin;
}
