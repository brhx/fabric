import type { ReactNode } from "react";

export function Keycap(props: { children: ReactNode }) {
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded border border-white/10 bg-white/[0.05] px-1 text-[10px] leading-none font-semibold text-white/65">
      {props.children}
    </span>
  );
}
