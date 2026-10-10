"""Smoke test: synthetic same-car pair (perspective + photometric change) vs a different car."""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from carprint.core.image_io import load_image  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import verify  # noqa: E402


def warp_view(rgb: np.ndarray, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    h, w = rgb.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = (src + rng.uniform(-0.08, 0.08, src.shape) * [w, h]).astype(np.float32)
    out = cv2.warpPerspective(rgb, cv2.getPerspectiveTransform(src, dst), (w, h), borderMode=cv2.BORDER_REFLECT)
    out = np.clip(out.astype(np.float32) * rng.uniform(0.85, 1.15) + rng.uniform(-15, 15), 0, 255).astype(np.uint8)
    return out


def main(img_dir: str):
    from carprint.core.quality import assess
    imgs = [im for im in (load_image(p.read_bytes()).rgb for p in sorted(Path(img_dir).glob("*.jpg"))) if assess(im).ok][:10]
    t = time.perf_counter()
    a = make_frame("a", "extra", imgs[0])
    a2 = make_frame("a2", "extra", warp_view(imgs[0], 1))
    b = make_frame("b", "extra", imgs[1])
    cohort = {"a": [make_frame(f"c{i}", "extra", im) for i, im in enumerate(imgs[2:])]}
    print(f"feature extraction: {time.perf_counter() - t:.2f}s, kpts a={len(a.feats.keypoints)}")
    for name, cur in [("same (synthetic view)", a2), ("different car", b)]:
        t = time.perf_counter()
        v = verify([a], [cur], cohort)
        print(f"{name}: {v.decision} score={v.score_raw:.1f} zones={[z.to_dict()['log10_nfa_distinct'] for z in v.zones]}"
              f" t={time.perf_counter() - t:.2f}s reasons={v.reasons}")


if __name__ == "__main__":
    main(sys.argv[1])
