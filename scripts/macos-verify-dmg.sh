#!/usr/bin/env bash
# Controleert wat een macOS-gebruiker echt krijgt: mount de dmg, kopieer de app
# eruit en eis een geldige Developer ID-handtekening, een Gatekeeper-akkoord en
# een vastgeniet notarisatieticket. Tauri ruimt de losse .app na het bouwen van
# de dmg op, dus de dmg is de enige betrouwbare bron.
# Gebruik: scripts/macos-verify-dmg.sh <map-met-dmg>
set -euo pipefail
DMG_DIR="${1:?map met de dmg ontbreekt}"
DMG_PATH="$(find "$DMG_DIR" -name '*.dmg' -print -quit)"
test -n "$DMG_PATH" || { echo "geen dmg in $DMG_DIR" >&2; exit 1; }
echo "dmg: $DMG_PATH"
codesign --verify --verbose=2 "$DMG_PATH"

MOUNT_DIR="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT_DIR" "$DMG_PATH"
APP_SRC="$(find "$MOUNT_DIR" -maxdepth 1 -name '*.app' -print -quit)"
test -n "$APP_SRC" || { hdiutil detach "$MOUNT_DIR"; echo "geen .app in de dmg" >&2; exit 1; }
APP_PATH="${RUNNER_TEMP:-$(mktemp -d)}/verify-app/$(basename "$APP_SRC")"
mkdir -p "$(dirname "$APP_PATH")"
cp -R "$APP_SRC" "$APP_PATH"
hdiutil detach "$MOUNT_DIR"

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -dv --verbose=2 "$APP_PATH" 2>&1 | grep -E '^(Authority|TeamIdentifier|Runtime|Timestamp)'
spctl --assess --type execute --verbose=4 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
echo "macOS-handtekening en notarisatie in orde"
