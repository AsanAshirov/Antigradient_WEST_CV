"""CarPrint API — see docs/API_CONTRACT.md."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.core.quality import MESSAGES_RU  # noqa: E402
from carprint.damage import segmenter  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import Frame, distinctiveness, verify  # noqa: E402
from carprint.identity.viz import side_by_side  # noqa: E402
from carprint.integrity.hashing import DUPLICATE_MAX_DISTANCE, hamming, phash64, sha256_hex  # noqa: E402
from carprint.integrity.ledger import Ledger  # noqa: E402
from carprint.timeline.diff import compare as timeline_compare  # noqa: E402

DATA = Path(os.environ.get("CARPRINT_DATA", ROOT / "data" / "store"))
MODELS = Path(os.environ.get("CARPRINT_MODELS", ROOT / "models"))
COHORT = Path(os.environ.get("CARPRINT_COHORT", ROOT / "data" / "cohort"))
ARTIFACTS = DATA / "artifacts"
for d in (DATA, ARTIFACTS):
    d.mkdir(parents=True, exist_ok=True)
VEHICLE_SECRET = os.environ.get("CARPRINT_VEHICLE_SECRET", "dev-only-secret").encode()
COHORT_K = 8
SHOT_PLAN = [
    ("front", "Перед целиком, 2–3 м"), ("front_left_45", "Диагональ слева спереди"), ("left", "Левый бок целиком"),
    ("rear_left_45", "Диагональ слева сзади"), ("rear", "Зад целиком"), ("rear_right_45", "Диагональ справа сзади"),
    ("right", "Правый бок целиком"), ("front_right_45", "Диагональ справа спереди"),
]
CHALLENGES = ["Покажите правое заднее колесо крупно", "Покажите левое переднее колесо крупно",
              "Покажите правое переднее колесо крупно", "Покажите левое заднее колесо крупно"]

app = FastAPI(title="CarPrint API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
ledger = Ledger(DATA / "passport.sqlite", DATA / "signing_key.pem")
compute_lock = threading.Lock()  # one heavy job at a time on a small GPU


@dataclass
class StoredFrame:
    frame_id: str
    inspection_id: str
    slot: str
    sha256: str
    phash: int
    capture_mode: str
    server_ts: str
    frame: Frame
    parts: list = field(default_factory=list)
    damages: list = field(default_factory=list)
    analyzed: bool = False


@dataclass
class Inspection:
    inspection_id: str
    vehicle_key: str
    role: str
    type: str
    nonce: str
    expires_at: datetime
    model_hint: str
    frames: list[StoredFrame] = field(default_factory=list)


INSPECTIONS: dict[str, Inspection] = {}
FRAMES: dict[str, StoredFrame] = {}
COHORT_CACHE: dict[str, list[Frame]] = {}
WEIGHTS: dict[str, np.ndarray] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def err(status: int, code: str, message_ru: str):
    raise HTTPException(status_code=status, detail={"error": {"code": code, "message_ru": message_ru}})


def vehicle_key_for(identifier: str) -> str:
    return "veh_" + hmac.new(VEHICLE_SECRET, identifier.strip().upper().encode(), hashlib.sha256).hexdigest()[:24]


def cohort_for(model_hint: str) -> list[Frame]:
    key = model_hint or "generic"
    if key not in COHORT_CACHE:
        folder = COHORT / key if (COHORT / key).is_dir() else COHORT
        paths = sorted(p for p in folder.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
        rng = np.random.default_rng(0)
        paths = list(rng.permutation(paths)[:COHORT_K]) if paths else []
        COHORT_CACHE[key] = [make_frame(f"cohort_{i}", "extra", load_image(p.read_bytes()).rgb) for i, p in enumerate(paths)]
    return COHORT_CACHE[key]


def weights_for(sf: StoredFrame, model_hint: str) -> np.ndarray:
    if sf.frame_id not in WEIGHTS:
        WEIGHTS[sf.frame_id] = distinctiveness(sf.frame, cohort_for(model_hint))
    return WEIGHTS[sf.frame_id]


def blur_regions(rgb: np.ndarray, masks: list[np.ndarray]) -> np.ndarray:
    out = rgb.copy()
    if not masks:
        return out
    m = np.any(masks, axis=0)
    blurred = cv2.GaussianBlur(rgb, (0, 0), 25)
    out[m] = blurred[m]
    return out


def save_artifact(rgb: np.ndarray, prefix: str) -> str:
    name = f"{prefix}_{uuid.uuid4().hex[:12]}.jpg"
    cv2.imwrite(str(ARTIFACTS / name), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return f"/api/v1/artifacts/{name}"


def part_at(sf: StoredFrame, inst) -> str | None:
    best, best_overlap = None, 0
    for p in sf.parts:
        ov = int(np.logical_and(p.mask, inst.mask).sum())
        if ov > best_overlap:
            best, best_overlap = p.cls, ov
    return best


def analyze_frame(sf: StoredFrame) -> dict:
    if not sf.analyzed:
        parts_model, dmg_model = segmenter.load("parts", MODELS), segmenter.load("damage", MODELS)
        sf.parts = parts_model.predict(sf.frame.rgb, 0.4) if parts_model else []
        sf.damages = dmg_model.predict(sf.frame.rgb, 0.35) if dmg_model else []
        sf.analyzed = True
    plates = [p.mask for p in sf.parts if p.cls == "license_plate"]
    overlay = blur_regions(sf.frame.rgb, plates)
    for d in sf.damages:
        overlay[d.mask] = (0.5 * overlay[d.mask] + 0.5 * np.array([231, 76, 60])).astype(np.uint8)
        x, y, w, h = d.bbox
        cv2.rectangle(overlay, (x, y), (x + w, y + h), (231, 76, 60), 2)
        cv2.putText(overlay, f"{d.cls} {d.score:.2f}", (x, max(12, y - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return {
        "frame_id": sf.frame_id, "slot": sf.slot,
        "privacy": {"plates_blurred": len(plates), "persons_blurred": 0},
        "parts": [{"part": p.cls, "score": round(p.score, 3), "bbox": list(p.bbox)} for p in sf.parts if p.cls != "license_plate"],
        "damages": [{"damage_id": f"dmg_{sf.frame_id}_{i}", "part": part_at(sf, d), "class": d.cls, "score": round(d.score, 3),
                     "area_ratio": round(d.area_ratio, 4), "bbox": list(d.bbox),
                     "status": "auto" if d.score >= 0.6 else "needs_master"} for i, d in enumerate(sf.damages)],
        "overlay_url": save_artifact(overlay, "ovl"),
    }


# ---------- endpoints ----------

class InspectionIn(BaseModel):
    vehicle_key: str | None = None
    vehicle_id_plain: str | None = None  # VIN or plate; hashed immediately, never stored
    vehicle_hint: dict | None = None
    role: str = "dealer"
    type: str = "checkin"


@app.post("/api/v1/inspections", status_code=201)
def create_inspection(body: InspectionIn):
    vk = body.vehicle_key or (vehicle_key_for(body.vehicle_id_plain) if body.vehicle_id_plain else f"veh_{uuid.uuid4().hex[:24]}")
    model_hint = ((body.vehicle_hint or {}).get("model") or "").strip().lower().replace(" ", "_")
    ins = Inspection(f"ins_{uuid.uuid4().hex[:16]}", vk, body.role, body.type, secrets.token_urlsafe(16),
                     now() + timedelta(hours=2), model_hint)
    INSPECTIONS[ins.inspection_id] = ins
    plan = [{"slot": s, "instruction": t, "required": True} for s, t in SHOT_PLAN]
    plan.append({"slot": "random_challenge", "instruction": secrets.choice(CHALLENGES), "required": True})
    return {"inspection_id": ins.inspection_id, "vehicle_key": vk, "nonce": ins.nonce,
            "expires_at": ins.expires_at.isoformat(), "shot_plan": plan}


def _get_inspection(inspection_id: str) -> Inspection:
    ins = INSPECTIONS.get(inspection_id)
    if ins is None:
        err(404, "NOT_FOUND", "Осмотр не найден")
    return ins


def _ingest(ins: Inspection, data: bytes, slot: str, capture_mode: str) -> tuple[StoredFrame, list[str]]:
    try:
        img = load_image(data)
    except Exception:
        err(400, "BAD_IMAGE", "Файл не является изображением")
    with compute_lock:
        frame = make_frame(f"frm_{uuid.uuid4().hex[:16]}", slot, img.rgb)
    ph = phash64(img.rgb)
    flags = []
    if capture_mode != "camera":
        flags.append("gallery_upload")
    for other in FRAMES.values():
        if other.inspection_id != ins.inspection_id and hamming(ph, other.phash) <= DUPLICATE_MAX_DISTANCE:
            flags.append(f"duplicate_of:{other.frame_id}")
            break
    sf = StoredFrame(frame.frame_id, ins.inspection_id, slot, sha256_hex(data), ph, capture_mode,
                     now().isoformat(), frame)
    ins.frames.append(sf)
    FRAMES[sf.frame_id] = sf
    (DATA / ins.inspection_id).mkdir(exist_ok=True)
    (DATA / ins.inspection_id / f"{sf.frame_id}.bin").write_bytes(data)  # original evidence, never served
    return sf, flags


@app.post("/api/v1/inspections/{inspection_id}/frames")
async def upload_frame(inspection_id: str, file: UploadFile = File(...), slot: str = Form("extra"),
                       nonce: str = Form(...), capture_mode: str = Form("gallery"), client_ts: str | None = Form(None)):
    ins = _get_inspection(inspection_id)
    if not hmac.compare_digest(nonce, ins.nonce):
        err(409, "NONCE_MISMATCH", "Неверный код сессии съёмки")
    if now() > ins.expires_at:
        err(409, "NONCE_EXPIRED", "Сессия съёмки истекла — начните осмотр заново")
    sf, flags = _ingest(ins, await file.read(), slot, capture_mode)
    q = sf.frame.quality
    return {"frame_id": sf.frame_id, "sha256": sf.sha256, "server_ts": sf.server_ts, "quality": q.to_dict(),
            "integrity_flags": flags, "recapture_required": not q.ok,
            "message_ru": "Кадр принят" if q.ok else "; ".join(MESSAGES_RU[i] for i in q.issues)}


@app.post("/api/v1/inspections/{inspection_id}/analyze")
def analyze(inspection_id: str):
    ins = _get_inspection(inspection_id)
    t0 = time.perf_counter()
    with compute_lock:
        frames = [analyze_frame(sf) for sf in ins.frames]
    status = "PROCESSED" if any(sf.frame.quality.ok for sf in ins.frames) else "RECAPTURE_REQUIRED"
    return {"inspection_id": ins.inspection_id, "status": status, "frames": frames,
            "latency_ms": round((time.perf_counter() - t0) * 1000)}


def _verify(ref: Inspection, cur: Inspection) -> dict:
    t0 = time.perf_counter()
    # A re-submitted reference photo would match itself perfectly: exclude it from evidence and flag it.
    recycled = {c.frame_id: r.frame_id for c in cur.frames for r in ref.frames
                if c.sha256 == r.sha256 or hamming(c.phash, r.phash) <= DUPLICATE_MAX_DISTANCE}
    fresh = [sf for sf in cur.frames if sf.frame_id not in recycled]
    with compute_lock:
        cohort = {sf.frame_id: cohort_for(ref.model_hint) for sf in ref.frames}
        v = verify([sf.frame for sf in ref.frames], [sf.frame for sf in fresh], cohort)
        for sf in ref.frames + cur.frames:
            analyze_frame(sf)
        evidence, timeline = [], []
        by_id = {sf.frame_id: sf for sf in ref.frames + cur.frames}
        best_zone: dict[tuple[str, str], object] = {}
        for z in v.zones:
            key = (z.ref_frame, z.cur_frame)
            if key not in best_zone or z.zone.n_inliers > best_zone[key].zone.n_inliers:
                best_zone[key] = z
        for (rf, cf), z in sorted(best_zone.items(), key=lambda kv: kv[1].log10_nfa_distinct)[:6]:
            r, c = by_id[rf], by_id[cf]
            viz = side_by_side(r.frame, c.frame, weights_for(r, ref.model_hint))
            evidence.append({**z.to_dict(), "slot": r.slot, "match_viz_url": save_artifact(viz, "m")})
            for item in timeline_compare(r.damages, c.damages, z.zone.H, r.frame.rgb.shape, c.frame.rgb.shape,
                                         part_of=lambda inst, sf=c: part_at(sf, inst)):
                timeline.append({"status": item.status, "class": item.cls, "part": item.part, "slot": r.slot,
                                 "cur_bbox": item.cur_bbox, "ref_bbox": item.ref_bbox,
                                 "first_seen_inspection_id": ref.inspection_id if item.status == "previously_recorded" else None})
    flags = sorted({"gallery_upload" for sf in cur.frames if sf.capture_mode != "camera"})
    flags += [f"recycled_reference_photo:{cid}->{rid}" for cid, rid in recycled.items()]
    level = "red" if recycled else ("yellow" if flags else "green")
    if recycled:
        v.reasons.insert(0, f"{len(recycled)} фото повторяют снимки эталонного осмотра и исключены из доказательств")
    return {"verification_id": f"ver_{uuid.uuid4().hex[:12]}", "decision": v.decision, "score_raw": v.score_raw,
            "score_note": "Число совпавших независимых ячеек с индивидуальными признаками; не вероятность",
            "reasons_ru": v.reasons, "cohort_size": v.cohort_size, "evidence": evidence, "damage_timeline": timeline,
            "integrity": {"flags": flags, "level": level}, "latency_ms": round((time.perf_counter() - t0) * 1000)}


class VerificationIn(BaseModel):
    reference_inspection_id: str
    current_inspection_id: str


@app.post("/api/v1/verifications")
def verifications(body: VerificationIn):
    return _verify(_get_inspection(body.reference_inspection_id), _get_inspection(body.current_inspection_id))


@app.post("/api/v1/compare")
async def compare(images_a: list[UploadFile] = File(...), images_b: list[UploadFile] = File(...),
                  model_hint: str = Form("")):
    if not (1 <= len(images_a) <= 16 and 1 <= len(images_b) <= 16):
        err(422, "BAD_REQUEST", "Нужно от 1 до 16 фото в каждой группе")
    insp = []
    for group in (images_a, images_b):
        ins = Inspection(f"ins_{uuid.uuid4().hex[:16]}", f"veh_{uuid.uuid4().hex[:24]}", "owner", "compare",
                         "", now() + timedelta(hours=2), model_hint.strip().lower())
        INSPECTIONS[ins.inspection_id] = ins
        for f in group:
            _ingest(ins, await f.read(), "extra", "gallery")
        insp.append(ins)
    result = _verify(insp[0], insp[1])
    with compute_lock:
        result["analysis_a"] = [analyze_frame(sf) for sf in insp[0].frames]
        result["analysis_b"] = [analyze_frame(sf) for sf in insp[1].frames]
    return result


class Finding(BaseModel):
    damage_id: str
    action: str
    comment: str = ""


class ConfirmIn(BaseModel):
    operator_id: str
    findings: list[Finding] = []
    customer_signed: bool = False


@app.post("/api/v1/inspections/{inspection_id}/confirm")
def confirm(inspection_id: str, body: ConfirmIn):
    ins = _get_inspection(inspection_id)
    payload = {"inspection_id": ins.inspection_id, "type": ins.type, "role": ins.role, "server_ts": now().isoformat(),
               "operator_id": body.operator_id, "customer_signed": body.customer_signed,
               "frames": [{"frame_id": f.frame_id, "slot": f.slot, "sha256": f.sha256, "capture_mode": f.capture_mode}
                          for f in ins.frames],
               "findings": [f.model_dump() for f in body.findings]}
    rec = ledger.append(ins.vehicle_key, f"rec_{uuid.uuid4().hex[:12]}", payload)
    return {**rec, "public_key_url": "/api/v1/passport/public-key"}


@app.get("/api/v1/vehicles/{vehicle_key}/timeline")
def timeline(vehicle_key: str):
    recs = ledger.timeline(vehicle_key)
    return {"vehicle_key": vehicle_key, "records": list(reversed(recs)), "chain_valid": ledger.verify_chain(vehicle_key)}


@app.get("/api/v1/passport/public-key")
def public_key():
    return {"algorithm": "Ed25519", "pem": ledger.public_key_pem}


@app.get("/api/v1/artifacts/{name}")
def artifact(name: str):
    path = (ARTIFACTS / name).resolve()
    if path.parent != ARTIFACTS.resolve() or not path.exists():
        err(404, "NOT_FOUND", "Файл не найден")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/v1/metrics")
def metrics():
    path = ROOT / "eval" / "results.json"
    return JSONResponse(content=__import__("json").loads(path.read_text()) if path.exists() else {"status": "not_evaluated"})


@app.get("/api/v1/health")
def health():
    import torch

    return {"status": "ok", "device": "cuda" if torch.cuda.is_available() else "cpu",
            "models": {"parts": getattr(segmenter.load("parts", MODELS), "name", None),
                       "damage": getattr(segmenter.load("damage", MODELS), "name", None),
                       "matcher": "aliked+lightglue"}}
