#!/bin/zsh

set -e
SCRIPT_DIR="${0:A:h}"
"$SCRIPT_DIR/scripts/update-knot.sh"
print ""
print "Knot has been updated. You can close this window."
