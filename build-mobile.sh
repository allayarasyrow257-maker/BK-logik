#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BK Logistics — Mobile Build Script
#  Builds iOS and/or Android apps using Tauri 2.x
#
#  Usage:  ./build-mobile.sh
#  To change server IP later: edit frontend/.env.mobile then re-run
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' W='\033[1m' N='\033[0m'

banner() { echo -e "\n${W}${B}══ $1 ══${N}"; }
ok()     { echo -e "  ${G}✓${N}  $1"; }
warn()   { echo -e "  ${Y}⚠${N}  $1"; }
fail()   { echo -e "  ${R}✗${N}  $1"; }
die()    { fail "$1"; exit 1; }

# ── Progress bar ─────────────────────────────────────────────────────────────
# Kullanım: progress_bar <mevcut> <toplam> <mesaj>
progress_bar() {
  local cur=$1 total=$2 msg=$3
  local width=36
  local filled=$(( cur * width / total ))
  local empty=$(( width - filled ))
  local bar="${G}["
  local i
  for (( i=0; i<filled; i++ )); do bar+="█"; done
  bar+="${Y}"
  for (( i=0; i<empty; i++ )); do bar+="░"; done
  bar+="${G}]${N}"
  printf "\r  %b %d/%d  %s" "$bar" "$cur" "$total" "$msg"
}

# Arka planda çalışan PID için spinner + canlı log
# Kullanım: run_with_log <pid> <log_dosyası> <adım_sayısı> <başlık>
run_with_log() {
  local pid=$1 logf=$2 steps=$3 title=$4
  local spin_chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local si=0 last=0 step=0

  while kill -0 "$pid" 2>/dev/null; do
    # Yeni log satırlarını bas
    local total
    total=$(wc -l < "$logf" 2>/dev/null | tr -d ' ')
    if (( total > last )); then
      local new_lines
      new_lines=$(tail -n +"$((last + 1))" "$logf" 2>/dev/null || true)
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        # Brew indirme adımlarını step olarak say
        if echo "$line" | grep -qE "==>|Downloading|Installing|Pouring|Linking|Already installed"; then
          (( step++ )) || true
          (( step > steps )) && step=$steps
        fi
        # Satırı temizlenmiş halde göster
        printf "\r\033[K  ${C}│${N} %s\n" "$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-72)"
      done <<< "$new_lines"
      last=$total
    fi
    # Spinner + progress
    local sc="${spin_chars:$(( si % ${#spin_chars} )):1}"
    (( step > 0 )) && progress_bar "$step" "$steps" "$title" || printf "\r  ${Y}%s${N}  %s..." "$sc" "$title"
    (( si++ )) || true
    sleep 0.12
  done
  printf "\r\033[K"  # spinner satırını temizle
  wait "$pid"
}

# ── Doğrudan Eclipse Temurin JDK 21 indir (Homebrew yoksa / başarısızsa) ─────
_download_jdk_direct() {
  local ARCH ARCH_ALIAS JDK_URL JDK_TAR TOTAL_BYTES TOTAL_MB INSTALL_DIR head_len
  ARCH=$(uname -m)
  [ "$ARCH" = "arm64" ] && ARCH_ALIAS="aarch64" || ARCH_ALIAS="x64"
  JDK_URL="https://api.adoptium.net/v3/binary/latest/21/ga/mac/${ARCH_ALIAS}/jdk/hotspot/normal/eclipse"
  JDK_TAR="/tmp/jdk21-$$.tar.gz"
  local EST_MB=190

  echo -e "\n  ${C}Eclipse Temurin JDK 21 LTS (${ARCH_ALIAS}) indiriliyor (~${EST_MB} MB)...${N}"

  # HEAD isteği ile gerçek dosya boyutunu al (5 sn timeout, başarısızsa tahmini kullan)
  head_len=$(curl -sIL --max-time 5 "$JDK_URL" 2>/dev/null \
    | grep -i "^content-length:" | tail -1 | awk '{print $2}' | tr -d '\r\n')
  TOTAL_BYTES=${head_len:-$(( EST_MB * 1024 * 1024 ))}
  (( TOTAL_BYTES < 1048576 )) && TOTAL_BYTES=$(( EST_MB * 1024 * 1024 ))
  TOTAL_MB=$(( TOTAL_BYTES / 1024 / 1024 ))

  # Arka planda indir; 0.3 s'de bir dosya boyutunu ölçerek progress bar göster
  curl -L --silent --output "$JDK_TAR" "$JDK_URL" &
  local dl_pid=$!

  while kill -0 "$dl_pid" 2>/dev/null; do
    local sz=0 mb=0 pct=0
    sz=$(stat -f%z "$JDK_TAR" 2>/dev/null || echo 0)
    [[ "$sz" =~ ^[0-9]+$ ]] || sz=0
    mb=$(( sz / 1024 / 1024 ))
    (( TOTAL_BYTES > 0 )) && pct=$(( sz * 100 / TOTAL_BYTES )) || pct=0
    (( pct > 99 )) && pct=99
    progress_bar "$pct" 100 "${mb} MB / ${TOTAL_MB} MB"
    sleep 0.3
  done
  wait "$dl_pid"
  local dl_exit=$?
  printf "\r\033[K"

  if [ $dl_exit -ne 0 ] || [ ! -s "$JDK_TAR" ]; then
    rm -f "$JDK_TAR"
    return 1
  fi

  progress_bar 100 100 "${TOTAL_MB} MB — indirme tamamlandı"
  printf "\n"

  echo -e "  ${C}JDK arşivi açılıyor...${N}"
  INSTALL_DIR="$HOME/.local/lib/jdk21"
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$JDK_TAR" -C "$INSTALL_DIR" --strip-components=1
  rm -f "$JDK_TAR"
  echo

  # macOS tarball: jdk-21.x/Contents/Home/... — strip-components=1 sonrası
  if [ -d "$INSTALL_DIR/Contents/Home" ]; then
    JAVA_HOME="$INSTALL_DIR/Contents/Home"
  else
    JAVA_HOME="$INSTALL_DIR"
  fi
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
  ok "JDK 21 kuruldu → $JAVA_HOME"
}

# ── Java uyumluluk kontrolü & otomatik kurulum ───────────────────────────────
ensure_java_compatible() {
  local GRADLE_MAX_JAVA=21

  # Mevcut Java major versiyonunu al
  local ver_str major
  ver_str=$(java -version 2>&1 | head -1 || true)
  if echo "$ver_str" | grep -q '"1\.'; then
    major=$(echo "$ver_str" | grep -oE '"1\.[0-9]+' | grep -oE '[0-9]+$')
  else
    major=$(echo "$ver_str" | grep -oE '"[0-9]+' | tr -d '"')
  fi
  major=${major:-0}

  if (( major > 0 && major <= GRADLE_MAX_JAVA )); then
    ok "Java $major — Gradle 8.x ile uyumlu"
    return 0
  fi

  if (( major > GRADLE_MAX_JAVA )); then
    warn "Java $major bulundu — Gradle 8.x yalnızca Java ≤${GRADLE_MAX_JAVA} destekler"
  else
    warn "Java bulunamadı — Java 21 LTS otomatik kuruluyor..."
  fi

  echo -e "\n  ${W}Java 21 (LTS) otomatik kuruluyor...${N}"

  # ── Yöntem 1: Homebrew ──────────────────────────────────────────────────────
  if command -v brew &>/dev/null; then
    local OPENJDK21_PREFIX
    OPENJDK21_PREFIX="$(brew --prefix openjdk@21 2>/dev/null || echo /opt/homebrew/opt/openjdk@21)"

    if brew list openjdk@21 &>/dev/null 2>&1; then
      ok "openjdk@21 zaten kurulu (Homebrew)"
      export JAVA_HOME="$OPENJDK21_PREFIX"
    else
      echo -e "  ${C}Homebrew deposu güncelleniyor...${N}"
      local upd_log="/tmp/brew-update-$$.log"
      brew update > "$upd_log" 2>&1 &
      local upd_pid=$!
      run_with_log "$upd_pid" "$upd_log" 3 "brew update"
      wait "$upd_pid" || true
      rm -f "$upd_log"
      echo

      echo -e "  ${C}openjdk@21 indiriliyor (~200 MB)...${N}"
      local inst_log="/tmp/brew-jdk21-$$.log"
      brew install openjdk@21 > "$inst_log" 2>&1 &
      local inst_pid=$!
      run_with_log "$inst_pid" "$inst_log" 7 "openjdk@21 kuruluyor"
      local inst_exit=$?
      rm -f "$inst_log"

      if (( inst_exit != 0 )) || ! brew list openjdk@21 &>/dev/null 2>&1; then
        echo
        warn "Homebrew kurulumu tamamlanamadı — Eclipse Temurin'den doğrudan indiriliyor..."
        _download_jdk_direct \
          || die "Java 21 kurulamadı. Manuel kur: https://adoptium.net/temurin/releases/"
      else
        echo
        ok "openjdk@21 kuruldu (Homebrew)"
        export JAVA_HOME="$OPENJDK21_PREFIX"
      fi
    fi
  else
    # ── Yöntem 2: Doğrudan Eclipse Temurin (Homebrew yok) ───────────────────
    warn "Homebrew bulunamadı — Eclipse Temurin'den doğrudan indiriliyor..."
    _download_jdk_direct \
      || die "Java 21 kurulamadı. Manuel kur: https://adoptium.net/temurin/releases/"
  fi

  ok "JAVA_HOME → ${JAVA_HOME:-bilinmiyor}"

  # Gradle wrapper'ın da bu JDK'yı kullanması için gradle.properties'e ekle
  local GRADLE_PROPS
  GRADLE_PROPS=$(find "$SCRIPT_DIR/frontend/src-tauri/gen/android" \
    -name "gradle.properties" -maxdepth 2 2>/dev/null | head -1 || true)
  if [ -n "$GRADLE_PROPS" ] && [ -n "${JAVA_HOME:-}" ]; then
    if ! grep -q "org.gradle.java.home" "$GRADLE_PROPS" 2>/dev/null; then
      printf '\norg.gradle.java.home=%s\n' "$JAVA_HOME" >> "$GRADLE_PROPS"
      ok "gradle.properties ← org.gradle.java.home ayarlandı"
    else
      sed -i '' "s|org.gradle.java.home=.*|org.gradle.java.home=$JAVA_HOME|" "$GRADLE_PROPS"
      ok "gradle.properties ← org.gradle.java.home güncellendi"
    fi
  fi
}

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
  1) BUILD_IOS=true      ; echo -e "\n  ${G}→ iOS${N}" ;;
  2) BUILD_ANDROID=true  ; echo -e "\n  ${G}→ Android${N}" ;;
  3) BUILD_IOS=true; BUILD_ANDROID=true; echo -e "\n  ${G}→ iOS + Android${N}" ;;
  *) die "Invalid choice. Enter 1, 2 or 3." ;;
