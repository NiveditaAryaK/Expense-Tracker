#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Installs two macOS launchd background services so the tracker runs
# unattended every day, with no terminal window kept open:
#
#   com.expensetracker.server   →  keeps the Next.js app (npm run dev) alive
#   com.expensetracker.watcher  →  keeps agent/sms-watcher.js alive, polling
#                                  every 30s for new bank SMS
#
# Both are installed as per-user LaunchAgents (~/Library/LaunchAgents), set to
# start at login and restart automatically if they crash.
#
# Usage:
#   bash agent/launchd/install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$PROJECT_DIR/agent/logs"

if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "❌ Could not find node/npm on PATH. Install Node.js first." >&2
  exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

SERVER_LABEL="com.expensetracker.server"
WATCHER_LABEL="com.expensetracker.watcher"
SERVER_PLIST="$LAUNCH_AGENTS_DIR/$SERVER_LABEL.plist"
WATCHER_PLIST="$LAUNCH_AGENTS_DIR/$WATCHER_LABEL.plist"

cat > "$SERVER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SERVER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>run</string>
    <string>dev</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/server.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/server.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

cat > "$WATCHER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$WATCHER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/agent/sms-watcher.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/watcher.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/watcher.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

for LABEL in "$SERVER_LABEL" "$WATCHER_LABEL"; do
  launchctl unload "$LAUNCH_AGENTS_DIR/$LABEL.plist" 2>/dev/null || true
done

launchctl load -w "$SERVER_PLIST"
launchctl load -w "$WATCHER_PLIST"

echo "✅ Installed and started:"
echo "   $SERVER_LABEL   (npm run dev, always on)"
echo "   $WATCHER_LABEL  (SMS import, polls every 30s)"
echo
echo "Logs:"
echo "   $LOG_DIR/server.out.log   /  server.err.log"
echo "   $LOG_DIR/watcher.out.log  /  watcher.err.log"
echo
echo "⚠️  IMPORTANT — Full Disk Access:"
echo "   launchd runs the watcher as: $NODE_BIN"
echo "   Grant THAT exact binary Full Disk Access (not just Terminal):"
echo "   System Settings → Privacy & Security → Full Disk Access → + → $NODE_BIN"
echo "   (Granting Terminal alone does not cover processes launchd starts.)"
echo
echo "To stop everything: bash agent/launchd/uninstall.sh"
