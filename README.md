# Knot

Knot is a calm, native-feeling task manager for macOS. Lists, a Today view, a calendar, starred tasks, reminders, and recurring tasks, all stored locally on your Mac.

## Download

**[Download Knot for Mac (Apple Silicon)](https://github.com/Adrish7/Knot/releases/latest/download/Knot-mac-arm64.dmg)**

This link always downloads the newest release.

Requirements: an Apple Silicon Mac (M1 or later) running macOS 12 or newer. Intel Macs are not supported.

1. Download the `.dmg` from the link above and open it.
2. Drag **Knot** into **Applications**, then eject the disk image. Don't run Knot from inside the disk image.
3. Open Knot from Applications or Spotlight.

### First launch

Knot is not signed with an Apple developer certificate, so macOS blocks it the first time. This only happens once.

1. Open Knot. macOS will say it cannot verify the app. Click **Done**.
2. Open **System Settings > Privacy & Security** and scroll down to the **Security** section.
3. Next to the message about Knot, click **Open Anyway**, then confirm.

Downloads of v1.3.0 and earlier could show "Knot is damaged and can't be opened" instead. Download the latest version, or run this once in Terminal and open Knot again:

```bash
xattr -dr com.apple.quarantine /Applications/Knot.app
```

### Updating

Download the newest `.dmg` from the [releases page](https://github.com/Adrish7/Knot/releases) and drag Knot into Applications again, replacing the old copy. Your tasks are kept; they live in your Application Support folder, not inside the app.

## Features

- Lists with a colour each, and an All tasks board showing every list side by side
- Today, Calendar, Starred, Completed, and Recently deleted views
- Notes, subtasks, due date and time, reminders, recurrence, and time spent
- A stopwatch for any task, plus an open stopwatch, with a day timeline of your sessions and per-day totals in the calendar
- Drag to reorder tasks; manual, due-date, or starred-first sorting
- Native macOS notifications and a Dock badge
- Dark by default, with light and follow-the-Mac options
- Optional open at login
- Keyboard shortcuts: `⌘K` to search, `⌘N` for a new task
- Data saved as JSON in `~/Library/Application Support/Knot`, with a backup of the previous save and a daily copy for the last 7 days in the `Backups` folder
- Export and import your data from Settings, for example to move to a new Mac

## Build from source

You need Node.js 20 or newer.

```bash
git clone https://github.com/Adrish7/Knot.git
cd Knot
npm install
npm run dev        # runs Knot in development with live reload
npm run dist       # builds release/Knot-mac-arm64.dmg
```

`npm run typecheck` checks types and `npm run package` builds an unpacked `.app` in `release/`.

## Releasing

Pushing a tag like `v1.2.0` runs the GitHub Actions workflow in `.github/workflows/release.yml`, which builds the DMG and attaches it to a GitHub Release for that tag. Bump `version` in `package.json` to match before tagging. The README download link points at the latest release, so it never needs editing.

`npm run downloads` prints how many times each release has been downloaded.

## License

[MIT](LICENSE)