esac

# ── 2. Backend server URL ────────────────────────────────────────────────────
banner "Backend Server"
echo -e "  ${W}The FastAPI backend must be reachable from the phone.${N}"
echo -e "  Port 8001 is the default. Phone and computer must be on the same WiFi."
echo

# Check for existing .env.mobile
EXISTING_URL=""
if [ -f "$FRONTEND/.env.mobile" ]; then
  EXISTING_URL=$(grep "^VITE_API_URL=" "$FRONTEND/.env.mobile" 2>/dev/null | cut -d= -f2- || true)
fi

# Auto-detect local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null \
  || ipconfig getifaddr en1 2>/dev/null \
  || ipconfig getifaddr en2 2>/dev/null \
  || echo "")

if [ -n "$EXISTING_URL" ]; then
  echo -e "  Last used: ${G}${EXISTING_URL}${N}"
  read -rp "  Press Enter to reuse, or type new URL (http://IP:PORT): " NEW_URL
  API_URL="${NEW_URL:-$EXISTING_URL}"
elif [ -n "$LOCAL_IP" ]; then
  SUGGESTED="http://${LOCAL_IP}:8001"
  echo -e "  Auto-detected IP: ${G}${LOCAL_IP}${N}"
  read -rp "  Press Enter to use ${SUGGESTED}, or type a different URL: " NEW_URL
  API_URL="${NEW_URL:-$SUGGESTED}"
