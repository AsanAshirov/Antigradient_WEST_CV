"""Unit tests for the scientific building blocks (no network, no trained segmentation models)."""
import io
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from carprint.core.quality import assess, corner_factor, glare_mask, laplacian_variance  # noqa: E402
from carprint.identity.geometry import fit_zones, log10_nfa, plausible  # noqa: E402
from carprint.integrity.hashing import hamming, phash64  # noqa: E402
from carprint.integrity.ledger import Ledger, verify_records  # noqa: E402

RNG = np.random.default_rng(0)


def textured(h=480, w=640, seed=0):
    rng = np.random.default_rng(seed)
    img = cv2.resize(rng.integers(0, 255, (h // 8, w // 8, 3), dtype=np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    for _ in range(40):
        c = tuple(int(v) for v in rng.integers(0, 255, 3))
        cv2.circle(img, tuple(int(v) for v in rng.integers(0, [w, h])), int(rng.integers(5, 40)), c, -1)
    return img


# ---------- ledger ----------

def test_ledger_chain_detects_tampering(tmp_path):
    led = Ledger(tmp_path / "p.sqlite", tmp_path / "k.pem")
    for i in range(3):
        led.append("veh_1", f"rec_{i}", {"inspection_id": f"ins_{i}", "findings": [i]})
    assert led.verify_chain("veh_1")
    recs = led.timeline("veh_1")
    recs[1]["payload"]["findings"] = [999]  # edit history
    from cryptography.hazmat.primitives import serialization
    pub = serialization.load_pem_public_key(led.public_key_pem.encode())
    assert not verify_records(recs, pub)
    assert verify_records(led.timeline("veh_1"), pub)


def test_ledger_chains_are_per_vehicle(tmp_path):
    led = Ledger(tmp_path / "p.sqlite", tmp_path / "k.pem")
    a = led.append("veh_a", "r1", {"x": 1})
    b = led.append("veh_b", "r2", {"x": 1})
    assert a["prev_hash"] == b["prev_hash"] == "0" * 64
    assert led.append("veh_a", "r3", {"x": 2})["prev_hash"] == a["record_hash"]


# ---------- a-contrario NFA (ORSA) ----------

def test_nfa_more_inliers_is_more_significant():
    area = 640 * 480
    vals = [log10_nfa(200, k, area) for k in (10, 20, 40, 80)]
    assert all(a > b for a, b in zip(vals, vals[1:]))


def test_nfa_few_inliers_among_many_is_not_significant():
    # IPOL ORSA: a handful of inliers among many tentative matches is explainable by chance (NFA >= 1)
    assert log10_nfa(1000, 6, 0.05 * 640 * 480) > 0


# ---------- homography plausibility ----------

def _pts(n=60):
    return RNG.uniform([50, 50], [600, 430], (n, 2)).astype(np.float32)


def test_plausible_accepts_similarity():
    a = _pts()
    H = np.array([[1.1, 0.05, 20], [-0.05, 1.1, -10], [0, 0, 1]])
    b = cv2.perspectiveTransform(a.reshape(-1, 1, 2), H).reshape(-1, 2)
    assert plausible(H, a, b, (640, 480))


def test_plausible_rejects_mirror_and_collinear():
    a = _pts()
    mirror = np.array([[-1.0, 0, 640], [0, 1, 0], [0, 0, 1]])
    assert not plausible(mirror, a, cv2.perspectiveTransform(a.reshape(-1, 1, 2), mirror).reshape(-1, 2), (640, 480))
    line = np.stack([np.linspace(0, 600, 60), np.full(60, 200.0) + RNG.normal(0, 0.5, 60)], 1).astype(np.float32)
    assert not plausible(np.eye(3), line, line, (640, 480))


def test_fit_zones_recovers_planted_plane_among_noise():
    a = _pts(80)
    H = np.array([[0.9, 0.1, 30], [-0.08, 0.95, 15], [1e-5, 0, 1]])
    b = cv2.perspectiveTransform(a.reshape(-1, 1, 2), H).reshape(-1, 2)
    noise_a = _pts(120)
    noise_b = RNG.uniform([0, 0], [640, 480], (120, 2)).astype(np.float32)
    zones = fit_zones(np.vstack([a, noise_a]), np.vstack([b, noise_b]), 640 * 480)
    assert zones and zones[0].log10_nfa < -10
    assert len(set(zones[0].inlier_idx) & set(range(80))) >= 70


# ---------- quality gate ----------

def test_sharpness_is_exposure_invariant_and_detects_blur():
    img = cv2.cvtColor(textured(), cv2.COLOR_RGB2GRAY)
    dim = (img * 0.6).astype(np.uint8)
    assert abs(laplacian_variance(img) - laplacian_variance(dim)) / laplacian_variance(img) < 0.1
    assert laplacian_variance(cv2.GaussianBlur(img, (0, 0), 4)) < 0.3 * laplacian_variance(img)


def test_white_paint_is_not_glare_but_clipped_highlight_is():
    white = np.full((200, 200, 3), 228, np.uint8)
    assert glare_mask(white).mean() == 0
    clipped = white.copy()
    clipped[80:120, 80:120] = 255
    assert glare_mask(clipped)[100, 100]


def test_quality_flags_dark_frame():
    assert "too_dark" in assess(np.full((300, 400, 3), 20, np.uint8)).issues


def test_corner_factor_low_on_edge_high_on_corner():
    img = np.zeros((200, 200, 3), np.uint8)
    img[:, 100:] = 255  # vertical edge
    img[150:, :50] = 255  # corner at (50, 150)
    f = corner_factor(img, np.array([[100.0, 60.0], [50.0, 150.0]]))
    assert f[0] < 0.2 and f[1] > 0.8


# ---------- perceptual hash ----------

def test_phash_survives_recompression_and_resize_but_separates_images():
    a = textured(seed=1)
    buf = io.BytesIO()
    Image.fromarray(a).resize((400, 300)).save(buf, "JPEG", quality=60)
    a2 = np.asarray(Image.open(buf))
    assert hamming(phash64(a), phash64(a2)) <= 6
    assert hamming(phash64(a), phash64(textured(seed=2))) > 15


def test_timeline_reports_gone_only_for_confident_reference_findings():
    from types import SimpleNamespace

    from carprint.timeline.diff import ABSENT_MIN, ZoneMap, compare

    m = np.zeros((100, 100), bool)
    m[40:60, 40:60] = True
    zone = ZoneMap(np.eye(3), (0, 0, 100, 100), (0, 0, 100, 100))
    rgb = np.full((100, 100, 3), 120, np.uint8)

    def finding(score):
        return SimpleNamespace(cls="scratch", score=score, bbox=(40, 40, 20, 20), mask=m)

    assert compare([finding(ABSENT_MIN - 0.2)], [], [zone], rgb, (100, 100)) == []
    gone = compare([finding(ABSENT_MIN + 0.2)], [], [zone], rgb, (100, 100))
    assert [i.status for i in gone] == ["previously_seen_now_absent"]
    new = compare([], [finding(0.4)], [zone], rgb, (100, 100))
    assert [(i.status, i.score) for i in new] == [("newly_detected", 0.4)]
    same = compare([finding(0.4)], [finding(0.5)], [zone], rgb, (100, 100))
    assert [i.status for i in same] == ["previously_recorded"]
