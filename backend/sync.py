#!/usr/bin/env python3
"""
BK Logic - Primeauto.ge ile senkronizasyon.

Dealer hesabindan tum araclari ceker, detaylarini scrape eder,
resimleri indirir ve SQLite'a kaydeder.

Kullanim:
    python3 -m backend.sync              # Tam senkronizasyon
    python3 -m backend.sync --list-only  # Sadece arac listesini goster
    python3 -m backend.sync --no-images  # Resim indirmeden sync
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

# Projenin kok dizini
ROOT = Path(__file__).resolve().parent.parent
AUTH_FILE = ROOT / "auth.json"
IMAGES_DIR = ROOT / "data" / "images"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

ASSIGNED_CARS_URL = "https://primeauto.ge/my-account/assigned-cars/"

# Gurcuce etiket -> veri alani eslesmesi (scraper.py ile ayni)
LABEL_MAP = {
    "\u10db\u10d0\u10e0\u10d9\u10d0": "make",                        # მარკა
    "\u10db\u10dd\u10d3\u10d4\u10da\u10d8": "model",                  # მოდელი
    "\u10ec\u10d4\u10da\u10d8": "year",                               # წელი
    "\u10e4\u10d4\u10e0\u10d8": "color",                              # ფერი
    "\u10d9\u10dd\u10dc\u10e2\u10d4\u10d8\u10dc\u10d4\u10e0\u10d8": "container",  # კონტეინერი
    "\u10e9\u10d0\u10db\u10dd\u10e1\u10d5\u10da\u10d0": "arrivalDate",            # ჩამოსვლა
    "\u10d2\u10d0\u10d3\u10d0\u10db\u10d6\u10d8\u10d3\u10d8": "shippingLine",    # გადამზიდი
    "\u10d2\u10d0\u10e1\u10d0\u10e6\u10d4\u10d1\u10d8": "keyStatus",             # გასაღები
    "\u10e1\u10d0\u10ec\u10e7\u10dd\u10d1\u10e8\u10d8 \u10e9\u10d0\u10e1\u10d5\u10da\u10d0": "warehouseDate",   # საწყობში ჩასვლა
    "\u10e1\u10d0\u10ec\u10e7\u10dd\u10d1\u10e8\u10d8 \u10db\u10d8\u10e2\u10d0\u10dc\u10d0": "warehouseDate",  # საწყობში მიტანა
    "\u10e8\u10d4\u10eb\u10d4\u10dc\u10d8\u10e1 \u10d7\u10d0\u10e0\u10d8\u10d2\u10d8": "purchaseDate",         # შეძენის თარიღი
    "\u10e8\u10d4\u10eb\u10d4\u10dc\u10d0": "purchaseDate",                      # შეძენა
}

# Gurcuce durum -> Ingilizce eslesmesi
STATUS_MAP = {
    "\u10e1\u10d0\u10ec\u10e7\u10dd\u10d1\u10e8\u10d8 \u10d0\u10e0 \u10db\u10d8\u10e1\u10e3\u10da\u10d8": "Not in warehouse",
    "\u10e1\u10d0\u10ec\u10e7\u10dd\u10d1\u10e8\u10d8": "In warehouse",
    "\u10d9\u10dd\u10dc\u10e2\u10d4\u10d8\u10dc\u10d4\u10e0\u10e8\u10d8 \u10e9\u10d0\u10e2\u10d5\u10d8\u10e0\u10d7\u10e3\u10da\u10d8": "Loaded in container",
    "\u10e9\u10d0\u10db\u10dd\u10e1\u10e3\u10da\u10d8": "Arrived",
    "\u10d2\u10d6\u10d0\u10d5\u10dc\u10d8\u10da\u10d8\u10d0": "In transit",
    "\u10d3\u10d0\u10ef\u10d0\u10d5\u10e8\u10dc\u10d8\u10da\u10d8 \u10d9\u10dd\u10dc\u10e2\u10d4\u10d8\u10dc\u10d4\u10e0\u10d8": "Reserved container",
    "\u10e9\u10d0\u10e3\u10e2\u10d5\u10d8\u10e0\u10d7\u10d0\u10d5\u10d8 \u10db\u10d0\u10dc\u10e5\u10d0\u10dc\u10d4\u10d1\u10d8": "Not loaded",
    "Loaded in container": "Loaded in container",
}


def _clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    import html as html_lib
    return html_lib.unescape(text).strip()


_GEO_MONTHS = {
    "იანვარი": "01", "თებერვალი": "02", "მარტი": "03",
    "აპრილი": "04", "მაისი": "05", "ივნისი": "06",
    "ივლისი": "07", "აგვისტო": "08", "სექტემბერი": "09",
    "ოქტომბერი": "10", "ნოემბერი": "11", "დეკემბერი": "12",
}


def _parse_price(text: str) -> float | None:
    """'1 325,00 $' -> 1325.0, '$ 9,890.00' -> 9890.0. Taninmazsa None."""
    if not text:
        return None
    # Sadece rakam, virgul ve nokta birak (para simgesi, bosluk, nbsp temizle)
    s = re.sub(r"[^\d.,]", "", text)
    if not s:
        return None
    if "," in s and "." in s:
        # Hangi ayrac sagdaysa o ondalik
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")  # 1.325,00 -> 1325.00
        else:
            s = s.replace(",", "")                     # 9,890.00 -> 9890.00
    elif "," in s:
        s = s.replace(",", ".")                        # 1 325,00 -> 1325.00
    try:
        return float(s)
    except ValueError:
        return None


def _parse_geo_date(text: str) -> str:
    """'ივლისი 8, 2026' → '2026-07-08'. Taninmazsa orijinali doner."""
    if not text:
        return text
    for geo, num in _GEO_MONTHS.items():
        if geo in text:
            # "ივლისი 8, 2026" veya "8 ივლისი 2026"
            digits = re.findall(r"\d+", text)
            if len(digits) >= 2:
                # Son 4 haneli sayi yil, diger gun
                year = next((d for d in digits if len(d) == 4), "")
                day = next((d for d in digits if len(d) <= 2), "")
                if year and day:
                    return f"{year}-{num}-{day.zfill(2)}"
    return text


# ── Adim 1: Arac listesini topla ───────────────────────────────────────


def collect_car_list(page) -> list[dict]:
    """assigned-cars sayfasindan tum araclarin temel bilgilerini topla."""
    cars = []

    page.goto(ASSIGNED_CARS_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(3000)

    while True:
        # Tablodaki tum satirlari oku
        rows = page.locator("tbody#carTableBody tr[data-vin]").all()
        for row in rows:
            vin = (row.get_attribute("data-vin") or "").upper()
            if not vin or any(c["vin"] == vin for c in cars):
                continue

            title = (row.get_attribute("data-title") or "").upper().strip()
            lot = row.get_attribute("data-lot") or ""
            car_price_str = row.get_attribute("data-car-price") or ""
            transport_str = row.get_attribute("data-transport-price") or ""
            container = row.get_attribute("data-container") or ""

            # Arac linki
            link_el = row.locator("a.car-title").first
            source_url = link_el.get_attribute("href") if link_el.count() else ""

            # Durum (status hucresindeki badge'i oku)
            status_cell = row.locator("td[data-label='\u10e1\u10e2\u10d0\u10e2\u10e3\u10e1\u10d8'] span.badge, td:last-child span.badge")
            status_raw = ""
            if status_cell.count():
                status_raw = status_cell.first.inner_text().strip()
            # Sayi olan durumlar gecersiz, temizle
            if status_raw.isdigit():
                status_raw = ""
            status = STATUS_MAP.get(status_raw, status_raw)

            # Auction city
            transport_cell = row.locator("td[data-auction-city]").first
            auction_city = ""
            if transport_cell.count():
                auction_city = transport_cell.get_attribute("data-auction-city") or ""

            # Slug
            slug = ""
            if source_url:
                slug = urlparse(source_url).path.rstrip("/").split("/")[-1]

            car_price = None
            transport_price = None
            try:
                car_price = float(car_price_str) if car_price_str else None
            except ValueError:
                pass
            try:
                transport_price = float(transport_str) if transport_str else None
            except ValueError:
                pass
            # data-transport-price attribute'u kaynakta bos geliyor;
            # fiyat hucrenin metninde ("1 325,00 $"). Oradan oku.
            if transport_price is None:
                tcell = row.locator("td.transport-price-column").first
                if tcell.count():
                    transport_price = _parse_price(tcell.inner_text())

            cars.append({
                "id": slug or vin.lower(),
                "slug": slug,
                "source_url": source_url or "",
                "title": title,
                "vin": vin,
                "lot_number": lot,
                "car_price": car_price,
                "transport_price": transport_price,
                "container": container,
                "auction_city": auction_city,
                "status": status,
            })

        # Sonraki sayfa var mi?
        current_page = page.evaluate("""
            () => {
                const el = document.querySelector('#clientPagination .page-item.active a');
                return el ? parseInt(el.dataset.page) : 1;
            }
        """)
        # Sayfa 2 butonuna tikla
        next_page = current_page + 1
        next_link = page.locator(f"#clientPagination a[data-page='{next_page}']")
        if next_link.count() == 0:
            break

        try:
            next_link.click(timeout=5000)
            page.wait_for_timeout(2000)
        except Exception:
            break

    return cars


# ── Adim 2: Arac detaylarini scrape et ─────────────────────────────────


def scrape_car_details(page, source_url: str) -> dict:
    """Urun sayfasindan detayli bilgi ve resimleri cek."""
    page.goto(source_url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)

    html = page.content()

    # Spesifikasyon tablosu
    specs: dict[str, str] = {}
    all_labels_found = []
    for th, td in re.findall(
        r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", html, re.S
    ):
        label = _clean_html(th)
        value = _clean_html(td)
        all_labels_found.append(f"  [{repr(label)}] = {repr(value[:60])}")
        if label in LABEL_MAP and value:
            specs[LABEL_MAP[label]] = value
    print(f"    [DEBUG] Tablodaki tum etiketler:")
    for line in all_labels_found:
        print(line)
    print(f"    [DEBUG] Eslesen specs: {specs}")

    # Fotograflar (buyuk boyutlu, kucuk resimleri ve logolari haric tut)
    all_imgs = re.findall(
        r"https://primeauto\.ge/wp-content/uploads/\d{4}/\d{2}/[^\"'\s]+\.(?:jpe?g|webp|png)",
        html,
    )
    seen: set[str] = set()
    images: list[str] = []
    for img in all_imgs:
        if "-150x150" in img or "logo" in img.lower() or "fav" in img.lower():
            continue
        if img not in seen:
            seen.add(img)
            images.append(img)

    year = specs.get("year", "")
    try:
        year_val = int(year)
    except (ValueError, TypeError):
        year_val = None

    # Anahtar durumu: key-yes/key-no class'i veya metin
    key_status = specs.get("keyStatus", "")
    if not key_status:
        if "key-yes" in html:
            key_status = "Yes"
        elif "key-no" in html:
            key_status = "No"

    return {
        "make": specs.get("make", ""),
        "model": specs.get("model", ""),
        "year": year_val,
        "color": specs.get("color", ""),
        "container": specs.get("container", ""),
        "shipping_line": specs.get("shippingLine", ""),
        "arrival_date": _parse_geo_date(specs.get("arrivalDate", "")),
        "key_status": key_status,
        "purchase_date": _parse_geo_date(specs.get("purchaseDate", "")),
        "warehouse_date": _parse_geo_date(specs.get("warehouseDate", "")),
        "cover": images[0] if images else "",
        "images": images,
    }


# ── Adim 3: Resimleri indir ────────────────────────────────────────────


def download_images(slug: str, image_urls: list[str]) -> list[str]:
    """Resimleri yerel diske indir. Varsa atla."""
    car_dir = IMAGES_DIR / slug
    car_dir.mkdir(parents=True, exist_ok=True)

    local_paths: list[str] = []

    for i, url in enumerate(image_urls):
        ext = Path(urlparse(url).path).suffix or ".jpg"
        filename = f"{i+1:02d}{ext}"
        local_path = car_dir / filename
        relative_path = f"images/{slug}/{filename}"

        if local_path.exists() and local_path.stat().st_size > 1000:
            local_paths.append(relative_path)
            continue

        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                if len(data) > 500:
                    local_path.write_bytes(data)
                    local_paths.append(relative_path)
        except Exception as e:
            print(f"    Resim indirilemedi: {url[:60]}... ({e})")

    return local_paths


# ── Adim 4: DB'ye kaydet ───────────────────────────────────────────────


def save_to_db(car_data: dict) -> None:
    """Tek bir araci DB'ye kaydet (upsert)."""
    from backend.database import db_session

    with db_session() as conn:
        conn.execute("""
            INSERT INTO cars (
                id, slug, source_url, title, vin, lot_number,
                make, model, year, color, container, shipping_line,
                arrival_date, auction_city, car_price, transport_price,
                status, cover, images, local_images,
                key_status, purchase_date, warehouse_date,
                added_at, updated_at
            ) VALUES (
                :id, :slug, :source_url, :title, :vin, :lot_number,
                :make, :model, :year, :color, :container, :shipping_line,
                :arrival_date, :auction_city, :car_price, :transport_price,
                :status, :cover, :images, :local_images,
                :key_status, :purchase_date, :warehouse_date,
                :added_at, :updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                vin = excluded.vin,
                lot_number = excluded.lot_number,
                make = excluded.make,
                model = excluded.model,
                year = excluded.year,
                color = excluded.color,
                container = excluded.container,
                shipping_line = excluded.shipping_line,
                arrival_date = excluded.arrival_date,
                auction_city = excluded.auction_city,
                car_price = excluded.car_price,
                transport_price = excluded.transport_price,
                status = excluded.status,
                cover = excluded.cover,
                images = excluded.images,
                local_images = excluded.local_images,
                key_status = excluded.key_status,
                purchase_date = excluded.purchase_date,
                warehouse_date = excluded.warehouse_date,
                updated_at = excluded.updated_at
        """, car_data)


