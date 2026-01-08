import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  LuAnchor,
  LuChevronDown,
  LuChevronRight,
  LuCircleHelp,
  LuCloud,
  LuCornerDownRight,
  LuEllipsis,
  LuHand,
  LuHouse,
  LuLayers,
  LuPenTool,
  LuPin,
  LuPlus,
  LuRuler,
  LuSearch,
  LuTerminal,
  LuWrench,
  LuZoomIn,
} from "react-icons/lu";
import "./App.css";
import { Viewport3D } from "./Viewport3D";

function App() {
  return (
    <main className="relative h-full w-full overflow-hidden text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      <Viewport3D className="absolute inset-0" />
      <div
        aria-hidden="true"
        className="fabric-canvas pointer-events-none absolute inset-0"
      />

      <div className="pointer-events-none relative z-10 flex h-full w-full flex-col">
        <header
          data-tauri-drag-region
          data-ui-chrome="true"
          className="pointer-events-auto flex h-12 items-center gap-3 border-b border-white/10 bg-black/20 px-2 backdrop-blur-xl"
        >
          <div className="flex items-center gap-1 pl-20">
            <TitleIconButton label="Home">
              <LuHouse className="h-4 w-4" />
            </TitleIconButton>
            <TitleIconButton label="Cloud">
              <LuCloud className="h-4 w-4" />
            </TitleIconButton>
          </div>

          <ProjectTitle />

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-tauri-drag-region="false"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              Share
            </button>
            <TitleIconButton label="Help">
              <LuCircleHelp className="h-4 w-4" />
            </TitleIconButton>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 min-w-0 gap-2">
          <aside
            className="pointer-events-auto min-h-0 w-72"
            data-ui-chrome="true"
          >
            <GlassPanel className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="text-xs font-semibold tracking-wide text-white/65">
                  Items
                </div>
              </div>

              <div className="mt-3 min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] bg-clip-padding px-3 py-2 text-sm text-white/75 hover:bg-white/[0.08] hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
                    All items
                  </span>
                  <LuChevronDown className="h-4 w-4 text-white/45" />
                </button>

                <button
                  type="button"
                  className="group mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="grid w-4 place-items-center text-white/35 group-hover:text-white/55">
                    <LuCornerDownRight className="h-4 w-4" />
                  </span>
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/[0.06] text-white/70 ring-1 ring-white/[0.08] ring-inset">
                    <LuPenTool className="h-4 w-4" />
                  </span>
                  Sketch 01
                </button>
              </div>

              <div className="border-t border-white/10 px-3 py-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] bg-clip-padding text-white/65 hover:bg-white/[0.08] hover:text-white"
                  >
                    <LuPlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] bg-clip-padding text-white/65 hover:bg-white/[0.08] hover:text-white"
                  >
                    <LuEllipsis className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </GlassPanel>
          </aside>

          <section
            data-viewport-area="true"
            className="pointer-events-none relative min-h-0 min-w-0 flex-1 overflow-visible"
          >
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 flex flex-col justify-between">
              <Dock>
                <DockButton label="Tool A">
                  <span className="h-5 w-5 rounded-md bg-emerald-400" />
                </DockButton>
                <DockButton label="Tool B">
                  <span className="h-5 w-5 rounded-md bg-fuchsia-400" />
                </DockButton>
                <DockButton label="Tool C">
                  <span className="h-5 w-5 rounded-md bg-zinc-300" />
                </DockButton>
              </Dock>

              <Dock>
                <DockButton label="Search">
                  <LuSearch className="h-5 w-5" />
                </DockButton>
                <DockButton label="Pan">
                  <LuHand className="h-5 w-5" />
                </DockButton>
                <DockButton label="Zoom">
                  <LuZoomIn className="h-5 w-5" />
                </DockButton>
                <DockButton label="Settings">
                  <LuWrench className="h-5 w-5" />
                </DockButton>
              </Dock>

              <Dock>
                <DockButton label="Library">
                  <LuLayers className="h-5 w-5" />
                </DockButton>
                <DockButton label="Console">
                  <LuTerminal className="h-5 w-5" />
                </DockButton>
              </Dock>
            </div>

            <Dock className="absolute top-0 right-0">
              <DockButton label="Pin">
                <LuPin className="h-5 w-5" />
              </DockButton>
              <DockButton label="Measure">
                <LuRuler className="h-5 w-5" />
              </DockButton>
              <DockButton label="Anchor">
                <LuAnchor className="h-5 w-5" />
              </DockButton>
            </Dock>
          </section>

          <aside
            className="pointer-events-auto min-h-0 w-80"
            data-ui-chrome="true"
          >
            <GlassPanel className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="text-xs font-semibold tracking-wide text-white/65">
                  History
                </div>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] bg-clip-padding text-white/55 hover:bg-white/[0.08] hover:text-white"
                >
                  <LuChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] bg-clip-padding px-3 py-2 text-sm text-white hover:bg-white/[0.09]"
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/[0.06] text-white/70 ring-1 ring-white/[0.08] ring-inset">
                      <LuPenTool className="h-4 w-4" />
                    </span>
                    Sketch 01
                  </span>
                  <LuChevronRight className="h-4 w-4 text-white/45" />
                </button>
              </div>
            </GlassPanel>
          </aside>
        </div>
      </div>
    </main>
  );
}

function GlassPanel(props: { className?: string; children: ReactNode }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border border-white/10 bg-black/25 bg-clip-padding shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative h-full w-full">{props.children}</div>
    </div>
  );
}

function TitleIconButton(props: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-tauri-drag-region="false"
      aria-label={props.label}
      className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
    >
      {props.children}
    </button>
  );
}

function Dock(props: { className?: string; children: ReactNode }) {
  return (
    <div
      className={[
        "pointer-events-auto rounded-xl border border-white/10 bg-black/20 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col gap-1">{props.children}</div>
    </div>
  );
}

function DockButton(props: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      className="grid h-10 w-10 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
    >
      {props.children}
    </button>
  );
}

export default App;

const DRAG_ACTIVATION_DISTANCE_PX = 6;

function ProjectTitle() {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextBlurCommitRef = useRef(false);

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startedDragging: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const commit = () => {
    const next = draftName.trim() || "Untitled Project";
    setProjectName(next);
    setDraftName(next);
    setIsEditing(false);
  };

  const cancel = () => {
    setDraftName(projectName);
    setIsEditing(false);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isEditing) return;
    if (event.button !== 0) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedDragging: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isEditing) return;

    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.startedDragging) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.hypot(dx, dy) < DRAG_ACTIVATION_DISTANCE_PX) return;

    state.startedDragging = true;

    if (!isTauri()) return;
    getCurrentWindow()
      .startDragging()
      .catch(() => {
        // ignored
      });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (isEditing) return;

    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.startedDragging) return;

    setDraftName(projectName);
    setIsEditing(true);
  };

  const onPointerCancel = () => {
    dragStateRef.current = null;
  };

  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center px-2 text-sm font-medium text-zinc-200/90"
      data-tauri-drag-region="false"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {isEditing ?
        <input
          ref={inputRef}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            if (ignoreNextBlurCommitRef.current) {
              ignoreNextBlurCommitRef.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              ignoreNextBlurCommitRef.current = true;
              cancel();
            }
          }}
          data-tauri-drag-region="false"
          className="h-8 w-full max-w-[520px] rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-sm font-medium text-zinc-100 ring-1 ring-transparent outline-none placeholder:text-white/35 focus:border-blue-400/40 focus:ring-blue-400/25"
        />
      : <div className="select-none">{projectName}</div>}
    </div>
  );
}
