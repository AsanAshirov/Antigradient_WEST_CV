"""Identity verification evaluation (ISO/IEC 19795-style counting).

Manifest (JSON list): {"path", "car_id", "session", "model", "slot"}.
Genuine comparisons: same car_id, different session. Impostor comparisons: different car_id (pairs by the same
photographer of the same model are excluded as unknown ground truth unless they were visually verified as distinct
cars of one "distinct_group"), split into
"hard" (same model) and "other". Error rates are reported per comparison AND bounded per vehicle, with
exact Clopper-Pearson 95% upper bounds; when there are 0 errors the bound is ~3/N (rule of three).
"""
from __future__ import annotations

import hashlib
import itertools
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.stats import beta

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import verify  # noqa: E402


def upper95(errors: int, n: int) -> float | None:
    return None if n == 0 else float(beta.ppf(0.95, errors + 1, n - errors)) if errors < n else 1.0


def rate(errors: int, n: int) -> dict:
    return {"errors": errors, "n": n, "rate": (errors / n) if n else None, "upper95": upper95(errors, n)}


def main(manifest_path: str, cohort_dir: str, out_path: str, max_impostor_per_stratum: int = 200):
    manifest_bytes = Path(manifest_path).read_bytes()
    items = json.loads(manifest_bytes)
    base = Path(manifest_path).parent
    sessions: dict[tuple, list] = defaultdict(list)
    for it in items:
        sessions[(it["car_id"], it["session"])].append(it)

    frames = {}
    t = time.perf_counter()
    for key, its in sessions.items():
        frames[key] = [make_frame(f"{key[0]}|{key[1]}|{i}", it.get("slot", "extra"),
                                  load_image((base / it["path"]).read_bytes()).rgb) for i, it in enumerate(its)]
    print(f"features for {len(items)} images: {time.perf_counter() - t:.1f}s", flush=True)

    cohort_cache = {}

    def cohort(model: str):
        if model not in cohort_cache:
            paths = bank_paths(Path(cohort_dir), model)
            cohort_cache[model] = [make_frame(f"c{model}{i}", "extra", load_image(p.read_bytes()).rgb) for i, p in enumerate(paths)]
        return cohort_cache[model]

    model_of = {k: v[0]["model"] for k, v in sessions.items()}
    author_of = {k: {w.lower() for w in v[0].get("author", "").replace(",", " ").split() if len(w) >= 4}
                 for k, v in sessions.items()}
    group_of = {k: v[0].get("distinct_group") for k, v in sessions.items()}
    keys = sorted(sessions)
    genuine = [(a, b) for a, b in itertools.combinations(keys, 2) if a[0] == b[0]]
    # Same photographer + same model is often the same car shot twice: unknown ground truth, excluded.
    impostor = [(a, b) for a, b in itertools.combinations(keys, 2) if a[0] != b[0]
                and (not (author_of[a] & author_of[b] and model_of[a] == model_of[b])
                     or (group_of[a] is not None and group_of[a] == group_of[b]))]
    rng = np.random.default_rng(0)
    strata = {"hard": [p for p in impostor if model_of[p[0]] == model_of[p[1]]],
              "other": [p for p in impostor if model_of[p[0]] != model_of[p[1]]]}
    for s in strata:
        if len(strata[s]) > max_impostor_per_stratum:
            idx = rng.choice(len(strata[s]), max_impostor_per_stratum, replace=False)
            strata[s] = [strata[s][i] for i in idx]

    records, lat = [], []
    for label, pairs in [("genuine", genuine), ("hard", strata["hard"]), ("other", strata["other"])]:
        for a, b in pairs:
            t = time.perf_counter()
            coh = cohort(model_of[a])
            v = verify(frames[a], frames[b], {f.frame_id: coh for f in frames[a]})
            lat.append((time.perf_counter() - t) * 1000)
            records.append({"label": label, "ref": list(a), "cur": list(b), "decision": v.decision, "score": v.score_raw})

    def summarize(label):
        rs = [r for r in records if r["label"] == label]
        dec = defaultdict(int)
        for r in rs:
            dec[r["decision"]] += 1
        return rs, dict(dec)

    out = {"test_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(), "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
           "n_images": len(items), "n_cars": len({k[0] for k in keys}), "n_sessions": len(keys), "identity": {}}
    g, gd = summarize("genuine")
    out["identity"]["genuine"] = {"decisions": gd, "fnmr": rate(gd.get("DIFFERENT", 0), len(g)),
                                  "review_rate": rate(gd.get("REVIEW", 0) + gd.get("RECAPTURE_REQUIRED", 0), len(g)),
                                  "tar": rate(gd.get("SAME", 0), len(g))}
    for s in ("hard", "other"):
        rs, d = summarize(s)
        cars = {c for r in rs for c in (r["ref"][0], r["cur"][0])}
        fm_cars = {c for r in rs if r["decision"] == "SAME" for c in (r["ref"][0], r["cur"][0])}
        out["identity"][f"impostor_{s}"] = {"decisions": d, "fmr": rate(d.get("SAME", 0), len(rs)),
                                            "fmr_vehicle_bound": rate(len(fm_cars), len(cars)),
                                            "review_rate": rate(d.get("REVIEW", 0) + d.get("RECAPTURE_REQUIRED", 0), len(rs))}
    out["latency_ms"] = {"p50": float(np.percentile(lat, 50)) if lat else None,
                         "p95": float(np.percentile(lat, 95)) if lat else None, "n": len(lat)}
    out["records"] = records
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "records"}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:4])
