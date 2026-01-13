import type { ReactNode } from "react";
import { VIEWCUBE_BUTTON_SIZE_PX } from "./constants";

export function ViewCubeButton(props: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ui-chrome="true"
      aria-label={props.label}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      style={{
        width: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
        height: `${VIEWCUBE_BUTTON_SIZE_PX}px`,
        borderRadius: "999px",
        border: "none",
        background: "rgba(84,86,96,0.78)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        color: "rgba(255,255,255,0.92)",
        pointerEvents: "auto",
      }}
    >
      {props.children}
    </button>
  );
}
