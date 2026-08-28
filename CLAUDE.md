# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **yarn** (yarn.lock is committed).

```bash
yarn install      # deps; postinstall runs `nuxt prepare` to regenerate .nuxt types
yarn dev          # dev server on :3000
yarn test         # node --test over test/*.test.ts (no test framework dependency)
yarn generate     # static build into .output/public (the `dist` symlink points there)
yarn preview      # serve the generated build
yarn build        # nuxt build (rarely useful here, ssr is off)
```

Run one test file: `node --test test/dates.test.ts`. Filter by name: `node --test --test-name-pattern="ay hizası" test/`.

Tests run on Node's built-in runner using native TypeScript type stripping (Node 22.18+). Two consequences: **no constructor parameter properties** (`constructor(readonly x)`) in any file a test imports, and relative imports in tested modules need explicit `.ts` extensions.

There is no linter and no typecheck script; `yarn generate` is the compile check.

## Architecture

Nuxt 4 SPA (`ssr: false`), no backend. Source root is `app/`. There is no `pages/` directory and no routing: `app/app.vue` is the entire application shell (header, sidebar, chart area, all three modals, global keyboard and storage listeners).

Auto-imports come from `nuxt.config.ts` (`imports.dirs: ['stores', 'composables', 'utils']`) plus components under `app/components/`.

**Import style matters here.** Files under `app/utils`, `app/stores`, and `app/composables` are imported directly by the Node test runner, which cannot resolve the `~` alias. Runtime imports in those directories use relative paths with `.ts` extensions; type-only imports may keep `~/types` because type stripping erases them. Components are Vite-only and use `~/` freely.

### Data flow

`localStorage` is the only persistence layer. `app/composables/useDatabase.ts` owns four keys (`gantt-projects`, `gantt-tasks`, `gantt-settings`, `gantt-backup`) and exposes an async CRUD API that rewrites the whole array per mutation. It also owns `generateId()` (with a fallback for non-secure contexts where `crypto.randomUUID` is undefined) and throws `StorageError` when a write fails.

`app/stores/gantt.ts` (Pinia setup store) is the single source of truth for the UI. Every mutating action goes through `guardedWrite()`, which refuses writes in view-only mode and converts `StorageError` into `store.errorMessage`. Inside it, write to `useDatabase()` first, then patch the local ref. Adding a mutation outside `guardedWrite` silently reintroduces both bugs.

`migrateStorage()` runs once per `loadProjects()` and normalizes whatever is already in localStorage, so legacy or hand-edited records cannot crash the app at runtime.

### Timeline geometry

This is the part that requires reading several files together, and the invariant below is load-bearing:

- `store.dateRange` is the horizontal coordinate space. It is **always month-aligned** (starts on a 1st, ends on a month end). `getTimelineRange` guarantees this and `shiftRange` preserves it by moving whole months.
- `app/utils/dates.ts` converts dates to percentages of that range. `getRangeDays` is inclusive of both ends.
- `GanttChart.vue` owns `zoomLevel` (px per average month) and derives `pxPerDay = zoomLevel / 30.4375`, then `timelineWidth = rangeDays * pxPerDay`. It provides `timelineWidth` and `pxPerDay`.
- **Month columns are sized by their real day count** (`getMonthDaysInRange(month) * pxPerDay`), not a fixed width. Because the range is month-aligned, the column widths sum exactly to `rangeDays * pxPerDay`, which is what keeps bars aligned with grid lines. A test asserts this sum. Breaking month alignment or using a fixed column width reintroduces drift of several pixels around February.
- `app/utils/geometry.ts` owns `getBarGeometry()`, used by **both** `GanttRow` and `DependencyLines` so the minimum bar width applies identically and connector lines stay attached. `ROW_HEIGHT` lives here and must match the `h-10` row class and the `gantt-row` spacing token.

### Dates are calendar days, not instants

Every stored date is a `"YYYY-MM-DD"` calendar day. `new Date("2026-01-01")` parses as UTC midnight while `new Date(2026, 0, 1)` is local midnight; mixing the two shifted every bar by a day in positive-offset zones and broke month grouping in negative-offset ones. So:

- **Parse with `parseDate()`**, never `new Date(str)`.
- **Format with `toISODate()`**, never `toISOString().split('T')[0]`.
- `daysDiff` uses `Math.round` so DST days of 23 or 25 hours do not round to an extra day.

`test/dates.test.ts` is run against several timezones; keep it passing in at least one positive-offset, one negative-offset, and one half-hour-offset zone.

### Task tree and graph safety

`app/utils/tasks.ts` owns the tree and all graph invariants: `buildTaskTree` (tolerates self-parenting and parent cycles by rooting the offender rather than recursing forever), `collectDescendantIds`, `canReparent`, `wouldCreateDependencyCycle`, and `getDependencyOptions`. The store and `TaskModal` both go through these; do not hand-roll descendant walks.

`store.sortMode` (`'manual' | 'date'`) selects the sibling comparator passed to `buildTaskTree`. Date sorting is presentation only: it never writes `order`, so toggling back restores the manual arrangement exactly. Reordering is blocked while it is active (`store.canReorder` gates the drag handles and the up/down buttons, and `reorderTasks` refuses with a message), because writing `order` would not be visible on screen.

