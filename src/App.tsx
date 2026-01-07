import "./App.css";
import type { ReactNode } from "react";
import { Viewport3D } from "./Viewport3D";
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

function App() {
  return (
    <main className="relative h-full w-full overflow-hidden text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      <Viewport3D className="absolute inset-0" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 fabric-canvas" />

      <div className="pointer-events-none relative z-10 flex h-full w-full flex-col">
        <header
          data-tauri-drag-region
          data-ui-chrome="true"
          className="pointer-events-auto flex h-12 items-center gap-3 border-b border-white/10 bg-black/20 px-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-1 pl-20">
            <TitleIconButton label="Home">
              <LuHouse className="h-4 w-4" />
            </TitleIconButton>
            <TitleIconButton label="Cloud">
              <LuCloud className="h-4 w-4" />
            </TitleIconButton>
          </div>

          <div className="flex-1 text-center text-sm font-medium text-zinc-200/90">
            Untitled Project
          </div>

          <div className="flex items-center gap-2 pr-2">
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

        <div className="flex flex-1 min-h-0 min-w-0 gap-3 p-3 pt-3">
          <aside className="pointer-events-auto w-72 min-h-0" data-ui-chrome="true">
            <GlassPanel className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="text-xs font-semibold tracking-wide text-white/65">
                  Items
                </div>
              </div>

              <div className="mt-3 flex-1 min-h-0 overflow-auto px-3 pb-3 overscroll-contain">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.08] hover:text-white"
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
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/[0.08]">
                    <LuPenTool className="h-4 w-4" />
                  </span>
                  Sketch 01
                </button>
              </div>

              <div className="border-t border-white/10 px-3 py-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.08] hover:text-white"
                  >
                    <LuPlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.08] hover:text-white"
                  >
                    <LuEllipsis className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </GlassPanel>
          </aside>

          <section
            data-viewport-area="true"
            className="pointer-events-none relative flex-1 min-h-0 min-w-0 overflow-visible"
          >

            <Dock className="absolute left-4 top-16">
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

            <Dock className="absolute left-4 top-[260px]">
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

            <Dock className="absolute left-4 bottom-4">
              <DockButton label="Library">
                <LuLayers className="h-5 w-5" />
              </DockButton>
              <DockButton label="Console">
                <LuTerminal className="h-5 w-5" />
              </DockButton>
            </Dock>

            <Dock className="absolute right-4 top-16">
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

          <aside className="pointer-events-auto w-80 min-h-0" data-ui-chrome="true">
            <GlassPanel className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 pt-4">
                <div className="text-xs font-semibold tracking-wide text-white/65">
                  History
                </div>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.08] hover:text-white"
                >
                  <LuChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex-1 min-h-0 overflow-auto px-3 pb-3 overscroll-contain">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.09]"
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/[0.08]">
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
        "relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl backdrop-saturate-150",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-white/[0.04]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]"
      />
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
        "pointer-events-auto rounded-2xl border border-white/10 bg-black/20 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl",
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
