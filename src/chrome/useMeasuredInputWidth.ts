import { useLayoutEffect, useRef, useState } from "react";

export function useMeasuredInputWidth(text: string, enabled: boolean) {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [widthPx, setWidthPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = measureRef.current;
    if (!el) return;
    setWidthPx(el.offsetWidth);
  }, [enabled, text]);

  return { widthPx, measureRef };
}
