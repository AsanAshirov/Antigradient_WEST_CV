"""Repair-cost estimate for detected damages: a distribution (P10 / P50 / P90), never a single number.

Model, per damaged part (paint and replacement are charged per part, not per damage):
  1. Damage i is real with probability q_i (detector confidence; to be calibrated on the validation split).
  2. Its size bucket comes from the metric length L_i (log-normal with the measurement uncertainty, scale.py) or,
     without a metric scale, from the relative area r_i = damage area / part area in the same frame.
  3. The repair operation is drawn from an expert prior P(op | class, part kind, size bucket, near an edge) that
     encodes collision-estimating practice: PDR only for small dents away from edges and not on plastic, glass and
     lamps are replaced when cracked or broken, large dents mean replacement is likely, and so on. The part's
     operation is the most invasive operation among its damages.
  4. Cost of a part given its operation:
        polish          h_polish * rate
        spot            n_spot * c_spot                    (SMART repair of chips and short scratches)
        glass_chip      n_chip * c_chip
        pdr             sum_i c_pdr(size_i)
        wheel_repair    c_wheel
        plastic_repair  h_plastic * rate + c_refinish(part)
        repair_paint    h_repair(largest size) * rate + c_refinish(part)
        replace         c_part(model, part) + h_replace(kind) * rate + 1[painted] * c_refinish(part)
     Every price is triangular (min, mode, max) from the price table; the labour rate is drawn once per sample
     (one shop does the whole job), so its uncertainty correlates across parts as it does in reality.
  5. Monte Carlo over 1-4 gives the distribution of the total; we report P10/P50/P90, P(replace) per part and the
     share of the total variance each part explains (what a person should check first).

What has to be learned from partner data: the operation prior (multinomial logistic regression on class, part, size
and edge distance, fitted on repair orders with photos) and the price table (dealer DMS). Until then the output is an
indicative range, and every response says so.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

DATA = Path(__file__).resolve().parent / "data"
N_SAMPLES = 4000
OPS = ["none", "polish", "spot", "glass_chip", "pdr", "wheel_repair", "plastic_repair", "repair_paint", "replace"]
SEV = {op: i for i, op in enumerate(OPS)}
BUCKETS = ("s", "m", "l", "xl")
LENGTH_EDGES_MM = (50.0, 150.0, 300.0)  # s <= 5 cm < m <= 15 cm < l <= 30 cm < xl
REL_AREA_EDGES = (0.02, 0.08, 0.25)  # same buckets from the share of the part covered, when no metric scale exists
REL_AREA_UNC = 0.3  # log-normal sd of the relative-area proxy
PART_KIND = {
    "front_bumper": "bumper", "back_bumper": "bumper",
    "hood": "panel", "trunk": "panel", "roof": "panel", "front_door": "panel", "back_door": "panel",
    "fender": "panel", "quarter_panel": "panel", "rocker_panel": "panel",
    "windshield": "glass", "back_windshield": "glass", "front_window": "glass", "back_window": "glass",
    "headlight": "lamp", "tail_light": "lamp", "mirror": "trim", "grille": "trim",
    "front_wheel": "wheel", "back_wheel": "wheel", "license_plate": "ignore",
}
PAINTED = {"bumper", "panel"}
SIDED_PARTS = {"front_door", "back_door", "fender", "quarter_panel", "rocker_panel", "mirror", "front_wheel",
               "back_wheel", "front_window", "back_window"}


@lru_cache(maxsize=4)
def price_table(name: str = "prices_uz.json") -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def op_prior(cls: str, kind: str, bucket: str, near_edge: bool) -> dict[str, float]:
    """Expert prior over repair operations for one damage (sums to 1)."""
    big = bucket in ("l", "xl")
    if kind == "ignore":
        return {"none": 1.0}
    if kind == "glass":
        if cls == "crack" and bucket == "s":
            return {"glass_chip": 0.6, "replace": 0.4}
        return {"replace": 1.0} if cls in ("crack", "broken_part", "missing_part") else {"polish": 1.0}
    if kind == "lamp":
        return {"replace": 1.0} if cls in ("crack", "broken_part", "missing_part") else {"polish": 0.7, "replace": 0.3}
    if kind == "wheel":
        return {"replace": 1.0} if cls in ("crack", "broken_part", "missing_part") else {"wheel_repair": 0.85, "replace": 0.15}
    if kind == "trim":
        return {"replace": 1.0} if cls in ("crack", "broken_part", "missing_part") else {"polish": 0.5, "replace": 0.5}
    bumper = kind == "bumper"
    repair = "plastic_repair" if bumper else "repair_paint"
    if cls == "missing_part":
        return {"replace": 1.0}
    if cls == "broken_part":
        return {"replace": 0.8, repair: 0.2}
    if cls == "crack":
        if bumper:
            return {"replace": 0.8, repair: 0.2} if big else {repair: 0.6, "replace": 0.4}
        return {"repair_paint": 0.5, "replace": 0.5}
    if cls == "dent":
        if bucket == "xl":
            return {"replace": 0.6, repair: 0.4}
        if bumper:  # plastic is reshaped with heat and repainted; PDR does not apply
            return {repair: 0.6, "replace": 0.4} if big else {repair: 1.0}
        if near_edge:  # PDR tools cannot reach folded edges and the metal there is stretched
            return {"repair_paint": 0.8, "replace": 0.2} if big else {"repair_paint": 1.0}
        return {"s": {"pdr": 0.7, "repair_paint": 0.3}, "m": {"pdr": 0.3, "repair_paint": 0.7},
                "l": {"repair_paint": 0.75, "replace": 0.25}}[bucket]
    if cls == "scratch":  # depth is not observable in a photo: clear-coat (polish) vs through the paint
        return {"s": {"polish": 0.4, "spot": 0.35, repair: 0.25}, "m": {"polish": 0.25, "spot": 0.15, repair: 0.6},
                "l": {"polish": 0.1, repair: 0.9}, "xl": {repair: 1.0}}[bucket]
    if cls == "paint_damage":
        return {"spot": 0.6, repair: 0.4} if bucket == "s" else {repair: 1.0}
    if cls == "corrosion":
        return {"replace": 0.5, repair: 0.5} if big else {repair: 0.7, "replace": 0.3}
    return {repair: 1.0}


@dataclass
class DamageInput:
    cls: str
    part: str | None
    q: float  # probability that the finding is real
    length_mm: float | None  # metric largest extent, if measurable
    rel_unc_length: float | None
    rel_area: float | None  # damage area / part area in the same frame
    near_edge: bool = False
    source: str = ""  # damage_id, for traceability


def near_part_edge(damage_mask: np.ndarray, part_mask: np.ndarray | None) -> bool:
    """True when most of the damage lies within ~6% of the part size from the part boundary."""
    if part_mask is None or not part_mask.any() or not damage_mask.any():
        return False
    k = max(3, int(0.06 * math.sqrt(part_mask.sum())))
    core = cv2.erode(part_mask.astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)).astype(bool)
    return float((~core[damage_mask]).mean()) > 0.5


def _tri(rng, spec, n):
    lo, mode, hi = (float(v) for v in spec)
    if hi <= lo:
        return np.full(n, mode)
    return rng.triangular(lo, min(max(mode, lo), hi), hi, n)


def _bucket_samples(d: DamageInput, rng, n) -> np.ndarray:
    if d.length_mm:
        x = d.length_mm * np.exp(rng.normal(0, max(d.rel_unc_length or 0.1, 0.02), n))
        edges = LENGTH_EDGES_MM
    elif d.rel_area:
        x = d.rel_area * np.exp(rng.normal(0, REL_AREA_UNC, n))
        edges = REL_AREA_EDGES
    else:
        return np.full(n, 1)  # unknown size: medium
    return np.searchsorted(np.array(edges), x)


def _part_prices(table: dict, model: str, part: str) -> list:
    by_model = table["parts"].get(model, {})
    return by_model.get(part) or table["parts"]["_default"].get(part) or table["parts"]["_default"]["_any"]


def group_key(part: str | None, slot: str) -> str:
    """Left and right doors are different parts: the side comes from the shot-plan slot when known."""
    if part in SIDED_PARTS:
        side = "left" if "left" in slot else ("right" if "right" in slot else "")
        return f"{side}_{part}" if side else part
    return part or "unknown_part"


def estimate(damages: list[tuple[str, DamageInput]], model: str = "", n: int = N_SAMPLES, seed: int = 0,
             table: dict | None = None) -> dict:
    """damages: (group key, input). Returns the cost distribution and its explanation."""
    table = table or price_table()
    rng = np.random.default_rng(seed)
    rate = _tri(rng, table["labour_rate"], n)
    groups: dict[str, list[DamageInput]] = {}
    for key, d in damages:
        if PART_KIND.get(d.part or "", "panel") != "ignore":
            groups.setdefault(key, []).append(d)
    total = np.zeros(n)
    parts_out, per_part = [], {}
    hours, flat = table["hours"], table["flat"]
    for key, ds in groups.items():
        part = ds[0].part or "unknown_part"
        kind = PART_KIND.get(part, "panel")
        sev = np.zeros(n, int)
        n_spot, n_chip = np.zeros(n), np.zeros(n)
        pdr = np.zeros(n)
        largest = np.zeros(n, int)
        for d in ds:
            exists = rng.random(n) < min(max(d.q, 0.05), 0.99)
            b = _bucket_samples(d, rng, n)
            u = rng.random(n)
            op = np.zeros(n, int)
            for bi, bucket in enumerate(BUCKETS):
                sel = b == bi
                if not sel.any():
                    continue
                prior = op_prior(d.cls, kind, bucket, d.near_edge)
                names = list(prior)
                cdf = np.cumsum([prior[o] for o in names])
                idx = np.minimum(np.searchsorted(cdf, u[sel] * cdf[-1], side="right"), len(names) - 1)
                op[sel] = np.array([SEV[names[i]] for i in idx])
            op[~exists] = 0
            sev = np.maximum(sev, op)
            n_spot += op == SEV["spot"]
            n_chip += op == SEV["glass_chip"]
            pdr_price = np.where(b == 0, _tri(rng, flat["pdr"]["s"], n), _tri(rng, flat["pdr"]["m"], n))
            pdr += np.where(op == SEV["pdr"], pdr_price, 0.0)
            largest = np.where(exists, np.maximum(largest, b), largest)
        refinish = _tri(rng, table["refinish"].get(part, table["refinish"]["_default"]), n)
        repair_h = np.choose(largest, [_tri(rng, hours["repair"][bk], n) for bk in BUCKETS])
        replace = (_tri(rng, _part_prices(table, model, part), n)
                   + _tri(rng, hours["replace"].get(kind, hours["replace"]["_default"]), n) * rate
                   + (refinish if kind in PAINTED else 0.0))
        cost = np.select(
            [sev == SEV["polish"], sev == SEV["spot"], sev == SEV["glass_chip"], sev == SEV["pdr"],
             sev == SEV["wheel_repair"], sev == SEV["plastic_repair"], sev == SEV["repair_paint"], sev == SEV["replace"]],
            [_tri(rng, hours["polish"], n) * rate, n_spot * _tri(rng, flat["spot"], n), n_chip * _tri(rng, flat["glass_chip"], n),
             pdr + n_spot * _tri(rng, flat["spot"], n), _tri(rng, flat["wheel_repair"], n),
             _tri(rng, hours["plastic_repair"], n) * rate + refinish, repair_h * rate + refinish, replace],
            default=0.0)
        total += cost
        per_part[key] = cost
        probs = {o: round(float(np.mean(sev == SEV[o])), 3) for o in OPS if np.mean(sev == SEV[o]) >= 0.005}
        likely = max(probs, key=probs.get)
        parts_out.append({"part_key": key, "part": part, "damages": len(ds), "likely_operation": likely,
                          "operation_probs": probs, "p_replace": probs.get("replace", 0.0),
                          "cost_p50": _money(np.percentile(cost, 50)), "cost_p90": _money(np.percentile(cost, 90)),
                          "cost_mean": _money(cost.mean()), "evidence": [d.source for d in ds if d.source]})
    var = float(total.var()) or 1.0
    for p in parts_out:  # share of the total variance (covariance through the shared labour rate included)
        c = per_part[p["part_key"]]
        p["variance_share"] = round(float(np.cov(c, total)[0, 1] / var) if total.var() > 0 else 0.0, 3)
    parts_out.sort(key=lambda p: -p["cost_mean"])
    usd = float(table["usd_rate"])
    q = {k: float(np.percentile(total, v)) for k, v in (("p10", 10), ("p50", 50), ("p90", 90))}
    return {"currency": table["currency"], **{k: _money(v) for k, v in q.items()}, "mean": _money(total.mean()),
            "usd": {k: round(v / usd) for k, v in q.items()}, "p_zero": round(float(np.mean(total == 0)), 3),
            "parts": parts_out, "n_damages": sum(len(v) for v in groups.values()), "samples": n,
            "price_table": table["version"], "status": table.get("status", "indicative"),
            "note_ru": table.get("note_ru", ""), "note_en": table.get("note_en", "")}


def _money(x: float) -> int:
    return int(round(float(x) / 10000.0) * 10000)
