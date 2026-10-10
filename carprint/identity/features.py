"""Local features (ALIKED, BSD-3) and matching (LightGlue, Apache-2.0)."""
from __future__ import annotations

import threading
from dataclasses import dataclass

import numpy as np
import torch

_lock = threading.Lock()
_models: dict = {}


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _get(max_keypoints: int):
    with _lock:
        if "aliked" not in _models:
            from lightglue import ALIKED, LightGlue

            dev = device()
            _models["aliked"] = ALIKED(max_num_keypoints=max_keypoints, detection_threshold=0.01).eval().to(dev)
            _models["lightglue"] = LightGlue(features="aliked", depth_confidence=-1, width_confidence=-1).eval().to(dev)
    return _models["aliked"], _models["lightglue"]


@dataclass
class Features:
    keypoints: np.ndarray  # Nx2 (x, y) in image pixels
    scores: np.ndarray  # N
    raw: dict  # tensors for LightGlue, batch dim kept
    image_size: tuple[int, int]  # (width, height)


@torch.inference_mode()
def extract(rgb: np.ndarray, keep_mask: np.ndarray | None = None, max_keypoints: int = 2048,
            resize: int = 1024) -> Features:
    aliked, _ = _get(max_keypoints)
    img = torch.from_numpy(rgb).permute(2, 0, 1).float().div(255).to(device())
    feats = aliked.extract(img, resize=resize)
    kpts = feats["keypoints"][0].cpu().numpy()
    if keep_mask is not None:
        h, w = keep_mask.shape
        xi = np.clip(kpts[:, 0].round().astype(int), 0, w - 1)
        yi = np.clip(kpts[:, 1].round().astype(int), 0, h - 1)
        keep = torch.from_numpy(keep_mask[yi, xi]).to(feats["keypoints"].device)
        per_point = ("keypoints", "keypoint_scores", "descriptors")
        feats = {k: (v[:, keep] if k in per_point else v) for k, v in feats.items()}
        kpts = feats["keypoints"][0].cpu().numpy()
    scores = feats.get("keypoint_scores", torch.ones(1, len(kpts)))[0].cpu().numpy()
    return Features(kpts, scores, feats, (rgb.shape[1], rgb.shape[0]))


@torch.inference_mode()
def match(f0: Features, f1: Features) -> tuple[np.ndarray, np.ndarray]:
    """Returns (pairs Kx2 of keypoint indices, confidence K)."""
    if len(f0.keypoints) < 8 or len(f1.keypoints) < 8:
        return np.empty((0, 2), int), np.empty(0)
    _, lg = _get(2048)
    out = lg({"image0": f0.raw, "image1": f1.raw})
    m = out["matches"][0].cpu().numpy()
    s = out["scores"][0].cpu().numpy()
    return m, s
