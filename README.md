# Knot

Knot is a native-feeling macOS task manager built with Electron, React, and TypeScript. It combines the familiar Google Tasks workflow with a calmer board layout, focused list views, local desktop persistence, reminders, recurring tasks, and carefully matched light and dark themes.

## Install the Mac app

1. Open `release/Knot-1.0.1-arm64.dmg`.
2. Drag **Knot** into **Applications**.
3. Launch Knot from the Applications folder.
4. Leave **Open at login** enabled at the bottom of Knot's sidebar.

## Update the installed app

Open Knot from Spotlight and click **Update Knot** at the bottom of the sidebar. Knot rebuilds from this project folder, safely replaces `/Applications/Knot.app`, and relaunches itself.

As a fallback, double-click `Update Knot.command` in this folder or run `npm run update:app`.

This local build is not notarized for public distribution. If macOS blocks the first launch, try opening Knot once, then go to **Apple menu > System Settings > Privacy & Security**, scroll to **Security**, and choose **Open Anyway** for Knot.

## Open automatically

Knot enables **Open at login** by default. The sidebar switch updates the native macOS login-item setting. Knot also listens for the Mac's wake event and brings its window forward when the computer resumes after the lid opens.

To verify it in macOS:

1. Open **Apple menu > System Settings**.
2. Select **General**.
3. Open **Login Items & Extensions**.
4. Confirm **Knot** appears under **Open at Login**.

Install Knot in Applications before enabling the setting so macOS records its final location. Closing and reopening the MacBook lid wakes the existing Knot process and brings its window forward; **Open at login** covers restarts, shutdowns, and signing out and back in.

## Included features

- Create, rename, and delete lists
- Open each list's three-dot menu from either the sidebar or All Tasks board
- Board, focused-list, Today, Starred, and search views
- Create, edit, complete, delete, reorder, and move tasks
- Double-click task and list names to edit them in place
- Use the calendar button in quick-add to create a task and open its details immediately
- Notes, subtasks, due date/time, reminders, and recurrence
- Manual, due-date, and starred-first sorting
- Collapsible completed tasks
- Light, dark, and system themes
- Native macOS notifications and Dock badge
- Native JSON persistence in the user's Application Support folder
- Automatic previous-save backup and final-save flush when the app closes
- Keyboard shortcuts: `Command-K` for search and `Command-N` for a new task

## Develop and build

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run package
npm run dist
```

`npm run package:signed` is available when a configured Apple signing identity and unlocked keychain are present.
