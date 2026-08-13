#!/usr/bin/env python3
"""
Prime Auto — импортёр данных о машинах.

Скачивает страницу товара с primeauto.ge, извлекает характеристики и
фотографии, и добавляет запись в data/cars.json.

Использование:
    python3 scraper.py https://primeauto.ge/product/kia-k5-gt-line-jun/
    python3 scraper.py <url1> <url2> ...
"""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "cars.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

# Грузинская метка -> ключ в нашей модели данных
LABEL_MAP = {
    "მარკა": "make",       # Марка
    "მოდელი": "model",      # Модель
    "წელი": "year",        # Год
    "ფერი": "color",       # Цвет
    "კონტეინერი": "container",  # Контейнер
    "ჩამოსვლა": "arrivalDate",  # Дата прибытия
    "გადამზიდი": "shippingLine",  # Перевозчик
}


def fetch(url: str) -> str:
    """Скачать HTML страницы."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return html_lib.unescape(text).strip()


def parse(url: str, html: str) -> dict:
    """Разобрать HTML страницы товара в структуру данных."""
    title_m = re.search(r"<meta property=\"og:title\" content=\"([^\"]*)\"", html)
    title = _clean(title_m.group(1)) if title_m else ""
    title = title.replace(" - Prime Auto Import", "").strip()

    # VIN
    vin_m = re.search(r"VIN[^0-9A-HJ-NPR-Z]*([0-9A-HJ-NPR-Z]{11,17})", html)
    vin = vin_m.group(1) if vin_m else ""

    # Таблица характеристик: <th>метка</th> ... <td>значение</td>
    specs: dict[str, str] = {}
    for th, td in re.findall(
        r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", html, re.S
    ):
        label = _clean(th)
        value = _clean(td)
        if label in LABEL_MAP and value:
            specs[LABEL_MAP[label]] = value

    # Фотографии (полноразмерные, без миниатюр -150x150 и лого)
    all_imgs = re.findall(
        r"https://primeauto\.ge/wp-content/uploads/\d{4}/\d{2}/[^\"'\s]+\.jpe?g", html
    )
    seen: set[str] = set()
    images: list[str] = []
    for img in all_imgs:
        if "-150x150" in img or "logo" in img.lower() or "fav" in img.lower():
            continue
        if img not in seen:
            seen.add(img)
            images.append(img)

    slug = urlparse(url).path.rstrip("/").split("/")[-1]

    year = specs.get("year", "")
    try:
        year_val: int | str = int(year)
    except (ValueError, TypeError):
        year_val = year

    return {
        "id": slug,
        "slug": slug,
        "sourceUrl": url,
        "title": title,
        "vin": vin,
        "make": specs.get("make", ""),
        "model": specs.get("model", ""),
        "year": year_val,
        "color": specs.get("color", ""),
        "container": specs.get("container", ""),
        "shippingLine": specs.get("shippingLine", ""),
        "arrivalDate": specs.get("arrivalDate", ""),
        "cover": images[0] if images else "",
        "images": images,
        "addedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def load_cars() -> list[dict]:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return []


def save_cars(cars: list[dict]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(cars, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def add_car(url: str) -> dict:
    html = fetch(url)
    car = parse(url, html)
    cars = load_cars()
    # обновить, если такая машина уже есть (по id), иначе добавить
    cars = [c for c in cars if c.get("id") != car["id"]]
    cars.insert(0, car)
    save_cars(cars)
    return car


def main(argv: list[str]) -> int:
    urls = argv[1:]
    if not urls:
        print(__doc__)
        return 1
    for url in urls:
        try:
            car = add_car(url)
            print(f"✓ Добавлено: {car['title']}  ({len(car['images'])} фото)  -> {car['id']}")
        except Exception as exc:  # noqa: BLE001
            print(f"✗ Ошибка для {url}: {exc}", file=sys.stderr)
    print(f"\nВсего машин в базе: {len(load_cars())}")
    print(f"Данные: {DATA_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
