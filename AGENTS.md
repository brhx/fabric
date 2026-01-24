# Repository Guidelines

## Project Structure & Module Organization

- `src/`: Vite + React + TypeScript frontend.
  - `src/chrome/`: window chrome (title bar, panels, toolbar).
  - `src/viewport/`: 3D viewport, camera/controls, and viewcube helpers.
- `src-tauri/`: Tauri (Rust) backend and app config (`src-tauri/tauri.conf.json`).
- `tests/`: automated tests (`tests/unit/`, `tests/e2e/`).
- `dist/`: production build output (generated).

## Build, Test, and Development Commands

- `pnpm install`: install JS dependencies (lockfile: `pnpm-lock.yaml`).
- `pnpm dev`: run the web app via Vite (Tauri dev expects `http://localhost:1420`).
- `pnpm tauri dev`: run the desktop app (starts Vite via `beforeDevCommand`).
- `pnpm build`: `tsc` + Vite build to `dist/`.
- `pnpm preview`: serve the built app from `dist/`.
- `pnpm lint` / `pnpm lint:fix`: type-aware `oxlint` + `tsc --noEmit` (optionally auto-fix).
- `pnpm format` / `pnpm format:check`: Prettier write/check.

## Coding Style & Naming Conventions

- Use Prettier as the source of truth for formatting (2-space indentation; don't hand-format).
- Prefer kebab-case file names (e.g., `viewport-debug-overlay.tsx`), PascalCase React components,
  and `use*` prefixes for hooks.
- Keep modules focused: math/controls in `src/viewport/`, UI chrome in `src/chrome/`.

## Testing Guidelines

- Unit tests: Vitest (`tests/unit/*.test.ts`), run with `pnpm test`.
- E2E (web): Vitest + Playwright (`tests/e2e/*.e2e.test.ts`), run with `pnpm test:e2e:web`.
  - Headless example: `HEADLESS=1 pnpm test:e2e:web`

## Commit & Pull Request Guidelines

- Commit messages are short, imperative, sentence case (e.g., "Fix ViewCube snap orbit plane").
- PRs should include: what changed, how to test, and screenshots/recordings for UI/3D changes.
- Before requesting review, run: `pnpm lint`, `pnpm test`, and `pnpm build`.

## Rust / Tauri Notes

- Rust lives in `src-tauri/src/`; the toolchain is pinned in `rust-toolchain.toml`.
- When touching Rust, run `cargo fmt` and `cargo clippy` from `src-tauri/`.
