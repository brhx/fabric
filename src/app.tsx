import { useState } from "react";
import "./app.css";
import { Keycap } from "./chrome/keycap";
import { LeftItemsPanel } from "./chrome/left-items-panel";
import { RightHistoryPanel } from "./chrome/right-history-panel";
import { TitleBar } from "./chrome/title-bar";
import { Toolbar, ToolbarButton } from "./chrome/toolbar";
import {
  LEFT_TOOLBAR_GROUPS,
  RIGHT_TOOLBAR_GROUPS,
  TOOLBAR_ICON_CLASSNAME,
} from "./chrome/toolbar-config";
import { Viewport3D } from "./viewport-3d";

function ShortcutKeycaps(props: { keys: readonly string[] }) {
  return (
    <>
      {props.keys.map((key) => (
        <Keycap key={key}>{key}</Keycap>
      ))}
    </>
  );
}

function App() {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);

  return (
    <main className="relative h-full w-full overflow-hidden text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      <Viewport3D className="absolute inset-0" />
      <div
        aria-hidden="true"
        className="fabric-canvas pointer-events-none absolute inset-0"
      />

      <div className="pointer-events-none relative z-10 flex h-full w-full flex-col">
        <TitleBar
          projectName={projectName}
          setProjectName={setProjectName}
          isEditingProjectName={isEditingProjectName}
          setIsEditingProjectName={setIsEditingProjectName}
        />

        <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
          <LeftItemsPanel />

          <section
            data-viewport-area="true"
            className="pointer-events-none relative min-h-0 min-w-0 flex-1 overflow-visible"
          >
            <div className="group/toolbar-side pointer-events-none absolute top-0 bottom-0 left-0 flex flex-col items-start justify-between">
              {LEFT_TOOLBAR_GROUPS.map((group) => (
                <Toolbar key={group.key} showLabelsOnHover>
                  {group.buttons.map((button) => (
                    <ToolbarButton
                      key={button.key}
                      label={button.label}
                      shortcut={
                        button.shortcut ?
                          <ShortcutKeycaps keys={button.shortcut} />
                        : undefined
                      }
                    >
                      <button.Icon className={TOOLBAR_ICON_CLASSNAME} />
                    </ToolbarButton>
                  ))}
                </Toolbar>
              ))}
            </div>

            <div className="group/toolbar-side pointer-events-none absolute top-0 right-0 bottom-0 flex flex-col items-end justify-between">
              {RIGHT_TOOLBAR_GROUPS.map((group) => (
                <Toolbar key={group.key} showLabelsOnHover labelSide="left">
                  {group.buttons.map((button) => (
                    <ToolbarButton key={button.key} label={button.label}>
                      <button.Icon className={TOOLBAR_ICON_CLASSNAME} />
                    </ToolbarButton>
                  ))}
                </Toolbar>
              ))}
            </div>
          </section>

          <RightHistoryPanel />
        </div>
      </div>
    </main>
  );
}

export default App;
