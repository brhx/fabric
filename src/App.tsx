import "./App.css";
import type { ReactNode } from "react";

function App() {
  return (
    <main className="relative h-full w-full overflow-hidden text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 fabric-canvas"
      />

      <div className="relative z-10 flex h-full w-full flex-col">
        <header
          data-tauri-drag-region
          className="flex h-12 items-center gap-3 border-b border-white/10 bg-black/20 px-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-1 pl-20">
            <TitleIconButton label="Home">
              <IconHome className="h-4 w-4" />
            </TitleIconButton>
            <TitleIconButton label="Cloud">
              <IconCloud className="h-4 w-4" />
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
              <IconHelp className="h-4 w-4" />
            </TitleIconButton>
          </div>
        </header>

        <div className="flex flex-1 gap-3 p-3 pt-3">
          <aside className="flex w-72 flex-col rounded-2xl border border-white/10 bg-black/20 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="px-4 pt-4 text-xs font-semibold tracking-wide text-white/70">
              Items
            </div>

            <button
              type="button"
              className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                All items
              </span>
              <IconChevronDown className="h-4 w-4 text-white/50" />
            </button>

            <div className="mt-2 px-3">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              >
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10">
                  <IconSketch className="h-4 w-4 text-white/70" />
                </span>
                Sketch 01
              </button>
            </div>

            <div className="flex-1" />

            <div className="flex items-center justify-between p-3">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <IconPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <IconDots className="h-4 w-4" />
              </button>
            </div>
          </aside>

          <section className="relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/10 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">

            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[420px] -translate-x-[46%] -translate-y-[20%] rotate-[14deg] skew-x-[-14deg] border border-blue-500/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[150px] w-[160px] -translate-x-[10%] translate-y-[32%] rotate-[14deg] skew-x-[-14deg] border border-blue-500/60 bg-blue-500/10" />

            <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[58%] -translate-x-[36%] translate-y-[38%] rotate-[14deg] bg-red-500/35" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[60%] -translate-x-[66%] -translate-y-[8%] rotate-[104deg] bg-green-500/35" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[52%] w-px -translate-x-[92%] -translate-y-[42%] rotate-[14deg] bg-blue-500/35" />

            <Dock className="absolute left-4 top-16">
              <DockButton label="Tool A">
                <span className="h-5 w-5 rounded-md bg-gradient-to-br from-emerald-400 to-sky-500" />
              </DockButton>
              <DockButton label="Tool B">
                <span className="h-5 w-5 rounded-md bg-gradient-to-br from-fuchsia-400 to-amber-300" />
              </DockButton>
              <DockButton label="Tool C">
                <span className="h-5 w-5 rounded-md bg-gradient-to-br from-zinc-200 to-zinc-500" />
              </DockButton>
            </Dock>

            <Dock className="absolute left-4 top-[260px]">
              <DockButton label="Search">
                <IconSearch className="h-5 w-5" />
              </DockButton>
              <DockButton label="Pan">
                <IconHand className="h-5 w-5" />
              </DockButton>
              <DockButton label="Zoom">
                <IconZoomIn className="h-5 w-5" />
              </DockButton>
              <DockButton label="Settings">
                <IconWrench className="h-5 w-5" />
              </DockButton>
            </Dock>

            <Dock className="absolute left-4 bottom-4">
              <DockButton label="Library">
                <IconStack className="h-5 w-5" />
              </DockButton>
              <DockButton label="Console">
                <IconTerminal className="h-5 w-5" />
              </DockButton>
            </Dock>

            <Dock className="absolute right-4 top-16">
              <DockButton label="Pin">
                <IconPin className="h-5 w-5" />
              </DockButton>
              <DockButton label="Measure">
                <IconRuler className="h-5 w-5" />
              </DockButton>
              <DockButton label="Anchor">
                <IconAnchor className="h-5 w-5" />
              </DockButton>
            </Dock>

            <div className="pointer-events-none absolute right-6 top-6 grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-black/20 text-xs text-white/70 backdrop-blur-xl">
              Cube
            </div>
          </section>

          <aside className="flex w-80 flex-col rounded-2xl border border-white/10 bg-black/20 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 pt-4 text-xs font-semibold tracking-wide text-white/70">
              <span>History</span>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <IconChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 px-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10">
                    <IconSketch className="h-4 w-4 text-white/70" />
                  </span>
                  Sketch 01
                </span>
                <IconChevronRight className="h-4 w-4 text-white/50" />
              </button>
            </div>

            <div className="flex-1" />
          </aside>
        </div>
      </div>
    </main>
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
        "rounded-2xl border border-white/10 bg-black/20 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl",
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

type IconProps = { className?: string };

function IconHome(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5v11h14v-11" />
      <path d="M9 20.5v-6h6v6" />
    </svg>
  );
}

function IconCloud(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M7.5 18.5h9a4 4 0 0 0 .8-7.92A5.5 5.5 0 0 0 6.2 8.85 3.75 3.75 0 0 0 7.5 18.5z" />
    </svg>
  );
}

function IconHelp(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
      <path d="M9.5 9.25a2.5 2.5 0 1 1 3.9 2.06c-.92.64-1.4 1.1-1.4 2.44v.25" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

function IconChevronDown(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconChevronRight(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}

function IconPlus(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconDots(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
    >
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  );
}

function IconSketch(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M5 7l3-3h8l3 3-10 14L5 7z" />
      <path d="M5 7h14" />
      <path d="M9 7l3 14 3-14" />
    </svg>
  );
}

function IconSearch(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function IconHand(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M8.5 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11.5 11V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14.5 12V6.5a1.5 1.5 0 0 1 3 0V14" />
      <path d="M8.5 11v6.5c0 2.5 2 4.5 4.5 4.5 3.5 0 6-2.5 6-6v-2" />
      <path d="M5.5 13.25c0-1 1.1-1.6 2-1l1 1" />
    </svg>
  );
}

function IconZoomIn(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
      <path d="M10.5 8v5" />
      <path d="M8 10.5h5" />
    </svg>
  );
}

function IconWrench(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M14 7a5 5 0 0 0 6 6l-3 3-2-2-6 6a2 2 0 0 1-3-3l6-6-2-2 3-3a5 5 0 0 0 1 1z" />
    </svg>
  );
}

function IconStack(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}

function IconTerminal(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M4 6l6 6-6 6" />
      <path d="M12 18h8" />
    </svg>
  );
}

function IconPin(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M14 3l7 7-4 1-2 6-2-2-6 2 2-6-2-2 6-2 1-4z" />
    </svg>
  );
}

function IconRuler(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M4 20l16-16" />
      <path d="M8 16l-2-2" />
      <path d="M12 12l-2-2" />
      <path d="M16 8l-2-2" />
      <path d="M6 18l-2-2" />
      <path d="M20 4l-4 4" />
    </svg>
  );
}

function IconAnchor(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      <path d="M12 6v11" />
      <path d="M7 11H4c0 6 4 10 8 10s8-4 8-10h-3" />
      <path d="M12 17l-3-3" />
      <path d="M12 17l3-3" />
    </svg>
  );
}

export default App;
