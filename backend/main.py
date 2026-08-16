"""
BK Logic - FastAPI Backend

API Endpoints:
  POST /api/auth/login          - Dealer veya musteri girisi
  GET  /api/cars                - Arac listesi (rol bazli)
  GET  /api/cars/{car_id}       - Arac detayi
  GET  /api/customers           - Musteri listesi (sadece dealer)
  POST /api/customers           - Musteri ekle (sadece dealer)
  DELETE /api/customers/{id}    - Musteri sil (sadece dealer)
  POST /api/assignments         - Arac -> musteri ata (sadece dealer)
  DELETE /api/assignments/{id}  - Atama sil (sadece dealer)
  GET  /api/assignments         - Atamalar (sadece dealer)
  POST /api/sync                - Manuel sync tetikle (sadece dealer)
  GET  /api/stats               - Dashboard istatistikleri (sadece dealer)
"""

from __future__ import annotations

import hashlib
import json
import re
import socket
import ssl
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.auth import hash_password, verify_password, create_token, decode_token
from backend.database import db_session, init_db

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "data" / "images"
THUMBS_DIR = IMAGES_DIR / ".thumbs"
ALLOWED_THUMB_W = (80, 96, 120, 160, 200, 320, 480, 640, 800, 1200)

# ── Image-proxy cache / robustness config ───────────────────────────────
PROXY_CACHE_DIR = IMAGES_DIR / ".proxy"
_ALLOWED_PROXY_HOSTS = ("primeauto.ge",)
_PROXY_TIMEOUT = 20
_PROXY_RETRIES = 3
_PROXY_MAX_BYTES = 25 * 1024 * 1024  # 25 MB guard
_PROXY_SSL_CTX = ssl.create_default_context()
# Per-URL locks so a gallery requesting the same image concurrently
# fetches upstream once instead of stampeding it.
_proxy_locks: dict[str, threading.Lock] = {}
_proxy_locks_guard = threading.Lock()


def _proxy_host_allowed(hostname: str) -> bool:
    hostname = (hostname or "").lower()
    return any(
        hostname == h or hostname.endswith("." + h) for h in _ALLOWED_PROXY_HOSTS
    )


def _proxy_lock_for(key: str) -> threading.Lock:
    with _proxy_locks_guard:
        lock = _proxy_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _proxy_locks[key] = lock
        return lock

try:
    from PIL import Image
    _PIL_OK = True
except Exception:
    _PIL_OK = False

