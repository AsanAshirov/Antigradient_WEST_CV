"""Identity decisions and API behaviour on synthetic scenes (runs ALIKED + LightGlue, CPU or GPU)."""
import io
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import verify  # noqa: E402
from carprint.timeline.diff import ZoneMap, compare  # noqa: E402
from carprint.damage.segmenter import Instance  # noqa: E402


def scene(seed, h=600, w=800):
    rng = np.random.default_rng(seed)
    img = np.full((h, w, 3), 120, np.uint8)
    for _ in range(300):
        c = tuple(int(v) for v in rng.integers(0, 255, 3))
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        if rng.random() < 0.5:
            cv2.circle(img, (x, y), int(rng.integers(3, 25)), c, -1)
        else:
            cv2.rectangle(img, (x, y), (x + int(rng.integers(5, 40)), y + int(rng.integers(5, 40))), c, -1)
    return img


def view(img, seed):
    rng = np.random.default_rng(seed)
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = (src + rng.uniform(-0.06, 0.06, (4, 2)) * [w, h]).astype(np.float32)
    out = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h), borderMode=cv2.BORDER_REFLECT)
    return np.clip(out.astype(np.float32) * 0.9 + 10, 0, 255).astype(np.uint8)


@pytest.fixture(scope="module")
def frames():
    car = scene(1)
    cohort = [make_frame(f"c{i}", "extra", scene(100 + i)) for i in range(5)]
    return {"ref": make_frame("ref", "extra", car), "same": make_frame("same", "extra", view(car, 7)),
            "other": make_frame("other", "extra", scene(2)), "cohort": cohort}


def test_same_scene_new_view_is_same(frames):
    v = verify([frames["ref"]], [frames["same"]], {"ref": frames["cohort"]})
    assert v.decision == "SAME", v.reasons


def test_unrelated_scene_is_not_same(frames):
    v = verify([frames["ref"]], [frames["other"]], {"ref": frames["cohort"]})
    assert v.decision != "SAME"


def test_no_cohort_means_no_automatic_same(frames):
    v = verify([frames["ref"]], [frames["same"]], {"ref": frames["cohort"][:2]})
    assert v.decision == "REVIEW"


def test_design_shared_by_cohort_is_discounted(frames):
    # Every cohort "car" carries the reference design itself: its matches are design, not identity.
    ref = frames["ref"]
    design_cohort = [make_frame(f"d{i}", "extra", view(ref.rgb, 50 + i)) for i in range(5)]
    v = verify([ref], [frames["same"]], {"ref": design_cohort})
    assert v.decision != "SAME"


def test_bad_quality_requires_recapture(frames):
    dark = make_frame("dark", "extra", np.full((480, 640, 3), 10, np.uint8))
    assert verify([frames["ref"]], [dark], {"ref": frames["cohort"]}).decision == "RECAPTURE_REQUIRED"


def test_timeline_statuses():
    h, w = 300, 400
    rgb = np.full((h, w, 3), 120, np.uint8)

    def inst(x, y):
        m = np.zeros((h, w), bool)
        m[y:y + 20, x:x + 20] = True
        return Instance("scratch", 0.9, (x, y, 20, 20), m)

    zones = [ZoneMap(np.eye(3), (0, 0, w, h), (0, 0, w, h))]
    items = compare([inst(50, 50), inst(300, 200)], [inst(52, 51), inst(150, 100)], zones, rgb, (h, w))
    statuses = sorted(i.status for i in items)
    assert statuses == ["newly_detected", "previously_recorded", "previously_seen_now_absent"]


# ---------- API ----------

@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import os
    os.environ["CARPRINT_DATA"] = str(tmp_path_factory.mktemp("store"))
    from fastapi.testclient import TestClient
    import api.main as main
    return TestClient(main.app)


def jpeg(rgb):
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, "JPEG", quality=92)
    return buf.getvalue()


def new_inspection(client):
    r = client.post("/api/v1/inspections", json={"role": "dealer", "type": "checkin"})
    assert r.status_code == 201
    return r.json()


def test_api_rejects_wrong_nonce(client):
    ins = new_inspection(client)
    r = client.post(f"/api/v1/inspections/{ins['inspection_id']}/frames", files={"file": ("a.jpg", jpeg(scene(3)), "image/jpeg")},
                    data={"slot": "front", "nonce": "forged", "capture_mode": "camera"})
    assert r.status_code == 409


def test_api_recycled_reference_photo_is_red_and_excluded(client):
    a, b = new_inspection(client), new_inspection(client)
    photo = jpeg(scene(4))
    for ins in (a, b):
        r = client.post(f"/api/v1/inspections/{ins['inspection_id']}/frames", files={"file": ("p.jpg", photo, "image/jpeg")},
                        data={"slot": "front", "nonce": ins["nonce"], "capture_mode": "camera"})
        assert r.status_code == 200
    v = client.post("/api/v1/verifications", json={"reference_inspection_id": a["inspection_id"],
                                                    "current_inspection_id": b["inspection_id"]}).json()
    assert v["integrity"]["level"] == "red"
    assert v["decision"] != "SAME"


def test_api_confirm_builds_valid_chain(client):
    ins = new_inspection(client)
    client.post(f"/api/v1/inspections/{ins['inspection_id']}/frames", files={"file": ("p.jpg", jpeg(scene(5)), "image/jpeg")},
                data={"slot": "front", "nonce": ins["nonce"], "capture_mode": "camera"})
    for _ in range(2):
        assert client.post(f"/api/v1/inspections/{ins['inspection_id']}/confirm", json={"operator_id": "op"}).status_code == 200
    t = client.get(f"/api/v1/vehicles/{ins['vehicle_key']}/timeline").json()
    assert t["chain_valid"] and len(t["records"]) == 2
    pdf = client.get(f"/api/v1/inspections/{ins['inspection_id']}/report.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


# ---------- web studio compatibility ----------

STUDIO_FIELDS = {"decision", "geometry", "message", "inliers", "candidate_matches", "reprojection_error_px",
                 "coverage_percent", "elapsed_ms", "warnings", "evidence_image", "reference_image", "aligned_image",
                 "algorithm", "sha256", "limitations"}


def test_studio_compare_schema_and_alignment(client):
    car = scene(11)
    # a genuinely different capture: shifted framing + new viewpoint (pHash distance well above the copy threshold)
    shifted = cv2.resize(car[90:, 140:], (car.shape[1], car.shape[0]))
    r = client.post("/api/compare", files={"reference": ("a.jpg", jpeg(car), "image/jpeg"),
                                           "current": ("b.jpg", jpeg(view(shifted, 3)), "image/jpeg")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert STUDIO_FIELDS <= set(body)
    assert body["geometry"] == "MATCHED" and body["aligned_image"].startswith("data:image/jpeg;base64,")
    assert body["evidence_image"].startswith("data:image/jpeg;base64,")


def test_studio_errors_are_plain_strings(client):
    r = client.post("/api/compare", files={"reference": ("a.txt", b"not an image", "text/plain"),
                                           "current": ("b.jpg", jpeg(scene(12)), "image/jpeg")})
    assert r.status_code == 415 and isinstance(r.json()["detail"], str)
