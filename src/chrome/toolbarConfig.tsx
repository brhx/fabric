import type { ComponentType } from "react";
import {
  LuAnchor,
  LuBox,
  LuCircleHelp,
  LuEllipsis,
  LuHand,
  LuLayers,
  LuPalette,
  LuPanelsTopLeft,
  LuPin,
  LuPlus,
  LuRuler,
  LuSearch,
  LuTerminal,
  LuWrench,
  LuZoomIn,
} from "react-icons/lu";

type IconType = ComponentType<{ className?: string }>;

export type ToolbarButtonConfig = {
  key: string;
  label: string;
  Icon: IconType;
  shortcut?: readonly string[];
};

export type ToolbarGroupConfig = {
  key: string;
  buttons: readonly ToolbarButtonConfig[];
};

export const TOOLBAR_ICON_CLASSNAME = "h-5 w-5";

export const LEFT_TOOLBAR_GROUPS: readonly ToolbarGroupConfig[] = [
  {
    key: "left-top",
    buttons: [
      { key: "modeling", label: "Modeling", Icon: LuBox },
      { key: "visualization", label: "Visualization", Icon: LuPalette },
      {
        key: "drawings",
        label: "Drawings",
        Icon: LuPanelsTopLeft,
        shortcut: ["⇧", "⌘", "\\"],
      },
    ],
  },
  {
    key: "left-middle",
    buttons: [
      { key: "search", label: "Search", Icon: LuSearch },
      { key: "pan", label: "Pan", Icon: LuHand },
      { key: "zoom", label: "Zoom", Icon: LuZoomIn },
      { key: "settings", label: "Settings", Icon: LuWrench },
    ],
  },
  {
    key: "left-bottom",
    buttons: [
      { key: "library", label: "Library", Icon: LuLayers },
      { key: "console", label: "Console", Icon: LuTerminal },
    ],
  },
];

export const RIGHT_TOOLBAR_GROUPS: readonly ToolbarGroupConfig[] = [
  {
    key: "right-top",
    buttons: [
      { key: "pin", label: "Pin", Icon: LuPin },
      { key: "measure", label: "Measure", Icon: LuRuler },
      { key: "anchor", label: "Anchor", Icon: LuAnchor },
    ],
  },
  {
    key: "right-bottom",
    buttons: [
      { key: "add", label: "Add", Icon: LuPlus },
      { key: "more", label: "More", Icon: LuEllipsis },
      { key: "help", label: "Help", Icon: LuCircleHelp },
    ],
  },
];