else
  read -rp "  Enter backend URL (e.g. http://192.168.1.100:8001): " API_URL
fi

echo
echo -e "  ${W}Backend URL:${N} ${G}${API_URL}${N}"

# Persist — easy to edit next time without re-running full setup
echo "VITE_API_URL=${API_URL}" > "$FRONTEND/.env.mobile"
ok "Saved to frontend/.env.mobile (edit this file to change IP later)"

# ── 3. Environment ───────────────────────────────────────────────────────────
banner "Environment Setup"

export ANDROID_HOME="$HOME/Library/Android/sdk"
# Pick latest NDK version
NDK_VER=$(ls "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$NDK_VER" ]; then
  export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VER"
else
  export NDK_HOME=""
fi

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Java home — prefer java_home helper, fall back to JAVA_HOME if already set
if /usr/libexec/java_home &>/dev/null 2>&1; then
  export JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null)"
fi

ok "ANDROID_HOME = $ANDROID_HOME"
ok "NDK_HOME     = ${NDK_HOME:-not found}"
ok "JAVA_HOME    = ${JAVA_HOME:-not set}"

# Java versiyonunu doğrula; uyumsuzsa Java 21 otomatik indir
ensure_java_compatible

# ── 4. Prerequisites ─────────────────────────────────────────────────────────
banner "Checking Prerequisites"

