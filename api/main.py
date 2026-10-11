"""CarPrint API — see docs/API_CONTRACT.md."""
from __future__ import annotations

import hashlib
import hmac
import os
import re
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
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.core.quality import MESSAGES_RU  # noqa: E402
from carprint.damage import segmenter  # noqa: E402
from carprint.damage.estimate import SIDED_PARTS, DamageInput, estimate as cost_estimate, group_key, near_part_edge  # noqa: E402
from carprint.damage.scale import estimate_scale, measure, vehicle_spec  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import Frame, Verdict, distinctiveness, verify  # noqa: E402
from carprint.identity.viz import match_lines, side_by_side  # noqa: E402
from carprint.integrity.hashing import DUPLICATE_MAX_DISTANCE, hamming, phash64, sha256_hex  # noqa: E402
from carprint.integrity.ledger import Ledger  # noqa: E402
from carprint.integrity.report import build_pdf  # noqa: E402
from carprint.timeline.diff import ZoneMap, compare as timeline_compare  # noqa: E402

DATA = Path(os.environ.get("CARPRINT_DATA", ROOT / "data" / "store"))
MODELS = Path(os.environ.get("CARPRINT_MODELS", ROOT / "models"))
COHORT = Path(os.environ.get("CARPRINT_COHORT", ROOT / "data" / "cohort"))
ARTIFACTS = DATA / "artifacts"
for d in (DATA, ARTIFACTS):
    d.mkdir(parents=True, exist_ok=True)
VEHICLE_SECRET = os.environ.get("CARPRINT_VEHICLE_SECRET", "dev-only-secret").encode()
COHORT_K = 8
REGISTRATION_NFA = -2.0  # a zone must be registered (a-contrario) before damage masks are carried through it
SHOT_PLAN = [
    ("front", "Перед целиком, 2–3 м"), ("front_left_45", "Диагональ слева спереди"), ("left", "Левый бок целиком"),
    ("rear_left_45", "Диагональ слева сзади"), ("rear", "Зад целиком"), ("rear_right_45", "Диагональ справа сзади"),
    ("right", "Правый бок целиком"), ("front_right_45", "Диагональ справа спереди"),
]
CHALLENGES = ["Покажите правое заднее колесо крупно", "Покажите левое переднее колесо крупно",
              "Покажите правое переднее колесо крупно", "Покажите левое заднее колесо крупно"]

app = FastAPI(title="CarPrint API", version="0.1.0")
WARM_MODELS = [m for m in os.environ.get("CARPRINT_WARM", "cobalt,matiz,nexia,gentra,spark").split(",") if m]


@app.on_event("startup")
def _warm_cohorts():
    """Compute the cohort banks of the common models in the background, so the jury's first check does not pay for
    them (on a CPU-only host this is ~40 s per model)."""
    def run():
        for m in WARM_MODELS:
            try:
                with compute_lock:
                    cohort_for(m)
                print(f"[carprint] cohort warmed: {m}")
            except Exception as e:
                print(f"[carprint] cohort warm-up failed for {m}: {e!r}")

    threading.Thread(target=run, daemon=True).start()
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
    overlay_url: str | None = None
    scale: object = None  # carprint.damage.scale.Scale
    sizes: list = field(default_factory=list)  # measure() per damage
    damage_inputs: list = field(default_factory=list)  # DamageInput per damage (cost model)
    response: dict | None = None  # analysis already rendered (overlay written once)


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
LAST_ZONES: dict[str, list] = {}  # verification_id -> ZoneEvidence (for the web studio's aligned view)
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
        paths = bank_paths(COHORT, model_hint, COHORT_K) if COHORT.is_dir() else []
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


def part_instance_at(sf: StoredFrame, inst):
    best, best_overlap = None, 0
    for p in sf.parts:
        if p.cls == "license_plate":
            continue
        ov = int(np.logical_and(p.mask, inst.mask).sum())
        if ov > best_overlap:
            best, best_overlap = p, ov
    return best


