import type { ReactNode } from "react";
import { Panel } from "./Panel";

export { DEFAULT_FROSTED_BG_CLASS } from "./Panel";

export function FrostedSurface(props: {
  className?: string;
  radiusClassName?: string;
  backgroundClassName?: string;
  children: ReactNode;
}) {
  return (
    <Panel
      variant="frosted"
      className={props.className}
      radiusClassName={props.radiusClassName}
      backgroundClassName={props.backgroundClassName}
    >
      {props.children}
    </Panel>
  );
}
