#!/usr/bin/env python3
"""
Prime Auto — вход в дилерский кабинет (Вариант C: реальный браузер).

Логинится под твоим аккаунтом на primeauto.ge через настоящий Chromium
(проходит анти-бот фаервол), сохраняет сессию в auth.json. Дальше все
скрипты сбора данных ходят по этой сохранённой сессии — без повторного
ввода пароля.

Пароль берётся ТОЛЬКО из файла .env и нигде не печатается и не сохраняется
в коде. Смотри .env.example.

Использование:
    python3 login.py           # войти и сохранить сессию (окно браузера видно)
    python3 login.py --check   # проверить, жива ли сохранённая сессия
    python3 login.py --headless # войти в фоновом режиме (если не нужна капча)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import Page, TimeoutError as PWTimeout, sync_playwright

ROOT = Path(__file__).resolve().parent
AUTH_FILE = ROOT / "auth.json"
DEBUG_DIR = ROOT / "debug"

# Реалистичный профиль браузера — снижает шанс срабатывания анти-бота.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Селекторы стандартной формы входа WooCommerce (my-account).
# Если у primeauto кастомная форма — правится здесь, в одном месте.
SEL_USERNAME = "#username, input[name='username']"
SEL_PASSWORD = "#password, input[name='password']"
SEL_SUBMIT = "button[name='login'], button[type='submit']"
# Признаки успешного входа: ссылка «выйти» или меню личного кабинета.
SEL_LOGGED_IN = (
    "a[href*='customer-logout'], "
    ".woocommerce-MyAccount-navigation, "
    ".woocommerce-MyAccount-content"
)


def load_config() -> dict:
    """Прочитать настройки из .env. Падает с понятной ошибкой, если пусто."""
    load_dotenv(ROOT / ".env")
    login = os.getenv("PRIMEAUTO_LOGIN", "").strip()
    password = os.getenv("PRIMEAUTO_PASSWORD", "")
    url = os.getenv("PRIMEAUTO_LOGIN_URL", "https://primeauto.ge/my-account/").strip()
    headful = os.getenv("PRIMEAUTO_HEADFUL", "true").strip().lower() != "false"
    if not login or not password:
        sys.exit(
            "✗ Не заданы логин/пароль.\n"
            "  1) cp .env.example .env\n"
            "  2) впиши PRIMEAUTO_LOGIN и PRIMEAUTO_PASSWORD в .env\n"
        )
    return {"login": login, "password": password, "url": url, "headful": headful}


def _dump_debug(page: Page, name: str) -> None:
    """Сохранить скриншот + HTML для диагностики (без секретов)."""
    DEBUG_DIR.mkdir(exist_ok=True)
    try:
        page.screenshot(path=str(DEBUG_DIR / f"{name}.png"), full_page=True)
        (DEBUG_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")
        print(f"  ⓘ debug сохранён: debug/{name}.png, debug/{name}.html")
    except Exception:  # noqa: BLE001
        pass


def _is_logged_in(page: Page) -> bool:
    """Есть ли на странице признаки залогиненного кабинета."""
    try:
        return page.locator(SEL_LOGGED_IN).first.is_visible(timeout=3000)
    except PWTimeout:
        return False
    except Exception:  # noqa: BLE001
        return False


def _human_delay(page: Page, ms_min: int = 600, ms_max: int = 1400) -> None:
    """Случайная пауза — имитирует человеческое поведение."""
    import random
    page.wait_for_timeout(random.randint(ms_min, ms_max))


def do_login(cfg: dict) -> int:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not cfg["headful"],
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            locale="ka-GE",
            timezone_id="Asia/Tbilisi",
            viewport={"width": 1366, "height": 900},
            # Скрываем признаки автоматизации
            extra_http_headers={"Accept-Language": "ka-GE,ka;q=0.9,en;q=0.8"},
        )
        # Убираем navigator.webdriver — главный признак бота
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = context.new_page()

        # ── Шаг 1: сначала главная страница (как обычный посетитель) ──────────
        print("→ Открываю главную страницу…")
        try:
            page.goto("https://primeauto.ge/", wait_until="domcontentloaded", timeout=60000)
            _human_delay(page, 1000, 2500)
        except PWTimeout:
            print("✗ Главная страница не загрузилась. Проверь интернет или VPN.")
            _dump_debug(page, "homepage-timeout")
            browser.close()
            return 2

        # ── Шаг 2: переходим на страницу входа ────────────────────────────────
        print(f"→ Перехожу на страницу входа: {cfg['url']}")
        try:
            page.goto(cfg["url"], wait_until="domcontentloaded", timeout=60000)
            _human_delay(page, 800, 1800)
        except PWTimeout:
            print("✗ Страница входа не загрузилась (таймаут / фаервол).")
            _dump_debug(page, "login-timeout")
            browser.close()
            return 2

        # Уже залогинены?
        if _is_logged_in(page):
            print("✓ Уже авторизован.")
            context.storage_state(path=str(AUTH_FILE))
            browser.close()
            return 0

        # ── Шаг 3: заполняем форму по-человечески (по символу, с паузами) ────
        try:
            user_field = page.locator(SEL_USERNAME).first
            user_field.wait_for(timeout=15000)
            user_field.click()
            _human_delay(page, 300, 700)
            user_field.type(cfg["login"], delay=80)   # печатаем, а не вставляем
            _human_delay(page, 400, 900)

            pass_field = page.locator(SEL_PASSWORD).first
            pass_field.click()
            _human_delay(page, 300, 600)
            pass_field.type(cfg["password"], delay=90)
            _human_delay(page, 500, 1200)
        except PWTimeout:
            print("✗ Не нашёл поля логина/пароля на странице.")
            print("  Сохраняю debug/login-noform.png — посмотри, что там за форма.")
            _dump_debug(page, "login-noform")
            browser.close()
            return 3

        print("→ Нажимаю «Войти»…")
        page.locator(SEL_SUBMIT).first.click(timeout=15000)

        # ── Шаг 4: ждём успешного входа ───────────────────────────────────────
        if cfg["headful"]:
            print("  ⏳ Жду вход… (если появится капча — пройди её в окне, до 3 мин)")
        deadline = 180_000 if cfg["headful"] else 45_000
        try:
            page.wait_for_selector(SEL_LOGGED_IN, timeout=deadline)
        except PWTimeout:
            print("✗ Вход не подтвердился.")
            print("  Причины: неверный пароль / капча / анти-бот блокировка.")
            _dump_debug(page, "login-failed")
            browser.close()
            return 4

        context.storage_state(path=str(AUTH_FILE))
        print(f"✓ Вход выполнен! Сессия сохранена → {AUTH_FILE.name}")
        browser.close()
        return 0


def check_session(cfg: dict) -> int:
    """Проверить, что сохранённая сессия ещё действительна."""
    if not AUTH_FILE.exists():
        print("✗ auth.json нет — сначала выполни: python3 login.py")
        return 1
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(AUTH_FILE), user_agent=USER_AGENT, locale="ka-GE"
        )
        page = context.new_page()
        page.goto(cfg["url"], wait_until="domcontentloaded", timeout=45000)
        ok = _is_logged_in(page)
        if not ok:
            _dump_debug(page, "check-failed")
        browser.close()
    print("✓ Сессия жива." if ok else "✗ Сессия протухла — перелогинься: python3 login.py")
    return 0 if ok else 5


def main(argv: list[str]) -> int:
    cfg = load_config()
    if "--headless" in argv:
        cfg["headful"] = False
    if "--check" in argv:
        return check_session(cfg)
    return do_login(cfg)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