def part_at(sf: StoredFrame, inst) -> str | None:
    p = part_instance_at(sf, inst)
    return p.cls if p is not None else None


def _measure_damages(sf: StoredFrame):
    """Metric scale of the frame and size of every damage: the inputs of the cost model."""
    ins = INSPECTIONS.get(sf.inspection_id)
    sf.scale = estimate_scale(sf.parts, vehicle_spec(ins.model_hint if ins else ""), sf.frame.rgb.shape,
                              sf.frame.subject_box, sf.slot)
    sf.sizes, sf.damage_inputs = [], []
    for i, d in enumerate(sf.damages):
        part = part_instance_at(sf, d)
        size = measure(d.mask, part.cls if part else None, sf.scale)
        rel = float(d.mask.sum() / part.mask.sum()) if part is not None and part.mask.any() else None
        sf.sizes.append(size)
        sf.damage_inputs.append(DamageInput(d.cls, part.cls if part else None, d.score, size["length_mm"],
                                            size.get("rel_unc_length"), rel,
                                            near_part_edge(d.mask, part.mask if part else None), f"dmg_{sf.frame_id}_{i}"))


def inspection_cost(frames: list[StoredFrame], model_hint: str, only: dict[str, set] | None = None) -> dict | None:
    """Cost of the damages of one inspection. A damage seen from several slots is costed once: every part is taken
    from the view where its damage is largest. `only` restricts to {frame_id: damage indices} (e.g. new damages)."""
    views: dict[str, list] = {}
    for sf in frames:
        per_group: dict[str, list] = {}
        for i, di in enumerate(sf.damage_inputs):
            if only is not None and i not in only.get(sf.frame_id, ()):
                continue
            key = group_key(di.part, sf.slot)
            if sf.slot in ("", "extra") and (di.part is None or di.part in SIDED_PARTS):
                key += f"@{sf.frame_id}"  # unknown side: a left and a right door must not collapse into one
            per_group.setdefault(key, []).append(di)
        for key, ds in per_group.items():
            views.setdefault(key, []).append((sum(d.rel_area or 0.0 for d in ds) or len(ds), ds))
    chosen = [(key, d) for key, v in views.items() for d in max(v, key=lambda t: t[0])[1]]
    return cost_estimate(chosen, model=model_hint) if chosen else None


def _size_dict(size: dict) -> dict:
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in size.items() if k != "area_px"}


