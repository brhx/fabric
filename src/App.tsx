import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent, ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LuAnchor,
  LuBox,
  LuChevronDown,
  LuChevronRight,
  LuCircleHelp,
  LuCloud,
  LuCornerDownRight,
  LuEllipsis,
  LuHand,
  LuHouse,
  LuLayers,
  LuPalette,
  LuPanelsTopLeft,
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

const TITLEBAR_DRAG_THRESHOLD_PX = 6;
const FROSTED_BG_CLASS = "bg-black/40 bg-clip-padding backdrop-blur-xl";

function App() {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
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
    if (isEditingProjectName) return;

    setIsEditingProjectName(true);
  };

  const onTitleBarPointerCancel = () => {
    titleBarGestureRef.current = null;
  };

  return (
    <main className="relative h-full w-full overflow-hidden text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      <Viewport3D className="absolute inset-0" />
      <div
        aria-hidden="true"
        className="fabric-canvas pointer-events-none absolute inset-0"
      />

      <div className="pointer-events-none relative z-10 flex h-full w-full flex-col">
        <header
          data-tauri-drag-region="false"
          data-ui-chrome="true"
          className="pointer-events-auto flex h-12 items-center gap-3 border-b border-white/10 bg-black/20 px-2 backdrop-blur-xl select-none touch-none"
          onPointerDown={onTitleBarPointerDown}
          onPointerMove={onTitleBarPointerMove}
          onPointerUp={onTitleBarPointerUp}
          onPointerCancel={onTitleBarPointerCancel}
        >
          <div className="flex items-center gap-1 pl-20">
            <TitleIconButton label="Home">
              <LuHouse className="h-4 w-4" />
            </TitleIconButton>
            <TitleIconButton label="Cloud">
              <LuCloud className="h-4 w-4" />
            </TitleIconButton>
          </div>

          <ProjectTitle
            projectName={projectName}
            setProjectName={setProjectName}
            isEditing={isEditingProjectName}
            setIsEditing={setIsEditingProjectName}
          />

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

        <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
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
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 flex flex-col items-start justify-between group/toolbar-side">
              <Toolbar showLabelsOnHover>
                <ToolbarButton label="Modeling">
                  <LuBox className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Visualization">
                  <LuPalette className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton
                  label="Drawings"
                  shortcut={
                    <>
                      <Keycap>⇧</Keycap>
                      <Keycap>⌘</Keycap>
                      <Keycap>{"\\"}</Keycap>
                    </>
                  }
                >
                  <LuPanelsTopLeft className="h-5 w-5" />
                </ToolbarButton>
              </Toolbar>

              <Toolbar showLabelsOnHover>
                <ToolbarButton label="Search">
                  <LuSearch className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Pan">
                  <LuHand className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Zoom">
                  <LuZoomIn className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Settings">
                  <LuWrench className="h-5 w-5" />
                </ToolbarButton>
              </Toolbar>

              <Toolbar showLabelsOnHover>
                <ToolbarButton label="Library">
                  <LuLayers className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Console">
                  <LuTerminal className="h-5 w-5" />
                </ToolbarButton>
              </Toolbar>
            </div>

            <div className="pointer-events-none absolute top-0 bottom-0 right-0 flex flex-col items-end justify-between group/toolbar-side">
              <Toolbar showLabelsOnHover labelSide="left">
                <ToolbarButton label="Pin">
                  <LuPin className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Measure">
                  <LuRuler className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Anchor">
                  <LuAnchor className="h-5 w-5" />
                </ToolbarButton>
              </Toolbar>

              <Toolbar showLabelsOnHover labelSide="left">
                <ToolbarButton label="Add">
                  <LuPlus className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="More">
                  <LuEllipsis className="h-5 w-5" />
                </ToolbarButton>
                <ToolbarButton label="Help">
                  <LuCircleHelp className="h-5 w-5" />
                </ToolbarButton>
              </Toolbar>
            </div>
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

type ToolbarContextValue = {
  showLabelsOnHover: boolean;
  labelSide: "left" | "right";
};

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

function FrostedSurface(props: {
  className?: string;
  radiusClassName?: string;
  backgroundClassName?: string;
  children: ReactNode;
}) {
  const radiusClassName = props.radiusClassName ?? "rounded-xl";
  const backgroundClassName = props.backgroundClassName ?? FROSTED_BG_CLASS;

  return (
    <div
      data-frosted-surface="true"
      className={[
        "relative isolate overflow-visible",
        radiusClassName,
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        aria-hidden="true"
        data-frosted-bg="true"
        className={[
          "pointer-events-none absolute inset-0 -z-10",
          radiusClassName,
          backgroundClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {props.children}
    </div>
  );
}

function Toolbar(props: {
  className?: string;
  showLabelsOnHover?: boolean;
  labelSide?: "left" | "right";
  children: ReactNode;
}) {
  const contextValue = useMemo<ToolbarContextValue>(
    () => ({
      showLabelsOnHover: Boolean(props.showLabelsOnHover),
      labelSide: props.labelSide ?? "right",
    }),
    [props.labelSide, props.showLabelsOnHover],
  );

  return (
    <ToolbarContext.Provider value={contextValue}>
      <div
        className={[
          "pointer-events-auto inline-block overflow-visible",
          contextValue.showLabelsOnHover ? "group" : null,
          props.className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <FrostedSurface
          radiusClassName="rounded-xl"
          className="border border-white/10 p-0.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="flex flex-col">{props.children}</div>
        </FrostedSurface>
      </div>
    </ToolbarContext.Provider>
  );
}

function ToolbarButton(props: {
  label: ReactNode;
  shortcut?: ReactNode;
  children: ReactNode;
}) {
  const toolbarContext = useContext(ToolbarContext);
  const showLabel = Boolean(toolbarContext?.showLabelsOnHover);
  const labelSide = toolbarContext?.labelSide ?? "right";
  const ariaLabel = typeof props.label === "string" ? props.label : undefined;

  const labelPositionClassName =
    labelSide === "right" ? "left-full ml-2" : "right-full mr-2";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        className="peer grid h-11 w-11 place-items-center p-0.5 hover:[&>span]:bg-white/[0.10] hover:[&>span]:text-white hover:[&>span]:ring-1 hover:[&>span]:ring-white/15"
      >
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.025] text-white/80">
          {props.children}
        </span>
      </button>

      {showLabel ? (
        <div
          className={[
            "pointer-events-none absolute top-1/2 -mt-4 z-20 invisible opacity-0 transition-none group-has-[button:hover]/toolbar-side:visible group-has-[button:hover]/toolbar-side:opacity-100",
            "peer-hover:[&_[data-frosted-bg]]:bg-white/[0.06] peer-hover:[&_[data-frosted-surface]]:border-white/15",
            labelPositionClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <FrostedSurface
            radiusClassName="rounded-lg"
            className="flex h-8 items-center gap-2 whitespace-nowrap border border-white/10 px-3.5 text-[13px] font-semibold leading-none text-white/90 shadow-[0_10px_22px_rgba(0,0,0,0.38)]"
          >
            <span className="whitespace-nowrap">{props.label}</span>
            {props.shortcut ? (
              <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-white/70">
                {props.shortcut}
              </span>
            ) : null}
          </FrostedSurface>
        </div>
      ) : null}
    </div>
  );
}

function Keycap(props: { children: ReactNode }) {
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded border border-white/10 bg-white/[0.05] px-1 text-[10px] font-semibold leading-none text-white/65">
      {props.children}
    </span>
  );
}

function ProjectTitle(props: {
  projectName: string;
  setProjectName: (name: string) => void;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
}) {
  const [draftName, setDraftName] = useState(props.projectName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const ignoreNextBlurCommitRef = useRef(false);
  const [inputWidth, setInputWidth] = useState<number | undefined>(undefined);

  const measureText = draftName || "Untitled Project";

  useEffect(() => {
    if (!props.isEditing) return;
    setDraftName(props.projectName);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [props.isEditing, props.projectName]);

  useLayoutEffect(() => {
    if (!props.isEditing) return;
    const el = measureRef.current;
    if (!el) return;
    setInputWidth(el.offsetWidth);
  }, [props.isEditing, measureText]);

  const commit = () => {
    const next = draftName.trim() || "Untitled Project";
    props.setProjectName(next);
    setDraftName(next);
    props.setIsEditing(false);
  };

  const cancel = () => {
    setDraftName(props.projectName);
    props.setIsEditing(false);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center px-2 text-sm font-medium text-zinc-200/90">
      <div
        className={[
          "relative inline-flex items-center justify-center rounded-xl px-1 py-0.5",
          "max-w-[min(520px,70vw)] select-none",
          "cursor-default",
        ].join(" ")}
      >
        {props.isEditing ?
          <>
            <span
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute top-0 left-0 inline-block h-8 max-w-[min(520px,70vw)] whitespace-pre rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-sm font-medium text-zinc-100 ring-1 ring-transparent"
            >
              {measureText}
            </span>
            <input
              ref={inputRef}
              value={draftName}
              placeholder="Untitled Project"
              style={
                inputWidth !== undefined ?
                  { width: Math.ceil(inputWidth) }
                : undefined
              }
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
              className="h-8 max-w-[min(520px,70vw)] rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-sm font-medium text-zinc-100 ring-1 ring-transparent outline-none placeholder:text-white/35 focus:border-blue-400/40 focus:ring-blue-400/25"
            />
          </>
        : <div className="pointer-events-none truncate px-2 py-1">{props.projectName}</div>}
      </div>
    </div>
  );
}

export default App;
