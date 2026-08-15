#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  BK Logistics — Android Build Script
#  Builds: APK (debug/release) + AAB (Google Play release)
#
#  Usage:
#    ./build-android.sh              # interactive
#    ./build-android.sh --apk        # APK only (debug)
#    ./build-android.sh --release    # APK + AAB signed release
#    ./build-android.sh --aab        # AAB only (Google Play)
#
#  What this script does:
#    1. Checks & auto-installs all required tools (JDK, NDK, Rust, Node, etc.)
#    2. Builds the Vite/React frontend → dist/
#    3. Runs tauri android build → APK + AAB
#    4. Shows clear output paths at the end
# ═══════════════════════════════════════════════════════════════════════════════
set -eo pipefail

# ── Colors & helpers ──────────────────────────────────────────────────────────
R='\033[0;31m'   G='\033[0;32m'   Y='\033[1;33m'
B='\033[0;34m'   C='\033[0;36m'   W='\033[1m'     N='\033[0m'

ok()      { echo -e "  ${G}✓${N}  $*"; }
warn()    { echo -e "  ${Y}⚠${N}  $*"; }
err()     { echo -e "  ${R}✗${N}  $*"; }
info()    { echo -e "  ${C}→${N}  $*"; }
die()     { echo -e "\n  ${R}FATAL:${N} $*\n"; exit 1; }
banner()  { echo -e "\n${W}${B}━━━  $1  ━━━${N}"; }
step()    { echo -e "\n${W}  [$1]${N} $2"; }

# ── Progress bar ──────────────────────────────────────────────────────────────
# progress <label> <current> <total>
progress() {
  local label="$1" cur="$2" total="$3"
  local width=40
  local filled=$(( cur * width / total ))
  local empty=$(( width - filled ))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty;  i++)); do bar+="░"; done
  local pct=$(( cur * 100 / total ))
  printf "\r  ${C}[${bar}]${N} ${W}%3d%%${N}  %s" "$pct" "$label"
  [[ "$cur" -eq "$total" ]] && echo ""
}

# spinner <pid> <label>
spinner() {
  local pid=$1 label="$2"
  local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${C}%s${N}  %s " "${frames[$((i % ${#frames[@]}))]}" "$label"
    sleep 0.1
    ((i++))
  done
  printf "\r  ${G}✓${N}  %-50s\n" "$label"
}

# run_with_spinner <label> <log_file> <cmd...>
run_with_spinner() {
  local label="$1" log="$2"; shift 2
  "$@" >"$log" 2>&1 &
  local pid=$!
  spinner "$pid" "$label"
  wait "$pid" || { err "$label failed — see log:"; cat "$log"; return 1; }
}

# download_with_progress <url> <dest>
download_with_progress() {
  local url="$1" dest="$2" label="${3:-Downloading}"
  info "$label"
  if command -v curl &>/dev/null; then
    curl -L --progress-bar -o "$dest" "$url" 2>&1 | while IFS= read -r line; do
      # curl --progress-bar outputs lines like "###...  42.5%"
      if [[ "$line" =~ ([0-9]+)\.?[0-9]*% ]]; then
        local pct="${BASH_REMATCH[1]}"
        local filled=$(( pct * 40 / 100 ))
        local bar=""; for ((i=0; i<40; i++)); do [[ $i -lt $filled ]] && bar+="█" || bar+="░"; done
        printf "\r  ${C}[%s]${N} ${W}%3d%%${N}  %s" "$bar" "$pct" "$label"
      fi
    done
    echo ""
  else
    wget -q --show-progress -O "$dest" "$url"
  fi
}

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"
ANDROID_GEN="$FRONTEND/src-tauri/gen/android"
LOG_DIR="$SCRIPT_DIR/.build-logs"
mkdir -p "$LOG_DIR"

# ── Parse args ────────────────────────────────────────────────────────────────
MODE="interactive"
BUILD_APK=true
BUILD_AAB=true
BUILD_RELEASE=false

for arg in "$@"; do
  case "$arg" in
    --apk)        BUILD_APK=true;  BUILD_AAB=false; MODE="cli" ;;
    --aab)        BUILD_APK=false; BUILD_AAB=true;  MODE="cli" ;;
    --release)    BUILD_RELEASE=true;               MODE="cli" ;;
    --debug)      BUILD_RELEASE=false;              MODE="cli" ;;
    --help|-h)
      echo "Usage: $0 [--apk|--aab|--release|--debug]"
      echo "  --apk      Build APK only"
      echo "  --aab      Build AAB only (Google Play)"
      echo "  --release  Signed release build (APK + AAB)"
      echo "  (no args)  Interactive mode"
      exit 0 ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${W}${B}"
echo "╔══════════════════════════════════════════════════╗"
echo "║      BK Logistics — Android Build Pipeline       ║"
echo "║      APK + AAB (Google Play)  ·  Tauri 2.x       ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${N}"

