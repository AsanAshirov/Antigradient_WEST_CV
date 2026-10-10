"""Damage timeline between two inspections of the same car.

Old damage masks are carried into the new frame with the zone homography found by the identity
step; a status is assigned only where both frames actually observed the location.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from carprint.damage.segmenter import Instance

MATCH_IOU = 0.10  # dilated-mask IoU for "same damage"
DILATE_PX = 15


@dataclass
class TimelineItem:
    status: str  # previously_recorded | newly_detected | previously_seen_now_absent | insufficient_evidence
    cls: str
    part: str | None
    cur_bbox: tuple | None
    ref_bbox: tuple | None


def _dilate(mask: np.ndarray) -> np.ndarray:
    k = np.ones((2 * DILATE_PX + 1, 2 * DILATE_PX + 1), np.uint8)
    return cv2.dilate(mask.astype(np.uint8), k).astype(bool)


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter / union) if union else 0.0


def warp_mask(mask: np.ndarray, H: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    return cv2.warpPerspective(mask.astype(np.uint8), H, (shape[1], shape[0]), flags=cv2.INTER_NEAREST).astype(bool)


def compare(ref_dmg: list[Instance], cur_dmg: list[Instance], H: np.ndarray | None, ref_shape, cur_shape,
            part_of=lambda inst: None) -> list[TimelineItem]:
    if H is None:
        return [TimelineItem("insufficient_evidence", d.cls, part_of(d), d.bbox, None) for d in cur_dmg]
    seen_in_ref = warp_mask(np.ones(ref_shape[:2], bool), H, cur_shape)  # where the old frame observed the car
    warped = [(r, _dilate(warp_mask(r.mask, H, cur_shape))) for r in ref_dmg]
    used = set()
    items = []
    for d in cur_dmg:
        dm = _dilate(d.mask)
        best = max(range(len(warped)), key=lambda i: _iou(dm, warped[i][1]), default=None)
        if best is not None and _iou(dm, warped[best][1]) >= MATCH_IOU:
            used.add(best)
            items.append(TimelineItem("previously_recorded", d.cls, part_of(d), d.bbox, warped[best][0].bbox))
        elif seen_in_ref[d.mask].mean() > 0.8:
            items.append(TimelineItem("newly_detected", d.cls, part_of(d), d.bbox, None))
        else:
            items.append(TimelineItem("insufficient_evidence", d.cls, part_of(d), d.bbox, None))
    for i, (r, wm) in enumerate(warped):
        if i in used:
            continue
        status = "previously_seen_now_absent" if wm.any() else "insufficient_evidence"
        items.append(TimelineItem(status, r.cls, part_of(r), None, r.bbox))
    return items