app = FastAPI(title="BK Logic API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _add_image_cache_headers(request, call_next):
    resp = await call_next(request)
    path = request.url.path
    if path.startswith("/images") or path.startswith("/api/thumb"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp

# Statik dosyalar (resimler)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")


@app.get("/api/thumb")
def thumbnail(path: str = Query(...), w: int = Query(200)):
    """Resized, progressive-JPEG thumbnail with on-disk cache. Falls back to the
    original file if Pillow is unavailable or the image can't be processed."""
    rel = path.replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(status_code=400, detail="bad path")
    src = (IMAGES_DIR / rel).resolve()
    try:
        src.relative_to(IMAGES_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="bad path")
    if not src.is_file():
        raise HTTPException(status_code=404, detail="not found")

    width = min(ALLOWED_THUMB_W, key=lambda x: abs(x - w))

    if not _PIL_OK:
        return FileResponse(str(src))

    cache = (THUMBS_DIR / str(width) / rel).with_suffix(".jpg")
    try:
        fresh = cache.is_file() and cache.stat().st_mtime >= src.stat().st_mtime
        if not fresh:
            cache.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(src) as im:
                im = im.convert("RGB")
                im.thumbnail((width, width * 4), Image.LANCZOS)
                im.save(cache, "JPEG", quality=66, progressive=True, optimize=True)
    except Exception:
        return FileResponse(str(src))

    return FileResponse(str(cache), media_type="image/jpeg")


# ── Modeller ────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str


class CustomerCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    password: str


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    password: str | None = None


class AssignmentCreate(BaseModel):
    car_id: str
    customer_id: int


class AssignmentUpdate(BaseModel):
    payment_status: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdate(BaseModel):
    username: str | None = None
    current_password: str = ""
    new_password: str | None = None


class CarIn(BaseModel):
    title: str
    vin: str = ""
    lot_number: str = ""
    make: str = ""
    model: str = ""
    year: int | None = None
    color: str = ""
    container: str = ""
    shipping_line: str = ""
    arrival_date: str = ""
    auction_city: str = ""
    car_price: float | None = None
    transport_price: float | None = None
    status: str = ""
    key_status: str = ""
    purchase_date: str = ""
    warehouse_date: str = ""
    booking_code: str = ""
    pickup_date: str = ""
    loading_date: str = ""
    dispatch_date: str = ""


# ── Auth yardimcilari ───────────────────────────────────────────────────


def get_current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token gerekli")
    token = authorization[7:]
    user = decode_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Gecersiz veya suresi dolmus token")
    return user


def require_dealer(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "dealer":
        raise HTTPException(status_code=403, detail="Yetkisiz: sadece dealer erisebilir")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """dealer VEYA bkadmin erisebilir."""
    if user.get("role") not in ("dealer", "bkadmin"):
        raise HTTPException(status_code=403, detail="Yetkisiz")
    return user


def _admin_table(user: dict) -> str:
    return "bkadmin" if user.get("role") == "bkadmin" else "dealer"


def _get_setting(key: str, default: str = "") -> str:
    with db_session() as conn:
        r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return r["value"] if r else default


def _flag(key: str) -> bool:
    return _get_setting(key, "0") == "1"


# ── Startup ─────────────────────────────────────────────────────────────


@app.on_event("startup")
def startup():
    init_db()
    # Varsayilan dealer hesabi olustur (yoksa)
    with db_session() as conn:
        dealer = conn.execute("SELECT id FROM dealer WHERE id = 1").fetchone()
        if not dealer:
            conn.execute(
                "INSERT INTO dealer (id, username, password_hash, name) VALUES (1, ?, ?, ?)",
                ("admin", hash_password("admin123"), "BK Logic Dealer"),
            )
            print("Varsayilan dealer hesabi olusturuldu: admin / admin123")
        bk = conn.execute("SELECT id FROM bkadmin WHERE id = 1").fetchone()
        if not bk:
            conn.execute(
                "INSERT INTO bkadmin (id, username, password_hash, name) VALUES (1, ?, ?, ?)",
                ("BKadmin", hash_password("Bkadmin123"), "BKadmin"),
            )
            print("BKadmin hesabi olusturuldu: BKadmin / Bkadmin123")
        for _k, _v in (("bkadmin_sync_enabled", "0"), ("bkadmin_add_enabled", "0")):
            if not conn.execute("SELECT key FROM settings WHERE key = ?", (_k,)).fetchone():
                conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (_k, _v))


# ── Auth ────────────────────────────────────────────────────────────────


@app.post("/api/auth/login")
def login(req: LoginRequest):
    # Dealer girisi
    with db_session() as conn:
        dealer = conn.execute(
            "SELECT * FROM dealer WHERE username = ?", (req.username,)
        ).fetchone()
        if dealer and verify_password(req.password, dealer["password_hash"]):
            token = create_token(dealer["id"], "dealer", dealer["name"])
            return {"token": token, "role": "dealer", "name": dealer["name"]}

        # BKadmin girisi
        bk = conn.execute(
            "SELECT * FROM bkadmin WHERE username = ?", (req.username,)
        ).fetchone()
        if bk and verify_password(req.password, bk["password_hash"]):
            token = create_token(bk["id"], "bkadmin", bk["name"])
            return {"token": token, "role": "bkadmin", "name": bk["name"]}

        # Musteri girisi (telefon veya email ile)
        customer = conn.execute(
            "SELECT * FROM customers WHERE phone = ? OR email = ?",
            (req.username, req.username),
        ).fetchone()
        if customer and verify_password(req.password, customer["password_hash"]):
            token = create_token(customer["id"], "customer", customer["name"])
            return {"token": token, "role": "customer", "name": customer["name"]}

    raise HTTPException(status_code=401, detail="Yanlis kullanici adi veya sifre")


@app.put("/api/auth/password")
def change_password(req: PasswordChange, user: dict = Depends(require_admin)):
    table = _admin_table(user)
    with db_session() as conn:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = 1").fetchone()
        if not row or not verify_password(req.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Mevcut sifre yanlis")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="Yeni sifre en az 6 karakter olmali")
        conn.execute(
            f"UPDATE {table} SET password_hash = ? WHERE id = 1",
            (hash_password(req.new_password),),
        )
    return {"message": "Sifre basariyla degistirildi"}


@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdate, user: dict = Depends(require_admin)):
    table = _admin_table(user)
    updates = {}

    if req.username is not None:
        username = req.username.strip()
        if len(username) < 3:
            raise HTTPException(status_code=400, detail="Kullanici adi en az 3 karakter olmali")
        updates["username"] = username

    if req.new_password is not None:
        if not req.current_password:
            raise HTTPException(status_code=400, detail="Mevcut sifre gerekli")
        with db_session() as conn:
            dealer = conn.execute(f"SELECT * FROM {table} WHERE id = 1").fetchone()
            if not dealer or not verify_password(req.current_password, dealer["password_hash"]):
                raise HTTPException(status_code=400, detail="Mevcut sifre yanlis")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="Yeni sifre en az 6 karakter olmali")
        updates["password_hash"] = hash_password(req.new_password)

    if not updates:
        raise HTTPException(status_code=400, detail="Guncellenecek alan yok")

    with db_session() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE {table} SET {set_clause} WHERE id = 1", list(updates.values()))

    return {"message": "Profil guncellendi", "username": req.username}


# ── Araclar ─────────────────────────────────────────────────────────────


def _car_to_dict(row, hide_transport: bool = False) -> dict:
    d = dict(row)
    d["images"] = json.loads(d.get("images") or "[]")
    d["local_images"] = json.loads(d.get("local_images") or "[]")
    if hide_transport:
        d.pop("transport_price", None)
    return d


@app.get("/api/cars")
def list_cars(user: dict = Depends(get_current_user)):
    with db_session() as conn:
        if user["role"] in ("dealer", "bkadmin"):
            rows = conn.execute(
                "SELECT * FROM cars ORDER BY updated_at DESC"
            ).fetchall()
        else:
            # Musteri: sadece atanmis araclari goster (payment_status dahil)
            rows = conn.execute("""
                SELECT c.*, a.payment_status FROM cars c
                INNER JOIN assignments a ON a.car_id = c.id
                WHERE a.customer_id = ?
                ORDER BY c.updated_at DESC
            """, (int(user["sub"]),)).fetchall()

        return [_car_to_dict(r, hide_transport=(user["role"] == "customer")) for r in rows]


@app.get("/api/cars/{car_id}")
def get_car(car_id: str, user: dict = Depends(get_current_user)):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")

        # Musteri ise, araci gormeye yetkili mi?
        if user["role"] == "customer":
            assigned = conn.execute(
                "SELECT 1 FROM assignments WHERE car_id = ? AND customer_id = ?",
                (car_id, int(user["sub"])),
            ).fetchone()
            if not assigned:
                raise HTTPException(status_code=403, detail="Bu araci gormeye yetkiniz yok")

        car = _car_to_dict(row, hide_transport=(user["role"] == "customer"))

        # Atama bilgilerini ekle
        assignments = conn.execute("""
            SELECT a.id as assignment_id, a.assigned_at, c.id, c.name, c.phone, c.email
            FROM assignments a
            JOIN customers c ON c.id = a.customer_id
            WHERE a.car_id = ?
        """, (car_id,)).fetchall()

        car["assigned_customers"] = [dict(a) for a in assignments]
        return car


# Editable arac alanlari (id/slug/images/added_at haric)
_CAR_EDITABLE_FIELDS = (
    "title", "vin", "lot_number", "make", "model", "year", "color",
    "container", "shipping_line", "arrival_date", "auction_city",
    "car_price", "transport_price", "status", "key_status",
    "purchase_date", "warehouse_date", "booking_code",
    "pickup_date", "loading_date", "dispatch_date",
)


def _slugify(text: str) -> str:
    """URL-safe slug: kucuk harf, alfanumerik olmayan -> '-', tekrarlari birlestir."""
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower())
    return s.strip("-")


