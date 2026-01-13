import { Vector3 } from "three";

export const VIEWCUBE_SCALE = 0.75;

export const VIEWCUBE_MARGIN_RIGHT_PX = 52;
export const VIEWCUBE_MARGIN_TOP_PX = 24;

export const VIEWCUBE_DRAG_ROTATE_SPEED = 0.0042;
export const VIEWCUBE_DRAG_THRESHOLD_PX = 3;

export const VIEWCUBE_CUBE_SIZE_PX = 42 * VIEWCUBE_SCALE;
export const VIEWCUBE_CHAMFER_PX = VIEWCUBE_CUBE_SIZE_PX * 0.2;
export const VIEWCUBE_SAFE_CHAMFER_PX = Math.min(
  VIEWCUBE_CHAMFER_PX,
  VIEWCUBE_CUBE_SIZE_PX * 0.24,
);
export const VIEWCUBE_FACE_SIZE_PX =
  VIEWCUBE_CUBE_SIZE_PX - 2 * VIEWCUBE_SAFE_CHAMFER_PX;
export const VIEWCUBE_FACE_LABEL_SIZE_PX = VIEWCUBE_FACE_SIZE_PX * 0.82;
export const VIEWCUBE_CUBE_LABEL_OFFSET_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 0.8 * VIEWCUBE_SCALE;
export const VIEWCUBE_HOVER_COLOR = "#3b82f6";
export const VIEWCUBE_HOVER_OPACITY = 0.86;
export const VIEWCUBE_HOVER_OFFSET_PX = 0.28 * VIEWCUBE_SCALE;

export const VIEWCUBE_AXIS_SCALE = 0.62;
export const VIEWCUBE_AXIS_LENGTH_PX = 36 * VIEWCUBE_SCALE;
export const VIEWCUBE_AXIS_RADIUS_PX = 1.0 * VIEWCUBE_SCALE;
export const VIEWCUBE_AXIS_CORNER_GAP_PX = 3.6 * VIEWCUBE_SCALE;
export const VIEWCUBE_AXIS_SPHERE_RADIUS_PX = 2.2 * VIEWCUBE_SCALE;
export const VIEWCUBE_AXIS_LABEL_OFFSET_PX = 10 * VIEWCUBE_SCALE;
export const VIEWCUBE_AXIS_LABEL_SCALE = 20 * VIEWCUBE_SCALE;

export const VIEWCUBE_BUTTON_SIZE_PX = 26 * VIEWCUBE_SCALE;
export const VIEWCUBE_BUTTON_OFFSET_X_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 25 * VIEWCUBE_SCALE;
export const VIEWCUBE_BUTTON_OFFSET_Y_PX =
  VIEWCUBE_CUBE_SIZE_PX / 2 + 20 * VIEWCUBE_SCALE;
export const VIEWCUBE_BUTTON_ICON_SIZE_PX = 18 * VIEWCUBE_SCALE;

export const VIEWCUBE_CONTENT_ROTATION: [number, number, number] = [
  Math.PI / 2,
  0,
  0,
];
export const VIEWCUBE_PERSPECTIVE_DISTANCE_SCALE = 0.7;
export const VIEWCUBE_WIDGET_GAP_PX = 16 * VIEWCUBE_SCALE;

export const VIEWCUBE_WIDGET_WIDTH_PX =
  VIEWCUBE_BUTTON_OFFSET_X_PX * 2 + VIEWCUBE_BUTTON_SIZE_PX;
export const VIEWCUBE_WIDGET_HEIGHT_PX =
  VIEWCUBE_BUTTON_OFFSET_Y_PX +
  VIEWCUBE_BUTTON_SIZE_PX / 2 +
  (VIEWCUBE_CUBE_SIZE_PX / 2 + VIEWCUBE_WIDGET_GAP_PX) +
  (VIEWCUBE_AXIS_LENGTH_PX * VIEWCUBE_AXIS_SCALE) / 2;

export const COLOR_AXIS_X = "#e15a5a";
export const COLOR_AXIS_Y = "#4fc07f";
export const COLOR_AXIS_Z = "#4a7cff";

export const FACE_LABELS = [
  { key: "right", label: "Right", localNormal: new Vector3(1, 0, 0) },
  { key: "left", label: "Left", localNormal: new Vector3(-1, 0, 0) },
  { key: "top", label: "Top", localNormal: new Vector3(0, 1, 0) },
  { key: "bottom", label: "Bottom", localNormal: new Vector3(0, -1, 0) },
  { key: "front", label: "Front", localNormal: new Vector3(0, 0, 1) },
  { key: "back", label: "Back", localNormal: new Vector3(0, 0, -1) },
] as const;
