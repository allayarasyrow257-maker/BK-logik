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

import json
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from PIL import Image
    _PIL_OK = True
except Exception:
    _PIL_OK = False

from backend.auth import hash_password, verify_password, create_token, decode_token
from backend.database import db_session, init_db

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "data" / "images"
THUMBS_DIR = IMAGES_DIR / ".thumbs"
ALLOWED_THUMB_W = (80, 96, 120, 160, 200, 320, 480, 640, 800)

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
    p = request.url.path
    if p.startswith("/images") or p.startswith("/api/thumb"):
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

    # snap requested width to the nearest allowed size (bounds the cache)
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
                im.save(cache, "JPEG", quality=72, progressive=True, optimize=True)
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
def change_password(req: PasswordChange, user: dict = Depends(require_dealer)):
    with db_session() as conn:
        dealer = conn.execute("SELECT * FROM dealer WHERE id = 1").fetchone()
        if not dealer or not verify_password(req.current_password, dealer["password_hash"]):
            raise HTTPException(status_code=400, detail="Mevcut sifre yanlis")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="Yeni sifre en az 6 karakter olmali")
        conn.execute(
            "UPDATE dealer SET password_hash = ? WHERE id = 1",
            (hash_password(req.new_password),),
        )
    return {"message": "Sifre basariyla degistirildi"}


@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdate, user: dict = Depends(require_dealer)):
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
            dealer = conn.execute("SELECT * FROM dealer WHERE id = 1").fetchone()
            if not dealer or not verify_password(req.current_password, dealer["password_hash"]):
                raise HTTPException(status_code=400, detail="Mevcut sifre yanlis")
        if len(req.new_password) < 6:
            raise HTTPException(status_code=400, detail="Yeni sifre en az 6 karakter olmali")
        updates["password_hash"] = hash_password(req.new_password)

    if not updates:
        raise HTTPException(status_code=400, detail="Guncellenecek alan yok")

    with db_session() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE dealer SET {set_clause} WHERE id = 1", list(updates.values()))

    return {"message": "Profil guncellendi", "username": req.username}


# ── Araclar ─────────────────────────────────────────────────────────────


def _car_to_dict(row) -> dict:
    d = dict(row)
    d["images"] = json.loads(d.get("images") or "[]")
    d["local_images"] = json.loads(d.get("local_images") or "[]")
    return d


@app.get("/api/cars")
def list_cars(user: dict = Depends(get_current_user)):
    with db_session() as conn:
        if user["role"] == "dealer":
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

        return [_car_to_dict(r) for r in rows]


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

        car = _car_to_dict(row)

        # Atama bilgilerini ekle
        assignments = conn.execute("""
            SELECT a.id as assignment_id, a.assigned_at, c.id, c.name, c.phone, c.email
            FROM assignments a
            JOIN customers c ON c.id = a.customer_id
            WHERE a.car_id = ?
        """, (car_id,)).fetchall()

        car["assigned_customers"] = [dict(a) for a in assignments]
        return car


# ── Musteriler ──────────────────────────────────────────────────────────


@app.get("/api/customers")
def list_customers(user: dict = Depends(require_dealer)):
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


@app.post("/api/customers", status_code=201)
def create_customer(req: CustomerCreate, user: dict = Depends(require_dealer)):
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
def update_customer(customer_id: int, req: CustomerUpdate, user: dict = Depends(require_dealer)):
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
def delete_customer(customer_id: int, user: dict = Depends(require_dealer)):
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
def list_assignments(user: dict = Depends(require_dealer)):
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
def create_assignment(req: AssignmentCreate, user: dict = Depends(require_dealer)):
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
def update_assignment(assignment_id: int, req: AssignmentUpdate, user: dict = Depends(require_dealer)):
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
def delete_assignment(assignment_id: int, user: dict = Depends(require_dealer)):
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
def trigger_sync(user: dict = Depends(require_dealer)):
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
def sync_status(user: dict = Depends(require_dealer)):
    return _sync_status


# ── Dashboard ───────────────────────────────────────────────────────────


@app.get("/api/stats")
def get_stats(user: dict = Depends(require_dealer)):
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

        return {
            "total_cars": total_cars,
            "total_customers": total_customers,
            "total_assignments": total_assignments,
            "unassigned_cars": unassigned,
            "status_breakdown": {r["status"]: r["cnt"] for r in status_counts},
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8001, reload=False)
