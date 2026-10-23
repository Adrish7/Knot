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
| Sidebar `--sidebar` | `rgba(243,243,245,.86)` over the page ground | `rgba(30,30,32,.84)` |
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
| Sanctuary | `#c9548f` | `#ea88bb` |
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

Radii: 5px controls and checkboxes, 7px rows, 10px popovers and menus, 12px panels and dialogs. Hairlines at 1px. Shadows always carry offset and blur: `--shadow-sm: 0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.05)`; `--shadow-md: 0 12px 32px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.08)`. No halos, no blur-as-decoration. The window has no vibrancy and the sidebar no backdrop blur: the page is opaque, so neither ever showed, and both cost work even while Knot was in the background.

## Components

- **Sidebar**: 244px, traffic-light space, search field on top, view rows with colored icons, list rows with a progress ring in the list color, Completed and Recently deleted after a hairline, footer with "New list", an update button (a circled down arrow that checks for a release; accent with a dot when one is out, and a click opens the New update card) and a settings gear that opens a popover (appearance, open at login, Sanctuary and buddies on or off, what's new, export and import, shortcuts, version and "Check for updates"). Collapsed rail at 76px keeps icons and rings.
- **New update**: whenever a newer release exists, a filled button reading "New update" sits at the top right of the window, in the title-bar strip above the page title, on every page and with the sidebar collapsed or not. It is the one filled control in the chrome and always the app blue (`--blue`, white label, 28px, 6px radius, `--shadow-sm`), never the list's colour, since it is about Knot. It drops in once when the release is found; nothing loops. A click opens a 332px card under it: "Knot 1.7.0 is available", "You have 1.6.3", the release notes (paragraphs and bullets from the GitHub release, GitHub's own "Full Changelog" line dropped), a plain line that Knot restarts (and that a running stopwatch keeps counting), then Later and Update and restart. While the update downloads, the button reads "Downloading 42%" and fills left to right, and the card shows a 4px bar. The sidebar's update icon and Settings' "Update to …" open the same card.
- **Page title**: colored view icon + 26px title. No eyebrow. Optional one-line subline (date, result count).
- **Task row**: 16px rounded-square checkbox, 14px title, 12px meta line, hover actions at the right (date, star, delete), drop guide in accent.
- **Board**: columns of 320px with heading (ring, name, count) over a hairline; no card chrome.
- **List views**: a centered 760px column, no sheet.
- **Inspector**: right-edge 420px panel with hairline and shadow, title textarea, plain notes area, label/value rows, subtasks.
- **Dialogs**: 420px, 12px radius, title 17px, primary blue and secondary grey buttons.
- **Toast**: dark pill at bottom center.
- **Tags**: labels that cut across lists (Productive, Break, Relaxing to start), drawn as a 6px dot in the tag's colour plus its name in the meta line. Picked from a popover that filters, creates, renames and recolours. Exactly one tag is the break tag: its time counts as a break, the same as the gaps between sessions, so it stays out of every working-time total and joins the gaps on the sessions band as a thin line.
- **Stopwatch face**: the one place with real depth. A round basin of still water on the page ground, seen from above, with the readout resting on its calm centre. Time falls into it as ink: once a second a drop of the task's colour lands on the rim at the second's position (12 o'clock is :00) and blooms, and a slow inward spiral draws each bloom back and in as it ages, so the last half minute reads as a comet of ink curling round the rim. Light mode is ink in water on porcelain (`#f7f7f9`; the dye is absorbed Beer–Lambert style so dense ink stays saturated rather than going grey); dark mode is luminous dye in black water (`#18181b`, additive with a soft bloom). A hairline rim with a shallow inner shadow frames it. A 1.5px arc on the rim fills clockwise with the minute within the hour; finished hours sit as small dots in a row at 6 o'clock. Paused water keeps its ink, greyed; the idle basin is clear water. The pointer trails a little ink that fades. While another app is in front (or the window is hidden) the water holds still and the readout's digits keep rolling; on return the trail is drawn as it stands by then. The water is drawn in type and not simulated (since 1.7.0): the last half minute's drops, where they have drifted to, are summed onto a grid of character cells (about sixty across, finer on the full-screen face) and each cell shows a glyph from a density ramp, a faint field of `·` for clear water and `· ∙ • + * ✢ ✳ ✶ ✻ ✽` as the ink thickens, with cells near a step flickering between neighbours a few times a second. It is Canvas 2D (`src/components/ink/ascii.ts`), at about 30 fps while a drop lands and much slower in between; if the canvas can't draw, the basin falls back to a still disc.
- **Full-screen stopwatch**: "Full screen" (a quiet text button with an expand icon at the right of the Stopwatch page's title row, or F) puts the window into macOS full screen and shows only the face on the page ground, as large as the screen's height allows (`100vh − 156px`), with the readout scaled to it (digits 16% of the face, title and list in proportion). Under it, in the margin, the bar holds the primary button in the face colour (Pause, Resume or Start) and "Exit full screen" with an `esc` key cap. While the stopwatch runs and the pointer rests for 2.5 s, the bar and the cursor fade out; paused, they stay. Space starts and pauses, Esc or F leaves, and leaving the window's full screen any other way (green button, ⌃⌘F) leaves this too. No Cinder, break offer, sidebar or update button there.

- **Sanctuary**: the one fantastical page, and deliberately so (added 2026-10-16). A painted tree hollow with a moon window (`hollow-night` in dark, `hollow-day` in light, same camera, crossfaded) fills the workspace under the native title row. Everything the page shows lives on objects in the scene rather than in panels, and the scene carries three figures, all from focus time (v5, `design/mockups/v5/SPEC.md`): five lanterns are today (one per 72 minutes, all five a 6 h day, lit in code, the next glowing as it fills) with a walnut plank under them saying `2 h 20 m today`; a groove carved in the trunk with three notches and glowing sap is the long run, with one carved mark at its head (`Hearth · 12 h to Elder`); a glimmer jar on the shelf is the one place the balance shows (`Glimmer jar · 96`). Keepsakes are objects on the shelves, sill and floor, locked ones as grey silhouettes; a name and price (`Star jar · 24`) shows only on hover, focus or while its card is open, and a locked one you can afford gets a warm rim. A parchment tag on twine buys them. Time is written `2 h 20 m` (thin spaces). In-world labels use the system serif (`ui-serif`, New York) with a carved shadow; outside the scene only the Sanctuary's page title uses it, and only while the Sanctuary is open. The painted figures are cut-out raster sprites (AVIF), crossfaded by state; light, breath and particles are code. The light holds still (lanterns, moon shaft, halos, the buddies' glow); what moves is the buddies' breath and Hearth's sway (set from the canvas's tick) and the fireflies (a canvas at about 13 fps, 1x). Nothing in the scene loops in CSS, because any running loop recomposites the whole painting every display frame, and the world doesn't drift with the pointer. All of it rests while another app is in front or after 45 seconds without input. The page, its CSS and its art load the first time it opens; with the Sanctuary turned off in Settings (the Sanctuary, Hearth's badge and Cinder all go) none of it loads. While the Sanctuary is open, the sidebar and title row become the inside of the hollow (walnut at night, sunlit oak by day, lantern light on the wood, a few fireflies at night; `src/components/sanctuary/SanctuaryChrome.css`, hooked on `.app-shell.is-sanctuary`). Geometry, the system font in the nav, and view and list colours stay; everything crossfades back in 640ms on leaving.
- **Buddies**: Hearth (felted moss, ember core, buds that bloom) keeps the hollow; its mood follows the lanterns (asleep before any focus, stirring until one is lit, awake at 1–2, lively at 3–4, radiant at 5) and its form the lifetime hours (sprout, Hearth, elder). Cinder (charcoal felt, ember seams, a flame on its hood) keeps focus: it stands beside the Stopwatch basin, never on it, holding its ember while a stopwatch runs, its flame growing with the stretch; it yawns after 50 minutes without a break and offers one in a plain line under the controls, and sits with tea on a break. Hearth's face sits in a 28px circle beside Time today in the sidebar and opens the Sanctuary. Both buddies are buttons: a click makes Hearth hop (spores lift off its buds, a glad pose mid-hop) or, sitting, rock once, and Cinder does its cheer hop with a flare and sparks; each says one plain line in a parchment slip beside its head (Hearth: today's time, the next lantern, hours to the next stage, the jar; Cinder: what the stretch is). Three quick clicks turn Hearth round; the other buddy's light flares a moment later. Beside the Stopwatch, Cinder's line uses the page's own tip look. The sidebar badge bounces with a ring and, on the Sanctuary, pokes the Hearth in the scene instead of navigating. All under 1.2 s, interruptible and keyboardable; reduced motion keeps only the pose, light and bubble fades.
- **What's new tour**: coach marks over the real interface (dimmed window, spotlight on the target, a settings-popover card with Back / Next / Skip). Shown once after an update, re-opened from Settings and the Sanctuary.

## Motion

Two authored moments: completing a task (check pop, strike, row collapse) and the stopwatch basin (a drop and a ripple each second; at the minute a vortex turns the water a quarter turn and folds the trail into it; at the hour a wave runs in from the rim; starting splashes outward from the centre; pausing stills and greys the water in about 600ms; reset drains it in a swirl; the pointer stirs the water anywhere on the face and a press splashes; a task switch floats the new colour in; digits turn on drums). The basin only animates while something moves: idle and paused water settles within a couple of seconds and the frame loop stops. Everything else is 150–220ms state feedback with `cubic-bezier(.2,.8,.2,1)`. Reduced motion collapses all to 1ms and leaves the basin still with one drop at the current second.
