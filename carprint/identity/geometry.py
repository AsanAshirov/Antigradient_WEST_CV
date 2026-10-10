"""Geometric verification of tentative matches.

A car body is piecewise planar at the scale of one panel, so we fit several homographies
sequentially (MAGSAC++), one per approximately planar zone. Each zone gets the a-contrario
number of false alarms of ORSA (Moisan, Moulon & Monasse, IPOL 2012):
    NFA = (n - 4) * C(n, k) * C(k, 4) * p^(k - 4),   p = pi * eps^2 / A,
the expected number of k-inlier homographies that random correspondences would produce.
NFA < 1 means the zone is unlikely by chance. It is a registration gate, not identity evidence.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from scipy.special import gammaln

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
    value = np.log10(n - 4) + _log10_comb(n, k) + _log10_comb(k, 4) + (k - 4) * np.log10(p)
    return float(max(value, -300.0))


def _bbox(pts: np.ndarray) -> tuple[int, int, int, int]:
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    return int(x0), int(y0), int(x1 - x0), int(y1 - y0)


SCALE_RANGE = (0.25, 4.0)  # area scale of the local affine part
MAX_ANISOTROPY = 4.0  # ratio of singular values of the affine part
MAX_PERSPECTIVE = 0.6  # |h31|*w + |h32|*h: how strongly the plane is tilted across the frame
MIN_SPREAD = 0.08  # sqrt(min/max eigenvalue) of inlier covariance: rejects near-collinear supports


def plausible(H: np.ndarray, a: np.ndarray, b: np.ndarray, size0: tuple[float, float]) -> bool:
    """Reject homographies no rigid panel seen from two phone positions can produce: mirroring,
    extreme scaling or shear, near-singular perspective, or inliers lying on a line (degenerate fit)."""
    Hn = H / H[2, 2]
    A = Hn[:2, :2]
    det = float(np.linalg.det(A))
    if det <= 0 or not (SCALE_RANGE[0] <= det <= SCALE_RANGE[1]):
        return False
    sv = np.linalg.svd(A, compute_uv=False)
    if sv[0] / max(sv[1], 1e-9) > MAX_ANISOTROPY:
        return False
    if abs(Hn[2, 0]) * size0[0] + abs(Hn[2, 1]) * size0[1] > MAX_PERSPECTIVE:
        return False
    for pts in (a, b):
        ev = np.linalg.eigvalsh(np.cov(pts.T))
        if ev[0] <= 0 or np.sqrt(ev[0] / ev[1]) < MIN_SPREAD:
            return False
    return True


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
        size0 = (float(pts0[:, 0].max() + 1), float(pts0[:, 1].max() + 1))
        if not plausible(H, a[inl], b[inl], size0):
            remaining = remaining[~inl]  # consume the degenerate support, keep searching the rest
            continue
        proj = cv2.perspectiveTransform(a[inl].reshape(-1, 1, 2), H).reshape(-1, 2)
        err = np.linalg.norm(proj - b[inl], axis=1)
        hull_area = cv2.contourArea(cv2.convexHull(b[inl])) if inl.sum() >= 3 else 0.0
        area = max(hull_area * 4.0, 0.05 * image1_area)  # neighbourhood of the zone, floor at 5% of frame
        zones.append(Zone(remaining[inl], H, len(remaining), float(np.median(err)),
                          log10_nfa(len(remaining), int(inl.sum()), area, eps), _bbox(a[inl]), _bbox(b[inl])))
        remaining = remaining[~inl]
    return zones