def analyze_frame(sf: StoredFrame) -> dict:
    if sf.response is not None:
        return sf.response
    if not sf.analyzed:
        try:
            parts_model, dmg_model = segmenter.load("parts", MODELS), segmenter.load("damage", MODELS)
            sf.parts = parts_model.predict(sf.frame.rgb, 0.4) if parts_model else []
            sf.damages = dmg_model.predict(sf.frame.rgb, 0.35) if dmg_model else []
            _measure_damages(sf)
        except Exception as e:  # a damage-model failure must never cost the identity verdict
            print(f"[carprint] damage analysis failed for {sf.frame_id}: {e!r}")
            sf.parts, sf.damages, sf.sizes, sf.damage_inputs, sf.scale = [], [], [], [], None
        sf.analyzed = True
    plates = [p.mask for p in sf.parts if p.cls == "license_plate"]
    overlay = blur_regions(sf.frame.rgb, plates)
    signal = np.array([255, 91, 31])  # the site's accent: new damage reads the same everywhere
    for d in sf.damages:
        overlay[d.mask] = (0.55 * overlay[d.mask] + 0.45 * signal).astype(np.uint8)
        contours, _ = cv2.findContours(d.mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (255, 91, 31), 2, cv2.LINE_AA)
        x, y, w, h = d.bbox
        label = f"{d.cls} {d.score:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(overlay, (x, max(0, y - th - 10)), (x + tw + 10, max(th + 10, y)), (255, 91, 31), -1)
        cv2.putText(overlay, label, (x + 5, max(th + 5, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (12, 13, 15), 1, cv2.LINE_AA)
    sf.overlay_url = save_artifact(overlay, "ovl")
    sf.response = {
        "frame_id": sf.frame_id, "slot": sf.slot, "quality": sf.frame.quality.to_dict(),
        "privacy": {"plates_blurred": len(plates), "persons_blurred": 0},
        "parts": [{"part": p.cls, "score": round(p.score, 3), "bbox": list(p.bbox)} for p in sf.parts if p.cls != "license_plate"],
        "damages": [{"damage_id": f"dmg_{sf.frame_id}_{i}", "part": part_at(sf, d), "class": d.cls, "score": round(d.score, 3),
                     "area_ratio": round(d.area_ratio, 4), "bbox": list(d.bbox), "size": _size_dict(sz),
                     "status": "auto" if d.score >= 0.6 else "needs_master"}
                    for i, (d, sz) in enumerate(zip(sf.damages, sf.sizes))],
        "scale": sf.scale.to_dict() if sf.scale is not None else None,
        "overlay_url": sf.overlay_url,
    }
    return sf.response


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
    for other in list(FRAMES.values()):
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


def _precompute_weights(sf: StoredFrame, model_hint: str):
    """Cohort distinctiveness of a frame is needed whenever it later serves as a reference: compute it off the
    request path so a verification does not pay K extra matches per reference frame."""
    try:
        with compute_lock:
            weights_for(sf, model_hint)
    except Exception as e:  # never fail an upload because of a cache warm-up
        print(f"[carprint] weight precompute failed for {sf.frame_id}: {e!r}")


@app.post("/api/v1/inspections/{inspection_id}/frames")
def upload_frame(inspection_id: str, background: BackgroundTasks, file: UploadFile = File(...),
                       slot: str = Form("extra"), nonce: str = Form(...), capture_mode: str = Form("gallery"),
                       client_ts: str | None = Form(None)):
    ins = _get_inspection(inspection_id)
    if not hmac.compare_digest(nonce, ins.nonce):
        err(409, "NONCE_MISMATCH", "Неверный код сессии съёмки")
    if now() > ins.expires_at:
        err(409, "NONCE_EXPIRED", "Сессия съёмки истекла — начните осмотр заново")
    sf, flags = _ingest(ins, file.file.read(), slot, capture_mode)
    q = sf.frame.quality
    if q.ok:
        background.add_task(_precompute_weights, sf, ins.model_hint)
    return {"frame_id": sf.frame_id, "sha256": sf.sha256, "server_ts": sf.server_ts, "quality": q.to_dict(),
            "integrity_flags": flags, "recapture_required": not q.ok,
            "message_ru": "Кадр принят" if q.ok else "; ".join(MESSAGES_RU[i] for i in q.issues)}


@app.post("/api/v1/inspections/{inspection_id}/analyze")
def analyze(inspection_id: str):
    ins = _get_inspection(inspection_id)
    t0 = time.perf_counter()
    with compute_lock:
        frames = [analyze_frame(sf) for sf in ins.frames]
        cost = inspection_cost(ins.frames, ins.model_hint)
    status = "PROCESSED" if any(sf.frame.quality.ok for sf in ins.frames) else "RECAPTURE_REQUIRED"
    return {"inspection_id": ins.inspection_id, "status": status, "frames": frames, "cost_estimate": cost,
            "latency_ms": round((time.perf_counter() - t0) * 1000)}


_TL_RANK = {"previously_recorded": 3, "newly_detected": 2, "previously_seen_now_absent": 1, "insufficient_evidence": 0}


def dedupe_timeline(items: list[dict]) -> list[dict]:
    """Every (reference, current) frame pair yields its own timeline; merge them so each damage appears once.
    A current damage keeps its strongest status (recorded > new > not visible); a reference damage that was recorded
    from any angle is not "gone", and "gone" yields to "not visible" when the views disagree."""
    recorded_refs = {t["ref_damage_id"] for t in items if t["status"] == "previously_recorded" and t.get("ref_damage_id")}
    best: dict[str, dict] = {}
    for t in items:
        if t.get("damage_id"):
            key = t["damage_id"]
            if key not in best or _TL_RANK[t["status"]] > _TL_RANK[best[key]["status"]]:
                best[key] = t
        else:
            key = t.get("ref_damage_id") or f"ref:{t['ref_frame']}:{t['ref_bbox']}"
            if key in recorded_refs:
                continue
            if key not in best or t["status"] == "insufficient_evidence":
                best[key] = t
    return list(best.values())


def _verify(ref: Inspection, cur: Inspection) -> dict:
    t0 = time.perf_counter()
    # A re-submitted reference photo would match itself perfectly: exclude it from evidence and flag it.
    recycled = {c.frame_id: r.frame_id for c in cur.frames for r in ref.frames
                if c.sha256 == r.sha256 or hamming(c.phash, r.phash) <= DUPLICATE_MAX_DISTANCE}
    fresh = [sf for sf in cur.frames if sf.frame_id not in recycled]
    with compute_lock:
        cohort = {sf.frame_id: cohort_for(ref.model_hint) for sf in ref.frames}
        if recycled and not fresh:
            v = Verdict("REVIEW", 0.0, [], ["Все фото текущего осмотра — копии эталонных снимков: нужен новый осмотр"])
        else:
            v = verify([sf.frame for sf in ref.frames], [sf.frame for sf in fresh], cohort)
        for sf in ref.frames + cur.frames:
            analyze_frame(sf)
        evidence, timeline = [], []
        by_id = {sf.frame_id: sf for sf in ref.frames + cur.frames}
        best_zone: dict[tuple[str, str], object] = {}
        registered: dict[tuple[str, str], list[ZoneMap]] = {}
        for z in v.zones:
            key = (z.ref_frame, z.cur_frame)
            if key not in best_zone or z.zone.n_inliers > best_zone[key].zone.n_inliers:
                best_zone[key] = z
            if z.zone.log10_nfa < REGISTRATION_NFA:
                registered.setdefault(key, []).append(ZoneMap(z.zone.H, z.zone.bbox0, z.zone.bbox1))
        for (rf, cf), z in sorted(best_zone.items(), key=lambda kv: kv[1].log10_nfa_distinct)[:6]:
            r, c = by_id[rf], by_id[cf]
            pair_zones = [e for e in v.zones if (e.ref_frame, e.cur_frame) == (rf, cf)]
            viz = side_by_side(r.frame, c.frame, pair_zones)
            rh, rw = r.frame.rgb.shape[:2]
            aligned = None
            if z.zone.log10_nfa < REGISTRATION_NFA:
                aligned = save_artifact(cv2.warpPerspective(c.frame.rgb, np.linalg.inv(z.zone.H), (rw, rh)), "al")
            evidence.append({**z.to_dict(), "slot": r.slot, "match_viz_url": save_artifact(viz, "m"), "aligned_url": aligned,
                             "matches": match_lines(pair_zones, r.frame.rgb.shape, c.frame.rgb.shape)})
        # The timeline only makes sense for the same car; each pair of frames contributes its registered panels.
        new_idx: dict[str, set] = {}
        old_idx: dict[str, set] = {}
        try:
            if v.decision != "DIFFERENT":
                for (rf, cf), zone_maps in registered.items():
                    r, c = by_id[rf], by_id[cf]
                    for item in timeline_compare(r.damages, c.damages, zone_maps, r.frame.rgb, c.frame.rgb.shape,
                                                 part_of=lambda inst, sf=c: part_at(sf, inst),
                                                 part_of_ref=lambda inst, sf=r: part_at(sf, inst)):
                        timeline.append({"status": item.status, "class": item.cls, "part": item.part, "slot": c.slot,
                                         "ref_frame": rf, "cur_frame": cf, "cur_bbox": item.cur_bbox, "ref_bbox": item.ref_bbox,
                                         "damage_id": f"dmg_{cf}_{item.cur_index}" if item.cur_index is not None else None,
                                         "ref_damage_id": f"dmg_{rf}_{item.ref_index}" if item.ref_index is not None else None,
                                         "score": round(item.score, 3) if item.score is not None else None,
                                         "first_seen_inspection_id": ref.inspection_id if item.status == "previously_recorded" else None})
                        if item.cur_index is not None and item.status in ("newly_detected", "previously_recorded"):
                            target = new_idx if item.status == "newly_detected" else old_idx
                            target.setdefault(cf, set()).add(item.cur_index)
            timeline = dedupe_timeline(timeline)
            # New = new in some registered view and recorded in none (a damage seen as old from another angle is old).
            only_new = {f: ids - old_idx.get(f, set()) for f, ids in new_idx.items()}
            model = ref.model_hint or cur.model_hint
            cost_new = inspection_cost(cur.frames, model, only_new) if any(only_new.values()) else None
            cost_all = inspection_cost(cur.frames, model)
        except Exception as e:  # timeline and cost are additions to the verdict, never a reason to lose it
            print(f"[carprint] timeline/cost failed: {e!r}")
            timeline, cost_new, cost_all = [], None, None
        vid = f"ver_{uuid.uuid4().hex[:12]}"
        LAST_ZONES[vid] = v.zones
        while len(LAST_ZONES) > 256:
            LAST_ZONES.pop(next(iter(LAST_ZONES)), None)
    flags = sorted({"gallery_upload" for sf in cur.frames if sf.capture_mode != "camera"})
    flags += [f"recycled_reference_photo:{cid}->{rid}" for cid, rid in recycled.items()]
    level = "red" if recycled else ("yellow" if flags else "green")
    if recycled:
        v.reasons.insert(0, f"{len(recycled)} фото повторяют снимки эталонного осмотра и исключены из доказательств")
    return {"verification_id": vid, "decision": v.decision, "score_raw": v.score_raw,
            "score_note": "Число совпавших независимых ячеек с индивидуальными признаками; не вероятность",
            "reasons_ru": v.reasons, "reasons_en": [reason_en(r) for r in v.reasons], "cohort_size": v.cohort_size,
            "evidence": evidence, "damage_timeline": timeline,
            "cost_estimate_new": cost_new, "cost_estimate_current": cost_all,
            "integrity": {"flags": flags, "level": level}, "latency_ms": round((time.perf_counter() - t0) * 1000)}


REASONS_EN = [
    (r"Совпали индивидуальные признаки в (\d+) независимых ячейках \((\d+) зон\)",
     "Individual marks agree in {0} independent cells ({1} zones)"),
    (r"Когорта машин той же модели мала \((\d+) < (\d+)\): автоматический SAME запрещён",
     "Same-model cohort too small ({0} < {1}): automatic SAME is disabled"),
    (r"Ракурсы совмещаются по дизайну модели, но индивидуальные метки эталона не найдены",
     "The views align on the model's design, but the reference's individual marks are absent"),
    (r"Не найдено сопоставимых участков: снимите те же ракурсы, что в эталоне",
     "No comparable areas found: shoot the same angles as the reference"),
    (r"Доказательств недостаточно: (\d+) совпавших ячеек из (\d+) нужных",
     "Not enough evidence: {0} matching cells of {1} needed"),
    (r"Нет кадров достаточного качества в одном из осмотров", "One of the inspections has no frame of sufficient quality"),
    (r"(\d+) фото повторяют снимки эталонного осмотра и исключены из доказательств",
     "{0} photo(s) repeat the reference inspection and are excluded from evidence"),
    (r"Все фото текущего осмотра — копии эталонных снимков: нужен новый осмотр",
     "Every current photo is a copy of a reference photo: a new inspection is needed"),
]


def reason_en(text: str) -> str:
    for pattern, template in REASONS_EN:
        m = re.fullmatch(pattern, text)
        if m:
            return template.format(*m.groups())
    return text


class VerificationIn(BaseModel):
    reference_inspection_id: str
    current_inspection_id: str


@app.post("/api/v1/verifications")
def verifications(body: VerificationIn):
    return _verify(_get_inspection(body.reference_inspection_id), _get_inspection(body.current_inspection_id))


@app.post("/api/v1/compare")
def compare(images_a: list[UploadFile] = File(...), images_b: list[UploadFile] = File(...),
                  model_hint: str = Form("")):
    if not (1 <= len(images_a) <= 16 and 1 <= len(images_b) <= 16):
        err(422, "BAD_REQUEST", "Нужно от 1 до 16 фото в каждой группе")
    insp = []
    for group in (images_a, images_b):
        ins = Inspection(f"ins_{uuid.uuid4().hex[:16]}", f"veh_{uuid.uuid4().hex[:24]}", "owner", "compare",
                         "", now() + timedelta(hours=2), model_hint.strip().lower())
        INSPECTIONS[ins.inspection_id] = ins
        for f in group:
            _ingest(ins, f.file.read(), "extra", "gallery")
        insp.append(ins)
    result = _verify(insp[0], insp[1])
    result["inspections"] = {"reference": insp[0].inspection_id, "current": insp[1].inspection_id}
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


@app.get("/api/v1/inspections/{inspection_id}/report.pdf")
def report(inspection_id: str):
    ins = _get_inspection(inspection_id)
    with compute_lock:
        for sf in ins.frames:
            if sf.overlay_url is None:
                analyze_frame(sf)
        cost = inspection_cost(ins.frames, ins.model_hint)
    record = next((r for r in ledger.timeline(ins.vehicle_key) if r["payload"].get("inspection_id") == ins.inspection_id), None)
    damages = [f"{d.cls} ({part_at(sf, d) or 'деталь не определена'}, {d.score:.2f})" for sf in ins.frames for d in sf.damages]
    rows = [("Осмотр", ins.inspection_id), ("Автомобиль (ключ)", ins.vehicle_key), ("Тип / роль", f"{ins.type} / {ins.role}"),
            ("Кадров", str(len(ins.frames))), ("Находки модели", "; ".join(damages) or "не обнаружено"),
            ("Оценка ремонта (ориентир)", f"P10–P90 {cost['p10']:,}–{cost['p90']:,} сум, медиана {cost['p50']:,} сум"
             .replace(",", " ") if cost else "нет находок"),
            ("Запись паспорта", record["record_hash"] if record else "не подтверждено приёмщиком"),
            ("Предыдущая запись", record["prev_hash"] if record else "—")]
    rows += [(f"Кадр {sf.slot}", f"SHA-256 {sf.sha256[:32]}… {sf.capture_mode} {sf.server_ts}") for sf in ins.frames]
    overlays = [(f"{sf.slot} — {sf.sha256[:16]}", ARTIFACTS / sf.overlay_url.rsplit("/", 1)[-1]) for sf in ins.frames if sf.overlay_url]
    pdf = build_pdf("CarPrint — акт осмотра", rows, overlays,
                    "Находки модели не являются решением: каждая подтверждается сотрудником. Номера размыты. "
                    "Целостность записи проверяется по цепочке хешей и подписи Ed25519 (/api/v1/passport/public-key).")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{ins.inspection_id}.pdf"'})


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


# Web studio: compatibility endpoints, then the built frontend (mounted last so API routes win).
from api.compat import build_router  # noqa: E402

app.include_router(build_router(sys.modules[__name__]))
WEB_DIST = Path(os.environ.get("CARPRINT_WEB_DIST", ROOT / "web" / "dist"))
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = (WEB_DIST / path).resolve()
        if path and target.is_file() and WEB_DIST.resolve() in target.parents:
            return FileResponse(target)
        if path.startswith("api/"):
            err(404, "NOT_FOUND", "Нет такого метода API")
        return FileResponse(WEB_DIST / "index.html", headers={"Cache-Control": "no-cache"})
