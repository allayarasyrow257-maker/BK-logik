#!/usr/bin/env bash
#
# iOS Platform indirici  —  BK Logistics
# --------------------------------------
# Xcode 26 için eksik olan "iOS platform" bileşenini indirir.
# Özellikler:
#   • Canlı progress bar
#   • İnternet kesilirse otomatik bekler ve KALDIĞI YERDEN devam eder
#   • Başarıyı çıkış koduna değil, sisteme gerçekten kurulup kurulmadığına bakarak anlar
#
# Kullanım:
#   ./ios-platform-download.sh
#   (izin gerekirse:  sudo ./ios-platform-download.sh)
#
set -uo pipefail

# ---- ayarlar ----
PLATFORM="iOS"
LOG="/tmp/ios-platform-dl.log"
RETRY_WAIT=10          # kesilince kaç sn sonra tekrar denesin
MAX_ATTEMPTS=200       # sonsuz döngüye karşı üst sınır

# ---- renkler ----
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; N='\033[0m'

# ---- progress bar ----
bar() {
  local pct=${1%%.*}
  [[ -z "$pct" || ! "$pct" =~ ^[0-9]+$ ]] && pct=0
  (( pct > 100 )) && pct=100
  local width=40 filled empty i out=""
  filled=$(( pct * width / 100 )); empty=$(( width - filled ))
  for ((i=0; i<filled; i++)); do out+="█"; done
  for ((i=0; i<empty;  i++)); do out+="░"; done
  printf "\r  [%s] %3d%%  " "$out" "$pct"
}

# ---- kurulu mu? ----
# DOĞRU tespit: iOS platform SDK'sı stub mu, dolu mu?
# Stub (kurulmamış) ~70 MB; tam kurulum ~1.5-2 GB+. Eşik = 500 MB.
# (simulator runtime'a BAKMIYORUZ — o başka şey, cihaz derlemesini garanti etmez.)
SDK_THRESHOLD_KB=512000   # 500 MB
sdk_dir() {
  echo "$DEV_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"
}
already_installed() {
  local sdk kb
  sdk="$(sdk_dir)"
  [[ -d "$sdk" ]] || return 1
  kb=$(du -sk "$sdk" 2>/dev/null | awk '{print $1}')
  [[ -n "$kb" && "$kb" -gt "$SDK_THRESHOLD_KB" ]] && return 0
  return 1
}

# ---- internet var mı? (macOS ping: -t = saniye cinsinden timeout) ----
have_net() {
  ping -c1 -t3 apple.com          >/dev/null 2>&1 && return 0
  ping -c1 -t3 developer.apple.com >/dev/null 2>&1 && return 0
  ping -c1 -t3 1.1.1.1            >/dev/null 2>&1 && return 0
  return 1
}
wait_for_net() {
  local first=1
  until have_net; do
    if (( first )); then echo -e "\n  ${Y}⚠ İnternet yok — bağlantı bekleniyor...${N}"; first=0; fi
    sleep "$RETRY_WAIT"
  done
}

# ---- Xcode doğru seçili mi? ----
DEV_DIR=$(xcode-select -p 2>/dev/null || true)
if [[ "$DEV_DIR" != *"Xcode"*"Developer" ]]; then
  echo -e "  ${R}✗ Aktif geliştirici dizini Xcode değil:${N} ${DEV_DIR:-yok}"
  echo -e "  Düzeltmek için:  ${C}sudo xcode-select -s /Applications/Xcode-26.app/Contents/Developer${N}"
  exit 1
fi

echo ""
echo -e "  ${C}iOS Platform indirici${N}   (resume destekli)"
echo    "  ==========================================="
echo -e "  Xcode : ${DEV_DIR}"
echo -e "  Log    : ${LOG}"
echo ""

if already_installed; then
  echo -e "  ${G}✓ iOS platformu zaten kurulu — indirmeye gerek yok.${N}"
  du -sh "$(sdk_dir)" 2>/dev/null | awk '{print "  iPhoneOS.sdk: "$1}'
  exit 0
fi
echo -e "  ${Y}iOS platformu kurulu değil (SDK stub).${N} İndirme başlıyor..."

attempt=0
while ! already_installed; do
  attempt=$(( attempt + 1 ))
  if (( attempt > MAX_ATTEMPTS )); then
    echo -e "\n  ${R}✗ $MAX_ATTEMPTS deneme sonunda kurulamadı. Log'a bak: $LOG${N}"
    exit 1
  fi

  wait_for_net
  echo -e "\n  ${C}▶ Deneme #$attempt${N}  ($(date '+%H:%M:%S'))"

  # xcodebuild'i pty içinde çalıştır (script) ki çıktı canlı gelsin.
  # CR ile güncellenen satırları LF'e çevir ki bar akıcı olsun.
  # tee ile ham çıktıyı log'a yaz.
  script -q /dev/null xcodebuild -downloadPlatform "$PLATFORM" 2>&1 \
    | tee -a "$LOG" \
    | tr '\r' '\n' \
    | while IFS= read -r line; do
        pct=$(printf '%s' "$line" | grep -oE '[0-9]+(\.[0-9]+)?%' | tail -1 | tr -d '%')
        if [[ -n "$pct" ]]; then
          bar "$pct"
        else
          # yetki hatası → kullanıcıya sudo öner
          if printf '%s' "$line" | grep -qiE "not authorized|permission|requires authentication|Could not write"; then
            echo -e "\n  ${Y}⚠ Yetki gerekiyor. Script'i şöyle çalıştır:${N}  ${C}sudo $0${N}"
          fi
          # anlamlı satırları göster
          printf '%s' "$line" | grep -qiE "error|fail|download|install|beginning|complete|assets?" \
            && echo -e "\n  $line"
        fi
      done

  if already_installed; then
    bar 100; echo ""
    echo -e "  ${G}✓ Kurulum tamamlandı!${N}"
    break
  fi

  echo -e "\n  ${Y}⚠ İndirme kesildi/bitmedi. ${RETRY_WAIT}s sonra kaldığı yerden devam...${N}"
  sleep "$RETRY_WAIT"
done

echo ""
echo -e "  ${C}iOS platform SDK durumu:${N}"
du -sh "$(sdk_dir)" 2>/dev/null | awk '{print "  iPhoneOS.sdk: "$1"  (dolu = kuruldu)"}'
echo ""
echo -e "  ${G}Sıradaki adım →${N} cihazda çalıştır:"
echo -e "    ${C}./ios.sh${N}   (menüden 1 = Dev)"
echo ""
