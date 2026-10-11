"""Damage timeline between two inspections of the same car.

Each old damage mask is carried into the new frame with the homography of the planar zone (panel) it lies in;
a status is assigned only where both frames actually observed the location without glare.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from carprint.core.quality import glare_mask
from carprint.damage.segmenter import Instance

MATCH_IOU = 0.10  # dilated-mask IoU for "same damage"
DILATE_PX = 15
VISIBLE_MIN = 0.8  # share of a damage that must have been observable in the other frame
ABSENT_MIN = 0.6  # "gone" is a claim about the past: only for reference findings the model was confident about
ZONE_MARGIN = 0.25  # zone bbox expansion when assigning a damage to a panel


@dataclass
class TimelineItem:
    status: str  # previously_recorded | newly_detected | previously_seen_now_absent | insufficient_evidence
    cls: str
    part: str | None
    cur_bbox: tuple | None
    ref_bbox: tuple | None
    cur_index: int | None = None  # index into the current frame's damages (cost of what is new)
    ref_index: int | None = None
    score: float | None = None  # detector confidence of the finding the item is about


@dataclass
class ZoneMap:
    H: np.ndarray  # ref -> cur
    bbox_ref: tuple[int, int, int, int]
    bbox_cur: tuple[int, int, int, int]


def _dilate(mask: np.ndarray) -> np.ndarray:
    k = np.ones((2 * DILATE_PX + 1, 2 * DILATE_PX + 1), np.uint8)
    return cv2.dilate(mask.astype(np.uint8), k).astype(bool)


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter / union) if union else 0.0


def warp(mask: np.ndarray, H: np.ndarray, shape) -> np.ndarray:
    return cv2.warpPerspective(mask.astype(np.uint8), H, (shape[1], shape[0]), flags=cv2.INTER_NEAREST).astype(bool)


def _center(bbox) -> tuple[float, float]:
    x, y, w, h = bbox
    return x + w / 2, y + h / 2


def _zone_for(bbox, zones: list[ZoneMap], use_ref: bool) -> ZoneMap | None:
    cx, cy = _center(bbox)
    best, best_d = None, float("inf")
    for z in zones:
        x, y, w, h = z.bbox_ref if use_ref else z.bbox_cur
        mx, my = w * ZONE_MARGIN, h * ZONE_MARGIN
        if x - mx <= cx <= x + w + mx and y - my <= cy <= y + h + my:
            d = np.hypot(cx - (x + w / 2), cy - (y + h / 2))
            if d < best_d:
                best, best_d = z, d
    return best


def compare(ref_dmg: list[Instance], cur_dmg: list[Instance], zones: list[ZoneMap], ref_rgb: np.ndarray,
            cur_shape, part_of=lambda inst: None, part_of_ref=None) -> list[TimelineItem]:
    part_of_ref = part_of_ref or part_of  # reference masks live in the reference frame: use its parts
    observable_ref = ~glare_mask(ref_rgb)
    items, used = [], set()
    warped_ref = []
    for r in ref_dmg:
        z = _zone_for(r.bbox, zones, use_ref=True)
        warped_ref.append(_dilate(warp(r.mask, z.H, cur_shape)) if z is not None else None)
    for ci, d in enumerate(cur_dmg):
        z = _zone_for(d.bbox, zones, use_ref=False)
        if z is None:
            items.append(TimelineItem("insufficient_evidence", d.cls, part_of(d), d.bbox, None, ci, score=d.score))
            continue
        dm = _dilate(d.mask)
        cands = [(i, _iou(dm, w)) for i, w in enumerate(warped_ref) if w is not None and i not in used]
        best = max(cands, key=lambda t: t[1], default=(None, 0.0))
        if best[0] is not None and best[1] >= MATCH_IOU:
            used.add(best[0])
            items.append(TimelineItem("previously_recorded", d.cls, part_of(d), d.bbox, ref_dmg[best[0]].bbox, ci, best[0],
                                      score=d.score))
            continue
        seen = warp(observable_ref, z.H, cur_shape)
        visible = float(seen[d.mask].mean()) if d.mask.any() else 0.0
        status = "newly_detected" if visible >= VISIBLE_MIN else "insufficient_evidence"
        items.append(TimelineItem(status, d.cls, part_of(d), d.bbox, None, ci, score=d.score))
    for i, (r, w) in enumerate(zip(ref_dmg, warped_ref)):
        if i in used or r.score < ABSENT_MIN:  # an unsure old finding that is not seen again is no news
            continue
        status = "previously_seen_now_absent" if w is not None and w.any() else "insufficient_evidence"
        items.append(TimelineItem(status, r.cls, part_of_ref(r), None, r.bbox, None, i, score=r.score))
    return items
