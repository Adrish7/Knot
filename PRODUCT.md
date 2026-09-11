# Knot

Personal task manager for macOS. Electron + React + TypeScript, packaged as `/Applications/Knot.app` and updated from this source folder.

## Users

- Single user: Adrish, on a Mac laptop, throughout the working day. Morning planning, quick captures during the day, evening tidy-up. Light and dark environments both real.
- Job: keep a small number of lists honest, decide what today holds, and plan work onto calendar days without ceremony.

## Purpose and position

- An upgraded Google Tasks: familiar list-and-checkbox workflow with a calmer board layout and a planning calendar.
- Distinct mechanism: **focus days.** A task can be planned onto one or more calendar days independent of its due date, with a per-day outcome (done or missed) and per-day ordering. The calendar is where the week is arranged.

## Capabilities (keep every one)

- Lists: create, rename, delete, reorder (drag on the board), color per list.
- Views: All tasks (board of list columns), Today, Calendar (month, week, day, year; task tray; drag to plan), Starred, per-list, Completed, Recently deleted, search.
- Tasks: create (inline quick add, ⌘N), edit title in place (double-click), notes, subtasks (inline toggles and editor), due date/time, focus days, reminder, recurrence, star, complete with animation, delete to trash, restore, purge, reorder by drag, move between lists.
- Sorting: manual, due date, starred first.
- Theme: light, dark, follow system.
- Native: macOS notifications, Dock badge, open at login, JSON persistence with backup, single instance, wake-to-front, in-app "Update Knot" that rebuilds from source.
- Shortcuts: ⌘K search, ⌘N new task, Esc closes layers.

## Constraints

- Functionality and state logic are frozen; UI files are the redesign surface.
- No external network: CSP is `default-src 'self'`. Fonts must be system or bundled; nothing loads from the web.
- Persisted data shape is versioned (`version: 1`) and normalized on load; list colors are stored as hex, so any palette change must keep older hex values rendering.
- Copy stays plain and utilitarian. No slogans, no greetings, no poetic microcopy.
- The dev Electron instance must not be launched for verification (it adds a second Dock icon). Verify with the web build in headless Chrome.

## Platform

`web` renderer inside a native macOS shell. Native window chrome: hidden inset title bar with traffic lights at the top left of the sidebar, window vibrancy behind the sidebar.

## Voice

Short, concrete, present tense. Controls name their action ("Delete list", "Reopen", "Empty now"). Counts instead of encouragement.

_Facts above are taken from the codebase and README, confirmed by the redesign brief of 2026-09-11 (inferred where the brief was silent)._
