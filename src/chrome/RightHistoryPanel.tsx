import { LuChevronDown, LuChevronRight, LuPenTool } from "react-icons/lu";
import { GlassPanel } from "../ui/GlassPanel";

export function RightHistoryPanel() {
  return (
    <aside className="pointer-events-auto min-h-0 w-80" data-ui-chrome="true">
      <GlassPanel className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="text-xs font-semibold tracking-wide text-white/65">
            History
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.04] bg-clip-padding text-white/55 hover:bg-white/[0.08] hover:text-white"
          >
            <LuChevronDown className="h-4 w-4 text-white/45" />
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
  );
}
