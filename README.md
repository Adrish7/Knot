# Knot

Knot is a calm, native-feeling task manager for macOS. Lists, a Today view, a calendar, starred tasks, reminders, and recurring tasks, all stored locally on your Mac.

## Download

**[Download the latest Knot for Mac](https://github.com/Adrish7/Knot/releases/latest)**

Requirements: an Apple Silicon Mac (M1 or later) running macOS 12 or newer. Intel Macs are not supported.

1. Download the `.dmg` from the link above and open it.
2. Drag **Knot** into **Applications**.
3. Open Knot from Applications or Spotlight.

### First launch

Knot is not signed with an Apple developer certificate, so macOS blocks it the first time. This only happens once.

1. Open Knot. macOS will say it cannot verify the app. Click **Done**.
2. Open **System Settings > Privacy & Security** and scroll down to the **Security** section.
3. Next to the message about Knot, click **Open Anyway**, then confirm.

If macOS instead says the app is "damaged", run this once in Terminal and open Knot again:

```bash
xattr -dr com.apple.quarantine /Applications/Knot.app
```

### Updating

Download the newest `.dmg` from the [releases page](https://github.com/Adrish7/Knot/releases) and drag Knot into Applications again, replacing the old copy. Your tasks are kept; they live in your Application Support folder, not inside the app.

## Features

- Lists with a colour each, and an All tasks board showing every list side by side
- Today, Calendar, Starred, Completed, and Recently deleted views
- Notes, subtasks, due date and time, reminders, and recurrence
- Drag to reorder tasks; manual, due-date, or starred-first sorting
- Native macOS notifications and a Dock badge
- Dark by default, with light and follow-the-Mac options
- A glowing frame around the sidebar in the app icon's colours, which you can switch off in settings
- Optional open at login
- Keyboard shortcuts: `⌘K` to search, `⌘N` for a new task
- Data saved as JSON in `~/Library/Application Support/Knot`, with an automatic backup of the previous save

## Build from source

You need Node.js 20 or newer.

```bash
git clone https://github.com/Adrish7/Knot.git
cd Knot
npm install
npm run dev        # runs Knot in development with live reload
npm run dist       # builds release/Knot-<version>-mac-arm64.dmg
```

`npm run typecheck` checks types and `npm run package` builds an unpacked `.app` in `release/`.

## Releasing

Pushing a tag like `v1.2.0` runs the GitHub Actions workflow in `.github/workflows/release.yml`, which builds the DMG and attaches it to a GitHub Release for that tag. Bump `version` in `package.json` to match before tagging.

## License

[MIT](LICENSE)