@app.post("/api/cars", status_code=201)
def create_car(req: CarIn, user: dict = Depends(require_admin)):
    if user.get("role") == "bkadmin" and not _flag("bkadmin_add_enabled"):
        raise HTTPException(status_code=403, detail="Yetkisiz: arac ekleme kapali")
    slug = _slugify(req.title) or _slugify(req.vin) or "car"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    with db_session() as conn:
        # Benzersiz id uret: 'm-' + slug, gerekirse -2, -3, ...
        base_id = "m-" + slug
        car_id = base_id
        n = 2
        while conn.execute("SELECT 1 FROM cars WHERE id = ?", (car_id,)).fetchone():
            car_id = f"{base_id}-{n}"
            n += 1

        car_data = {
            "id": car_id,
            "slug": slug,
            "source_url": "",
            "title": req.title,
            "vin": req.vin,
            "lot_number": req.lot_number,
            "make": req.make,
            "model": req.model,
            "year": req.year,
            "color": req.color,
            "container": req.container,
            "shipping_line": req.shipping_line,
            "arrival_date": req.arrival_date,
            "auction_city": req.auction_city,
            "car_price": req.car_price,
            "transport_price": req.transport_price,
            "status": req.status,
            "cover": "",
            "images": "[]",
            "local_images": "[]",
            "key_status": req.key_status,
            "purchase_date": req.purchase_date,
            "warehouse_date": req.warehouse_date,
            "booking_code": req.booking_code,
            "pickup_date": req.pickup_date,
            "loading_date": req.loading_date,
            "dispatch_date": req.dispatch_date,
            "added_at": now,
            "updated_at": now,
        }

        conn.execute("""
            INSERT INTO cars (
                id, slug, source_url, title, vin, lot_number,
                make, model, year, color, container, shipping_line,
                arrival_date, auction_city, car_price, transport_price,
                status, cover, images, local_images,
                key_status, purchase_date, warehouse_date,
                booking_code, pickup_date, loading_date, dispatch_date,
                added_at, updated_at
            ) VALUES (
                :id, :slug, :source_url, :title, :vin, :lot_number,
                :make, :model, :year, :color, :container, :shipping_line,
                :arrival_date, :auction_city, :car_price, :transport_price,
                :status, :cover, :images, :local_images,
                :key_status, :purchase_date, :warehouse_date,
                :booking_code, :pickup_date, :loading_date, :dispatch_date,
                :added_at, :updated_at
            )
        """, car_data)

        row = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        return _car_to_dict(row)


