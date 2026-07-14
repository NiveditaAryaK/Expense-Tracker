#!/bin/bash
# Stops and removes both background services installed by install.sh.
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

for LABEL in com.expensetracker.server com.expensetracker.watcher; do
  PLIST="$LAUNCH_AGENTS_DIR/$LABEL.plist"
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "🛑 Removed $LABEL"
  else
    echo "  (already not installed: $LABEL)"
  fi
done
