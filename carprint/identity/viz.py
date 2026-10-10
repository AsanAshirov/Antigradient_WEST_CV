"""Evidence visualisations drawn from the zones the decision actually used (never a re-run of the matcher)."""
from __future__ import annotations

import cv2
import numpy as np

from carprint.identity.verify import Frame, ZoneEvidence

MARK = (255, 91, 31)  # RGB signal orange: individual mark (cohort weight >= 0.7)
DESIGN = (200, 204, 210)  # shared design feature
INDIVIDUAL_W = 0.7


def side_by_side(ref: Frame, cur: Frame, zones: list[ZoneEvidence], height: int = 540) -> np.ndarray:
    """Inlier lines of the given zones; orange = individual mark, grey = design feature shared by the model."""
    s0, s1 = height / ref.rgb.shape[0], height / cur.rgb.shape[0]
    a = cv2.resize(ref.rgb, (round(ref.rgb.shape[1] * s0), height), interpolation=cv2.INTER_AREA)
    b = cv2.resize(cur.rgb, (round(cur.rgb.shape[1] * s1), height), interpolation=cv2.INTER_AREA)
    canvas = (np.concatenate([a, b], axis=1) * 0.8).astype(np.uint8)
    off = a.shape[1]
    dim = canvas.copy()
    for z in zones:
        if z.ref_pts is None:
            continue
        for (x0, y0), (x1, y1), w in zip(z.ref_pts * s0, z.cur_pts * s1, z.weights):
            p, q = (int(x0), int(y0)), (int(x1) + off, int(y1))
            if w >= INDIVIDUAL_W:
                cv2.line(canvas, p, q, MARK, 2, cv2.LINE_AA)
                cv2.circle(canvas, p, 4, MARK, -1, cv2.LINE_AA)
                cv2.circle(canvas, q, 4, MARK, -1, cv2.LINE_AA)
            else:
                cv2.line(dim, p, q, DESIGN, 1, cv2.LINE_AA)
    return cv2.addWeighted(dim, 0.5, canvas, 0.5, 0) if any(z.ref_pts is not None for z in zones) else canvas


def match_lines(zones: list[ZoneEvidence], ref_shape, cur_shape, limit: int = 160) -> list[list[float]]:
    """Inliers as [x0, y0, x1, y1, w] with coordinates normalised to each image (0..1), strongest first, so a
    client can draw them over the two photos at any display size."""
    rows = []
    for z in zones:
        if z.ref_pts is None:
            continue
        for (x0, y0), (x1, y1), w in zip(z.ref_pts, z.cur_pts, z.weights):
            rows.append([x0 / ref_shape[1], y0 / ref_shape[0], x1 / cur_shape[1], y1 / cur_shape[0], float(w)])
    rows.sort(key=lambda r: -r[4])
    return [[round(float(v), 4) for v in r] for r in rows[:limit]]
