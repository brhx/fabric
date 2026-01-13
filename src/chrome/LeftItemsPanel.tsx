import {
  LuChevronDown,
  LuCornerDownRight,
  LuEllipsis,
  LuPenTool,
  LuPlus,
} from "react-icons/lu";
import { GlassPanel } from "../ui/GlassPanel";

export function LeftItemsPanel() {
  return (
    <aside className="pointer-events-auto min-h-0 w-72" data-ui-chrome="true">
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
  );
}
