"""Distribution of capture-quality metrics on real photos, to calibrate the quality gate thresholds.

Usage: python scripts/quality_stats.py <out.json>
Runs the vehicle detector and the quality assessment (inside the car box) on every cohort and test image and prints
percentiles of each metric and how often each issue would fire. Thresholds should reject the worst few percent of
usable photos, not a third of them.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.core.quality import assess  # noqa: E402
from carprint.identity.subject import locate  # noqa: E402


def main(out_path: str):
    paths = sorted((ROOT / "data" / "cohort").rglob("*.jpg"))
    base = ROOT / "data" / "test" / "commons_mined"
    paths += [base / it["path"] for it in json.loads((base / "manifest.json").read_text(encoding="utf-8"))]
    rows = []
    for p in paths:
        rgb = load_image(p.read_bytes()).rgb
        s = locate(rgb)
        mask = s.mask(rgb.shape) if s.box is not None else None
        q = assess(rgb, mask)
        p95 = float(np.percentile(np.dot(rgb[mask] if mask is not None else rgb.reshape(-1, 3), [0.299, 0.587, 0.114]), 95) / 255)
        rows.append({"path": str(p.relative_to(ROOT)), "found": s.box is not None, "blur": q.blur, "glare": q.glare_ratio,
                     "subject": q.subject_ratio, "brightness": q.brightness, "p95": p95, "issues": q.issues})
    pct = lambda k: {f"p{v}": round(float(np.percentile([r[k] for r in rows if r[k] is not None], v)), 4) for v in (1, 5, 10, 50, 90, 95, 99)}
    summary = {"n": len(rows), "found": sum(r["found"] for r in rows),
               "issues": Counter(i for r in rows for i in r["issues"]), "any_issue": sum(1 for r in rows if r["issues"]),
               **{k: pct(k) for k in ("blur", "glare", "subject", "brightness", "p95")}}
    Path(out_path).write_text(json.dumps({"summary": summary, "rows": rows}, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
