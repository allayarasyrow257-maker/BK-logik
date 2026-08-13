#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BK Logistics — Mobile Build Script  (Tauri 2.x · iOS & Android)
#
#  Usage:  ./build-mobile.sh
#  Change server IP later: edit frontend/.env.mobile → re-run
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' W='\033[1m' N='\033[0m'
banner() { echo -e "\n${W}${B}══ $1 ══${N}"; }
ok()     { echo -e "  ${G}✓${N}  $1"; }
warn()   { echo -e "  ${Y}⚠${N}  $1"; }
die()    { echo -e "  ${R}✗${N}  $1"; exit 1; }

echo -e "${W}${B}"
echo "╔═══════════════════════════════════════════╗"
echo "║       BK Logistics — Mobile Builder       ║"
echo "║       Tauri 2.x  ·  iOS & Android         ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${N}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"

# ── 1. Platform ──────────────────────────────────────────────────────────────
banner "Platform Selection"
echo "  1) iOS only"
echo "  2) Android only"
echo "  3) Both iOS and Android"
echo
read -rp "  Enter choice [1/2/3]: " CHOICE
BUILD_IOS=false; BUILD_ANDROID=false
case "$CHOICE" in
  1) BUILD_IOS=true;                     echo -e "\n  ${G}→ iOS${N}" ;;
  2) BUILD_ANDROID=true;                 echo -e "\n  ${G}→ Android${N}" ;;
  3) BUILD_IOS=true; BUILD_ANDROID=true; echo -e "\n  ${G}→ iOS + Android${N}" ;;
  *) die "Invalid choice. Enter 1, 2 or 3." ;;
esac

# ── 2. Apple Team ID (iOS only) ───────────────────────────────────────────────
APPLE_TEAM_ID=""
if $BUILD_IOS; then
  banner "Apple Developer Team ID"

  # Try to read saved team ID
  SAVED_TEAM=""
  if [ -f "$FRONTEND/.env.mobile" ]; then
    SAVED_TEAM=$(grep "^APPLE_TEAM_ID=" "$FRONTEND/.env.mobile" 2>/dev/null | cut -d= -f2- || true)
  fi

  echo -e "  ${W}Where to find your Team ID:${N}"
  echo -e "  → developer.apple.com → Account → Membership → Team ID"
  echo -e "  → Xcode → Settings → Accounts → select account → Team ID"
  echo -e "  It looks like: ${Y}XXXXXXXXXX${N}  (10 characters)"
  echo

  if [ -n "$SAVED_TEAM" ]; then
    echo -e "  Last used Team ID: ${G}${SAVED_TEAM}${N}"
    read -rp "  Press Enter to reuse, or type new Team ID: " NEW_TEAM
    APPLE_TEAM_ID="${NEW_TEAM:-$SAVED_TEAM}"
  else
    read -rp "  Enter Apple Team ID: " APPLE_TEAM_ID
  fi

  if [ -z "$APPLE_TEAM_ID" ]; then
    die "Apple Team ID is required for iOS builds. Get it from developer.apple.com"
  fi

  ok "Team ID: $APPLE_TEAM_ID"

  # Inject team ID into tauri.conf.json
  python3 - "$FRONTEND/src-tauri/tauri.conf.json" "$APPLE_TEAM_ID" <<'PY'
import sys, json
path, team = sys.argv[1], sys.argv[2]
conf = json.load(open(path))
conf.setdefault("bundle", {}).setdefault("iOS", {})["developmentTeam"] = team
json.dump(conf, open(path, "w"), indent=2)
print(f"  tauri.conf.json updated with team: {team}")
PY
fi

# ── 3. Backend server URL ────────────────────────────────────────────────────
banner "Backend Server URL"
echo -e "  ${W}FastAPI backend (port 8001) must be reachable from the phone.${N}"
echo -e "  Phone and computer must be on the same WiFi network."
echo

EXISTING_URL=""
[ -f "$FRONTEND/.env.mobile" ] && EXISTING_URL=$(grep "^VITE_API_URL=" "$FRONTEND/.env.mobile" 2>/dev/null | cut -d= -f2- || true)
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

if [ -n "$EXISTING_URL" ]; then
  echo -e "  Last used: ${G}${EXISTING_URL}${N}"
  read -rp "  Press Enter to reuse, or type new URL: " NEW_URL
  API_URL="${NEW_URL:-$EXISTING_URL}"
