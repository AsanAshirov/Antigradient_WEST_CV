"""Compatibility layer for the web studio (web/src/App.tsx): POST /api/compare with `reference` + `current`.

Returns the schema the studio already renders, computed by the CarPrint pipeline, plus extra CarPrint fields
(congruent_cells, zones, cohort_size, integrity). Errors use a plain-string `detail`, as the studio expects.
"""
from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from carprint.core.image_io import load_image
from carprint.integrity.hashing import DUPLICATE_MAX_DISTANCE, hamming, phash64, sha256_hex

router = APIRouter()
MAX_BYTES = 8 * 1024 * 1024
WEB_ROOT = Path(os.environ.get("CARPRINT_WEB", Path(__file__).resolve().parents[1] / "web"))

DECISION_EN = {
    "SAME": "Same vehicle: individual marks agree in {cells} independent areas",
    "DIFFERENT": "Different vehicle: the design aligns, but the reference's individual marks are absent",
    "REVIEW": "Not enough individual evidence for an automatic decision",
    "RECAPTURE_REQUIRED": "Photo quality is too low for a decision. Please retake",
}
QUALITY_EN = {
    "blurry": "A photo is blurred. Hold the phone still and retake.",
    "too_dark": "A photo is too dark. Use the flash or a torch.",
    "overexposed": "A photo is overexposed. Change the angle.",
    "glare": "Strong glare on the car. Move to remove the reflection.",
    "car_too_small": "The car is too small in the frame. Move closer.",
    "no_car": "No car was found in the frame.",
}
LIMITATIONS = ("CarPrint decides SAME only from individual marks (chips, curb rash, scratches) after discounting features "
               "shared by every car of the same model. Identical new cars without marks stay REVIEW and need a VIN check. "
               "Findings are evidence for a person, not an automatic charge or legal assessment.")
ALGORITHM = ("ALIKED + LightGlue, MAGSAC++ planar zones with a-contrario (ORSA) gate, same-model cohort "
             "distinctiveness, congruent-cell voting")


def _data_url(rgb: np.ndarray, max_side: int = 1400) -> str:
    h, w = rgb.shape[:2]
    s = min(1.0, max_side / max(h, w))
    if s < 1:
        rgb = cv2.resize(rgb, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    ok, enc = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return "data:image/jpeg;base64," + base64.b64encode(enc.tobytes()).decode()


def _read(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_BYTES + 1)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413, "Each image must be between 1 byte and 8 MB.")
    if not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")
            or (data.startswith(b"RIFF") and data[8:12] == b"WEBP")):
        raise HTTPException(415, "Supported image formats are JPG, PNG and WebP.")
    return data


