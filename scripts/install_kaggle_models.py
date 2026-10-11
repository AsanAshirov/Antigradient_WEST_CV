"""Fetch trained part/damage weights from a finished Kaggle kernel into models/<task>/ and smoke-test them.

Usage: python scripts/install_kaggle_models.py <owner>/<kernel-slug> <task> [--image some.jpg]
Kaggle credentials come from the environment (KAGGLE_API_TOKEN) or ~/.kaggle; nothing is written outside models/.
Keeps model_info.json, the best checkpoint and the training log; reports the classes and one prediction.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEEP = ("model_info.json", "checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth",
        "log.txt", "results.json", "metrics.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kernel")
    ap.add_argument("task", choices=["damage", "parts"])
    ap.add_argument("--image", default=str(ROOT / "web" / "public" / "evidence" / "cur.jpg"))
    a = ap.parse_args()
    dst = ROOT / "models" / a.task
    with tempfile.TemporaryDirectory() as tmp:
        # only what serving needs: the per-epoch checkpoints in the kernel output weigh gigabytes
        pattern = r"(model_info\.json|checkpoint_best_(total|ema|regular)\.pth|log\.txt|results\.json|dataset_\w+\.json)$"
        subprocess.run(["kaggle", "kernels", "output", a.kernel, "-p", tmp, "-o", "--file-pattern", pattern], check=True)
        found = {p.name: p for p in Path(tmp).rglob("*") if p.is_file()}
        print("kernel output:", sorted(found)[:40])
        if "model_info.json" not in found:
            sys.exit("no model_info.json in the kernel output (training did not finish)")
        dst.mkdir(parents=True, exist_ok=True)
        best = next((n for n in KEEP[1:4] if n in found), None)
        if best is None:
            sys.exit("no best checkpoint in the kernel output")
        for name in KEEP:
            if name in found and (name == best or not name.startswith("checkpoint")):
                shutil.copy2(found[name], dst / name)
        for name, p in found.items():  # per-class dataset statistics
            if name.startswith("dataset_") and name.endswith(".json"):
                shutil.copy2(p, dst / name)
    info = json.loads((dst / "model_info.json").read_text())
    print(a.task, info.get("model"), "classes:", info.get("classes"))
    print("files:", {p.name: round(p.stat().st_size / 1e6, 1) for p in dst.iterdir()})

    sys.path.insert(0, str(ROOT))
    from carprint.core.image_io import load_image
    from carprint.damage.segmenter import Segmenter

    seg = Segmenter(dst)
    rgb = load_image(Path(a.image).read_bytes()).rgb
    inst = seg.predict(rgb, 0.3)
    print("smoke test:", len(inst), "instances", [(i.cls, round(i.score, 2), i.bbox) for i in inst[:8]])


if __name__ == "__main__":
    main()
