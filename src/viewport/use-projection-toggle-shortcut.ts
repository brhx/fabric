import { useEffect } from "react";

export function useProjectionToggleShortcut(options: {
  element: HTMLCanvasElement | null;
  onToggleProjection: () => void;
}) {
  const { element, onToggleProjection } = options;

  useEffect(() => {
    if (!element) return;

    const doc = element.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;

    const isEditableTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return false;
      const editable = eventTarget.closest?.(
        'input,textarea,select,[contenteditable="true"],[contenteditable=""]',
      );
      return Boolean(editable);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      if (event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const isDigit0 = event.key === "0" || event.code === "Digit0";
      if (!isDigit0) return;

      event.preventDefault();
      event.stopPropagation();
      onToggleProjection();
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true } as any);
    };
  }, [element, onToggleProjection]);
}

