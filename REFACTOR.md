# Refactor Plan (Checklist)

This document is a detailed, ordered checklist for refactoring the app + 3D code to be more DRY and idiomatic, without changing behavior.

## Goals

- Make UI + 3D code easier to navigate (smaller files, clearer boundaries).
- Remove repeated markup/styles by making code data-driven where appropriate.
- Encapsulate event/effect logic into focused hooks.
- Keep rendering behavior identical (or explicitly note intentional changes).

## Guardrails

- [ ] No behavior changes without an explicit checkbox item calling it out.
- [ ] Prefer extraction + composition over “clever” abstractions.
- [ ] Keep public component APIs small and explicit.
- [ ] Keep styling consistent (avoid class drift).
- [ ] First passes are **move/extract only**: keep Tailwind class strings and pointer-event semantics identical; do “variant cleanup” only after files are split.
- [ ] After each section, run TypeScript check and do a quick manual smoke test.

## Baseline (Before Touching Code)

- [x] Add a quick “what exists” inventory:
  - [x] `src/App.tsx` responsibilities (chrome, panels, toolbars, title editing).
  - [x] `src/Viewport3D.tsx` responsibilities (Canvas setup, camera rig + controls, geo offset, view shortcuts, overlays).
  - [x] `src/ViewCube.tsx` responsibilities (geometry creation, hit testing, pointer handling, textures, HUD rendering).
  - [x] `src/geo/*` responsibilities (WGS84 conversions, local ENU frame, render offset strategy).
  - [x] `src/viewport/*` responsibilities (camera rig, controls, math, debug).
- [x] Confirm current “entry points”:
  - [x] `src/main.tsx` renders `App`.
  - [x] `App` renders `Viewport3D` and UI chrome.
- [x] Decide folder layout convention (one of):
  - [ ] **Option A (feature folders)**: `src/features/viewcube/*`, `src/features/viewport/*`, `src/features/chrome/*`
  - [x] **Option B (current style, tightened)**: keep `src/viewport/*`, add `src/viewcube/*`, add `src/ui/*`

Inventory notes (snapshot):

- App: UI chrome, title editing, panels, and toolbar composition.
- Viewport3D: Canvas + camera rig/controls, geo offset + overlays, view shortcuts.
- ViewCube: HUD, geometry + hit testing, pointer handling, textures.
- geo: WGS84 conversions, local ENU frame, render-offset strategy.
- viewport: rig, controls, math, debug overlay.

## Phase 1: DRY + Idiomatic UI in `App`

### 1.1 Extract shared UI primitives

- [x] Create `src/ui/Panel.tsx` (or `src/ui/Surface.tsx`) to unify `GlassPanel` + `FrostedSurface`.
  - [x] Support props like `className`, `radius`, and “surface style” variants.
  - [x] Keep Tailwind strings identical to current output (no visual drift yet).
- [x] Create `src/ui/IconButton.tsx` for `TitleIconButton` style buttons.
  - [x] Ensure `data-tauri-drag-region="false"` + `data-ui-chrome` behavior remains intact.
- [x] Create `src/ui/Keycap.tsx` from existing `Keycap`.

### 1.2 Make toolbars data-driven

- [x] Define toolbar configs in `src/chrome/toolbarConfig.tsx`:
  - [x] Left column: top group, middle group, bottom group.
  - [x] Right column: top group, bottom group.
  - [x] Each item: `{ label, Icon, shortcut?, ariaLabel? }`.
- [x] Extract `Toolbar`, `ToolbarButton` into `src/chrome/Toolbar.tsx`:
  - [x] Keep hover label behavior + label-side behavior.
  - [x] Keep `pointer-events-*` semantics identical.
  - [x] Keep `data-ui-chrome` semantics where needed.
- [x] Replace repeated markup in `App` with `map()` over config.

### 1.3 Extract panels and titlebar

- [x] Extract `TitleBar` from `App.tsx` into `src/chrome/TitleBar.tsx`.
  - [x] Keep Tauri dragging behavior identical (threshold, pointer capture, “editable target” logic).
  - [x] Keep `ProjectTitle` editing behavior identical (click-to-edit, blur commits, Escape cancels).
- [x] Extract `LeftItemsPanel` into `src/chrome/LeftItemsPanel.tsx`.
- [x] Extract `RightHistoryPanel` into `src/chrome/RightHistoryPanel.tsx`.
- [x] Keep `App.tsx` as a thin shell that composes these:
  - [x] Owns `projectName` state.
  - [x] Owns “is editing” state (or pushes it into `ProjectTitle` if fully local).

### 1.4 Title editing: optional follow-up cleanup (no behavior change)

- [x] Move `ProjectTitle` into `src/chrome/ProjectTitle.tsx`.
- [x] Extract measuring logic into `useMeasuredInputWidth` hook:
  - [x] Inputs: `text`, `enabled`.
  - [x] Outputs: `widthPx`, `measureRef`.

## Phase 2: Make `Viewport3D` more idiomatic

### 2.1 Extract keyboard shortcut effect

- [x] Create `src/viewport/useDefaultViewShortcuts.ts`:
  - [x] Registers `keydown` listener (capture) on `window`.
  - [x] Ignores editable targets exactly like current logic.
  - [x] Calls `geo.reset()` then `rig.requestDefaultView(viewId)` like current behavior.
