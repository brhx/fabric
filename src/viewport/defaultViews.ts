export type KeyboardShortcut = {
  key?: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

export type DefaultView = {
  id: "home";
  label: string;
  target: [number, number, number];
  position: [number, number, number];
  shortcut?: KeyboardShortcut;
};

export const DEFAULT_VIEWS: DefaultView[] = [
  {
    id: "home",
    label: "Home",
    target: [0, 0, 0],
    position: [10, -10, 10],
    shortcut: {
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: "1",
      code: "Digit1",
    },
  },
];

export type DefaultViewId = DefaultView["id"];

export const DEFAULT_VIEW_ID: DefaultViewId = "home";

const DEFAULT_VIEWS_BY_ID: Record<DefaultViewId, DefaultView> = {
  home: DEFAULT_VIEWS[0],
};

export function getDefaultView(
  id: DefaultViewId = DEFAULT_VIEW_ID,
): DefaultView {
  return DEFAULT_VIEWS_BY_ID[id];
}

const matchesModifier = (expected: boolean | undefined, actual: boolean) => {
  if (typeof expected === "undefined") return true;
  return expected === actual;
};

const matchesKey = (shortcut: KeyboardShortcut, event: KeyboardEvent) => {
  if (shortcut.key && shortcut.code) {
    return event.key === shortcut.key || event.code === shortcut.code;
  }
  if (shortcut.key) return event.key === shortcut.key;
  if (shortcut.code) return event.code === shortcut.code;
  return false;
};

export function matchDefaultViewShortcut(
  event: KeyboardEvent,
): DefaultView | null {
  for (const view of DEFAULT_VIEWS) {
    const shortcut = view.shortcut;
    if (!shortcut) continue;
    if (!matchesModifier(shortcut.metaKey, event.metaKey)) continue;
    if (!matchesModifier(shortcut.ctrlKey, event.ctrlKey)) continue;
    if (!matchesModifier(shortcut.altKey, event.altKey)) continue;
    if (!matchesModifier(shortcut.shiftKey, event.shiftKey)) continue;
    if (!matchesKey(shortcut, event)) continue;
    return view;
  }
  return null;
}