chk() {
  local name=$1 cmd=$2 fix=$3 fatal=${4:-no}
  if eval "$cmd" &>/dev/null; then ok "$name"
  else
    fail "$name — $fix"
    [ "$fatal" = "yes" ] && exit 1
  fi
}

chk "Rust"    "rustc --version"     "Install: https://rustup.rs"   yes
chk "Node"    "node --version"      "Install: https://nodejs.org"  yes
chk "npm"     "npm --version"       "Comes with Node"              yes

if $BUILD_IOS; then
  chk "Xcode"     "xcodebuild -version"      "Install Xcode from App Store"             yes
  chk "CocoaPods" "pod --version"            "Run: sudo gem install cocoapods"
  chk "xcrun"     "xcrun --version"          "Part of Xcode command-line tools"         yes

  # Install iOS Rust targets if missing
  IOS_TARGETS="aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios"
  MISSING_IOS=""
  for t in $IOS_TARGETS; do
    rustup target list --installed | grep -q "^$t" || MISSING_IOS="$MISSING_IOS $t"
  done
  if [ -n "$MISSING_IOS" ]; then
    warn "Installing missing iOS Rust targets:${MISSING_IOS}"
    rustup target add $MISSING_IOS
    ok "iOS Rust targets installed"
  else
    ok "iOS Rust targets (aarch64-apple-ios, sim)"
  fi
fi

if $BUILD_ANDROID; then
  chk "Android SDK"  "[ -d '$ANDROID_HOME' ]"              "Install Android Studio"         yes
  chk "NDK"         "[ -n '${NDK_HOME}' ] && [ -d '${NDK_HOME}' ]" "Install NDK via Android Studio" yes
  chk "Java (≤21)"   "java -version 2>&1 | grep -qE '\"(1[0-9]|2[01])\\.'" \
                   "Java 17-21 gerekli — yukarıdaki adım başarısız olmuş olabilir" yes

  # Verify Android Rust targets
  ANDROID_TARGETS="aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android"
  MISSING_AND=""
  for t in $ANDROID_TARGETS; do
    rustup target list --installed | grep -q "^$t" || MISSING_AND="$MISSING_AND $t"
  done
  if [ -n "$MISSING_AND" ]; then
    warn "Installing missing Android Rust targets:${MISSING_AND}"
    rustup target add $MISSING_AND
    ok "Android Rust targets installed"
  else
    ok "Android Rust targets (4 ABIs)"
  fi
fi

# ── 5. npm install ───────────────────────────────────────────────────────────
banner "Installing Dependencies"
cd "$FRONTEND"
npm install --prefer-offline 2>&1 | grep -E "added|updated|audited|warn|error" || true
ok "npm dependencies ready"

# ── 6. Generate app icons ────────────────────────────────────────────────────
banner "App Icons"
if [ -f "public/LOGO_inner.png" ]; then
  npx @tauri-apps/cli icon public/LOGO_inner.png 2>&1 | grep -v "^$" || true
  ok "Icons generated into src-tauri/icons/"
else
  warn "public/LOGO_inner.png not found — using placeholder icons"
fi

# ── 7. Write active .env.local for this build ────────────────────────────────
cp "$FRONTEND/.env.mobile" "$FRONTEND/.env.local"
ok "API URL injected: $API_URL"

# ── 8. Helper: patch Android cleartext HTTP ──────────────────────────────────
patch_android_http() {
  local NET_CFG="src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml"
  local MANIFEST="src-tauri/gen/android/app/src/main/AndroidManifest.xml"

  mkdir -p "$(dirname "$NET_CFG")"
  cat > "$NET_CFG" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow HTTP to the local BK Logistics backend server on the same LAN -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
XML
  ok "Android network_security_config.xml written"

  if [ -f "$MANIFEST" ] && ! grep -q "networkSecurityConfig" "$MANIFEST"; then
    sed -i '' 's/<application /<application android:networkSecurityConfig="@xml\/network_security_config" /' "$MANIFEST"
    ok "AndroidManifest.xml patched for network security config"
  fi
}

