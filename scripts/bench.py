"""Latency per pipeline stage on the current device (set CARPRINT_DEVICE=cpu to force CPU).

Usage: python scripts/bench.py <images_dir> [n_pairs]. Prints p50/p95 per stage and JSON to eval/bench_<device>.json.
"""
import json
import os
import platform
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from carprint.core.image_io import load_image  # noqa: E402
from carprint.core.quality import assess  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.features import device  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import distinctiveness, verify  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def pct(xs):
    return {"p50": round(float(np.percentile(xs, 50)), 1), "p95": round(float(np.percentile(xs, 95)), 1), "n": len(xs)}


def main(img_dir, n_pairs=10):
    paths = sorted(p for p in Path(img_dir).rglob("*.jpg"))[: 2 * n_pairs]
    imgs = [load_image(p.read_bytes()).rgb for p in paths]
    make_frame("warmup", "extra", imgs[0])
    t = {"decode": [], "quality": [], "extract": [], "cohort_weights": [], "verify": []}
    for p in paths:
        s = time.perf_counter(); load_image(p.read_bytes()); t["decode"].append((time.perf_counter() - s) * 1000)
    for im in imgs:
        s = time.perf_counter(); assess(im); t["quality"].append((time.perf_counter() - s) * 1000)
    frames = []
    for i, im in enumerate(imgs):
        s = time.perf_counter(); frames.append(make_frame(f"f{i}", "extra", im)); t["extract"].append((time.perf_counter() - s) * 1000)
    cohort = [make_frame(f"c{i}", "extra", load_image(p.read_bytes()).rgb) for i, p in enumerate(bank_paths(ROOT / "data" / "cohort", "cobalt"))]
    for f in frames[:n_pairs]:
        s = time.perf_counter(); distinctiveness(f, cohort); t["cohort_weights"].append((time.perf_counter() - s) * 1000)
    for i in range(n_pairs):
        a, b = frames[2 * i], frames[2 * i + 1]
        s = time.perf_counter(); verify([a], [b], {a.frame_id: cohort}); t["verify"].append((time.perf_counter() - s) * 1000)
    out = {"device": str(device()), "torch_threads": os.environ.get("OMP_NUM_THREADS", "default"),
           "cpu": platform.processor(), "cohort_k": len(cohort), "stages_ms": {k: pct(v) for k, v in t.items()}}
    try:
        import torch
        if torch.cuda.is_available() and str(device()).startswith("cuda"):
            out["gpu"] = torch.cuda.get_device_name(0)
    except Exception:
        pass
    Path(ROOT / "eval" / f"bench_{str(device()).split(':')[0]}.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 10)
