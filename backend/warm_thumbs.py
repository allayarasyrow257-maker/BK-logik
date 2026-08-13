#!/usr/bin/env python3
"""
BK Logic - /api/thumb icin onceden thumbnail uretir (cache warm-up).

Resimler local_images'a tasindiktan sonra galeri /api/thumb'i kullanmaya
basliyor. Cache bossa ilk ziyaretci butun fotograflar icin ayni anda
senkron Pillow resize tetikler - tek is parcacikli/az CPU'lu bir sunucuda
bu, indirme dahil butun istekleri kitler (net::ERR_CONNECTION_CLOSED).
Bu script ayni resize mantigini (backend/main.py:thumbnail ile birebir
ayni parametreler) onceden calistirip sonuclari diske yazar, boylece
canli istekler direkt cache'ten doner.

Kullanim:
    python3 -m backend.warm_thumbs
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "data" / "images"
THUMBS_DIR = IMAGES_DIR / ".thumbs"

# Frontend'in fiilen istedigi genislikler (bkz. frontend/src/utils/img.js
# cagrilari) - backend/main.py'deki ALLOWED_THUMB_W ile ayni kumeden.
WIDTHS = (96, 120, 200, 480, 640, 800)

IMG_EXT = {".jpg", ".jpeg", ".webp", ".png"}


def iter_source_images():
    for p in IMAGES_DIR.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in IMG_EXT:
            continue
        if ".thumbs" in p.parts or ".proxy" in p.parts:
            continue
        yield p


def main() -> None:
    files = list(iter_source_images())
    total_jobs = len(files) * len(WIDTHS)
    print(f"{len(files)} resim x {len(WIDTHS)} genislik = {total_jobs} thumbnail kontrol edilecek")

    made = 0
    skipped = 0
    for i, src in enumerate(files, 1):
        rel = src.relative_to(IMAGES_DIR)
        for width in WIDTHS:
            cache = (THUMBS_DIR / str(width) / rel).with_suffix(".jpg")
            if cache.is_file() and cache.stat().st_mtime >= src.stat().st_mtime:
                skipped += 1
                continue
            try:
                cache.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(src) as im:
                    im = im.convert("RGB")
                    im.thumbnail((width, width * 4), Image.LANCZOS)
                    im.save(cache, "JPEG", quality=66, progressive=True, optimize=True)
                made += 1
            except Exception as e:
                print(f"  atlandi {rel} @ {width}px: {e}")
        if i % 25 == 0 or i == len(files):
            print(f"  {i}/{len(files)} resim islendi ({made} uretildi, {skipped} zaten cache'te)")

    print(f"\nBitti. {made} yeni thumbnail uretildi, {skipped} zaten cache'teydi.")


if __name__ == "__main__":
    main()