# ── Ana senkronizasyon akisi ────────────────────────────────────────────


def run_sync(
    list_only: bool = False,
    download_imgs: bool = True,
) -> dict:
    """Tam senkronizasyon. Sonuc raporu doner."""

    if not AUTH_FILE.exists():
        print("auth.json bulunamadi. Once login.py calistirin:")
        print("  python3 login.py")
        return {"error": "auth.json not found"}

    from backend.database import init_db
    init_db()

    results = {"total": 0, "synced": 0, "errors": [], "started_at": "", "finished_at": ""}
    results["started_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            storage_state=str(AUTH_FILE),
            user_agent=USER_AGENT,
            locale="ka-GE",
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = ctx.new_page()

        # 1. Arac listesini topla
        print("1/3 Arac listesi toplanıyor...")
        car_list = collect_car_list(page)
        results["total"] = len(car_list)
        print(f"    {len(car_list)} arac bulundu.")

        if list_only:
            for c in car_list:
                print(f"    {c['title']} | {c['vin']} | {c['status']}")
            browser.close()
            return results

        # 2. Her arac icin detay + resim
        for idx, car_basic in enumerate(car_list, 1):
            try:
                print(f"\n2/3 [{idx}/{len(car_list)}] {car_basic['title']}")

                # Detay sayfasini scrape et
                details = {}
                if car_basic["source_url"]:
                    print(f"    Detaylar cekiliyor...")
                    details = scrape_car_details(page, car_basic["source_url"])
                    time.sleep(0.5)  # Nazik ol, sunucuyu yorma

                # Verileri birlestir (tablo verileri oncelikli, bos olanlari detaydan al)
                now = datetime.now(timezone.utc).isoformat(timespec="seconds")

                car_data = {
                    "id": car_basic["id"],
                    "slug": car_basic["slug"],
                    "source_url": car_basic["source_url"],
                    "title": car_basic["title"],
                    "vin": car_basic["vin"],
                    "lot_number": car_basic["lot_number"],
                    "make": details.get("make", ""),
                    "model": details.get("model", ""),
                    "year": details.get("year"),
                    "color": details.get("color", ""),
                    "container": car_basic["container"] or details.get("container", ""),
                    "shipping_line": details.get("shipping_line", ""),
                    "arrival_date": details.get("arrival_date", ""),
                    "auction_city": car_basic["auction_city"],
                    "car_price": car_basic["car_price"],
                    "transport_price": car_basic["transport_price"],
                    "status": car_basic["status"],
                    "cover": details.get("cover", ""),
                    "images": json.dumps(details.get("images", [])),
                    "local_images": "[]",
                    "key_status": details.get("key_status", ""),
                    "purchase_date": details.get("purchase_date", ""),
                    "warehouse_date": details.get("warehouse_date", ""),
                    "added_at": now,
                    "updated_at": now,
                }

                # Resimleri indir
                image_urls = details.get("images", [])
                if download_imgs and image_urls and car_basic["slug"]:
                    print(f"    {len(image_urls)} resim indiriliyor...")
                    local_paths = download_images(car_basic["slug"], image_urls)
                    car_data["local_images"] = json.dumps(local_paths)
                    print(f"    {len(local_paths)} resim kaydedildi.")

                # DB'ye kaydet
                save_to_db(car_data)
                results["synced"] += 1
                print(f"    DB'ye kaydedildi.")

            except Exception as e:
                err_msg = f"{car_basic['title']}: {e}"
                results["errors"].append(err_msg)
                print(f"    HATA: {e}")

        browser.close()

    results["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    print(f"\n3/3 Senkronizasyon tamamlandi!")
    print(f"    Toplam: {results['total']}")
    print(f"    Basarili: {results['synced']}")
    print(f"    Hata: {len(results['errors'])}")

    return results


def main(argv: list[str]) -> int:
    list_only = "--list-only" in argv
    no_images = "--no-images" in argv

    result = run_sync(list_only=list_only, download_imgs=not no_images)

    if "error" in result:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
