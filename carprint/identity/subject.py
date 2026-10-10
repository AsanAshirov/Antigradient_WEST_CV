"""Subject localisation: find the car so identity evidence comes from the car only.

Without it ALIKED spends most of its keypoint budget on textured background (paving, gravel, curtains), the
glossy car gets few points, and two different cars parked in the same reception bay could match on the
background. We detect the car with RF-DETR (COCO-pretrained, Apache-2.0), crop it with a margin and extract
features on the crop at full resolution.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass

import numpy as np
from PIL import Image

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}
MIN_SCORE = 0.35
MARGIN = 0.06

_lock = threading.Lock()
_model = {}


@dataclass
class Subject:
    box: tuple[int, int, int, int] | None  # x0, y0, x1, y1 in image pixels; None = not found
    score: float
    label: str

    def mask(self, shape) -> np.ndarray:
        m = np.zeros(shape[:2], bool)
        if self.box is None:
            m[:] = True
        else:
            x0, y0, x1, y1 = self.box
            m[y0:y1, x0:x1] = True
        return m


def _detector():
    with _lock:
        if "det" not in _model:
            try:
                import rfdetr
                from rfdetr.assets.coco_classes import COCO_CLASSES

                kw = {"device": os.environ["CARPRINT_DEVICE"]} if os.environ.get("CARPRINT_DEVICE") else {}
                try:
                    det = rfdetr.RFDETRNano(**kw)
                except TypeError:
                    det = rfdetr.RFDETRNano()
                _model["det"] = (det, COCO_CLASSES)
            except Exception as e:  # detector unavailable: fall back to whole frame
                print(f"[carprint] vehicle detector unavailable: {e!r}")
                _model["det"] = None
    return _model["det"]


def locate(rgb: np.ndarray) -> Subject:
    det = _detector()
    if det is None:
        return Subject(None, 0.0, "")
    model, names = det
    with _lock:
        d = model.predict(Image.fromarray(rgb), threshold=MIN_SCORE)
    h, w = rgb.shape[:2]
    best, best_key = None, -1.0
    for xyxy, conf, cid in zip(d.xyxy, d.confidence, d.class_id):
        name = names.get(int(cid), "") if isinstance(names, dict) else ""
        if name not in VEHICLE_CLASSES:
            continue
        x0, y0, x1, y1 = xyxy
        area = (x1 - x0) * (y1 - y0) / (w * h)
        cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
        centrality = 1.0 - min(1.0, np.hypot(cx - 0.5, cy - 0.5) / 0.7)
        key = area * (0.5 + 0.5 * centrality) * float(conf)  # the photographed car: large and central
        if key > best_key:
            best, best_key = (xyxy, float(conf), name), key
    if best is None:
        return Subject(None, 0.0, "")
    (x0, y0, x1, y1), conf, name = best
    mx, my = (x1 - x0) * MARGIN, (y1 - y0) * MARGIN
    box = (int(max(0, x0 - mx)), int(max(0, y0 - my)), int(min(w, x1 + mx)), int(min(h, y1 + my)))
    return Subject(box, conf, name)