@app.put("/api/cars/{car_id}")
def update_car(car_id: str, req: CarIn, user: dict = Depends(require_admin)):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT id FROM cars WHERE id = ?", (car_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")

        data = req.model_dump()
        updates = {k: data[k] for k in _CAR_EDITABLE_FIELDS}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [car_id]
        conn.execute(f"UPDATE cars SET {set_clause} WHERE id = ?", values)

        row = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        return _car_to_dict(row)


@app.delete("/api/cars/{car_id}")
def delete_car(car_id: str, user: dict = Depends(require_admin)):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT id FROM cars WHERE id = ?", (car_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")
        conn.execute("DELETE FROM assignments WHERE car_id = ?", (car_id,))
        conn.execute("DELETE FROM cars WHERE id = ?", (car_id,))
        return {"message": "Arac silindi"}


@app.post("/api/cars/{car_id}/images")
async def upload_car_images(
    car_id: str,
    files: list[UploadFile] = File(...),
    user: dict = Depends(require_admin),
):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")

        local_images = json.loads(row["local_images"] or "[]")
        cover = row["cover"] or ""

        car_dir = IMAGES_DIR / car_id
        car_dir.mkdir(parents=True, exist_ok=True)

        # Sonraki sira numarasini mevcut dosyalardan hesapla
        next_n = 1
        for f in car_dir.iterdir():
            m = re.match(r"^(\d+)", f.name)
            if m:
                next_n = max(next_n, int(m.group(1)) + 1)

        new_paths = []
        for up in files:
            if not (up.content_type or "").startswith("image/"):
                raise HTTPException(status_code=400, detail="Sadece resim dosyalari yuklenebilir")
            ext = Path(up.filename or "").suffix or ".jpg"
            filename = f"{next_n:02d}{ext}"
            dest = car_dir / filename
            data = await up.read()
            dest.write_bytes(data)
            relative_path = f"images/{car_id}/{filename}"
            local_images.append(relative_path)
            new_paths.append(relative_path)
            next_n += 1

        # Kapak resmi yoksa ilk yuklenen resmi ata
        if not cover and new_paths:
            cover = new_paths[0]

        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        conn.execute(
            "UPDATE cars SET local_images = ?, cover = ?, updated_at = ? WHERE id = ?",
            (json.dumps(local_images), cover, now, car_id),
        )

        updated = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        return _car_to_dict(updated)


