#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
TARGET_APP="/Applications/Knot.app"
BUILT_APP="$PROJECT_DIR/release/mac-arm64/Knot.app"
STAGED_APP="/Applications/.Knot-update-$$.app"
BACKUP_APP="/Applications/.Knot-previous.app"
MANAGED=false

if [[ "${1:-}" == "--managed" ]]; then
  MANAGED=true
fi

cleanup_stage() {
  if [[ -d "$STAGED_APP" ]]; then
    rm -rf "$STAGED_APP"
  fi
}
trap cleanup_stage EXIT

if [[ ! -f "$PROJECT_DIR/package.json" ]] || ! /usr/bin/grep -q '"name": "knot"' "$PROJECT_DIR/package.json"; then
  print -u2 "Knot's source project was not found at $PROJECT_DIR."
  exit 1
fi

NPM_BIN=""
for candidate in /opt/homebrew/bin/npm /usr/local/bin/npm; do
  if [[ -x "$candidate" ]]; then
    NPM_BIN="$candidate"
    break
  fi
done
if [[ -z "$NPM_BIN" ]]; then
  NPM_BIN="$(command -v npm || true)"
fi
if [[ -z "$NPM_BIN" ]]; then
  print -u2 "npm could not be found. Install Node.js before updating Knot."
  exit 1
fi

# Apps launched from Finder or Spotlight receive a minimal PATH. npm's
# launcher uses `#!/usr/bin/env node`, so make the Node binary installed next
# to the selected npm executable visible before npm starts.
NODE_DIR="${NPM_BIN:h}"
export PATH="$NODE_DIR:$PATH"
if [[ ! -x "$NODE_DIR/node" ]] && ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js could not be found next to npm. Reinstall Node.js before updating Knot."
  exit 1
fi

print "Preparing the latest Knot build…"
cd "$PROJECT_DIR"
"$NPM_BIN" install --no-audit --no-fund
"$NPM_BIN" run package

if [[ ! -x "$BUILT_APP/Contents/MacOS/Knot" ]]; then
  print -u2 "The Knot build did not produce a valid app. The installed app was not changed."
  exit 1
fi

/usr/bin/ditto "$BUILT_APP" "$STAGED_APP"

if [[ "$MANAGED" != true ]]; then
  /usr/bin/osascript -e 'tell application "Knot" to quit' >/dev/null 2>&1 || true
  for _ in {1..40}; do
    /usr/bin/pgrep -x Knot >/dev/null 2>&1 || break
    /bin/sleep 0.1
  done
fi

rm -rf "$BACKUP_APP"
if [[ -d "$TARGET_APP" ]]; then
  /bin/mv "$TARGET_APP" "$BACKUP_APP"
fi

if ! /bin/mv "$STAGED_APP" "$TARGET_APP"; then
  if [[ -d "$BACKUP_APP" && ! -d "$TARGET_APP" ]]; then
    /bin/mv "$BACKUP_APP" "$TARGET_APP"
  fi
  print -u2 "The new app could not be installed. The previous app was restored."
  exit 1
fi

if [[ "$MANAGED" != true ]]; then
  /usr/bin/open "$TARGET_APP"
  rm -rf "$BACKUP_APP"
fi

trap - EXIT
print "Knot is up to date."
