"""Evidence visualisations: matched zones between reference and current frames."""
from __future__ import annotations

import cv2
import numpy as np

from carprint.identity.features import match
from carprint.identity.geometry import fit_zones
from carprint.identity.verify import Frame

ZONE_COLORS = [(46, 204, 113), (52, 152, 219), (241, 196, 15), (155, 89, 182), (230, 126, 34)]


def side_by_side(ref: Frame, cur: Frame, w_ref: np.ndarray, height: int = 540) -> np.ndarray:
    """Inlier lines per zone; bright = distinctive (individual mark), dim = shared design feature."""
    s0, s1 = height / ref.rgb.shape[0], height / cur.rgb.shape[0]
    a = cv2.resize(ref.rgb, (round(ref.rgb.shape[1] * s0), height))
    b = cv2.resize(cur.rgb, (round(cur.rgb.shape[1] * s1), height))
    canvas = np.concatenate([a, b], axis=1).copy()
    off = a.shape[1]
    m, _ = match(ref.feats, cur.feats)
    if len(m) >= 10:
        p0, p1 = ref.feats.keypoints[m[:, 0]], cur.feats.keypoints[m[:, 1]]
        for zi, z in enumerate(fit_zones(p0, p1, cur.rgb.shape[0] * cur.rgb.shape[1])):
            color = np.array(ZONE_COLORS[zi % len(ZONE_COLORS)], float)
            for idx in z.inlier_idx:
                w = float(w_ref[m[idx, 0]])
                c = tuple(int(v) for v in color * (0.35 + 0.65 * w))
                x0, y0 = (p0[idx] * s0).astype(int)
                x1, y1 = (p1[idx] * s1).astype(int)
                cv2.line(canvas, (x0, y0), (x1 + off, y1), c, 1 if w < 0.5 else 2, cv2.LINE_AA)
                if w >= 0.7:
                    cv2.circle(canvas, (x0, y0), 4, c, -1, cv2.LINE_AA)
                    cv2.circle(canvas, (x1 + off, y1), 4, c, -1, cv2.LINE_AA)
    return canvas
