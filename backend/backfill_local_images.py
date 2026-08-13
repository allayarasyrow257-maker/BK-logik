#!/usr/bin/env python3
"""
BK Logic - Mevcut araclarin resimlerini yerel diske indirip local_images'i doldurur.

sync.py'nin agir Playwright taramasini tekrar calistirmadan, DB'de zaten
bilinen `images` (primeauto.ge) URL'lerini kullanarak sadece resim indirme +
DB guncelleme adimini yapar. Yeni eklenen araclar icin normal sync akisi
zaten bunu otomatik yapar - bu script sadece gecmiste local_images'i bos
kalmis araclari (once) telafi etmek icindir.

Kullanim:
    python3 -m backend.backfill_local_images
    python3 -m backend.backfill_local_images --workers 3
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.database import db_session
from backend.sync import download_images


def backfill_car(car_id: str, slug: str, images: list[str]) -> tuple[str, list[str]]:
    local_paths = download_images(slug, images)
    return car_id, local_paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3,
                         help="Ayni anda kac araci paralel indirsin (varsayilan 3)")
    args = parser.parse_args()

    with db_session() as conn:
        rows = conn.execute("SELECT id, slug, images, local_images FROM cars").fetchall()

    todo = []
    for row in rows:
        images = json.loads(row["images"] or "[]")
        local_images = json.loads(row["local_images"] or "[]")
        if images and len(local_images) < len(images):
            todo.append((row["id"], row["slug"], images))

    if not todo:
        print("Tum araclarin resimleri zaten yerelde. Yapilacak bir sey yok.")
        return

    print(f"{len(todo)} arac icin resim indiriliyor ({args.workers} paralel)...\n")

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(backfill_car, car_id, slug, images): (car_id, slug)
            for car_id, slug, images in todo
        }
        for future in as_completed(futures):
            car_id, slug = futures[future]
            done += 1
            try:
                _, local_paths = future.result()
            except Exception as e:
                print(f"[{done}/{len(todo)}] {slug}: HATA ({e})")
                continue

            with db_session() as conn:
                conn.execute(
                    "UPDATE cars SET local_images = ? WHERE id = ?",
                    (json.dumps(local_paths), car_id),
                )

            total = len(next(im for cid, _, im in todo if cid == car_id))
            print(f"[{done}/{len(todo)}] {slug}: {len(local_paths)}/{total} resim kaydedildi")

    print("\nBitti.")


if __name__ == "__main__":
    main()
