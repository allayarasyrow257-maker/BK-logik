#!/usr/bin/env python3
"""
BK Logic - Otomatik senkronizasyon zamanlayicisi.

Gunde 3 kez (08:00, 13:00, 19:00 Tiflis saati) primeauto'dan
verileri ceker ve DB'yi gunceller.

Kullanim:
    python3 -m backend.scheduler          # Zamanlayiciyi baslat
    python3 -m backend.scheduler --once   # Bir kez calistir ve cik
"""

from __future__ import annotations

import sys
import time
import threading
from datetime import datetime, timezone, timedelta

# Tiflis saat dilimi: UTC+4
TZ_TBILISI = timezone(timedelta(hours=4))

# Senkronizasyon saatleri (Tiflis saati)
SYNC_HOURS = [8, 13, 19]


def get_next_sync_time() -> datetime:
    """Bir sonraki sync zamanini hesapla."""
    now = datetime.now(TZ_TBILISI)

    for hour in SYNC_HOURS:
        target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if target > now:
            return target

    # Bugun bitti, yarina bak
    tomorrow = now + timedelta(days=1)
    return tomorrow.replace(hour=SYNC_HOURS[0], minute=0, second=0, microsecond=0)


def run_sync_safe():
    """Sync calistir, hatalar yakalanir."""
    try:
        from backend.sync import run_sync
        result = run_sync()
        now = datetime.now(TZ_TBILISI).strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{now}] Sync tamamlandi: {result.get('synced', 0)}/{result.get('total', 0)} arac")
    except Exception as e:
        now = datetime.now(TZ_TBILISI).strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{now}] Sync hatasi: {e}")


def main(argv: list[str]) -> int:
    if "--once" in argv:
        print("Tek seferlik sync basliyor...")
        run_sync_safe()
        return 0

    print("BK Logic Otomatik Senkronizasyon")
    print(f"Sync saatleri (Tiflis): {SYNC_HOURS}")

    while True:
        next_sync = get_next_sync_time()
        now = datetime.now(TZ_TBILISI)
        wait_seconds = (next_sync - now).total_seconds()

        print(f"\nSonraki sync: {next_sync.strftime('%Y-%m-%d %H:%M')} ({wait_seconds/60:.0f} dakika sonra)")

        # Bekle
        time.sleep(max(0, wait_seconds))

        # Sync'i arka planda calistir
        thread = threading.Thread(target=run_sync_safe, daemon=True)
        thread.start()
        thread.join(timeout=1800)  # Max 30 dakika

        # 1 dakika bekle (ayni saati tekrar yakalamak icin)
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