def build_router(main):
    """`main` is api.main (passed in to avoid a circular import)."""

    @router.get("/api/health")
    def health():
        h = main.health()
        return {"status": "ok", "algorithm": ALGORITHM, "version": main.app.version, **h}

    @router.post("/api/compare")
    def compare(reference: UploadFile = File(...), current: UploadFile = File(...), model: str = Form("")):
        t0 = time.perf_counter()
        blobs = [_read(reference), _read(current)]
        for b in blobs:
            try:
                img = load_image(b)
            except Exception:
                raise HTTPException(422, "Could not read the image. Please try a different file.")
            if min(img.rgb.shape[:2]) < 96:
                raise HTTPException(422, "The image is too small. Use at least 96 × 96 pixels.")
        ins = []
        for b in blobs:
            i = main.Inspection(f"ins_{os.urandom(8).hex()}", f"veh_{os.urandom(12).hex()}", "owner", "compare", "",
                                main.now() + main.timedelta(hours=2), model.strip().lower())
            main.INSPECTIONS[i.inspection_id] = i
            main._ingest(i, b, "extra", "gallery")
            ins.append(i)
        res = main._verify(ins[0], ins[1])
        ref, cur = ins[0].frames[0], ins[1].frames[0]
        zones = [z for z in res["evidence"]]
        best = max(zones, key=lambda z: z["inliers"], default=None)
        verdict = res["decision"]
        cells = max((z.get("congruent_cells", 0) for z in zones), default=0)
        registered = best is not None and best["log10_nfa"] < main.REGISTRATION_NFA

        aligned, coverage, err = None, 0.0, None
        if registered:
            v_zone = next((z for z in main.LAST_ZONES.get(res["verification_id"], []) if z.zone.n_inliers == best["inliers"]), None)
            if v_zone is not None:
                H = v_zone.zone.H
                rh, rw = ref.frame.rgb.shape[:2]
                aligned = cv2.warpPerspective(cur.frame.rgb, np.linalg.inv(H), (rw, rh))
                x, y, w, h = v_zone.zone.bbox0
                coverage = round(100.0 * (w * h) / (rw * rh), 1)
            err = best["reproj_err_px"]

        warnings = []
        for f in (ref, cur):
            warnings += [QUALITY_EN[i] for i in f.frame.quality.issues if i in QUALITY_EN]
        if blobs[0] == blobs[1] or hamming(phash64(ref.frame.rgb), phash64(cur.frame.rgb)) <= DUPLICATE_MAX_DISTANCE:
            warnings.append("The same photo was uploaded twice: it is excluded from identity evidence.")
        if verdict == "REVIEW":
            warnings.append("Photograph the same side of the car from a similar angle; include wheels and any marks.")
        warnings.append("Matching shape alone never proves identity: features shared by the model are discounted.")

        evidence_img = main.ARTIFACTS / res["evidence"][0]["match_viz_url"].rsplit("/", 1)[-1] if res["evidence"] else None
        evidence = cv2.cvtColor(cv2.imread(str(evidence_img)), cv2.COLOR_BGR2RGB) if evidence_img and evidence_img.exists() \
            else np.concatenate([cv2.resize(ref.frame.rgb, (480, 360)), cv2.resize(cur.frame.rgb, (480, 360))], axis=1)
        return {
            "decision": verdict,
            "geometry": "MATCHED" if registered else "INSUFFICIENT",
            "message": DECISION_EN.get(verdict, verdict).format(cells=cells),
            "inliers": int(best["inliers"]) if best else 0,
            "candidate_matches": int(best.get("tentative", best["inliers"])) if best else 0,
            "reprojection_error_px": err,
            "coverage_percent": coverage,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000),
            "warnings": list(dict.fromkeys(warnings)),
            "evidence_image": _data_url(evidence),
            "reference_image": _data_url(ref.frame.rgb),
            "aligned_image": _data_url(aligned) if aligned is not None else None,
            "algorithm": ALGORITHM,
            "algorithm_version": f"carprint-{main.app.version}",
            "sha256": [sha256_hex(b) for b in blobs],
            "limitations": LIMITATIONS,
            # CarPrint extras
            "congruent_cells": cells, "score_raw": res["score_raw"], "cohort_size": res["cohort_size"],
            "zones": zones, "integrity": res["integrity"], "reasons_ru": res["reasons_ru"],
            "damage_timeline": res["damage_timeline"],
        }

    @router.get("/api/example/{view}")
    def example(view: str):
        if view not in ("reference", "current"):
            raise HTTPException(404, "Photo not found.")
        image = cv2.imread(str(WEB_ROOT / "public" / "images" / "car-studio.png"))
        if image is None:
            raise HTTPException(503, "Sample images are unavailable.")
        image = image[300:850, 350:1500]  # synthetic, disclosed sample (AI-generated studio image)
        if view == "current":
            h, w = image.shape[:2]
            image = cv2.warpAffine(image, cv2.getRotationMatrix2D((w / 2, h / 2), 3, 0.96), (w, h),
                                   borderMode=cv2.BORDER_REFLECT)
            image = cv2.convertScaleAbs(image, alpha=0.92, beta=8)
        ok, enc = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return Response(enc.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})

    return router
