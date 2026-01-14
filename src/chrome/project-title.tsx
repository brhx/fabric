import { useEffect, useLayoutEffect, useRef, useState } from "react";

function useMeasuredInputWidth(text: string, enabled: boolean) {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [widthPx, setWidthPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = measureRef.current;
    if (!el) return;
    setWidthPx(el.offsetWidth);
  }, [enabled, text]);

  return { widthPx, measureRef };
}

export function ProjectTitle(props: {
  projectName: string;
  setProjectName: (name: string) => void;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
}) {
  const [draftName, setDraftName] = useState(props.projectName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextBlurCommitRef = useRef(false);

  const measureText = draftName || "Untitled Project";

  useEffect(() => {
    if (!props.isEditing) return;
    setDraftName(props.projectName);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [props.isEditing, props.projectName]);

  const { widthPx, measureRef } = useMeasuredInputWidth(
    measureText,
    props.isEditing,
  );
  const caretGutterPx = 2;

  const commit = () => {
    const next = draftName.trim() || "Untitled Project";
    props.setProjectName(next);
    setDraftName(next);
    props.setIsEditing(false);
  };

  const cancel = () => {
    setDraftName(props.projectName);
    props.setIsEditing(false);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center px-2 text-sm font-medium text-zinc-200/90">
      <div
        className={[
          "relative inline-flex items-center justify-center rounded-xl px-1 py-0.5",
          "max-w-[min(520px,70vw)] select-none",
          "cursor-default",
        ].join(" ")}
      >
        {props.isEditing ?
          <>
            <span
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute top-0 left-0 inline-block h-8 max-w-[min(520px,70vw)] rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-sm font-medium whitespace-pre text-zinc-100 ring-1 ring-transparent"
            >
              {measureText}
            </span>
            <input
              ref={inputRef}
              value={draftName}
              placeholder="Untitled Project"
              style={
                widthPx !== undefined ?
                  { width: Math.ceil(widthPx) + caretGutterPx }
                : undefined
              }
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                if (ignoreNextBlurCommitRef.current) {
                  ignoreNextBlurCommitRef.current = false;
                  return;
                }
                commit();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  ignoreNextBlurCommitRef.current = true;
                  cancel();
                }
              }}
              data-tauri-drag-region="false"
              className="h-8 max-w-[min(520px,70vw)] rounded-xl border border-white/10 bg-white/[0.06] px-3 text-center text-sm font-medium text-zinc-100 ring-1 ring-transparent outline-none placeholder:text-white/35 focus:border-blue-400/40 focus:ring-blue-400/25"
            />
          </>
        : <div className="pointer-events-none truncate px-2 py-1">
            {props.projectName}
          </div>
        }
      </div>
    </div>
  );
}
