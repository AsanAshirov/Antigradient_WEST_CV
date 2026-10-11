"""API paths the site uses, run end to end with a stand-in segmenter (the trained part/damage weights are not in CI):
quick compare with evidence lines, aligned frames, English reasons, metric sizes, cost estimates, timeline ids,
the PDF act and the SPA fallback."""
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from carprint.damage.segmenter import Instance  # noqa: E402
from test_identity_api import jpeg, scene, view  # noqa: E402


def _inst(cls, shape, box, score=0.9, circle=False):
    h, w = shape[:2]
    m = np.zeros((h, w), np.uint8)
    x0, y0, x1, y1 = box
    if circle:
        cv2.circle(m, ((x0 + x1) // 2, (y0 + y1) // 2), (x1 - x0) // 2, 1, -1)
    else:
        m[y0:y1, x0:x1] = 1
    m = m.astype(bool)
    ys, xs = np.nonzero(m)
    return Instance(cls, score, (int(xs.min()), int(ys.min()), int(np.ptp(xs) + 1), int(np.ptp(ys) + 1)), m)


class FakeSegmenter:
    def __init__(self, kind):
        self.kind = kind
        self.name = f"Fake{kind}"

    def predict(self, rgb, threshold=0.35):
        s = rgb.shape
        if self.kind == "parts":
            return [_inst("front_door", s, (120, 80, 680, 520)), _inst("front_wheel", s, (560, 380, 700, 520), circle=True),
                    _inst("license_plate", s, (40, 540, 160, 570))]
        return [_inst("scratch", s, (300, 250, 430, 275), 0.9), _inst("dent", s, (480, 300, 530, 345), 0.7)]


@pytest.fixture(scope="module")
def site_client(tmp_path_factory):
    import os

    os.environ["CARPRINT_DATA"] = str(tmp_path_factory.mktemp("store_site"))
    from fastapi.testclient import TestClient

    import api.main as main

    original = main.segmenter.load
    main.segmenter.load = lambda kind, models_dir: FakeSegmenter(kind)
    yield TestClient(main.app), main
    main.segmenter.load = original


def _compare(client, model="cobalt"):
    car = scene(21)
    shifted = cv2.resize(car[60:, 90:], (car.shape[1], car.shape[0]))
    return client.post("/api/v1/compare", files=[("images_a", ("a.jpg", jpeg(car), "image/jpeg")),
                                                 ("images_b", ("b.jpg", jpeg(view(shifted, 5)), "image/jpeg"))],
                       data={"model_hint": model})


def test_quick_compare_carries_everything_the_studio_renders(site_client):
    client, _ = site_client
    r = _compare(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["inspections"]["reference"].startswith("ins_") and body["inspections"]["current"].startswith("ins_")
    assert body["reasons_en"] and not any(re.search("[А-Яа-я]", x) for x in body["reasons_en"])
    for ev in body["evidence"]:
        assert all(len(m) == 5 for m in ev["matches"])
        assert ev["aligned_url"] is None or ev["aligned_url"].startswith("/api/v1/artifacts/")
    frame = body["analysis_b"][0]
    assert isinstance(frame["quality"]["ok"], bool)
    assert frame["scale"]["mm_per_px"] is not None  # wheel ruler from the stand-in parts model
    assert all("metric" in d["size"] for d in frame["damages"])
    assert {d["part"] for d in frame["damages"]} == {"front_door"}
    cost = body["cost_estimate_current"]
    assert cost and cost["p10"] <= cost["p50"] <= cost["p90"] and cost["n_damages"] >= 1
    assert all("damage_id" in t for t in body["damage_timeline"])


def test_analyze_and_pdf_include_the_estimate(site_client):
    client, _ = site_client
    ins = client.post("/api/v1/inspections", json={"vehicle_id_plain": "01A123BC", "vehicle_hint": {"model": "cobalt"},
                                                   "type": "checkin"}).json()
    up = client.post(f"/api/v1/inspections/{ins['inspection_id']}/frames",
                     files={"file": ("f.jpg", jpeg(scene(31)), "image/jpeg")},
                     data={"slot": "left", "nonce": ins["nonce"], "capture_mode": "camera"})
    assert up.status_code == 200, up.text
    a = client.post(f"/api/v1/inspections/{ins['inspection_id']}/analyze").json()
    assert a["cost_estimate"]["p50"] > 0
    assert a["frames"][0]["damages"][0]["size"]["metric"] is True  # side slot + wheel ruler -> metric size
    pdf = client.get(f"/api/v1/inspections/{ins['inspection_id']}/report.pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"


@pytest.mark.skipif(not (ROOT / "web_legacy" / "dist" / "index.html").exists(), reason="site not built")
def test_spa_fallback_serves_client_routes_but_not_unknown_api(site_client):
    client, _ = site_client
    page = client.get("/studio")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert client.get("/api/v1/nope").status_code == 404
    assert client.get("/evidence/pair.json").status_code == 200
