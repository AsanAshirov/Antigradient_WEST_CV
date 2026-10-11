"""RF-DETR-Seg wrapper for the parts and damage models trained in training/kaggle/train_seg.py."""
from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

CHECKPOINTS = ("checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth", "checkpoint.pth")


@dataclass
class Instance:
    cls: str
    score: float
    bbox: tuple[int, int, int, int]  # x, y, w, h
    mask: np.ndarray  # HxW bool

    @property
    def area_ratio(self) -> float:
        return float(self.mask.mean())


class Segmenter:
    def __init__(self, weights_dir: Path):
        import rfdetr

        info = json.loads((weights_dir / "model_info.json").read_text())
        self.classes: list[str] = info["classes"]
        self.name = info["model"]
        ckpt = next((weights_dir / c for c in CHECKPOINTS if (weights_dir / c).exists()), None)
        if ckpt is None:
            raise FileNotFoundError(f"no checkpoint in {weights_dir}")
        kw = {"device": os.environ["CARPRINT_DEVICE"]} if os.environ.get("CARPRINT_DEVICE") else {}
        try:
            self.model = getattr(rfdetr, info["model"])(pretrain_weights=str(ckpt), **kw)
        except TypeError:
            self.model = getattr(rfdetr, info["model"])(pretrain_weights=str(ckpt))
        self._lock = threading.Lock()

    def _name(self, class_id: int, predicted: str | None) -> str | None:
        """rfdetr >= 1.11 drops the root COCO category and predicts 0-based indices into the training classes; trust
        the class name it returns when it is one of ours, else the 0-based index; unknown ids are dropped."""
        if predicted and predicted in self.classes:
            return predicted
        i = int(class_id)
        return self.classes[i] if 0 <= i < len(self.classes) else None

    def predict(self, rgb: np.ndarray, threshold: float = 0.35) -> list[Instance]:
        with self._lock:
            det = self.model.predict(Image.fromarray(rgb), threshold=threshold)
        if len(det):
            # one query can pass the threshold for two classes: keep one instance per object
            det = det.with_nms(threshold=0.5, class_agnostic=True)
        names = det.data.get("class_name") if getattr(det, "data", None) else None
        out = []
        masks = det.mask if det.mask is not None else [None] * len(det)
        for k, (xyxy, conf, cid, m) in enumerate(zip(det.xyxy, det.confidence, det.class_id, masks)):
            cls = self._name(cid, str(names[k]) if names is not None else None)
            if cls is None:
                continue
            x0, y0, x1, y1 = (int(v) for v in xyxy)
            if m is None:
                m = np.zeros(rgb.shape[:2], bool)
                m[y0:y1, x0:x1] = True
            out.append(Instance(cls, float(conf), (x0, y0, x1 - x0, y1 - y0), np.asarray(m).astype(bool)))
        return out


_cache: dict[str, Segmenter | None] = {}


def load(kind: str, models_dir: Path) -> Segmenter | None:
    if kind not in _cache:
        d = models_dir / kind
        try:
            _cache[kind] = Segmenter(d) if (d / "model_info.json").exists() else None
        except Exception as e:  # missing package or corrupt checkpoint: run without this model
            print(f"[carprint] {kind} model not loaded: {e!r}")
            _cache[kind] = None
    return _cache[kind]
