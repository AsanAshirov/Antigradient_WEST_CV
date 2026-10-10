"""Metric scale and repair-cost estimate: formulas and the qualitative behaviour the estimate must have."""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from carprint.damage.estimate import DamageInput, estimate, group_key, near_part_edge, op_prior  # noqa: E402
from carprint.damage.scale import (ARCH_DELTA, Scale, estimate_scale, measure, tyre_diameter_mm,  # noqa: E402
                                   vehicle_spec)
from carprint.damage.segmenter import Instance  # noqa: E402

SHAPE = (1000, 1500)


def wheel(cx, cy, d, yaw_deg=0.0, cls="front_wheel"):
    """Tyre seen at yaw: ellipse D cos(yaw) wide and D tall, top ARCH_DELTA hidden by the arch."""
    m = np.zeros(SHAPE, np.uint8)
    cv2.ellipse(m, (cx, cy), (int(round(d * math.cos(math.radians(yaw_deg)) / 2)), d // 2), 0, 0, 360, 1, -1)
    m[: int(cy - d / 2 + ARCH_DELTA * d), :] = 0
    m = m.astype(bool)
    ys, xs = np.nonzero(m)
    return Instance(cls, 0.9, (int(xs.min()), int(ys.min()), int(np.ptp(xs) + 1), int(np.ptp(ys) + 1)), m)


def test_tyre_diameter_from_size():
    assert tyre_diameter_mm("185/75 R14") == pytest.approx(25.4 * 14 + 2 * 185 * 0.75)
    assert tyre_diameter_mm("235/50ZR19") == pytest.approx(25.4 * 19 + 2 * 235 * 0.5)


def test_wheel_scale_and_yaw():
    spec = vehicle_spec("cobalt")
    d_mm = tyre_diameter_mm(spec["tyre"])
    s = estimate_scale([wheel(700, 600, 200, yaw_deg=40)], spec, SHAPE, slot="extra")
    assert s.mm_per_px == pytest.approx(d_mm / 200, rel=0.02)  # vertical extent is yaw-free
    assert s.yaw_side_deg == pytest.approx(40, abs=4) and s.yaw_source == "wheel_ellipse"


def test_inverse_variance_fusion_is_between_and_tighter():
    spec = vehicle_spec("cobalt")
    s = estimate_scale([wheel(700, 600, 200)], spec, SHAPE, vehicle_box=(200, 300, 1300, 300 + 520), slot="left")
    w, b = (e.mm_per_px for e in s.estimates)
    assert min(w, b) <= s.mm_per_px <= max(w, b)
    assert s.rel_unc < min(e.rel_unc for e in s.estimates)


def test_measure_area_length_and_foreshortening():
    m = np.zeros(SHAPE, bool)
    m[400:450, 300:400] = True  # 100 x 50 px
    flat = measure(m, "front_door", Scale(2.0, 0.05, 0.0, "shot_plan"))
    assert flat["area_cm2"] == pytest.approx(5000 * 4 / 100)
    assert flat["length_mm"] == pytest.approx(2 * math.hypot(100, 50), rel=0.01)
    oblique = measure(m, "front_door", Scale(2.0, 0.05, 45.0, "shot_plan"))
    assert oblique["area_cm2"] == pytest.approx(flat["area_cm2"] * math.sqrt(2), rel=0.01)
    assert oblique["rel_unc_area"] > flat["rel_unc_area"]
    assert not measure(m, "hood", Scale(2.0, 0.05, 0.0, "shot_plan"))["metric"]  # grazing view of a horizontal part


def dmg(cls, part, length=None, q=0.95, rel=None, edge=False):
    return DamageInput(cls, part, q, length, 0.08 if length else None, rel, edge)


def test_cost_grows_with_dent_size_and_quantiles_are_ordered():
    small = estimate([("front_door", dmg("dent", "front_door", 30))])
    large = estimate([("front_door", dmg("dent", "front_door", 250))])
    assert small["p10"] <= small["p50"] <= small["p90"]
    assert large["p50"] > small["p50"]
    assert small["parts"][0]["likely_operation"] == "pdr"


def test_broken_lamp_is_replaced_and_low_confidence_is_discounted():
    lamp = estimate([("headlight", dmg("broken_part", "headlight", 120, q=0.99))])
    assert lamp["parts"][0]["p_replace"] > 0.95
    doubtful = estimate([("headlight", dmg("broken_part", "headlight", 120, q=0.1))])
    assert doubtful["p_zero"] > 0.8 and doubtful["mean"] < 0.2 * lamp["mean"]


def test_no_pdr_on_edges_or_plastic():
    assert "pdr" not in op_prior("dent", "panel", "s", near_edge=True)
    assert "pdr" not in op_prior("dent", "bumper", "s", near_edge=False)
    assert all(abs(sum(op_prior(c, k, b, e).values()) - 1) < 1e-9 for c in ("dent", "scratch", "crack", "broken_part",
               "missing_part", "paint_damage", "corrosion") for k in ("panel", "bumper", "glass", "lamp", "trim", "wheel")
               for b in ("s", "m", "l", "xl") for e in (False, True))


def test_variance_shares_sum_to_one_and_sides_are_separate_parts():
    r = estimate([(group_key("front_door", "left"), dmg("scratch", "front_door", 400)),
                  (group_key("front_door", "right"), dmg("dent", "front_door", 40)),
                  ("front_bumper", dmg("crack", "front_bumper", 200))])
    assert len(r["parts"]) == 3
    assert sum(p["variance_share"] for p in r["parts"]) == pytest.approx(1.0, abs=0.02)


def test_near_edge():
    part = np.zeros((200, 200), bool)
    part[20:180, 20:180] = True
    centre = np.zeros_like(part)
    centre[90:110, 90:110] = True
    edge = np.zeros_like(part)
    edge[22:30, 60:120] = True
    assert not near_part_edge(centre, part) and near_part_edge(edge, part)
