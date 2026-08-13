"""
BK Logic - SQLite veritabani yonetimi.

Tablolar:
  - cars: Primeauto'dan cekilen tum arac verileri
  - customers: Dealer'in musterileri
  - assignments: Hangi arac hangi musteriye ait
  - dealer: Dealer (admin) hesabi
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "bklogic.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_session():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Veritabanini olustur veya guncelle."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with db_session() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS dealer (
                id          INTEGER PRIMARY KEY CHECK (id = 1),
                username    TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                name        TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS cars (
                id              TEXT PRIMARY KEY,
                slug            TEXT NOT NULL,
                source_url      TEXT NOT NULL DEFAULT '',
                title           TEXT NOT NULL DEFAULT '',
                vin             TEXT NOT NULL DEFAULT '',
                lot_number      TEXT NOT NULL DEFAULT '',
                make            TEXT NOT NULL DEFAULT '',
                model           TEXT NOT NULL DEFAULT '',
                year            INTEGER,
                color           TEXT NOT NULL DEFAULT '',
                container       TEXT NOT NULL DEFAULT '',
                shipping_line   TEXT NOT NULL DEFAULT '',
                arrival_date    TEXT NOT NULL DEFAULT '',
                auction_city    TEXT NOT NULL DEFAULT '',
                car_price       REAL,
                transport_price REAL,
                status          TEXT NOT NULL DEFAULT '',
                cover           TEXT NOT NULL DEFAULT '',
                images          TEXT NOT NULL DEFAULT '[]',
                local_images    TEXT NOT NULL DEFAULT '[]',
                key_status      TEXT NOT NULL DEFAULT '',
                purchase_date   TEXT NOT NULL DEFAULT '',
                warehouse_date  TEXT NOT NULL DEFAULT '',
                added_at        TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS customers (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                phone       TEXT NOT NULL DEFAULT '',
                email       TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                password_plain TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone
                ON customers(phone) WHERE phone != '';

            CREATE TABLE IF NOT EXISTS assignments (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                car_id      TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                payment_status TEXT NOT NULL DEFAULT 'unpaid',
                assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(car_id, customer_id)
            );

            CREATE INDEX IF NOT EXISTS idx_assignments_customer
                ON assignments(customer_id);

            CREATE INDEX IF NOT EXISTS idx_assignments_car
                ON assignments(car_id);

            CREATE INDEX IF NOT EXISTS idx_cars_vin
                ON cars(vin) WHERE vin != '';
        """)

        # Migration: store the plaintext password too, so a dealer can view /
        # re-issue a customer's password from the admin panel.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(customers)").fetchall()]
        if "password_plain" not in cols:
            conn.execute("ALTER TABLE customers ADD COLUMN password_plain TEXT NOT NULL DEFAULT ''")

    # Migration: yeni kolonlari ekle (varsa atla)
    with db_session() as conn:
        assignment_cols = [r[1] for r in conn.execute("PRAGMA table_info(assignments)").fetchall()]
        if "payment_status" not in assignment_cols:
            conn.execute("ALTER TABLE assignments ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'")

        cars_cols = [r[1] for r in conn.execute("PRAGMA table_info(cars)").fetchall()]
        for col, definition in [
            ("key_status", "TEXT NOT NULL DEFAULT ''"),
            ("purchase_date", "TEXT NOT NULL DEFAULT ''"),
            ("warehouse_date", "TEXT NOT NULL DEFAULT ''"),
        ]:
            if col not in cars_cols:
                conn.execute(f"ALTER TABLE cars ADD COLUMN {col} {definition}")

    print(f"Veritabani hazir: {DB_PATH}")


if __name__ == "__main__":
    init_db()
