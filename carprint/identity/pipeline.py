"""Frame preparation shared by the API, evaluation and scripts."""
from __future__ import annotations

import numpy as np

from carprint.core.quality import assess, glare_mask
from carprint.identity.features import extract
from carprint.identity.verify import Frame


def make_frame(frame_id: str, slot: str, rgb: np.ndarray, subject_mask: np.ndarray | None = None) -> Frame:
    keep = ~glare_mask(rgb)
    if subject_mask is not None:
        keep &= subject_mask
    return Frame(frame_id, slot, rgb, extract(rgb, keep), assess(rgb, subject_mask))
