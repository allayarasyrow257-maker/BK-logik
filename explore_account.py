#!/usr/bin/env python3
"""Разведка дилерского кабинета — что доступно под нашим логином."""

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

PAGES_TO_CHECK = [
    "https://primeauto.ge/my-account/",
    "https://primeauto.ge/my-account/dashboard/",
    "https://primeauto.ge/my-account/orders/",
    "https://primeauto.ge/dealer/",
    "https://primeauto.ge/my-account/edit-account/",
]

def main():
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

        for url in PAGES_TO_CHECK:
            print(f"\n── {url}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(1500)

                title = page.title()
                current = page.url
                print(f"   title : {title}")
                print(f"   url   : {current}")

                # Найти все ссылки в навигации кабинета
                links = page.locator("nav a, .woocommerce-MyAccount-navigation a, .account-nav a").all()
                if links:
                    print("   nav links:")
                    for a in links[:15]:
                        href = a.get_attribute("href") or ""
                        text = a.inner_text().strip()
                        if text:
                            print(f"     - {text}  →  {href}")

                # Сохранить скрин
                slug = url.replace("https://primeauto.ge/","").replace("/","-").strip("-") or "root"
                page.screenshot(path=str(DEBUG_DIR / f"account-{slug}.png"), full_page=True)
                print(f"   screenshot → debug/account-{slug}.png")

            except Exception as e:
                print(f"   ERROR: {e}")

        # Проверить текст главной страницы my-account
        print("\n\n── Текст на my-account (что видит дилер) ──")
        page.goto("https://primeauto.ge/my-account/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)
        content = page.locator("body").inner_text()
        lines = [l.strip() for l in content.split("\n") if l.strip() and len(l.strip()) > 2]
        # убрать дубли
        seen = set()
        for l in lines[:80]:
            if l not in seen:
                seen.add(l)
                print(f"  {l}")

        browser.close()

if __name__ == "__main__":
    main()
