#!/bin/bash
set -e

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' RESET='\033[0m'
ok()   { echo -e "  ${GREEN}\xe2\x9c\x93${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}\xe2\x9a\xa0${RESET}  $1"; }
die()  { echo -e "  ${RED}\xe2\x9c\x97${RESET}  $1"; exit 1; }

echo ""
echo "=================================="
echo "   BK Logistics - iOS Builder"
echo "=================================="
echo ""

# -- 1. Mode --
echo "  1) Dev  (live reload on phone)"
echo "  2) Build (production .ipa + auto-install to iPhone)"
echo ""
read -rp "  Choose [1/2]: " MODE
case "$MODE" in
  1) TAURI_CMD="dev"   ;;
  2) TAURI_CMD="build" ;;
  *) die "Invalid choice" ;;
esac

# -- 2. Backend URL --
EXISTING=""
[ -f "frontend/.env.mobile" ] && EXISTING=$(grep "^VITE_API_URL=" frontend/.env.mobile 2>/dev/null | cut -d= -f2- || true)
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

echo ""
if [ -n "$EXISTING" ]; then
  echo -e "  Last URL: ${GREEN}${EXISTING}${RESET}"
  read -rp "  Press Enter to reuse, or type new: " NEW_URL
  API_URL="${NEW_URL:-$EXISTING}"
elif [ -n "$LOCAL_IP" ]; then
  SUGGESTED="http://${LOCAL_IP}:8001"
  echo -e "  Auto-detected: ${GREEN}${SUGGESTED}${RESET}"
  read -rp "  Press Enter to use it, or type new: " NEW_URL
  API_URL="${NEW_URL:-$SUGGESTED}"
else
  read -rp "  Enter backend URL (e.g. http://192.168.1.100:8001): " API_URL
fi

# NOTE: We do NOT write .env.local (that file is read by Chrome dev too and
# would break browser login). API URL is passed to the build as an env var only.
echo "VITE_API_URL=${API_URL}" > frontend/.env.mobile
ok "Backend URL: ${API_URL}  (Chrome dev is unaffected)"

# -- 3. Checks --
echo ""
rustc --version &>/dev/null && ok "Rust OK" || die "Rust not found - https://rustup.rs"
node --version  &>/dev/null && ok "Node OK" || die "Node not found - https://nodejs.org"

for TARGET in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  if ! rustup target list --installed | grep -q "^$TARGET"; then
    warn "Installing Rust target: $TARGET"
    rustup target add "$TARGET"
    ok "$TARGET installed"
  fi
done
ok "iOS Rust targets OK"

# -- 4. npm install --
echo ""
warn "Running npm install..."
(cd frontend && npm install --silent)
ok "npm dependencies ready"

# -- 5. Build / Dev --
echo ""
echo "=================================="
echo "   Starting: tauri ios ${TAURI_CMD}"
echo "=================================="
echo ""

if [ "$TAURI_CMD" = "dev" ]; then
  cd frontend
  exec env VITE_API_URL="$API_URL" npx @tauri-apps/cli ios dev
fi

# --- Production build ---
(cd frontend && env VITE_API_URL="$API_URL" npx @tauri-apps/cli ios build)
ok "Build complete"

# -- 6. Auto-install to connected iPhone --
IPA=$(find frontend/src-tauri/gen/apple/build -name "*.ipa" 2>/dev/null | head -1 || true)
if [ -z "$IPA" ]; then
  die "IPA not found after build"
fi
echo -e "  ${GREEN}IPA:${RESET} $IPA"

if ! command -v ideviceinstaller &>/dev/null; then
  warn "Installing ideviceinstaller (one-time)..."
  brew install ideviceinstaller --quiet || die "Could not install ideviceinstaller"
fi

UDID=$(idevice_id -l 2>/dev/null | head -1 || true)
if [ -z "$UDID" ]; then
  warn "No iPhone connected via USB. Connect it and run:"
  echo "    ideviceinstaller install \"$IPA\""
  exit 0
fi

warn "Installing to iPhone (UDID: $UDID)..."
ideviceinstaller install "$IPA"
ok "Installed to iPhone!"
echo ""
echo -e "  ${YELLOW}If the app shows 'Untrusted Developer':${RESET}"
echo "  Settings > General > VPN & Device Management > trust the developer profile"
