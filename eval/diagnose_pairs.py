"""Per-pair evidence breakdown on a manifest (calibration use only): where does identity evidence get lost?"""
import itertools
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.core.quality import corner_factor, reflection_factor  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.features import match  # noqa: E402
from carprint.identity.geometry import fit_zones  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import distinctiveness  # noqa: E402


def stats(ref, cur, w_ref):
    m, conf = match(ref.feats, cur.feats)
    if len(m) < 10:
        return {"matches": int(len(m))}
    p0, p1 = ref.feats.keypoints[m[:, 0]], cur.feats.keypoints[m[:, 1]]
    zones = fit_zones(p0, p1, cur.rgb.shape[0] * cur.rgb.shape[1])
    if not zones:
        return {"matches": int(len(m)), "zones": 0}
    z = max(zones, key=lambda z: z.n_inliers)
    idx = z.inlier_idx
    wc, cf = w_ref[m[idx, 0]], np.minimum(corner_factor(ref.rgb, p0[idx]), corner_factor(cur.rgb, p1[idx]))
    rf = np.minimum(reflection_factor(ref.rgb, p0[idx]), reflection_factor(cur.rgb, p1[idx]))
    return {"matches": int(len(m)), "zones": len(zones), "inl": z.n_inliers, "nfa": round(z.log10_nfa, 1),
            "w_cohort": round(float(wc.mean()), 2), "corner": round(float(cf.mean()), 2), "refl": round(float(rf.mean()), 2),
            "conf": round(float(conf[idx].mean()), 2), "w_total": round(float((wc * cf * rf * conf[idx]).sum()), 1)}


def main(manifest, cohort_dir, max_pairs=12):
    items = json.loads(Path(manifest).read_text(encoding="utf-8"))
    base = Path(manifest).parent
    sess = defaultdict(list)
    for it in items:
        sess[(it["car_id"], it["session"])].append(it)
    frames = {k: [make_frame(f"{k}{i}", "extra", load_image((base / it["path"]).read_bytes()).rgb) for i, it in enumerate(v)]
              for k, v in sess.items()}
    model = {k: v[0]["model"] for k, v in sess.items()}
    cohorts = {}
    keys = sorted(sess)
    genuine = [(a, b) for a, b in itertools.combinations(keys, 2) if a[0] == b[0]][:max_pairs]
    hard = [(a, b) for a, b in itertools.combinations(keys, 2) if a[0] != b[0] and model[a] == model[b]][:max_pairs]
    for label, pairs in (("GEN", genuine), ("IMP", hard)):
        for a, b in pairs:
            if model[a] not in cohorts:
                cohorts[model[a]] = [make_frame(f"c{model[a]}{i}", "extra", load_image(p.read_bytes()).rgb)
                                     for i, p in enumerate(bank_paths(Path(cohort_dir), model[a]))]
            best = None
            for r in frames[a]:
                w = distinctiveness(r, cohorts[model[a]])
                for c in frames[b]:
                    s = stats(r, c, w)
                    if best is None or s.get("inl", 0) > best.get("inl", 0):
                        best = s
            print(label, a[0], a[1], b[0], b[1], best, flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 12)
