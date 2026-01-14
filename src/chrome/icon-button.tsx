import type { ReactNode } from "react";

export function IconButton(props: { label: string; children: ReactNode }) {
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
