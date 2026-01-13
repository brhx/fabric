import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent } from "react";
import { useRef } from "react";
import { LuCircleHelp, LuCloud, LuHouse } from "react-icons/lu";
import { IconButton } from "../ui/icon-button";
import { ProjectTitle } from "./project-title";

const TITLEBAR_DRAG_THRESHOLD_PX = 6;

export function TitleBar(props: {
  projectName: string;
  setProjectName: (name: string) => void;
  isEditingProjectName: boolean;
  setIsEditingProjectName: (isEditing: boolean) => void;
}) {
  const titleBarGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    startedDragging: boolean;
    startedOnInteractive: boolean;
  } | null>(null);

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button, input, textarea, select, a"));
  };

  const onTitleBarPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;

    const startedOnInteractive = isInteractiveTarget(event.target);
    titleBarGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startedDragging: false,
      startedOnInteractive,
    };

    if (startedOnInteractive) return;

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTitleBarPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = titleBarGestureRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.hypot(dx, dy) < TITLEBAR_DRAG_THRESHOLD_PX) return;

    if (!state.moved) state.moved = true;
    if (state.startedDragging || state.startedOnInteractive) return;

    if (!isTauri()) return;
    state.startedDragging = true;
    getCurrentWindow()
      .startDragging()
      .catch(() => {
        // ignored
      });
  };

  const onTitleBarPointerUp = (event: PointerEvent<HTMLElement>) => {
    const state = titleBarGestureRef.current;
    titleBarGestureRef.current = null;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.startedOnInteractive) return;
    if (state.moved) return;
    if (props.isEditingProjectName) return;

    props.setIsEditingProjectName(true);
  };

  const onTitleBarPointerCancel = () => {
    titleBarGestureRef.current = null;
  };

  return (
    <header
      data-tauri-drag-region="false"
      data-ui-chrome="true"
      className="pointer-events-auto flex h-12 touch-none items-center gap-3 border-b border-white/10 bg-black/20 px-2 backdrop-blur-xl select-none"
      onPointerDown={onTitleBarPointerDown}
      onPointerMove={onTitleBarPointerMove}
      onPointerUp={onTitleBarPointerUp}
      onPointerCancel={onTitleBarPointerCancel}
    >
      <div className="flex items-center gap-1 pl-20">
        <IconButton label="Home">
          <LuHouse className="h-4 w-4" />
        </IconButton>
        <IconButton label="Cloud">
          <LuCloud className="h-4 w-4" />
        </IconButton>
      </div>

      <ProjectTitle
        projectName={props.projectName}
        setProjectName={props.setProjectName}
        isEditing={props.isEditingProjectName}
        setIsEditing={props.setIsEditingProjectName}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-tauri-drag-region="false"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
        >
          Share
        </button>
        <IconButton label="Help">
          <LuCircleHelp className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  );
}