@app.delete("/api/cars/{car_id}/images")
def delete_car_image(
    car_id: str,
    path: str = Body(..., embed=True),
    user: dict = Depends(require_admin),
):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")

        local_images = json.loads(row["local_images"] or "[]")
        if path in local_images:
            local_images.remove(path)

        # Dosyayi sil (best-effort)
        try:
            rel = path[len("images/"):] if path.startswith("images/") else path
            (IMAGES_DIR / rel).unlink(missing_ok=True)
        except Exception:
            pass

        cover = row["cover"] or ""
        if cover == path:
            cover = local_images[0] if local_images else ""

        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        conn.execute(
            "UPDATE cars SET local_images = ?, cover = ?, updated_at = ? WHERE id = ?",
            (json.dumps(local_images), cover, now, car_id),
        )

        updated = conn.execute("SELECT * FROM cars WHERE id = ?", (car_id,)).fetchone()
        return _car_to_dict(updated)


# ── Musteriler ──────────────────────────────────────────────────────────


@app.get("/api/customers")
def list_customers(user: dict = Depends(require_admin)):
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, name, phone, email, password_plain, created_at FROM customers ORDER BY name"
        ).fetchall()
        customers = []
        for r in rows:
            c = dict(r)
            # Her musteriye atanmis arac sayisi
            count = conn.execute(
                "SELECT COUNT(*) as cnt FROM assignments WHERE customer_id = ?",
                (c["id"],),
            ).fetchone()
            c["car_count"] = count["cnt"]
            customers.append(c)
        return customers


@app.get("/api/customers/{customer_id}/cars")
def customer_cars(customer_id: int, user: dict = Depends(require_admin)):
    """Admin/BKadmin: a single customer's assigned cars (full transport info)."""
    with db_session() as conn:
        exists = conn.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Musteri bulunamadi")
        rows = conn.execute("""
            SELECT c.*, a.payment_status FROM cars c
            INNER JOIN assignments a ON a.car_id = c.id
            WHERE a.customer_id = ?
            ORDER BY c.updated_at DESC
        """, (customer_id,)).fetchall()
        return [_car_to_dict(r, hide_transport=False) for r in rows]


