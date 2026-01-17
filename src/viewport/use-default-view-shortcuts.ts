import { useEffect } from "react";
import { matchDefaultViewShortcut, type DefaultViewId } from "./default-views";

export function useDefaultViewShortcuts(options: {
  element: HTMLCanvasElement | null;
  onSelectDefaultView: (id: DefaultViewId) => void;
}) {
  const { element, onSelectDefaultView } = options;

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
      const defaultView = matchDefaultViewShortcut(event);
      if (!defaultView) return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      onSelectDefaultView(defaultView.id);
    };

    view.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      view.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [element, onSelectDefaultView]);
}