Bar dragging pins the sort. `GanttBar` calls `store.beginTaskDrag()` / `store.endTaskDrag()` around a drag; while pinned, `buildTaskTree` sorts siblings by the captured display order instead of by date. Without this, each pointer move changes `startDate`, re-sorts the list, and yanks the dragged row out of view when the list is scrolled. Any future drag interaction that mutates dates live must bracket itself the same way.

`store.flattenedTasks` walks the tree skipping subtrees whose `collapsed` flag is set. Collapse state lives on the task and is persisted, so a row's index in `flattenedTasks` is its vertical position and `DependencyLines` depends on that ordering.

### Search filters the same list

`store.searchQuery` feeds `collectSearchVisibility()` in `app/utils/tasks.ts`, which returns three sets: `matches` (tasks whose name, description or notes contain the query), `visible` (matches plus their ancestors plus their whole subtree) and `expand` (only the ancestors). `flattenedTasks` drops anything outside `visible` and force-opens the nodes in `expand`, so a match buried under a collapsed parent still shows up while a matched parent's own collapsed branch stays collapsed. Comparison runs through `foldSearchText`, which lowercases with the `tr` locale and then strips Turkish diacritics, so `gorev` finds `Görev`.

Filtering the list changes what the rest of the chart sees: `DependencyLines` skips connectors whose source is filtered out (it already ignores unknown ids), and `store.canReorder` goes false while a search is active because two rows that look adjacent may not be siblings. Searching never writes anything, and `selectProject` clears the query since it belonged to the previous project.

### Completed tasks

`Task.completed` is a separate persisted flag, not `progress === 100`: marking a task done sets `progress` to 100 as well, but clearing it leaves the progress the user had. `normalizeTask` coerces it with `raw.completed === true`, so old exports load as unfinished. The flag is rendered in three places that must stay consistent: the row's color dot doubles as the toggle in `GanttRow`, the bar gets an emerald ring plus a strikethrough label in `GanttBar` (through `ringClass`, which resolves invalid-range / dragging / completed in that order so two `ring-*` classes never fight), and `TaskModal` has the same toggle.

### Backward compatibility

The exported JSON shape (`Project` and `Task`) has not changed since the first commit, and `parseImportJSON` ignores the `version` field. `normalizeImport()` in `app/utils/tasks.ts` is the single gate for all untrusted input (file import, share URL, storage migration): it fills missing fields, drops dangling parent and dependency references, breaks dependency cycles, and reports counts so the UI can tell the user what was adjusted. **It never rewrites valid stored dates**, including inverted ranges, so old files keep their data.

`test/tasks.test.ts` pins a real legacy export and asserts it round-trips unchanged. Treat that test as the compatibility contract.

### Sharing and view-only mode

`useExport.ts` compresses `{ project, tasks, viewOnly }` with LZ-String into `?share=`. The authoritative `viewOnly` signal is the separate `&view=1` param; the copy inside the payload exists only to keep links generated before commit `0028681` working, and is consulted just when `view` is absent.

View-only replaces the in-memory project list but never touches localStorage. `selectProject` returns early in this mode (the shared project id is not in storage, so selecting it used to blank the chart), and `exitViewOnly()` restores the user's own data. Any new interactive affordance must check `store.isViewOnly`.

### Drag persistence

Bar dragging calls `store.previewTaskDates()` on every pointer move (memory only) and `store.commitTaskDates()` once on release. Never call `updateTask` from a move handler: each call reserializes every task to localStorage, and at default zoom a whole day is about 2.6 pixels.

Touch is handled separately from mouse in `GanttBar.vue` (long-press to start a move, `passive: false` so `preventDefault` works). Row reordering uses HTML5 drag-and-drop, which does not fire on touch, so the up/down buttons in `GanttRow` are the mobile path and must stay reachable.

The task column is resizable: `GanttChart.vue` owns `taskListWidth` and an absolutely positioned separator that spans header and body (the container is `relative` for it, and the body's task list stays `sticky left-0`, so the handle does not drift while the timeline scrolls). Width is clamped against `chartRef.clientWidth` so the timeline keeps at least 120px, re-clamped on window resize, and persisted to `AppSettings.taskListWidth`. Mouse, touch (`passive: false` again) and arrow keys all drive the same `applyResize`.

## Conventions

- **UI text and code comments are Turkish.** Identifiers and types are English.
- Commit messages are English Conventional Commits (`feat(ui):`, `fix(share):`, `refactor(export):`). Older commits are Turkish; follow the recent English convention.
- Colors: `GANTT_COLOR_MAP` in `app/types/index.ts` and the `gantt` colors in `tailwind.config.ts` are duplicated by hand and must stay in sync. Purple is intentionally excluded.
- Use the `surface-*` palette, not Tailwind's default `gray-*`.
- Reuse the component classes in `app/assets/css/tailwind.css` (`.input`, `.label`, `.btn-*`, `.modal-*`, `.form-group`) instead of respelling utility chains.
- Everything touching `window` / `localStorage` guards on `typeof window === 'undefined'` even though SSR is off. Preserve those guards.
