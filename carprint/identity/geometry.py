"""Geometric verification of tentative matches.

A car body is piecewise planar at the scale of one panel, so we fit several homographies
sequentially (MAGSAC++), one per approximately planar zone. Each zone gets an a-contrario
significance (Moisan & Stival, ORSA): log10 NFA = log10(N_tests) + log10 P[Binom(n, p) >= k],
where p = pi * eps^2 / A is the chance that a random correspondence lands within eps pixels
of the predicted position inside the zone area A. NFA < 1 means the zone is unlikely by chance.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from scipy.special import gammaln
from scipy.stats import binom

EPS_PX = 6.0
MIN_INLIERS = 10
MAX_ZONES = 5


@dataclass
class Zone:
    inlier_idx: np.ndarray  # indices into the tentative match list
    H: np.ndarray  # 3x3, maps image0 -> image1
    n_tentative: int  # matches available when this zone was fitted
    reproj_err_px: float  # median
    log10_nfa: float
    bbox0: tuple[int, int, int, int]  # x, y, w, h in image0
    bbox1: tuple[int, int, int, int]

    @property
    def n_inliers(self) -> int:
        return len(self.inlier_idx)


def _log10_comb(n: int, k: int) -> float:
    return float((gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1)) / np.log(10))


def log10_nfa(n: int, k: int, area: float, eps: float = EPS_PX) -> float:
    if n < 5 or k < 5:
        return 0.0
    p = min(1.0, np.pi * eps * eps / max(area, 1.0))
    log_tail = binom.logsf(k - 1, n, p)
    if not np.isfinite(log_tail):  # underflow: the first term dominates the tail
        log_tail = binom.logpmf(k, n, p)
    log10_tail = max(log_tail / np.log(10), -300.0)
    log10_tests = np.log10(max(n - 4, 1)) + _log10_comb(n, 4)
    return float(log10_tests + log10_tail)


def _bbox(pts: np.ndarray) -> tuple[int, int, int, int]:
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    return int(x0), int(y0), int(x1 - x0), int(y1 - y0)


def fit_zones(pts0: np.ndarray, pts1: np.ndarray, image1_area: float, eps: float = EPS_PX,
              max_zones: int = MAX_ZONES, min_inliers: int = MIN_INLIERS) -> list[Zone]:
    remaining = np.arange(len(pts0))
    zones: list[Zone] = []
    while len(remaining) >= min_inliers and len(zones) < max_zones:
        a, b = pts0[remaining].astype(np.float32), pts1[remaining].astype(np.float32)
        H, mask = cv2.findHomography(a, b, cv2.USAC_MAGSAC, eps, confidence=0.999, maxIters=5000)
        if H is None or mask is None:
            break
        inl = mask.ravel().astype(bool)
        if inl.sum() < min_inliers:
            break
        proj = cv2.perspectiveTransform(a[inl].reshape(-1, 1, 2), H).reshape(-1, 2)
        err = np.linalg.norm(proj - b[inl], axis=1)
        hull_area = cv2.contourArea(cv2.convexHull(b[inl])) if inl.sum() >= 3 else 0.0
        area = max(hull_area * 4.0, 0.05 * image1_area)  # neighbourhood of the zone, floor at 5% of frame
        zones.append(Zone(remaining[inl], H, len(remaining), float(np.median(err)),
                          log10_nfa(len(remaining), int(inl.sum()), area, eps), _bbox(a[inl]), _bbox(b[inl])))
        remaining = remaining[~inl]
    return zones
