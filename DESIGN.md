# Knot design system

Replaced 2026-09-11. The previous world (warm cream ground, sage accent, rounded cards with soft halos, eyebrow labels, 10px meta text) is retired and is an anti-reference.

## Thesis

A native Mac tool where **color is wayfinding**. Every destination in the app owns one hue: it lives in its sidebar icon, its page title icon, its selection tint and its calendar mark, and nowhere else. The chrome is neutral so that these hues, and the user's own list colors, are the only color on screen. Nothing is a card; structure comes from type, hairlines and whitespace.

## Mode

Operate. Scanability and native expectations outrank expression. Brand lives in the color roles, the checkbox, the progress ring and the completion moment.

## Palette

Neutral ground, one accent, seven named view colors, a twelve-color list palette.

| Role | Light | Dark |
|---|---|---|
| Content ground `--bg` | `#ffffff` | `#232326` |
| Sidebar `--sidebar` | `rgba(243,243,245,.86)` over vibrancy | `rgba(30,30,32,.84)` |
| Hover fill `--surface-2` | `rgba(0,0,0,.045)` | `rgba(255,255,255,.06)` |
| Text | `#1c1c1e` | `#f2f2f4` |
| Secondary text `--text-2` | `#6e6e73` | `#a6a6ad` |
| Hairline `--border` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.09)` |
| Accent `--blue` | `#2e6ff2` | `#4b8bff` |
| All tasks | `#3b6ff0` | `#5b8dff` |
| Today | `#f0a218` | `#ffb52e` |
| Calendar | `#e8474b` | `#ff6b6b` |
| Starred | `#8b5cf6` | `#a78bfa` |
| Completed | `#2aa04f` | `#3fca6a` |
| Recently deleted | `#8e8e93` | `#98989f` |
| Stopwatch | `#0f9d8f` | `#2dd4bf` |
| Danger | `#e5484d` | `#ff6369` |

List palette (user-chosen, stored as hex): red `#e5484d`, orange `#f76b15`, amber `#e0a100`, green `#30a46c`, teal `#12a594`, cyan `#0c9cc4`, blue `#3b82f6`, indigo `#5b5bd6`, violet `#8e4ec6`, pink `#d6409f`, brown `#a07553`, slate `#64748b`.

Per-list theming stays sacred: any container scoped to one list gets `is-accented` and `--list-accent: <hex>`; the `--accent` / `--accent-soft` / `--accent-deep` trio re-derives automatically. New accent-colored UI uses `var(--accent)`, never a raw color.

## Type

One family: the system stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Text'`). No display face. Fixed pixel scale:

- Page title 26px / 700 / -0.02em
- Section and column headings 15px / 600
- Task title, sidebar rows, inputs 14px / 400 (sidebar selected 500)
- Notes and secondary rows 13px
- Meta, counts, labels 12px / 500. Nothing below 12px except tabular counts at 11.5px.

## Shape and depth

Radii: 5px controls and checkboxes, 7px rows, 10px popovers and menus, 12px panels and dialogs. Hairlines at 1px. Shadows always carry offset and blur: `--shadow-sm: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.05)`; `--shadow-md: 0 12px 32px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.08)`. No halos, no blur-as-decoration except the sidebar vibrancy.

## Components

- **Sidebar**: 244px, vibrancy, traffic-light space, search field on top, view rows with colored icons, list rows with a progress ring in the list color, Completed and Recently deleted after a hairline, footer with "New list" and a settings gear that opens a popover (appearance, open at login, export and import, shortcuts, version and "Check for updates"). When a newer release exists, an "Update Knot" row sits above the footer in `--accent` on `--accent-soft`, with the version at the right; while it downloads the row fills left to right. Collapsed rail at 76px keeps icons and rings.
- **Page title**: colored view icon + 26px title. No eyebrow. Optional one-line subline (date, result count).
- **Task row**: 16px rounded-square checkbox, 14px title, 12px meta line, hover actions at the right (date, star, delete), drop guide in accent.
- **Board**: columns of 320px with heading (ring, name, count) over a hairline; no card chrome.
- **List views**: a centered 760px column, no sheet.
- **Inspector**: right-edge 420px panel with hairline and shadow, title textarea, plain notes area, label/value rows, subtasks.
- **Dialogs**: 420px, 12px radius, title 17px, primary blue and secondary grey buttons.
- **Toast**: dark pill at bottom center.
- **Tags**: labels that cut across lists (Productive, Break, Relaxing to start), drawn as a 6px dot in the tag's colour plus its name in the meta line. Picked from a popover that filters, creates, renames and recolours. Exactly one tag is the break tag: its time counts as a break, the same as the gaps between sessions, so it stays out of every working-time total and joins the gaps on the sessions band as a thin line.
- **Stopwatch face**: the one place with real depth. A round basin of still water on the page ground, seen from above, with the readout resting on its calm centre. Time falls into it as ink: once a second a drop of the task's colour lands on the rim at the second's position (12 o'clock is :00) and blooms, and a slow inward spiral draws each bloom back and in as it ages, so the last half minute reads as a comet of ink curling round the rim. Light mode is ink in water on porcelain (`#f7f7f9`; the dye is absorbed Beer–Lambert style so dense ink stays saturated rather than going grey); dark mode is luminous dye in black water (`#18181b`, additive with a soft bloom). A hairline rim with a shallow inner shadow frames it. A 1.5px arc on the rim fills clockwise with the minute within the hour; finished hours sit as small dots in a row at 6 o'clock. Paused water keeps its ink, greyed; the idle basin is clear water. The water is a WebGL2 fluid simulation (`src/components/ink/`); if WebGL is unavailable the basin falls back to a still disc.

## Motion

Two authored moments: completing a task (check pop, strike, row collapse) and the stopwatch basin (a drop and a ripple each second; at the minute a vortex turns the water a quarter turn and folds the trail into it; at the hour a wave runs in from the rim; starting splashes outward from the centre; pausing stills and greys the water in about 600ms; reset drains it in a swirl; the pointer stirs the water anywhere on the face and a press splashes; a task switch floats the new colour in; digits turn on drums). The basin only animates while something moves: idle and paused water settles within a couple of seconds and the frame loop stops. Everything else is 150–220ms state feedback with `cubic-bezier(.2,.8,.2,1)`. Reduced motion collapses all to 1ms and leaves the basin still with one drop at the current second.