- [x] Replace the inline `useEffect` in `src/Viewport3D.tsx` with the hook.

### 2.2 Extract orbit fallback plane logic

- [x] Create `src/viewport/useOrbitFallbackPlane.ts`:
  - [x] Maintains `renderOffsetRef`.
  - [x] Exposes `getOrbitFallbackPlane(ctx, outPlane)` callback.
- [x] Keep behavior identical (`Z_UP` plane through current render offset).

### 2.3 Clarify scene composition

- [x] Rename `Viewport3DContent` to `ViewportScene` (optional) and keep file readable.
- [x] Move `MainScene` and `AxesOverlay` into `src/viewport/SceneHelpers.tsx` (or keep colocated if preferred).

## Phase 3: Break up `ViewCube.tsx` (largest DRY win)

### 3.1 Create a `src/viewcube/` folder

- [x] Move/view split responsibilities into:
  - [x] `src/viewcube/constants.ts`
  - [x] `src/viewcube/geometry.ts` (chamfered cube + triangle hit metadata + highlight geometries)
  - [x] `src/viewcube/hitTest.ts` (raycasting utilities, hit key helpers)
  - [x] `src/viewcube/textures.ts` (face + axis label textures, dispose helpers)
  - [x] `src/viewcube/ViewCube.tsx` (public component, orchestrates)
  - [x] `src/viewcube/ViewCubeHud.tsx` (HUD content + controls integration)
  - [x] `src/viewcube/ViewCubeButton.tsx` (HTML overlay button primitive)
  - [x] `src/viewcube/ViewCubeHighlight.tsx` (hover highlight mesh)
  - [x] `src/viewcube/Axes.tsx` (AxisLine + AxisLabel)

### 3.2 Reduce effect complexity with focused hooks

- [x] Implement `useViewCubeMargins(glDomElement)`:
  - [x] Encapsulates resize/scroll/ResizeObserver logic.
  - [x] Returns `[marginX, marginY]`.
- [x] Implement `useViewCubePointerEvents(...)`:
  - [x] Encapsulates document-level pointerdown/move/up/cancel + lost capture + mouseleave + blur + visibilitychange.
  - [x] Keeps “over UI chrome” checks identical.
  - [x] Keeps drag threshold behavior identical.
  - [x] Keeps hover hit + snap logic identical.
  - [x] Keep `preventDefault`/`stopPropagation` and `pointer-events-*` semantics identical until after extraction is complete.
- [x] Implement `useFaceLabelTextures(gl)` and `useAxisLabelTextures(gl)`:
  - [x] Responsible for creation + disposal.
  - [x] Keep anisotropy logic identical.

### 3.3 Normalize coordinate conversion in one place

- [x] Centralize `localDirectionToWorldDirection`:
  - [x] Keep current axis mapping comment and behavior.
  - [x] Ensure `props.getWorldDirectionFromLocalDirection` override still works.
- [x] Add small helpers for “tuple <-> Vector3” conversions (avoid repetitive `set(...tuple)` and `toArray()` casts).

### 3.4 Optional: reduce re-renders (still no behavior change)

- [x] Memoize stable callbacks and derived values; ensure `invalidate()` still triggers when hover changes.
- [x] Confirm `useFrame` logic still updates orientation + HUD projection each frame.

## Phase 4: Tighten `geo/` and `viewport/` organization (small cleanup)

### 4.1 `geo/` consistency

- [x] Consider exporting a single `GeoFrame` type + helpers from `src/geo/index.ts`.
- [x] Rename ambiguous fields only if it improves clarity and is easy to update:
  - [x] `renderOffset` vs “renderOriginOffset” semantics (document what it means).
- [x] Add doc comments (short) for:
  - [x] Render space convention (+X east, +Y north, +Z up).
  - [x] Why `renderOffset` exists and how it composes with `GeoRoot`.

### 4.2 `viewport/` ergonomics

- [x] (Defer) Add `src/viewport/index.ts` barrel exports only after the module boundaries feel stable (optional).
- [x] Ensure imports in `Viewport3D.tsx` are clean and grouped.

## Phase 5: Validation + Cleanup

- [x] Run TypeScript typecheck (project command).
- [x] Run lints/formatters if configured.
- [ ] Manual smoke test:
  - [ ] `App` chrome: title edit, hover labels, panels scroll, click targets.
  - [ ] `Viewport3D`: controls still work, default-view hotkeys still work, overlay still renders.
  - [ ] `ViewCube`: hover highlights, click-to-snap, drag-to-orbit, rotate buttons.
- [x] Remove dead code and inline duplicates after extractions.

## Notes / Open Questions (Decide Before Implementing)

- [x] Folder strategy: keep current `src/viewport/*` and add `src/viewcube/*` + `src/ui/*` (recommended for minimal churn).
- [x] Should `TitleBar` own its own “editing” state, or should `App` own it? (Either is fine; prefer local unless other components need it.)
- [x] Should `Toolbar` configs live next to `Toolbar` component or in a dedicated config file? (Prefer config file if it’s mostly data.)
- [x] Avoid “barrel export churn”: prefer direct imports while actively moving files; add `index.ts` exports later as a final polish step.

## Final Cleanup

- [ ] Delete this temporary `REFACTOR.md` file.
