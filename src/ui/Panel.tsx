import type { ReactNode } from "react";

export const DEFAULT_FROSTED_BG_CLASS =
  "bg-black/40 bg-clip-padding backdrop-blur-xl";

type PanelProps = {
  variant?: "glass" | "frosted";
  className?: string;
  radiusClassName?: string;
  backgroundClassName?: string;
  children: ReactNode;
};

export function Panel(props: PanelProps) {
  const variant = props.variant ?? "glass";
  if (variant === "frosted") {
    const radiusClassName = props.radiusClassName ?? "rounded-xl";
    const backgroundClassName =
      props.backgroundClassName ?? DEFAULT_FROSTED_BG_CLASS;

    return (
      <div
        data-frosted-surface="true"
        className={[
          "relative isolate overflow-visible",
          radiusClassName,
          props.className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          aria-hidden="true"
          data-frosted-bg="true"
          className={[
            "pointer-events-none absolute inset-0 -z-10",
            radiusClassName,
            backgroundClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        {props.children}
      </div>
    );
  }

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border border-white/10 bg-black/25 bg-clip-padding shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative h-full w-full">{props.children}</div>
    </div>
  );
}