# ── Interactive mode ──────────────────────────────────────────────────────────
if [[ "$MODE" == "interactive" ]]; then
  banner "Build Type"
  echo -e "  ${W}1)${N} Debug APK         (quick test on device)"
  echo -e "  ${W}2)${N} Release APK       (unsigned — for direct install)"
  echo -e "  ${W}3)${N} Release AAB       (Google Play Store upload)"
  echo -e "  ${W}4)${N} Release APK + AAB (both)"
  echo
  read -rp "  Choice [1-4]: " choice
  case "$choice" in
    1) BUILD_APK=true;  BUILD_AAB=false; BUILD_RELEASE=false ;;
    2) BUILD_APK=true;  BUILD_AAB=false; BUILD_RELEASE=true  ;;
    3) BUILD_APK=false; BUILD_AAB=true;  BUILD_RELEASE=true  ;;
    4) BUILD_APK=true;  BUILD_AAB=true;  BUILD_RELEASE=true  ;;
    *) die "Invalid choice." ;;
  esac
fi

echo ""
[[ "$BUILD_APK"     == true ]] && info "Will build: APK"
[[ "$BUILD_AAB"     == true ]] && info "Will build: AAB (Google Play)"
[[ "$BUILD_RELEASE" == true ]] && info "Build type: RELEASE" || info "Build type: DEBUG"

# ── Environment setup ─────────────────────────────────────────────────────────
banner "Environment"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_HOME

# Find latest NDK
if [[ -d "$ANDROID_HOME/ndk" ]]; then
  NDK_VER=$(ls "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -1)
  [[ -n "$NDK_VER" ]] && export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VER"
fi

# Java home (macOS)
if /usr/libexec/java_home &>/dev/null 2>&1; then
  export JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null)"
fi

# PATH additions
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/tools/bin:$PATH"
[[ -d "$HOME/.cargo/bin" ]] && export PATH="$HOME/.cargo/bin:$PATH"

info "ANDROID_HOME = ${ANDROID_HOME}"
info "NDK_HOME     = ${NDK_HOME:-not found}"
info "JAVA_HOME    = ${JAVA_HOME:-not set}"

# ── Prerequisite checks & auto-fix ───────────────────────────────────────────
banner "Prerequisites"

MISSING_FATAL=()
WARNINGS=()

# ─ Helper: check + optional auto-install ──────────────────────────────────────
check_tool() {
  local name="$1" check_cmd="$2" install_cmd="$3" fatal="${4:-yes}"
  if eval "$check_cmd" &>/dev/null 2>&1; then
    local ver
    ver=$(eval "$check_cmd" 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || echo "ok")
    ok "$name  ${C}($ver)${N}"
    return 0
  fi

  if [[ -n "$install_cmd" ]]; then
    warn "$name not found — attempting auto-install..."
    if eval "$install_cmd" 2>&1 | tee "$LOG_DIR/${name}-install.log" | grep -E "installing|installed|success|error" | head -5; then
      if eval "$check_cmd" &>/dev/null 2>&1; then
        ok "$name installed"
        return 0
      fi
    fi
    err "$name install failed — see $LOG_DIR/${name}-install.log"
  fi

  if [[ "$fatal" == "yes" ]]; then
    MISSING_FATAL+=("$name")
    err "$name  ${R}MISSING (required)${N}"
  else
    WARNINGS+=("$name")
    warn "$name  ${Y}MISSING (optional)${N}"
  fi
  return 1
}

# ─ Node.js ────────────────────────────────────────────────────────────────────
check_tool "Node.js (≥18)" \
  "node --version" \
  "brew install node" \
  "yes"

# ─ Rust / Cargo ───────────────────────────────────────────────────────────────
check_tool "Rust / Cargo" \
  "rustc --version" \
  'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --quiet && source "$HOME/.cargo/env"' \
  "yes"

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

# ─ JDK 17+ ───────────────────────────────────────────────────────────────────
step "JDK" "Checking Java version..."
JAVA_OK=false
if command -v java &>/dev/null 2>&1; then
  JAVA_VER=$(java -version 2>&1 | grep -oE 'version "[0-9]+' | grep -oE '[0-9]+' | head -1)
  if [[ "${JAVA_VER:-0}" -ge 17 ]]; then
    ok "JDK $JAVA_VER  ${C}($JAVA_HOME)${N}"
    JAVA_OK=true
  else
    warn "JDK $JAVA_VER found but need ≥17"
  fi
fi

if [[ "$JAVA_OK" == false ]]; then
  warn "JDK 17+ not found — trying to install via Homebrew..."
  if command -v brew &>/dev/null; then
    echo ""
    info "Running: brew install --cask temurin@17"
    echo ""
    if brew install --cask temurin@17 2>&1 | while IFS= read -r line; do
        echo "    $line"
        [[ "$line" =~ "==" ]] && progress "Installing JDK 17" 50 100
    done; then
      export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home)"
      progress "Installing JDK 17" 100 100
      ok "JDK 17 installed"
      JAVA_OK=true
    else
      err "Homebrew JDK install failed"
    fi
  fi

  if [[ "$JAVA_OK" == false ]]; then
    MISSING_FATAL+=("JDK 17+")
    err "JDK 17+ MISSING"
    echo ""
    echo -e "  ${W}Manual install options:${N}"
    echo -e "  ${Y}Option A${N} — Homebrew:  brew install --cask temurin@17"
    echo -e "  ${Y}Option B${N} — Download:  https://adoptium.net/temurin/releases/?version=17"
    echo -e "  ${Y}Option C${N} — SDKMAN:    sdk install java 17.0.11-tem"
    echo ""
  fi