@app.post("/api/customers", status_code=201)
def create_customer(req: CustomerCreate, user: dict = Depends(require_admin)):
    with db_session() as conn:
        # Telefon benzersiz kontrolu
        if req.phone:
            existing = conn.execute(
                "SELECT id FROM customers WHERE phone = ?", (req.phone,)
            ).fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Bu telefon zaten kayitli")

        pw_hash = hash_password(req.password)
        cursor = conn.execute(
            "INSERT INTO customers (name, phone, email, password_hash, password_plain) VALUES (?, ?, ?, ?, ?)",
            (req.name, req.phone, req.email, pw_hash, req.password),
        )
        return {"id": cursor.lastrowid, "name": req.name, "phone": req.phone, "email": req.email}


@app.put("/api/customers/{customer_id}")
def update_customer(customer_id: int, req: CustomerUpdate, user: dict = Depends(require_admin)):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT * FROM customers WHERE id = ?", (customer_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Musteri bulunamadi")

        updates = {}
        if req.name is not None:
            updates["name"] = req.name
        if req.phone is not None:
            updates["phone"] = req.phone
        if req.email is not None:
            updates["email"] = req.email
        if req.password is not None:
            updates["password_hash"] = hash_password(req.password)
            updates["password_plain"] = req.password

        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [customer_id]
            conn.execute(f"UPDATE customers SET {set_clause} WHERE id = ?", values)

        return {"message": "Musteri guncellendi"}


@app.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: int, user: dict = Depends(require_admin)):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT id FROM customers WHERE id = ?", (customer_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Musteri bulunamadi")
        conn.execute("DELETE FROM assignments WHERE customer_id = ?", (customer_id,))
        conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        return {"message": "Musteri silindi"}


# ── Atamalar ────────────────────────────────────────────────────────────


@app.get("/api/assignments")
def list_assignments(user: dict = Depends(require_admin)):
    with db_session() as conn:
        rows = conn.execute("""
            SELECT a.id, a.car_id, a.customer_id, a.assigned_at, a.payment_status,
                   c.name as customer_name, c.phone as customer_phone,
                   cars.title as car_title, cars.vin as car_vin
            FROM assignments a
            JOIN customers c ON c.id = a.customer_id
            JOIN cars ON cars.id = a.car_id
            ORDER BY a.assigned_at DESC
        """).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/assignments", status_code=201)