elif [ -n "$LOCAL_IP" ]; then
  SUGGESTED="http://${LOCAL_IP}:8001"
  echo -e "  Auto-detected IP: ${G}${LOCAL_IP}${N}"
  read -rp "  Press Enter to use ${SUGGESTED}, or type different: " NEW_URL
  API_URL="${NEW_URL:-$SUGGESTED}"
else
  read -rp "  Enter backend URL (e.g. http://192.168.1.100:8001): " API_URL
fi

echo -e "\n  ${W}Backend URL:${N} ${G}${API_URL}${N}"

# Persist both settings
{
  echo "VITE_API_URL=${API_URL}"
  [ -n "$APPLE_TEAM_ID" ] && echo "APPLE_TEAM_ID=${APPLE_TEAM_ID}"
} > "$FRONTEND/.env.mobile"
ok "Saved to frontend/.env.mobile  (edit to change IP/Team ID later)"

# ── 4. Environment ───────────────────────────────────────────────────────────
banner "Environment Setup"
export ANDROID_HOME="$HOME/Library/Android/sdk"
NDK_VER=$(ls "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -1 || true)
[ -n "$NDK_VER" ] && export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VER" || export NDK_HOME=""
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
/usr/libexec/java_home &>/dev/null && export JAVA_HOME="$(/usr/libexec/java_home)"
ok "ANDROID_HOME = $ANDROID_HOME"
ok "NDK_HOME     = ${NDK_HOME:-not found}"
ok "JAVA_HOME    = ${JAVA_HOME:-not set}"

# ── 5. Prerequisites ─────────────────────────────────────────────────────────
banner "Prerequisites"

chk() {
  local name=$1 cmd=$2 fix=$3 fatal=${4:-no}
  if eval "$cmd" &>/dev/null; then ok "$name"
  else echo -e "  ${R}✗${N}  $name — $fix"; [ "$fatal" = "yes" ] && exit 1; fi
}

chk "Rust" "rustc --version" "Install: https://rustup.rs" yes
chk "Node" "node --version"  "Install: https://nodejs.org" yes

if $BUILD_IOS; then
  chk "Xcode"     "xcodebuild -version" "Install Xcode from App Store" yes
  chk "CocoaPods" "pod --version"       "sudo gem install cocoapods"
  MISSING=""
  for t in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
    rustup target list --installed | grep -q "^$t" || MISSING="$MISSING $t"
  done
  if [ -n "$MISSING" ]; then
    warn "Installing iOS Rust targets:${MISSING}"
    rustup target add $MISSING
    ok "iOS Rust targets installed"
  else
    ok "iOS Rust targets"
  fi
fi

if $BUILD_ANDROID; then
  chk "Android SDK" "[ -d '$ANDROID_HOME' ]" "Install Android Studio" yes
  chk "NDK"         "[ -n '${NDK_HOME}' ] && [ -d '${NDK_HOME}' ]" "Install NDK" yes
  chk "Java"        "java --version" "Install JDK 17+" yes
  MISSING=""
  for t in aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android; do
    rustup target list --installed | grep -q "^$t" || MISSING="$MISSING $t"
  done
  if [ -n "$MISSING" ]; then
    warn "Installing Android Rust targets:${MISSING}"
    rustup target add $MISSING
    ok "Android Rust targets installed"
  else
    ok "Android Rust targets (4 ABIs)"
  fi
fi

# ── 6. npm install ───────────────────────────────────────────────────────────
banner "Installing npm Dependencies"
cd "$FRONTEND"
npm install 2>&1 | grep -E "added|updated|warn ERR" || true
ok "npm dependencies ready"

# ── 7. Icons — make square first, then generate ──────────────────────────────
banner "App Icons"
if [ -f "public/LOGO_inner.png" ]; then
  # tauri icon requires a square source — pad if needed
  python3 - <<'PY'
from PIL import Image
from pathlib import Path
src = Path("public/LOGO_inner.png")
im  = Image.open(src).convert("RGBA")
w, h = im.size
if w == h:
    print(f"  Image already square ({w}×{h})")
else:
    sz = max(w, h)
    sq = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    sq.paste(im, ((sz - w) // 2, (sz - h) // 2))
    sq.save("public/LOGO_square_tauri.png")
    print(f"  Padded {w}×{h} → {sz}×{sz} (public/LOGO_square_tauri.png)")
PY
  # Use square version if it was created
  ICON_SRC="public/LOGO_inner.png"
  [ -f "public/LOGO_square_tauri.png" ] && ICON_SRC="public/LOGO_square_tauri.png"
  npx @tauri-apps/cli icon "$ICON_SRC" 2>&1 | grep -v "^$" || true
  ok "Icons generated → src-tauri/icons/"
else
  warn "public/LOGO_inner.png not found — using existing icons"
fi

# ── 8. Inject API URL ────────────────────────────────────────────────────────
cp "$FRONTEND/.env.mobile" "$FRONTEND/.env.local"
ok "VITE_API_URL=$API_URL active for this build"

# ── 9. Helpers ───────────────────────────────────────────────────────────────
patch_android_http() {
  local NET="src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml"
  local MAN="src-tauri/gen/android/app/src/main/AndroidManifest.xml"
  mkdir -p "$(dirname "$NET")"
  cat > "$NET" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors><certificates src="system"/></trust-anchors>
    </base-config>
</network-security-config>
XML
  ok "Android: cleartext HTTP enabled"
  if [ -f "$MAN" ] && ! grep -q "networkSecurityConfig" "$MAN"; then
    sed -i '' 's/<application /<application android:networkSecurityConfig="@xml\/network_security_config" /' "$MAN"
    ok "Android: AndroidManifest.xml patched"
  fi
}

patch_ios_http() {
  local INFO
  INFO=$(find src-tauri/gen/apple -name "Info.plist" 2>/dev/null | grep -v "test" | head -1 || true)
  [ -z "$INFO" ] && { warn "Info.plist not found"; return; }
  if ! grep -q "NSAppTransportSecurity" "$INFO"; then
    python3 - "$INFO" <<'PY'
import sys, re
path = sys.argv[1]
s = open(path).read()
ats = "\n\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t</dict>"
s = re.sub(r'(</dict>\s*</plist>)', ats + r'\n\1', s)
open(path, 'w').write(s)
PY
    ok "iOS: NSAllowsArbitraryLoads added"
  else
    ok "iOS: ATS already configured"
  fi
}

# ── 10. Build ────────────────────────────────────────────────────────────────
build_platform() {
  local PLAT=$1
  banner "Building → $PLAT"

  local NEEDS_INIT=false
  [ "$PLAT" = "android" ] && [ ! -d "src-tauri/gen/android" ] && NEEDS_INIT=true
  [ "$PLAT" = "ios"     ] && [ ! -d "src-tauri/gen/apple"   ] && NEEDS_INIT=true

  if $NEEDS_INIT; then
    warn "First-time init — this may take a few minutes..."
    npx @tauri-apps/cli "$PLAT" init
    ok "Tauri $PLAT project initialized"
    [ "$PLAT" = "android" ] && patch_android_http
    [ "$PLAT" = "ios"     ] && patch_ios_http
  fi

  npx @tauri-apps/cli "$PLAT" build

  ok "$PLAT build complete"
  if [ "$PLAT" = "android" ]; then
    find src-tauri/gen/android -name "*.apk" 2>/dev/null | while read f; do echo -e "  ${W}APK:${N} ${G}$f${N}"; done
  fi
  if [ "$PLAT" = "ios" ]; then
    find src-tauri/gen/apple -name "*.ipa" -o -name "*.xcarchive" 2>/dev/null | head -3 | while read f; do echo -e "  ${W}Output:${N} ${G}$f${N}"; done
  fi
}

$BUILD_IOS     && build_platform "ios"
$BUILD_ANDROID && build_platform "android"

# ── Done ─────────────────────────────────────────────────────────────────────
echo -e "\n${W}${G}"
echo "╔═══════════════════════════════════════════╗"
echo "║         Build Complete!  ✓                ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${N}"
echo -e "  Backend:    ${G}${API_URL}${N}"
echo -e "  Change IP:  ${Y}edit frontend/.env.mobile${N}  →  re-run ./build-mobile.sh"
[ -n "$APPLE_TEAM_ID" ] && echo -e "  Team ID:    ${G}${APPLE_TEAM_ID}${N}  (saved in .env.mobile)"
