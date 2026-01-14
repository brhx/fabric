import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { Panel } from "./panel";

type ToolbarContextValue = {
  showLabelsOnHover: boolean;
  labelSide: "left" | "right";
};

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export function Toolbar(props: {
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
        <Panel
          variant="frosted"
          radiusClassName="rounded-xl"
          className="border border-white/10 p-0.5"
        >
          <div className="flex flex-col">{props.children}</div>
        </Panel>
      </div>
    </ToolbarContext.Provider>
  );
}

export function ToolbarButton(props: {
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

      {showLabel ?
        <div
          className={[
            "pointer-events-none invisible absolute top-1/2 z-20 -mt-4 opacity-0 transition-none group-has-[button:hover]/toolbar-side:visible group-has-[button:hover]/toolbar-side:opacity-100",
            "peer-hover:[&_[data-frosted-bg]]:bg-white/[0.06] peer-hover:[&_[data-frosted-surface]]:border-white/15",
            labelPositionClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Panel
            variant="frosted"
            radiusClassName="rounded-lg"
            className="flex h-8 items-center gap-2 border border-white/10 px-3.5 text-[13px] leading-none font-semibold whitespace-nowrap text-white/90"
          >
            <span className="whitespace-nowrap">{props.label}</span>
            {props.shortcut ?
              <span className="flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-white/70">
                {props.shortcut}
              </span>
            : null}
          </Panel>
        </div>
      : null}
    </div>
  );
}
