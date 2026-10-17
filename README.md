# Knot

Knot is a calm, native-feeling task manager for macOS. Lists, a Today view, a calendar, starred tasks, reminders, recurring tasks, and a stopwatch for tracking your time, all stored locally on your Mac.

## Download

**[Download Knot 1.6.2 for Mac (Apple Silicon)](https://github.com/Adrish7/Knot/releases/latest/download/Knot-mac-arm64.dmg)**

Latest version: **1.6.2**, released October 17, 2026 ([what's new](https://github.com/Adrish7/Knot/releases/tag/v1.6.2), [all releases](https://github.com/Adrish7/Knot/releases)). The link always downloads the newest release.

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

Knot 1.4.0 and later check for a new release when they open, every few hours, and when you switch back to Knot. When one is out, an **Update Knot** row appears at the bottom of the sidebar. Click it and Knot downloads the new version, replaces itself and restarts.

From 1.5.2 there is also an update button (an arrow in a circle) at the bottom of the sidebar, next to Settings, all the time. Click it to check for a new version. When one is out it turns blue with a dot, and clicking it installs the update. In 1.4.0 to 1.5.1, check by hand from Settings > **Check for updates**.

If Knot can't replace itself, for example because it isn't in your Applications folder, it opens the new disk image instead. Quit Knot and drag the new copy into Applications.

Versions before 1.4.0 have no update button. Update those once by hand: download the newest `.dmg` from the link above and drag Knot into Applications, replacing the old copy.

Your tasks are kept either way. They live in your Application Support folder, not inside the app.

## Features

- Lists with a colour each, and an All tasks board showing every list side by side
- Today, Calendar, Starred, Completed, and Recently deleted views
- Notes, subtasks, due date and time, reminders, recurrence, and time spent
- A stopwatch for any task, plus an open stopwatch, with a day timeline of your sessions and per-day totals in the calendar
- The Sanctuary: a painted tree hollow that fills with your focus time. Five lanterns light up over a 6 hour day, Hearth grows over the long run, and glimmers buy keepsakes for the hollow
- Two buddies: Hearth keeps the hollow, and Cinder sits beside the stopwatch and offers a break after 50 minutes without one. Click either of them
- Settings has a switch for the Sanctuary and buddies. Turned off, none of it is loaded, so Knot does less work
- Tags such as Productive, Break and Relaxing, with time on break-tagged tasks counted as breaks rather than work
- Mark tasks done for the day from the stopwatch's Today list, and drag that list into any order
- Drag to reorder tasks; manual, due-date, or starred-first sorting
- Native macOS notifications and a Dock badge
- Dark by default, with light and follow-the-Mac options
- Optional open at login
- Keyboard shortcuts: `⌘K` to search, `⌘N` for a new task
- Data saved as JSON in `~/Library/Application Support/Knot`, with a backup of the previous save and a daily copy for the last 7 days in the `Backups` folder
- Export and import your data from Settings, for example to move to a new Mac
- Updates itself from GitHub Releases with one click. The update check is the only thing Knot sends over the network.

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

Pushing a tag like `v1.5.2` runs the GitHub Actions workflow in `.github/workflows/release.yml`, which builds the DMG and attaches it to a GitHub Release for that tag. Bump `version` in `package.json` to match before tagging, and update the version, date and release-notes link under Download. The download link itself points at the latest release, so it doesn't change.

The in-app updater (`electron/updater.cjs`) reads the latest release from the GitHub API. A release is offered to users once it has a `Knot-mac-arm64.dmg` attached and its tag (`vX.Y.Z`) is newer than their version. Drafts and pre-releases are never offered.

`npm run downloads` prints how many times each release has been downloaded.

## License

[MIT](LICENSE)
