"""Subject localisation: find the car so identity evidence comes from the car only.

Without it ALIKED spends most of its keypoint budget on textured background (paving, gravel, curtains), the
glossy car gets few points, and two different cars parked in the same reception bay could match on the
background. A box alone is not enough: the neighbouring car or the wall behind sits inside the box too (we saw a
same-car verdict carried by a Kia parked behind the photographed Matiz). So we segment the car with RF-DETR-Seg
(COCO-pretrained, Apache-2.0), crop its box with a margin, extract features on the crop at full resolution and keep
only keypoints inside the slightly dilated car silhouette. Falls back to the box detector, then to the whole frame.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}
MIN_SCORE = 0.35
MARGIN = 0.06
MASK_DILATE = 0.012  # of the box diagonal: keeps the silhouette edge (panel outline) without the background

_lock = threading.Lock()
_model = {}


@dataclass
class Subject:
    box: tuple[int, int, int, int] | None  # x0, y0, x1, y1 in image pixels with margin; None = not found
    score: float
    label: str
    raw_box: tuple[int, int, int, int] | None = None  # detector box without margin
    silhouette: np.ndarray | None = None  # HxW bool instance mask of the car, if the segmenter is available

    def mask(self, shape) -> np.ndarray:
        """Box region (with margin): what the quality gate was calibrated on."""
        m = np.zeros(shape[:2], bool)
        if self.box is None:
            m[:] = True
        else:
            x0, y0, x1, y1 = self.box
            m[y0:y1, x0:x1] = True
        return m

    def keypoint_mask(self, shape) -> np.ndarray:
        """Where identity keypoints may come from: the dilated silhouette, else the box."""
        if self.silhouette is None or self.raw_box is None:
            return self.mask(shape)
        x0, y0, x1, y1 = self.raw_box
        k = max(3, int(MASK_DILATE * np.hypot(x1 - x0, y1 - y0)))
        return cv2.dilate(self.silhouette.astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8)).astype(bool)


def _detector():
    with _lock:
        if "det" not in _model:
            _model["det"] = None
            try:
                import rfdetr
                from rfdetr.assets.coco_classes import COCO_CLASSES

                kw = {"device": os.environ["CARPRINT_DEVICE"]} if os.environ.get("CARPRINT_DEVICE") else {}
                for name in ("RFDETRSegNano", "RFDETRNano"):  # silhouette first, box-only fallback
                    cls = getattr(rfdetr, name, None)
                    if cls is None:
                        continue
                    try:
                        det = cls(**kw)
                    except TypeError:
                        det = cls()
                    _model["det"] = (det, COCO_CLASSES, name)
                    break
            except Exception as e:  # detector unavailable: fall back to whole frame
                print(f"[carprint] vehicle detector unavailable: {e!r}")
    return _model["det"]


def detector_name() -> str | None:
    det = _detector()
    return det[2] if det else None


def locate(rgb: np.ndarray) -> Subject:
    det = _detector()
    if det is None:
        return Subject(None, 0.0, "unavailable")
    model, names, _ = det
    with _lock:
        d = model.predict(Image.fromarray(rgb), threshold=MIN_SCORE)
    h, w = rgb.shape[:2]
    masks = getattr(d, "mask", None)
    best, best_key = None, -1.0
    for i, (xyxy, conf, cid) in enumerate(zip(d.xyxy, d.confidence, d.class_id)):
        name = names.get(int(cid), "") if isinstance(names, dict) else ""
        if name not in VEHICLE_CLASSES:
            continue
        x0, y0, x1, y1 = xyxy
        area = (x1 - x0) * (y1 - y0) / (w * h)
        cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
        centrality = 1.0 - min(1.0, np.hypot(cx - 0.5, cy - 0.5) / 0.7)
        key = area * (0.5 + 0.5 * centrality) * float(conf)  # the photographed car: large and central
        if key > best_key:
            best, best_key = (i, xyxy, float(conf), name), key
    if best is None:
        return Subject(None, 0.0, "")
    i, (x0, y0, x1, y1), conf, name = best
    silhouette = None
    if masks is not None and len(masks) > i:
        m = np.asarray(masks[i]).astype(bool)
        if m.shape == (h, w) and m.any():
            silhouette = m
    mx, my = (x1 - x0) * MARGIN, (y1 - y0) * MARGIN
    box = (int(max(0, x0 - mx)), int(max(0, y0 - my)), int(min(w, x1 + mx)), int(min(h, y1 + my)))
    return Subject(box, conf, name, (int(x0), int(y0), int(x1), int(y1)), silhouette)
