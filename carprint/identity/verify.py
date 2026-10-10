"""Instance-level identity verification: SAME / DIFFERENT / REVIEW.

Two cars of the same model share their design (grille, lamps, panel lines), so geometrically
consistent matches alone do not prove identity. Each reference keypoint f gets a distinctiveness
weight from a cohort of K different cars of the same model:

    w(f) = log((K + 1) / (m_f + 0.5)) / log((K + 1) / 0.5),   m_f = cohort images where f is a verified inlier

so w ~ 1 for marks seen only on this car (chips, curb rash, scratches) and w ~ 0 for design features.
Zone evidence is then re-scored a-contrario with the weighted inlier count.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from carprint.core.quality import QualityReport, corner_factor, reflection_factor
from carprint.identity.features import Features, match
from carprint.identity.geometry import Zone, fit_zones, log10_nfa

GENERIC_NFA = -2.0  # cohort zone counts as a design-feature match below this
SAME_ZONE_NFA = -3.0  # distinctive zone significance needed to count as identity evidence
SAME_MIN_CELLS = 6  # congruent matching cells (NIST CMC analogue): >=6 identify, 2..5 inconclusive
SAME_STRONG_NFA = -6.0
CELL_FRACTION = 1 / 8  # cell side as a fraction of the reference image long side
CELL_MIN_WEIGHT = 2.0  # distinctive weight needed for a cell to vote (one vote per cell limits burstiness)
DIFF_ALIGN_NFA = -4.0  # raw (unweighted) zone significance meaning "same model, comparable view"
DIFF_MIN_REF_MARKS = 15  # distinctive reference keypoints that should have reappeared
DIFF_MAX_DISTINCT = 3.0
DIFF_MIN_ZONES = 2  # contradicted aligned zones needed for DIFFERENT (conservative; VIN is the hard proof)
MIN_COHORT = 4  # without a same-model cohort, design features cannot be discounted -> no automatic SAME


@dataclass
class Frame:
    frame_id: str
    slot: str
    rgb: np.ndarray
    feats: Features
    quality: QualityReport


@dataclass
class ZoneEvidence:
    ref_frame: str
    cur_frame: str
    zone: Zone
    distinct_inliers: float
    log10_nfa_distinct: float
    ref_marks_in_zone: int  # distinctive reference keypoints inside the aligned zone
    cells: frozenset = frozenset()  # congruent cells (cx, cy) in the reference frame

    def to_dict(self) -> dict:
        z = self.zone
        return {"ref_frame": self.ref_frame, "cur_frame": self.cur_frame, "inliers": z.n_inliers,
                "distinct_inliers": round(self.distinct_inliers, 1), "reproj_err_px": round(z.reproj_err_px, 2),
                "log10_nfa": round(z.log10_nfa, 1), "log10_nfa_distinct": round(self.log10_nfa_distinct, 1),
                "ref_marks_in_zone": self.ref_marks_in_zone, "congruent_cells": len(self.cells),
                "bbox_ref": z.bbox0, "bbox_cur": z.bbox1}


@dataclass
class Verdict:
    decision: str
    score_raw: float
    zones: list[ZoneEvidence] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    cohort_size: int = 0


_W_CACHE: dict[tuple, tuple] = {}
_W_CACHE_MAX = 512


def distinctiveness(ref: Frame, cohort: list[Frame]) -> np.ndarray:
    # Keyed by object identity; the cached tuple keeps the objects alive so their ids cannot be reused.
    key = (id(ref), tuple(id(c) for c in cohort))
    if key not in _W_CACHE:
        if len(_W_CACHE) >= _W_CACHE_MAX:
            _W_CACHE.pop(next(iter(_W_CACHE)))
        _W_CACHE[key] = (ref, list(cohort), _distinctiveness(ref, cohort))
    return _W_CACHE[key][2]


def _distinctiveness(ref: Frame, cohort: list[Frame]) -> np.ndarray:
    n = len(ref.feats.keypoints)
    k = len(cohort)
    if k == 0:
        return np.ones(n)
    hits = np.zeros(n)
    for c in cohort:
        m, _ = match(ref.feats, c.feats)
        if len(m) < 10:
            continue
        zones = fit_zones(ref.feats.keypoints[m[:, 0]], c.feats.keypoints[m[:, 1]], c.rgb.shape[0] * c.rgb.shape[1])
        seen = np.zeros(n, bool)
        for z in zones:
            if z.log10_nfa < GENERIC_NFA:
                seen[m[z.inlier_idx, 0]] = True
        hits += seen
    return np.log((k + 1) / (hits + 0.5)) / np.log((k + 1) / 0.5)


def compare_frames(ref: Frame, cur: Frame, w_ref: np.ndarray) -> list[ZoneEvidence]:
    m, conf = match(ref.feats, cur.feats)
    if len(m) < 10:
        return []
    pts0, pts1 = ref.feats.keypoints[m[:, 0]], cur.feats.keypoints[m[:, 1]]
    area = cur.rgb.shape[0] * cur.rgb.shape[1]
    cell = max(ref.rgb.shape[:2]) * CELL_FRACTION
    out = []
    # Identity weight of a match = cohort distinctiveness x not-a-reflection x corner-like (no aperture sliding)
    # x LightGlue confidence. Geometry still uses every match for registration.
    refl = np.minimum(reflection_factor(ref.rgb, pts0), reflection_factor(cur.rgb, pts1))
    corner = np.minimum(corner_factor(ref.rgb, pts0), corner_factor(cur.rgb, pts1))
    evidence_w = refl * corner * conf
    for z in fit_zones(pts0, pts1, area):
        w = w_ref[m[z.inlier_idx, 0]] * evidence_w[z.inlier_idx]
        k_d = float(w.sum())
        cid = np.floor(pts0[z.inlier_idx] / cell).astype(int)
        votes: dict[tuple[int, int], float] = {}
        for (cx, cy), wi in zip(map(tuple, cid), w):
            votes[(cx, cy)] = votes.get((cx, cy), 0.0) + wi
        cells = frozenset(c for c, v in votes.items() if v >= CELL_MIN_WEIGHT)
        x, y, bw, bh = z.bbox0
        kp = ref.feats.keypoints
        inside = (kp[:, 0] >= x) & (kp[:, 0] <= x + bw) & (kp[:, 1] >= y) & (kp[:, 1] <= y + bh)
        refl_ref = reflection_factor(ref.rgb, kp)
        marks = int(((w_ref * refl_ref > 0.7) & inside).sum())
        zone_area = max(bw * bh * 4.0, 0.05 * area)
        out.append(ZoneEvidence(ref.frame_id, cur.frame_id, z, k_d,
                                log10_nfa(z.n_tentative, int(round(k_d)), zone_area), marks, cells))
    return out


def _pairs(ref: list[Frame], cur: list[Frame]) -> list[tuple[Frame, Frame]]:
    same_slot = [(r, c) for r in ref for c in cur if r.slot == c.slot and r.slot not in ("", "extra")]
    return same_slot or [(r, c) for r in ref for c in cur]


def verify(ref_frames: list[Frame], cur_frames: list[Frame], cohort: dict[str, list[Frame]] | None = None) -> Verdict:
    ref_ok = [f for f in ref_frames if f.quality.ok]
    cur_ok = [f for f in cur_frames if f.quality.ok]
    if not ref_ok or not cur_ok:
        return Verdict("RECAPTURE_REQUIRED", 0.0, reasons=["Нет кадров достаточного качества в одном из осмотров"])

    cohort = cohort or {}
    weights = {r.frame_id: distinctiveness(r, cohort.get(r.frame_id, [])) for r in ref_ok}
    k_cohort = max((len(v) for v in cohort.values()), default=0)

    evidence: list[ZoneEvidence] = []
    for r, c in _pairs(ref_ok, cur_ok):
        evidence.extend(compare_frames(r, c, weights[r.frame_id]))

    strong = [e for e in evidence if e.log10_nfa_distinct < SAME_ZONE_NFA]
    congruent = {(e.ref_frame, c) for e in strong for c in e.cells}
    score = float(len(congruent))
    reasons = []
    if k_cohort < MIN_COHORT:
        reasons.append(f"Когорта машин той же модели мала ({k_cohort} < {MIN_COHORT}): автоматический SAME запрещён")

    if k_cohort >= MIN_COHORT and len(congruent) >= SAME_MIN_CELLS and min(e.log10_nfa_distinct for e in strong) < SAME_STRONG_NFA:
        reasons.insert(0, f"Совпали индивидуальные признаки в {len(congruent)} независимых ячейках ({len(strong)} зон)")
        return Verdict("SAME", score, evidence, reasons, k_cohort)

    aligned = [e for e in evidence if e.zone.log10_nfa < DIFF_ALIGN_NFA]
    contradicted = [e for e in aligned if e.ref_marks_in_zone >= DIFF_MIN_REF_MARKS and e.distinct_inliers < DIFF_MAX_DISTINCT]
    if len(contradicted) >= DIFF_MIN_ZONES and len(congruent) <= 1 and k_cohort >= MIN_COHORT:
        reasons.insert(0, "Ракурсы совмещаются по дизайну модели, но индивидуальные метки эталона не найдены")
        return Verdict("DIFFERENT", score, evidence, reasons, k_cohort)

    if not aligned:
        reasons.insert(0, "Не найдено сопоставимых участков: снимите те же ракурсы, что в эталоне")
    else:
        reasons.insert(0, f"Доказательств недостаточно: {len(congruent)} совпавших ячеек из {SAME_MIN_CELLS} нужных")
    return Verdict("REVIEW", score, evidence, reasons, k_cohort)
