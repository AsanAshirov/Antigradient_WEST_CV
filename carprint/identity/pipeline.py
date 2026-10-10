"""Frame preparation shared by the API, evaluation and scripts.

Features are extracted on the detected car (crop with margin, upsampled to the extractor's working size), so the
keypoint budget goes to the car and background can never support an identity match. Keypoints are stored in full-
image coordinates for geometry; the LightGlue tensors stay in crop coordinates, consistent with their image_size.
If the detector is unavailable or finds no vehicle, the whole frame is used (counted in SUBJECT_STATS).
"""
from __future__ import annotations

import os

import numpy as np

from carprint.core.quality import assess, glare_mask
from carprint.identity.features import Features, extract
from carprint.identity.verify import Frame

USE_SUBJECT = os.environ.get("CARPRINT_SUBJECT", "1") != "0"
SUBJECT_STATS = {"cropped": 0, "no_vehicle": 0, "error": 0, "disabled": 0}


def make_frame(frame_id: str, slot: str, rgb: np.ndarray, subject_mask: np.ndarray | None = None) -> Frame:
    keep = ~glare_mask(rgb)
    box = None
    if USE_SUBJECT:
        try:
            from carprint.identity.subject import locate

            subject = locate(rgb)
        except Exception as e:  # a detector failure must not fail the inspection: fall back to the whole frame
            print(f"[carprint] subject detection failed for {frame_id}: {e!r}")
            SUBJECT_STATS["error"] += 1
            subject = None
        box = subject.box if subject is not None else None
        if box is not None:
            SUBJECT_STATS["cropped"] += 1
            car = subject.mask(rgb.shape)
            subject_mask = car if subject_mask is None else (subject_mask & car)
        elif subject is not None:
            SUBJECT_STATS["error" if subject.label == "unavailable" else "no_vehicle"] += 1
    else:
        SUBJECT_STATS["disabled"] += 1
    if box is not None:
        x0, y0, x1, y1 = box
        keep = keep & subject.keypoint_mask(rgb.shape)  # silhouette: the car behind or the wall never votes
        f = extract(rgb[y0:y1, x0:x1], keep[y0:y1, x0:x1])
        feats = Features(f.keypoints + np.array([x0, y0], np.float32), f.scores, f.raw, (rgb.shape[1], rgb.shape[0]))
    else:
        feats = extract(rgb, keep if subject_mask is None else keep & subject_mask)
    return Frame(frame_id, slot, rgb, feats, assess(rgb, subject_mask), subject.raw_box if box is not None else None)
