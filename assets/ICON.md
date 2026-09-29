# macOS icon

`icon-source.png` preserves the original artwork. `npm run icons:build` normalizes
its opacity and visible bounds, writes matching `assets/icon.png` and
`public/icon.png`, and uses Apple's `sips` and `iconutil` to build `icon.icns`.
The build requires macOS Command Line Tools (Swift, sips, iconutil).

The output contract is a 1024×1024 sRGB PNG with an 824×824 centered icon body:
100 pixels of transparent inset on each side, fully opaque artwork inside the
body, and antialiased edges. Do not enlarge the body to fill the canvas.

The old artwork had an approximately 872×872 body at 1024px and alpha values
mostly 252–253 instead of 255 throughout the interior. On macOS 27.0 (26A428),
it appeared reduced inside a gray system tile. Normalizing the geometry and
alpha removed that tile while preserving the blue artwork.

The `.icns` contains 16, 32, 128, 256 and 512 point representations at both
1× and 2×. `build.mac.icon` explicitly selects it. Both the Dock and application
switcher use the bundle icon; there is no runtime `app.dock.setIcon` override.

## Checks

Run `npm run icons:check` after changing the icon. Packaging and distribution
run this automatically. It checks every ICNS representation, canvas dimensions,
safe-area bounds, fully opaque centers, transparent corners, and matching PNGs.
After replacing `icon-source.png`, run `npm run icons:build` first.

For a live check, quit Knot, install the new bundle/icon, register the bundle
with Launch Services and refresh the Dock. Compare Knot with T3 Code at the same
Dock size and magnification, then hold Command-Tab and compare their icon bodies.
Check for equal visible height, clean corners, no gray container, and the same
artwork in both surfaces. Check the installed and packaged ICNS hashes too;
looking only at the source PNG will miss system rendering and stale caches.

Verified on macOS 27.0 (26A428): both the live Dock and Command-Tab showed the
blue artwork at the same visible size as T3 Code, without the gray container.
Local screenshots are saved in `tmp/icon-verification/dock.png` and
`tmp/icon-verification/command-tab.png` (not committed). The source, packaged and
installed ICNS hashes matched. Typecheck, Vite build and macOS packaging passed.

## References

- [T3 Code's macOS export contract](https://github.com/pingdotgg/t3code/blob/main/assets/README.md):
  1024px canvas, 824px body, 100px inset; pre-Tahoe export for the legacy PNG path.
- [T3 Code's icon packaging](https://github.com/pingdotgg/t3code/blob/main/scripts/build-desktop-artifact.ts):
  `generateMacIconSet` uses sips and iconutil for the complete representation set.
- [Ghostty community icon build](https://github.com/lukejanicke/ghostty-app-icons/blob/main/build.sh):
  likewise packages authored iconsets with iconutil.

This is a conventional ICNS, not a layered Icon Composer asset with separate
system appearance variants. A generated candidate from this task was rejected
because its checkerboard was baked into an opaque RGB image. The shipped icon
uses the original artwork, not that candidate.
