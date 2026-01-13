import type { ReactNode } from "react";
import { Panel } from "./panel";

export function GlassPanel(props: { className?: string; children: ReactNode }) {
  return (
    <Panel variant="glass" className={props.className}>
      {props.children}
    </Panel>
  );
}