# ── 9. Helper: patch iOS ATS (allow HTTP) ────────────────────────────────────
patch_ios_http() {
  local INFO_PLIST
  INFO_PLIST=$(find src-tauri/gen/apple -name "Info.plist" 2>/dev/null | grep -v "test" | head -1 || true)
  if [ -z "$INFO_PLIST" ]; then
    warn "Info.plist not found — skipping ATS patch (HTTP may be blocked on iOS)"
    return
  fi
  if ! grep -q "NSAppTransportSecurity" "$INFO_PLIST"; then
    # Insert before closing </dict></plist>
    python3 - "$INFO_PLIST" <<'PY'
import sys, re
path = sys.argv[1]
s = open(path).read()
ats = """
\t<key>NSAppTransportSecurity</key>
\t<dict>
\t\t<key>NSAllowsArbitraryLoads</key>
\t\t<true/>
\t</dict>
"""
# Insert before last </dict>
s = re.sub(r'(</dict>\s*</plist>)', ats + r'\1', s)
open(path, 'w').write(s)
PY
    ok "iOS Info.plist ATS patched (NSAllowsArbitraryLoads)"
  else
    ok "iOS ATS already configured"
  fi
}

# ── 10. Build function ────────────────────────────────────────────────────────
build_platform() {
  local PLATFORM=$1
  banner "Building for ${PLATFORM}"

  local GEN_DIR="src-tauri/gen"
  local NEEDS_INIT=false

  if [ "$PLATFORM" = "android" ] && [ ! -d "$GEN_DIR/android" ]; then
    NEEDS_INIT=true
  fi
  if [ "$PLATFORM" = "ios" ] && [ ! -d "$GEN_DIR/apple" ]; then
    NEEDS_INIT=true
  fi

  if $NEEDS_INIT; then
    echo -e "  ${Y}→ Initializing Tauri $PLATFORM project (first time)...${N}"
    npx @tauri-apps/cli "$PLATFORM" init
    ok "Tauri $PLATFORM project initialized → src-tauri/gen/"

    # Apply HTTP patches immediately after init
    if [ "$PLATFORM" = "android" ]; then patch_android_http; fi
    if [ "$PLATFORM" = "ios" ];     then patch_ios_http; fi
  fi

  # Android: Gradle daemon JVM auto-provisioning (Java 25 host uyumu)
  if [ "$PLATFORM" = "android" ]; then
    local GRADLE_DIR="src-tauri/gen/android/gradle"
    local DAEMON_JVM="$GRADLE_DIR/gradle-daemon-jvm.properties"
    local GRADLE_PROPS="src-tauri/gen/android/gradle.properties"

    if [ -d "$GRADLE_DIR" ] && [ ! -f "$DAEMON_JVM" ]; then
      cat > "$DAEMON_JVM" <<'EOF'
# Gradle daemon JVM version (Gradle 8.8+ auto-provisioning)
# Java 25 is incompatible with Gradle 8.x Groovy compiler (class file major 69).
# This forces the daemon to use Java 21. Gradle downloads it automatically if needed.
toolchainVersion=21
EOF
      ok "Gradle daemon JVM → Java 21 (auto-provision)"
    fi

    if [ -f "$GRADLE_PROPS" ] && ! grep -q "auto-download" "$GRADLE_PROPS"; then
      printf '\n# Auto-download JVM toolchain for daemon\norg.gradle.java.installations.auto-download=true\n' >> "$GRADLE_PROPS"
      ok "gradle.properties ← auto-download etkinleştirildi"
    fi
  fi

  echo -e "  ${Y}→ Running Tauri $PLATFORM build...${N}"
  npx @tauri-apps/cli "$PLATFORM" build

  ok "$PLATFORM build complete"

  # Report output locations
  if [ "$PLATFORM" = "android" ]; then
    find "$GEN_DIR/android" -name "*.apk" 2>/dev/null | while read -r apk; do
      echo -e "  ${W}APK:${N} ${G}$apk${N}"
    done
  fi
  if [ "$PLATFORM" = "ios" ]; then
    find "$GEN_DIR/apple" -name "*.ipa" 2>/dev/null | while read -r ipa; do
      echo -e "  ${W}IPA:${N} ${G}$ipa${N}"
    done
    find "$GEN_DIR/apple" -name "*.xcarchive" 2>/dev/null | head -1 | while read -r arch; do
      echo -e "  ${W}Archive:${N} ${G}$arch${N}"
    done
  fi
}

# ── 11. Run builds ────────────────────────────────────────────────────────────
if $BUILD_IOS;     then build_platform "ios";     fi
if $BUILD_ANDROID; then build_platform "android"; fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo
echo -e "${W}${G}"
echo "╔═══════════════════════════════════════════╗"
echo "║         Build Complete! ✓                 ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${N}"
echo -e "  Backend:   ${G}${API_URL}${N}"
echo -e "  Change IP: ${Y}edit frontend/.env.mobile${N} → re-run ./build-mobile.sh"
echo