fi

# ─ Android SDK ────────────────────────────────────────────────────────────────
step "Android SDK" "Checking $ANDROID_HOME..."
if [[ -d "$ANDROID_HOME" ]]; then
  ok "Android SDK  ${C}($ANDROID_HOME)${N}"
else
  MISSING_FATAL+=("Android SDK")
  err "Android SDK not found at $ANDROID_HOME"
  echo ""
  echo -e "  ${W}Install Android Studio → includes SDK:${N}"
  echo -e "  ${Y}https://developer.android.com/studio${N}"
  echo -e "  Then open Android Studio → SDK Manager → install:"
  echo -e "  • Android SDK Platform-Tools"
  echo -e "  • Android SDK Build-Tools (≥34)"
  echo -e "  • NDK (Side by side) — any recent version"
  echo ""
fi

# ─ NDK ────────────────────────────────────────────────────────────────────────
step "Android NDK" "Checking NDK..."
if [[ -n "${NDK_HOME:-}" ]] && [[ -d "$NDK_HOME" ]]; then
  ok "NDK  ${C}($NDK_VER)${N}"
else
  warn "NDK not found — trying sdkmanager..."
  if command -v sdkmanager &>/dev/null 2>&1; then
    echo ""
    info "Installing NDK via sdkmanager (this may take a few minutes)..."
    echo "y" | sdkmanager "ndk;26.3.11579264" 2>&1 | while IFS= read -r line; do
      if [[ "$line" =~ \[=+ ]]; then
        local pct
        pct=$(echo "$line" | grep -oE '[0-9]+%' | tr -d '%' || echo "0")
        progress "Downloading NDK" "${pct:-0}" 100
      fi
    done
    NDK_VER=$(ls "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -1)
    if [[ -n "$NDK_VER" ]]; then
      export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VER"
      ok "NDK $NDK_VER installed"
    else
      MISSING_FATAL+=("Android NDK")
      err "NDK install failed"
      echo -e "  ${Y}Manual:${N} Android Studio → SDK Manager → NDK (Side by side)"
    fi
  else
    MISSING_FATAL+=("Android NDK")
    err "NDK not found and sdkmanager unavailable"
    echo -e "  ${Y}Fix:${N} Android Studio → SDK Manager → NDK (Side by side)"
  fi
fi

# ─ Rust Android targets ────────────────────────────────────────────────────────
step "Rust Android Targets" "Checking 4 ABIs..."
RUST_TARGETS=(
  "aarch64-linux-android"
  "armv7-linux-androideabi"
  "i686-linux-android"
  "x86_64-linux-android"
)
MISSING_TARGETS=()
for t in "${RUST_TARGETS[@]}"; do
  rustup target list --installed 2>/dev/null | grep -q "^$t" || MISSING_TARGETS+=("$t")
done

if [[ ${#MISSING_TARGETS[@]} -eq 0 ]]; then
  ok "All 4 Android Rust targets installed"
else
  warn "Installing missing targets: ${MISSING_TARGETS[*]}"
  total=${#MISSING_TARGETS[@]}
  for i in "${!MISSING_TARGETS[@]}"; do
    t="${MISSING_TARGETS[$i]}"
    progress "Installing Rust targets" "$((i))" "$total"
    rustup target add "$t" &>/dev/null
  done
  progress "Installing Rust targets" "$total" "$total"
  ok "Rust Android targets installed"
fi

# ─ Gradle wrapper check ────────────────────────────────────────────────────────
step "Gradle Wrapper" "Checking gradlew..."
GRADLEW="$ANDROID_GEN/gradlew"
if [[ -f "$GRADLEW" ]]; then
  chmod +x "$GRADLEW"

  # Read which Gradle version the wrapper expects
  GRADLE_WRAPPER_PROPS="$ANDROID_GEN/gradle/wrapper/gradle-wrapper.properties"
  GRADLE_VER_EXPECTED=""
  if [[ -f "$GRADLE_WRAPPER_PROPS" ]]; then
    GRADLE_VER_EXPECTED=$(grep "distributionUrl" "$GRADLE_WRAPPER_PROPS" | grep -oE 'gradle-[0-9.]+' | head -1 | sed 's/gradle-//')
  fi

  # Check if already cached in ~/.gradle/wrapper/dists
  GRADLE_CACHE="${GRADLE_USER_HOME:-$HOME/.gradle}/wrapper/dists"
  GRADLE_CACHED=false
  [[ -n "$GRADLE_VER_EXPECTED" ]] && find "$GRADLE_CACHE" -maxdepth 1 -name "gradle-${GRADLE_VER_EXPECTED}*" 2>/dev/null | grep -q . && GRADLE_CACHED=true

  if $GRADLE_CACHED; then
    ok "Gradle ${GRADLE_VER_EXPECTED}  ${C}(cached)${N}"
  else
    if [[ -n "$GRADLE_VER_EXPECTED" ]]; then
      info "Gradle ${GRADLE_VER_EXPECTED} not cached — downloading now (~150 MB)..."
    else
      info "Downloading Gradle wrapper..."
    fi
    echo ""

    # Run gradlew --version which triggers the automatic download
    # Pipe output live so user sees download progress
    (cd "$ANDROID_GEN" && ./gradlew --version 2>&1) | while IFS= read -r line; do
      # Gradle wrapper prints download progress like:
      #   Downloading https://services.gradle.org/distributions/gradle-8.x-bin.zip
      #   ..........................................................
      #   Unzipping /Users/pc/.gradle/wrapper/dists/...
      if echo "$line" | grep -qiE "^Downloading https"; then
        printf "  ${C}↓${N}  %s
" "$line"
      elif echo "$line" | grep -qE "^\.+$"; then
        # dots = download in progress, count them as progress
        dots="${#line}"
        pct=$(( dots > 100 ? 100 : dots ))
        width=40
        filled=$(( pct * width / 100 ))
        bar=""; for ((i=0; i<width; i++)); do [[ $i -lt $filled ]] && bar+="█" || bar+="░"; done
        printf "  ${C}[%s]${N}  Downloading Gradle..." "$bar"
      elif echo "$line" | grep -qiE "^Unzipping"; then
        echo ""
        printf "  ${C}⟳${N}  Unzipping Gradle...
"
      elif echo "$line" | grep -qiE "^Gradle [0-9]"; then
        GRADLE_VER_ACTUAL=$(echo "$line" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
        echo ""
        ok "Gradle ${GRADLE_VER_ACTUAL}  ${C}(ready)${N}"
      elif echo "$line" | grep -qE "^(Build time|Revision|Kotlin|Groovy|Ant|JVM|OS)"; then
        printf "    ${C}%s${N}
" "$line"
      elif echo "$line" | grep -qi "error\|failed"; then
        printf "  ${R}%s${N}
" "$line"
      fi
    done
    echo ""
  fi
else
  warn "gradlew not found — will be generated by tauri android init"
fi

# ─ Abort if fatal deps missing ────────────────────────────────────────────────
if [[ ${#MISSING_FATAL[@]} -gt 0 ]]; then
  echo ""
  echo -e "${R}${W}═══ BUILD BLOCKED ═══${N}"
  echo ""
  err "The following required tools are missing:"
  for dep in "${MISSING_FATAL[@]}"; do
    echo -e "  ${R}•${N} $dep"
  done
  echo ""
  echo -e "  Install the missing tools above, then re-run this script."
  exit 1
fi

[[ ${#WARNINGS[@]} -gt 0 ]] && {
  echo ""
  warn "Optional tools missing (build may still succeed):"
  for w in "${WARNINGS[@]}"; do echo -e "  ${Y}•${N} $w"; done
}

# ── Backend API URL ───────────────────────────────────────────────────────────
banner "Backend URL"

EXISTING_URL=""
ENV_MOBILE="$FRONTEND/.env.mobile"
[[ -f "$ENV_MOBILE" ]] && EXISTING_URL=$(grep "^VITE_API_URL=" "$ENV_MOBILE" 2>/dev/null | cut -d= -f2-)

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

if [[ -n "$EXISTING_URL" ]]; then
  info "Last used: ${G}${EXISTING_URL}${N}"
  read -rp "  Press Enter to reuse, or type new URL: " NEW_URL
  API_URL="${NEW_URL:-$EXISTING_URL}"
elif [[ -n "$LOCAL_IP" ]]; then
  SUGGESTED="http://${LOCAL_IP}:8001"
  info "Auto-detected: ${G}${SUGGESTED}${N}"
  read -rp "  Press Enter to use this, or type different: " NEW_URL
  API_URL="${NEW_URL:-$SUGGESTED}"
else
  read -rp "  Backend URL (e.g. http://192.168.1.100:8001): " API_URL
fi

echo "VITE_API_URL=${API_URL}" > "$ENV_MOBILE"
ok "API URL: ${G}${API_URL}${N}"

# ── Signing (release builds only) ────────────────────────────────────────────
KEYSTORE_FLAGS=""
KEYSTORE_PATH=""

if [[ "$BUILD_RELEASE" == true ]]; then
  banner "Android Signing (Release)"

  KEYSTORE_SAVED=""
  [[ -f "$FRONTEND/.android-keystore.conf" ]] && KEYSTORE_SAVED="$FRONTEND/.android-keystore.conf"

  echo -e "  ${W}For Google Play, your AAB must be signed with a keystore.${N}"
  echo -e "  You can let Tauri generate a debug key (not for Play Store)"
  echo -e "  or provide your own production keystore."
  echo ""
  echo -e "  ${W}1)${N} Use existing keystore"
  echo -e "  ${W}2)${N} Generate new keystore (for testing / first-time)"
  echo -e "  ${W}3)${N} Skip signing (unsigned APK — not for Play Store)"
  echo ""
  read -rp "  Choice [1-3]: " ks_choice

  case "$ks_choice" in
    1)
      if [[ -f "$KEYSTORE_SAVED" ]]; then
        source "$KEYSTORE_SAVED"
        info "Loaded saved keystore config"
      fi

      [[ -z "${KS_PATH:-}" ]] && read -rp "  Keystore path (.jks or .keystore): " KS_PATH
      [[ -z "${KS_PASS:-}" ]] && read -rsp "  Keystore password: " KS_PASS && echo ""
      [[ -z "${KS_ALIAS:-}" ]] && read -rp "  Key alias: " KS_ALIAS
      [[ -z "${KS_KEY_PASS:-}" ]] && read -rsp "  Key password: " KS_KEY_PASS && echo ""

      if [[ ! -f "$KS_PATH" ]]; then
        die "Keystore not found: $KS_PATH"
      fi

      # Save for next run (no passwords in file for security)
      {
        echo "KS_PATH='$KS_PATH'"
        echo "KS_ALIAS='$KS_ALIAS'"
      } > "$FRONTEND/.android-keystore.conf"

      ok "Keystore: $KS_PATH  alias: $KS_ALIAS"

      # Write signing config for Gradle
      SIGNING_PROPS="$ANDROID_GEN/keystore.properties"
      {
        echo "storeFile=$(realpath "$KS_PATH")"
        echo "storePassword=$KS_PASS"
        echo "keyAlias=$KS_ALIAS"
        echo "keyPassword=$KS_KEY_PASS"
      } > "$SIGNING_PROPS"
      ok "Signing properties written → keystore.properties"
      ;;

    2)
      KS_PATH="$SCRIPT_DIR/bklogistics-release.jks"
      read -rp "  Key alias [bklogistics]: " KS_ALIAS
      KS_ALIAS="${KS_ALIAS:-bklogistics}"
      read -rsp "  Set keystore password: " KS_PASS && echo ""
      read -rsp "  Set key password: " KS_KEY_PASS && echo ""
      read -rp "  Your name (for certificate): " KS_NAME
      read -rp "  Organization [BK Logistics]: " KS_ORG
      KS_ORG="${KS_ORG:-BK Logistics}"
      read -rp "  Country code [TR]: " KS_CC
      KS_CC="${KS_CC:-TR}"

      info "Generating keystore..."
      keytool -genkeypair \
        -v \
        -keystore "$KS_PATH" \
        -alias "$KS_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass "$KS_PASS" \
        -keypass "$KS_KEY_PASS" \
        -dname "CN=$KS_NAME, O=$KS_ORG, C=$KS_CC" \
        2>&1 | grep -E "Generating|Storing|Certificate" || true
      ok "Keystore generated → $KS_PATH  ${Y}(keep this file safe!)${N}"

      SIGNING_PROPS="$ANDROID_GEN/keystore.properties"
      {
        echo "storeFile=$(realpath "$KS_PATH")"
        echo "storePassword=$KS_PASS"
        echo "keyAlias=$KS_ALIAS"
        echo "keyPassword=$KS_KEY_PASS"
      } > "$SIGNING_PROPS"
      ok "Signing properties written → keystore.properties"

      {
        echo "KS_PATH='$KS_PATH'"
        echo "KS_ALIAS='$KS_ALIAS'"
      } > "$FRONTEND/.android-keystore.conf"
      ;;

    3)
      warn "Skipping signing — output will be unsigned"
      ;;
  esac

  # Patch build.gradle.kts to use keystore.properties if we have signing setup
  if [[ -f "$ANDROID_GEN/keystore.properties" ]]; then
    BGKTS="$ANDROID_GEN/app/build.gradle.kts"
    if ! grep -q "keystoreProperties" "$BGKTS" 2>/dev/null; then
      python3 - "$BGKTS" <<'PY'
import sys, re
path = sys.argv[1]
src = open(path).read()

header = '''import java.util.Properties

'''
ks_block = '''
val keystoreProperties = Properties().also { props ->
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { props.load(it) }
}

'''
signing_block = '''
    signingConfigs {
        create("release") {
            val f = rootProject.file("keystore.properties")
            if (f.exists()) {
                storeFile     = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias      = keystoreProperties["keyAlias"] as String
                keyPassword   = keystoreProperties["keyPassword"] as String
            }
        }
    }
'''

release_signing = '            signingConfig = signingConfigs.getByName("release")\n'

# Add import if not present
if 'import java.util.Properties' not in src:
    src = header + src

# Add keystoreProperties block after imports
if 'keystoreProperties' not in src:
    src = re.sub(r'(plugins\s*\{)', ks_block + r'\1', src, count=1)

# Add signingConfigs block inside android {}
if 'signingConfigs' not in src:
    src = re.sub(r'(android\s*\{)', r'\1' + signing_block, src, count=1)

# Wire release build type to signingConfig
if 'signingConfig = signingConfigs' not in src:
    src = re.sub(
        r'(getByName\("release"\)\s*\{)',
        r'\1\n' + release_signing,
        src, count=1
    )

open(path, 'w').write(src)
print("  build.gradle.kts patched with signingConfig")
PY
      ok "build.gradle.kts patched for release signing"
    else
      ok "build.gradle.kts already has signing config"
    fi
  fi
fi

# ── Network security (allow HTTP to local backend) ────────────────────────────
banner "Android Network Config"
NET_XML="$ANDROID_GEN/app/src/main/res/xml/network_security_config.xml"
mkdir -p "$(dirname "$NET_XML")"

if [[ "$API_URL" == http://* ]]; then
  cat > "$NET_XML" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors><certificates src="system"/></trust-anchors>
    </base-config>
</network-security-config>
XML
  ok "Cleartext HTTP allowed (backend is http://...)"
else
  cat > "$NET_XML" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors><certificates src="system"/></trust-anchors>
    </base-config>
</network-security-config>
XML
  ok "HTTPS only (backend is https://...)"
fi

MAN="$ANDROID_GEN/app/src/main/AndroidManifest.xml"
if [[ -f "$MAN" ]] && ! grep -q "networkSecurityConfig" "$MAN"; then
  sed -i '' 's|<application |<application android:networkSecurityConfig="@xml/network_security_config" |' "$MAN"
  ok "AndroidManifest.xml: networkSecurityConfig applied"
fi

# ── Copy .env for the build ────────────────────────────────────────────────────
cp "$ENV_MOBILE" "$FRONTEND/.env.local"

# ── Step 1: Frontend build ────────────────────────────────────────────────────
banner "Step 1 / 3 — Frontend Build (Vite)"

cd "$FRONTEND"
info "Installing npm dependencies..."
npm install --prefer-offline 2>&1 | grep -E "^(added|updated|found|warn)" | head -5 || true

info "Building React app → dist/"
echo ""

# Streaming build with progress indication
export TAURI_ENV_PLATFORM="android"
BUILD_LOG="$LOG_DIR/vite-build.log"

npm run build 2>&1 | tee "$BUILD_LOG" | while IFS= read -r line; do
  # Show vite build progress lines
  if [[ "$line" =~ "dist/" ]] || [[ "$line" =~ "✓" ]] || [[ "$line" =~ "built in" ]] || [[ "$line" =~ "transforming" ]] || [[ "$line" =~ "rendering" ]]; then
    echo "    $line"
  fi
done

BUILD_EXIT=${PIPESTATUS[0]}
if [[ "$BUILD_EXIT" -ne 0 ]]; then
  err "Frontend build failed — full log:"
  cat "$BUILD_LOG"
  exit 1
fi

DIST_SIZE=$(du -sh "$FRONTEND/dist" 2>/dev/null | cut -f1 || echo "unknown")
ok "Frontend built successfully  ${C}(dist/ — $DIST_SIZE)${N}"

# ── Step 2: Tauri Android init (first time only) ─────────────────────────────
banner "Step 2 / 3 — Tauri Android Setup"

if [[ ! -d "$ANDROID_GEN" ]]; then
  warn "First-time setup — initializing Tauri Android project..."
  info "This downloads Gradle and compiles Rust — may take 5-10 minutes"
  echo ""

  INIT_LOG="$LOG_DIR/tauri-android-init.log"
  npx @tauri-apps/cli android init 2>&1 | tee "$INIT_LOG" | while IFS= read -r line; do
    echo "    $line"
  done

  INIT_EXIT=${PIPESTATUS[0]}
  if [[ "$INIT_EXIT" -ne 0 ]]; then
    err "tauri android init failed — log:"
    cat "$INIT_LOG"
    exit 1
  fi

  ok "Tauri Android project initialized"

  # Re-apply network security after init
  [[ -f "$NET_XML" ]] || (mkdir -p "$(dirname "$NET_XML")" && echo "reapply" > "$NET_XML")
  cp "$NET_XML" "$NET_XML"  # keep it
else
  ok "Tauri Android project already exists  ${C}(src-tauri/gen/android/)${N}"
fi

# ── Gradle wrapper download progress ──────────────────────────────────────────
GRADLE_WRAPPER_PROPS="$ANDROID_GEN/gradle/wrapper/gradle-wrapper.properties"
if [[ -f "$GRADLE_WRAPPER_PROPS" ]]; then
  GRADLE_DIST_URL=$(grep "distributionUrl" "$GRADLE_WRAPPER_PROPS" | cut -d= -f2- | tr -d '\\')
  GRADLE_DIST_URL="${GRADLE_DIST_URL//\\:/://}"
  GRADLE_VER_STRING=$(echo "$GRADLE_DIST_URL" | grep -oE 'gradle-[0-9.]+' | head -1)

  GRADLE_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"
  GRADLE_DIST_DIR="$GRADLE_HOME/wrapper/dists"

  if ! find "$GRADLE_DIST_DIR" -name "${GRADLE_VER_STRING}*.zip" 2>/dev/null | grep -q .; then
    info "Gradle $GRADLE_VER_STRING not cached — will download during build"
    info "(This is automatic — shown in build output below)"
  else
    ok "Gradle $GRADLE_VER_STRING already cached"
  fi
fi

# ── Step 3: Tauri Android build ────────────────────────────────────────────────
banner "Step 3 / 3 — Tauri Android Build"

BUILD_LOG_TAURI="$LOG_DIR/tauri-android-build.log"

# Build flags
TAURI_FLAGS=()
[[ "$BUILD_RELEASE" == true ]]  && TAURI_FLAGS+=("--release")
[[ "$BUILD_AAB"     == true ]]  && TAURI_FLAGS+=("--aab")
[[ "$BUILD_APK"     == false ]] && TAURI_FLAGS+=("--no-default-features")  # skip APK if AAB only

# Handle APK-only vs AAB-only
if [[ "$BUILD_APK" == true ]] && [[ "$BUILD_AAB" == true ]]; then
  TAURI_FLAGS+=("--apk" "--aab")
elif [[ "$BUILD_APK" == true ]]; then
  TAURI_FLAGS+=("--apk")
elif [[ "$BUILD_AAB" == true ]]; then
  TAURI_FLAGS+=("--aab")
fi
# Remove the invalid --no-default-features we might have added
TAURI_FLAGS=("${TAURI_FLAGS[@]/--no-default-features/}")

info "Running: npx @tauri-apps/cli android build ${TAURI_FLAGS[*]}"
echo ""

# Run tauri build with live output and progress detection
GRADLE_PROGRESS_TOTAL=100
GRADLE_PROGRESS_CUR=0
PHASE="compiling"

npx @tauri-apps/cli android build "${TAURI_FLAGS[@]}" 2>&1 | tee "$BUILD_LOG_TAURI" | while IFS= read -r line; do
  # Skip truly empty lines
  [[ -z "${line// }" ]] && continue

  # ── Rust / Cargo lines ───────────────────────────────────────────────────
  if echo "$line" | grep -qE "^Compiling "; then
    pkg=$(echo "$line" | awk '{print $2}')
    ver=$(echo "$line" | awk '{print $3}')
    printf "\r  ${C}⟳${N}  Compiling %-35s ${C}%s${N}   " "$pkg" "$ver"
    continue
  fi

  if echo "$line" | grep -qE "^Finished |^    Finished "; then
    echo ""
    ok "Rust compiled successfully"
    continue
  fi

  if echo "$line" | grep -qE "^   Compiling|^error\[|^warning\[|^note:"; then
    echo "  $line"
    continue
  fi

  # ── Gradle task lines (e.g. "> Task :app:compileDebugKotlin") ───────────
  if echo "$line" | grep -qE "^> Task :|^\[:"; then
    task=$(echo "$line" | sed "s/^> Task //")
    printf "\r  ${B}⟳${N}  %-60s" "$task"
    continue
  fi

  # ── Gradle download progress ─────────────────────────────────────────────
  if echo "$line" | grep -qiE "^Downloading https|^Download "; then
    echo ""
    printf "  ${C}↓${N}  %s\n" "$line"
    continue
  fi

  # Gradle dot-style progress (.......)
  if echo "$line" | grep -qE "^\.{3,}"; then
    dots="${#line}"
    pct=$(( dots > 60 ? 100 : dots * 100 / 60 ))
    width=40; filled=$(( pct * width / 100 ))
    bar=""; for ((i=0; i<width; i++)); do [[ $i -lt $filled ]] && bar+="█" || bar+="░"; done
    printf "\r  ${C}[%s]${N} %3d%%  Downloading..." "$bar" "$pct"
    continue
  fi

  # Gradle percentage progress  e.g. "<==========----> 72% EXECUTING"
  if echo "$line" | grep -qE "[0-9]+% (EXECUTING|CONFIGURING|WAITING)"; then
    pct=$(echo "$line" | grep -oE "[0-9]+%" | tr -d "%" | head -1)
    phase=$(echo "$line" | grep -oE "(EXECUTING|CONFIGURING|WAITING)" | head -1)
    width=40; filled=$(( pct * width / 100 ))
    bar=""; for ((i=0; i<width; i++)); do [[ $i -lt $filled ]] && bar+="█" || bar+="░"; done
    printf "\r  ${C}[%s]${N} ${W}%3d%%${N}  Gradle: %s   " "$bar" "$pct" "$phase"
    continue
  fi

  # ── Key milestone lines ──────────────────────────────────────────────────
  if echo "$line" | grep -qE "BUILD SUCCESSFUL"; then
    echo ""
    echo -e "  ${G}${W}✓  BUILD SUCCESSFUL${N}"
    continue
  fi

  if echo "$line" | grep -qE "BUILD FAILED"; then
    echo ""
    echo -e "  ${R}${W}✗  BUILD FAILED${N}"
    continue
  fi

  if echo "$line" | grep -qE "in [0-9]+m?s$|actionable task"; then
    echo ""
    printf "  ${C}%s${N}\n" "$line"
    continue
  fi

  # Tauri phase headers (e.g. "    Bundling bklogistics_lib ...")
  if echo "$line" | grep -qE "^    (Bundling|Compressing|Signing|Packaging|Linking)"; then
    echo ""
    printf "  ${Y}⟳${N}  %s\n" "$(echo "$line" | xargs)"
    continue
  fi

  # ── Errors & warnings ────────────────────────────────────────────────────
  if echo "$line" | grep -qiE "^error|FAILED|Exception|fatal"; then
    echo ""
    echo -e "  ${R}$line${N}"
    continue
  fi

  if echo "$line" | grep -qiE "^warning|^warn"; then
    printf "  ${Y}⚠${N}  %s\n" "$line"
    continue
  fi

  # APK/AAB output paths
  if echo "$line" | grep -qE "\.apk|\.aab"; then
    echo ""
    echo -e "  ${G}✓${N}  ${W}$line${N}"
    continue
  fi

  # ── Everything else: show with indent (no silent filtering) ─────────────
  printf "    %s\n" "$line"
done

TAURI_EXIT=${PIPESTATUS[0]}

echo ""
if [[ "$TAURI_EXIT" -ne 0 ]]; then
  echo -e "${R}${W}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║               ✗  BUILD FAILED                    ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${N}"
  echo ""
  err "Build failed. Full log: $BUILD_LOG_TAURI"
  echo ""
  echo -e "  ${W}Common fixes:${N}"
  echo ""
  echo -e "  ${Y}• Gradle download failed${N}"
  echo -e "    → Check internet connection and retry"
  echo ""
  echo -e "  ${Y}• JDK version mismatch${N}"
  echo -e "    → Run: /usr/libexec/java_home -V"
  echo -e "    → Need JDK 17+. Set: export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
  echo ""
  echo -e "  ${Y}• NDK not found${N}"
  echo -e "    → Install from Android Studio → SDK Manager → NDK (Side by side)"
  echo ""
  echo -e "  ${Y}• Rust target missing${N}"
  echo -e "    → Run: rustup target add aarch64-linux-android"
  echo ""
  echo -e "  ${Y}• SDK license not accepted${N}"
  echo -e "    → Run: \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses"
  echo ""
  echo -e "  ${W}Full log:${N}"
  tail -50 "$BUILD_LOG_TAURI" | grep -E "(error|Error|FAILED|failed)" | head -20
  exit 1
fi

# ── Collect output files ───────────────────────────────────────────────────────
banner "Build Outputs"

echo ""
APK_FILES=()
AAB_FILES=()

while IFS= read -r f; do
  APK_FILES+=("$f")
done < <(find "$ANDROID_GEN" -name "*.apk" 2>/dev/null | grep -E "(release|debug)" | sort)

while IFS= read -r f; do
  AAB_FILES+=("$f")
done < <(find "$ANDROID_GEN" -name "*.aab" 2>/dev/null | sort)

if [[ ${#APK_FILES[@]} -gt 0 ]]; then
  echo -e "  ${W}APK files:${N}"
  for f in "${APK_FILES[@]}"; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo -e "    ${G}✓${N}  ${W}$SIZE${N}  $f"
  done
  echo ""
fi

if [[ ${#AAB_FILES[@]} -gt 0 ]]; then
  echo -e "  ${W}AAB files (Google Play):${N}"
  for f in "${AAB_FILES[@]}"; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo -e "    ${G}✓${N}  ${W}$SIZE${N}  $f"
  done
  echo ""
fi

if [[ ${#APK_FILES[@]} -eq 0 ]] && [[ ${#AAB_FILES[@]} -eq 0 ]]; then
  warn "No output files found — check $BUILD_LOG_TAURI"
fi

# ── Copy outputs to easy-access folder ────────────────────────────────────────
OUTPUT_DIR="$SCRIPT_DIR/android-builds/$(date +%Y-%m-%d_%H-%M)"
mkdir -p "$OUTPUT_DIR"

for f in "${APK_FILES[@]}" "${AAB_FILES[@]}"; do
  cp "$f" "$OUTPUT_DIR/"
done

[[ ${#APK_FILES[@]}+${#AAB_FILES[@]} -gt 0 ]] && ok "Copied to: ${W}$OUTPUT_DIR${N}"

# ── Install APK on connected device (optional) ────────────────────────────────
if [[ ${#APK_FILES[@]} -gt 0 ]] && command -v adb &>/dev/null 2>&1; then
  DEVICES=$(adb devices 2>/dev/null | grep -v "List" | grep "device$" | wc -l | tr -d ' ')
  if [[ "$DEVICES" -gt 0 ]]; then
    echo ""
    read -rp "  ${C}$DEVICES device(s) connected. Install APK? [y/N]:${N} " INSTALL_Q
    if [[ "${INSTALL_Q,,}" == "y" ]]; then
      APK_RELEASE="${APK_FILES[0]}"
      # Prefer release over debug
      for f in "${APK_FILES[@]}"; do
        [[ "$f" =~ release ]] && APK_RELEASE="$f" && break
      done
      info "Installing: $APK_RELEASE"
      adb install -r "$APK_RELEASE" && ok "APK installed on device"
    fi
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${W}${G}"
echo "╔══════════════════════════════════════════════════╗"
echo "║             ✓  BUILD COMPLETE                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${N}"
echo ""
echo -e "  ${W}Backend URL:${N}   ${G}${API_URL}${N}"
echo -e "  ${W}Output dir:${N}    ${G}${OUTPUT_DIR}${N}"
echo -e "  ${W}Logs dir:${N}      ${C}${LOG_DIR}${N}"
echo ""

if [[ ${#AAB_FILES[@]} -gt 0 ]]; then
  echo -e "  ${W}Google Play upload steps:${N}"
  echo -e "  1) Go to play.google.com/console"
  echo -e "  2) Create app → Production → Upload AAB"
  echo -e "  3) Upload: ${G}${AAB_FILES[0]}${N}"
  echo ""
fi

echo -e "  ${Y}Change backend URL:${N} edit ${W}frontend/.env.mobile${N} → re-run"
echo ""
