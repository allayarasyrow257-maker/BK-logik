#!/usr/bin/env python3
"""
Keşif scripti: assigned-cars sayfasının yapısını analiz eder.
Sadece OKUMA yapar, hiçbir veri değiştirmez.
"""
from __future__ import annotations
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
AUTH_FILE = ROOT / "auth.json"
DEBUG_DIR = ROOT / "debug"
DEBUG_DIR.mkdir(exist_ok=True)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

TARGET_URL = "https://primeauto.ge/my-account/assigned-cars/"


def main():
    if not AUTH_FILE.exists():
        print("auth.json bulunamadi. Once login.py calistirin.")
        return

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

        print(f"Sayfa aciliyor: {TARGET_URL}")
        page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)

        print(f"Sayfa basligi: {page.title()}")
        print(f"Guncel URL: {page.url}")

        # Screenshot (timeout uzatildi)
        try:
            page.screenshot(
                path=str(DEBUG_DIR / "assigned-cars.png"), full_page=True, timeout=10000
            )
            print("Screenshot: debug/assigned-cars.png")
        except Exception:
            print("Screenshot alinamadi (timeout) - devam ediliyor...")

        # HTML kaydet (analiz icin)
        html_content = page.content()
        (DEBUG_DIR / "assigned-cars.html").write_text(html_content, encoding="utf-8")
        print("HTML: debug/assigned-cars.html")

        # Sayfadaki tum linkleri bul
        print("\n=== Sayfadaki linkler ===")
        all_links = page.locator("a[href]").all()
        product_links = []
        for link in all_links:
            href = link.get_attribute("href") or ""
            text = link.inner_text().strip()[:80]
            if "/product/" in href:
                product_links.append({"href": href, "text": text})
                print(f"  ARAC: {text} -> {href}")

        print(f"\nToplam arac linki: {len(product_links)}")

        # Tablo veya liste yapisi var mi?
        print("\n=== Tablo yapisi ===")
        tables = page.locator("table").all()
        print(f"Tablo sayisi: {len(tables)}")
        for i, table in enumerate(tables):
            rows = table.locator("tr").count()
            cols = table.locator("th").count()
            print(f"  Tablo {i+1}: {rows} satir, {cols} sutun")
            # Baslik hucreleri
            headers = table.locator("th").all()
            header_texts = [h.inner_text().strip() for h in headers]
            if header_texts:
                print(f"  Basliklar: {header_texts}")

        # Kart yapisi var mi?
        print("\n=== Kart yapisi ===")
        cards = page.locator(".product, .car-card, .vehicle-card, .woocommerce-loop-product__title, .car-item").all()
        print(f"Kart elementleri: {len(cards)}")

        # Resim linkleri
        print("\n=== Resim URL ornekleri ===")
        images = page.locator("img[src*='primeauto']").all()
        print(f"Toplam resim: {len(images)}")
        for img in images[:5]:
            src = img.get_attribute("src") or ""
            alt = img.get_attribute("alt") or ""
            print(f"  {alt[:40]} -> {src[:100]}")

        # Pagination var mi?
        print("\n=== Sayfalama ===")
        pagination = page.locator(".pagination, .page-numbers, nav.woocommerce-pagination").all()
        print(f"Sayfalama elementleri: {len(pagination)}")

        # Sayfanin onemli metin icerigi
        print("\n=== Sayfa icerik ozeti ===")
        content_el = page.locator(".woocommerce-MyAccount-content, .entry-content, main, #content").first
        if content_el.count():
            text = content_el.inner_text()
            lines = [l.strip() for l in text.split("\n") if l.strip() and len(l.strip()) > 2]
            seen = set()
            for l in lines[:50]:
                if l not in seen:
                    seen.add(l)
                    print(f"  {l}")

        browser.close()
        print("\nKesif tamamlandi. Veri degisikligi yapilmadi.")


if __name__ == "__main__":
    main()