def create_assignment(req: AssignmentCreate, user: dict = Depends(require_admin)):
    with db_session() as conn:
        # Arac ve musteri var mi?
        car = conn.execute("SELECT id FROM cars WHERE id = ?", (req.car_id,)).fetchone()
        if not car:
            raise HTTPException(status_code=404, detail="Arac bulunamadi")

        customer = conn.execute(
            "SELECT id FROM customers WHERE id = ?", (req.customer_id,)
        ).fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Musteri bulunamadi")

        # Zaten atanmis mi?
        existing = conn.execute(
            "SELECT id FROM assignments WHERE car_id = ? AND customer_id = ?",
            (req.car_id, req.customer_id),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Bu arac zaten bu musteriye atanmis")

        cursor = conn.execute(
            "INSERT INTO assignments (car_id, customer_id) VALUES (?, ?)",
            (req.car_id, req.customer_id),
        )
        return {"id": cursor.lastrowid, "message": "Arac musteriye atandi"}


@app.put("/api/assignments/{assignment_id}")
def update_assignment(assignment_id: int, req: AssignmentUpdate, user: dict = Depends(require_admin)):
    if req.payment_status not in ("paid", "unpaid"):
        raise HTTPException(status_code=400, detail="Gecersiz odeme durumu")
    with db_session() as conn:
        existing = conn.execute(
            "SELECT id FROM assignments WHERE id = ?", (assignment_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Atama bulunamadi")
        conn.execute(
            "UPDATE assignments SET payment_status = ? WHERE id = ?",
            (req.payment_status, assignment_id),
        )
    return {"message": "Odeme durumu guncellendi"}


@app.delete("/api/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, user: dict = Depends(require_admin)):
    with db_session() as conn:
        existing = conn.execute(
            "SELECT id FROM assignments WHERE id = ?", (assignment_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Atama bulunamadi")
        conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
        return {"message": "Atama silindi"}


# ── Sync ────────────────────────────────────────────────────────────────


_sync_lock = threading.Lock()
_sync_status = {"running": False, "last_result": None}


@app.post("/api/sync")
def trigger_sync(user: dict = Depends(require_admin)):
    if user.get("role") == "bkadmin" and not _flag("bkadmin_sync_enabled"):
        raise HTTPException(status_code=403, detail="Yetkisiz: sync kapali")
    if _sync_status["running"]:
        raise HTTPException(status_code=409, detail="Senkronizasyon zaten calisiyor")

    def _run():
        _sync_status["running"] = True
        try:
            from backend.sync import run_sync
            result = run_sync()
            _sync_status["last_result"] = result
        except Exception as e:
            _sync_status["last_result"] = {"error": str(e)}
        finally:
            _sync_status["running"] = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"message": "Senkronizasyon baslatildi"}


@app.get("/api/sync/status")
def sync_status(user: dict = Depends(require_admin)):
    return _sync_status


# ── Dashboard ───────────────────────────────────────────────────────────


@app.get("/api/stats")
def get_stats(user: dict = Depends(require_admin)):
    with db_session() as conn:
        total_cars = conn.execute("SELECT COUNT(*) as cnt FROM cars").fetchone()["cnt"]
        total_customers = conn.execute("SELECT COUNT(*) as cnt FROM customers").fetchone()["cnt"]
        total_assignments = conn.execute("SELECT COUNT(*) as cnt FROM assignments").fetchone()["cnt"]
        unassigned = conn.execute("""
            SELECT COUNT(*) as cnt FROM cars
            WHERE id NOT IN (SELECT car_id FROM assignments)
        """).fetchone()["cnt"]

        # Duruma gore arac sayilari
        status_counts = conn.execute("""
            SELECT status, COUNT(*) as cnt FROM cars GROUP BY status
        """).fetchall()

        total_car_value = conn.execute(
            "SELECT COALESCE(SUM(car_price), 0) as total FROM cars"
        ).fetchone()["total"]
        total_transport = conn.execute(
            "SELECT COALESCE(SUM(transport_price), 0) as total FROM cars"
        ).fetchone()["total"]
        paid_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM assignments WHERE payment_status = 'paid'"
        ).fetchone()["cnt"]
        unpaid_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM assignments WHERE payment_status = 'unpaid'"
        ).fetchone()["cnt"]

        return {
            "total_cars": total_cars,
            "total_customers": total_customers,
            "total_assignments": total_assignments,
            "unassigned_cars": unassigned,
            "status_breakdown": {r["status"]: r["cnt"] for r in status_counts},
            "total_car_value": round(float(total_car_value), 2),
            "total_transport": round(float(total_transport), 2),
            "paid_count": paid_count,
            "unpaid_count": unpaid_count,
        }


class SettingsUpdate(BaseModel):
    bkadmin_sync_enabled: bool | None = None
    bkadmin_add_enabled: bool | None = None


@app.get("/api/settings")
def get_settings(user: dict = Depends(require_admin)):
    return {
        "bkadmin_sync_enabled": _flag("bkadmin_sync_enabled"),
        "bkadmin_add_enabled": _flag("bkadmin_add_enabled"),
    }


@app.put("/api/settings")
def update_settings(req: SettingsUpdate, user: dict = Depends(require_dealer)):
    with db_session() as conn:
        for k in ("bkadmin_sync_enabled", "bkadmin_add_enabled"):
            v = getattr(req, k)
            if v is not None:
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (k, "1" if v else "0"),
                )
    return {
        "bkadmin_sync_enabled": _flag("bkadmin_sync_enabled"),
        "bkadmin_add_enabled": _flag("bkadmin_add_enabled"),
    }


# ── Image Proxy ─────────────────────────────────────────────────────────


def _fetch_upstream_image(url: str) -> tuple[bytes, str]:
    """Fetch an image from upstream with retries + backoff.

    Retries transient network errors (connection reset, TLS glitch, timeout)
    and upstream 5xx responses. 4xx responses fail fast (no point retrying).
    Returns (bytes, content_type). Raises HTTPException on final failure.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://primeauto.ge/",
    }
    last_reason = "bilinmeyen hata"
    for attempt in range(_PROXY_RETRIES):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(
                req, timeout=_PROXY_TIMEOUT, context=_PROXY_SSL_CTX
            ) as resp:
                content_type = resp.headers.get("Content-Type", "image/jpeg")
                image_bytes = resp.read(_PROXY_MAX_BYTES + 1)
        except urllib.error.HTTPError as exc:
            # 5xx is worth retrying; 4xx is not.
            if exc.code and 500 <= exc.code < 600 and attempt < _PROXY_RETRIES - 1:
                last_reason = f"{exc.code} {exc.reason}"
                time.sleep(0.4 * (attempt + 1))
                continue
            raise HTTPException(
                status_code=exc.code or 502, detail=f"Upstream hata: {exc.reason}"
            )
        except (
            urllib.error.URLError,
            ConnectionError,
            ssl.SSLError,
            socket.timeout,
            TimeoutError,
        ) as exc:
            last_reason = str(getattr(exc, "reason", exc)) or exc.__class__.__name__
            if attempt < _PROXY_RETRIES - 1:
                time.sleep(0.4 * (attempt + 1))
                continue
            break
        else:
            if len(image_bytes) > _PROXY_MAX_BYTES:
                raise HTTPException(status_code=502, detail="Gorsel cok buyuk")
            if not content_type.lower().startswith("image/"):
                # Some upstreams return an HTML error page with a 200 status.
                raise HTTPException(
                    status_code=502, detail="Upstream gorsel dondurmedi"
                )
            return image_bytes, content_type
    raise HTTPException(status_code=502, detail=f"Gorsel alinamadi: {last_reason}")


@app.get("/api/proxy-image")
def proxy_image(url: str):
    """Fetch an external image from primeauto.ge and stream it back.

    Allows mobile browsers to download cross-origin images as blobs
    without hitting CORS restrictions. Results are cached on disk and
    upstream fetches retry transient failures to avoid spurious 502s.
    """
    from urllib.parse import urlparse

    try:
        parsed_url = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Gecersiz URL")

    if parsed_url.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Gecersiz URL")
    if not _proxy_host_allowed(parsed_url.hostname):
        raise HTTPException(
            status_code=403, detail="Sadece primeauto.ge gorsellerine izin verilir"
        )

    cache_headers = {"Cache-Control": "public, max-age=604800"}
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_file = PROXY_CACHE_DIR / key[:2] / key
    type_file = cache_file.with_suffix(".type")

    def _serve_cache():
        if not cache_file.is_file():
            return None
        content_type = "image/jpeg"
        try:
            stored = type_file.read_text().strip()
            if stored:
                content_type = stored
        except Exception:
            pass
        return FileResponse(
            str(cache_file), media_type=content_type, headers=cache_headers
        )

    cached = _serve_cache()
    if cached is not None:
        return cached

    # Single-flight: only one fetch per URL even under concurrent gallery loads.
    lock = _proxy_lock_for(key)
    with lock:
        cached = _serve_cache()
        if cached is not None:
            return cached

        image_bytes, content_type = _fetch_upstream_image(url)

        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache_file.with_suffix(".tmp")
            tmp.write_bytes(image_bytes)
            tmp.replace(cache_file)
            type_file.write_text(content_type)
        except Exception:
            pass  # Caching is best-effort; still return the image.

    return Response(
        content=image_bytes, media_type=content_type, headers=cache_headers
    )
