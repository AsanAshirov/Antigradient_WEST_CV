"""Render evidence visuals for the site and the deck from a real genuine pair (the system's own output).

Usage: python scripts/render_evidence.py <out_dir>
Uses the verified same-car pair matiz_pink_g0 (sessions s0/s1, Commons, CC BY-SA 4.0, Damian B Oh) with the
same-model cohort, picks the frame pair with the most distinctive evidence and draws:
  pair.jpg   side by side, inlier lines: individual marks (cohort weight >= 0.7) in signal orange, design features dim
  cells.jpg  reference frame with the congruent-cell grid, cells that vote for identity filled
  stats.json numbers shown next to the visuals (inliers, cells, NFA)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

os.environ.setdefault("CARPRINT_SUBJECT", "0")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.verify import CELL_FRACTION, CELL_MIN_WEIGHT, compare_frames, distinctiveness  # noqa: E402

ORANGE = (255, 91, 31)  # RGB, the site's signal accent
DIM = (200, 204, 210)
INK = (14, 16, 19)


def main(out_dir: str):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    base = ROOT / "data" / "test" / "commons_mined"
    items = [it for it in json.loads((base / "manifest.json").read_text(encoding="utf-8")) if it["car_id"] == "matiz_pink_g0"]
    frames = {it["path"]: make_frame(it["path"], "extra", load_image((base / it["path"]).read_bytes()).rgb) for it in items}
    cohort = [make_frame(f"c{i}", "extra", load_image(p.read_bytes()).rgb) for i, p in enumerate(bank_paths(ROOT / "data" / "cohort", "matiz"))]
    s0 = [it["path"] for it in items if it["session"] == "s0"]
    s1 = [it["path"] for it in items if it["session"] == "s1"]
    best = None
    for a in s0:
        w = distinctiveness(frames[a], cohort)
        for b in s1:
            ev = compare_frames(frames[a], frames[b], w)
            score = sum(len(e.cells) for e in ev if e.log10_nfa_distinct < -3)
            if best is None or score > best[0]:
                best = (score, a, b, w, ev)
    score, a, b, w, ev = best
    ref, cur = frames[a], frames[b]
    print("best pair", a, b, "cells", score)

    # pair.jpg
    h = 900
    s_a, s_b = h / ref.rgb.shape[0], h / cur.rgb.shape[0]
    A = cv2.resize(ref.rgb, (round(ref.rgb.shape[1] * s_a), h), interpolation=cv2.INTER_AREA)
    B = cv2.resize(cur.rgb, (round(cur.rgb.shape[1] * s_b), h), interpolation=cv2.INTER_AREA)
    gap = 24
    canvas = np.full((h, A.shape[1] + gap + B.shape[1], 3), INK, np.uint8)
    canvas[:, : A.shape[1]] = (A * 0.78).astype(np.uint8)
    canvas[:, A.shape[1] + gap:] = (B * 0.78).astype(np.uint8)
    off = A.shape[1] + gap
    # Draw exactly the inliers the decision used (stored on the evidence), never a re-run of the matcher.
    lines_dim, lines_hot = [], []
    for e in ev:
        for a0, b1, wi in zip(e.ref_pts, e.cur_pts, e.weights):
            seg = ((a0 * s_a).astype(int), (b1 * s_b).astype(int) + np.array([off, 0]))
            (lines_hot if wi >= 0.7 else lines_dim).append(seg)
    overlay = canvas.copy()
    for (x0, y0), (x1, y1) in lines_dim:
        cv2.line(overlay, (int(x0), int(y0)), (int(x1), int(y1)), DIM, 1, cv2.LINE_AA)
    canvas = cv2.addWeighted(overlay, 0.45, canvas, 0.55, 0)
    for (x0, y0), (x1, y1) in lines_hot:
        cv2.line(canvas, (int(x0), int(y0)), (int(x1), int(y1)), ORANGE, 2, cv2.LINE_AA)
        for x, y in ((x0, y0), (x1, y1)):
            cv2.circle(canvas, (int(x), int(y)), 5, ORANGE, -1, cv2.LINE_AA)
            cv2.circle(canvas, (int(x), int(y)), 8, ORANGE, 1, cv2.LINE_AA)
    cv2.imwrite(str(out / "pair.jpg"), cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])

    # cells.jpg
    img = (ref.rgb * 0.72).astype(np.uint8)
    cell = max(ref.rgb.shape[:2]) * CELL_FRACTION
    votes: dict[tuple[int, int], float] = {}
    for e in ev:
        if e.log10_nfa_distinct < -3:
            for c, v in e.votes.items():
                votes[c] = votes.get(c, 0.0) + v
    hh, ww = img.shape[:2]
    over = img.copy()
    for (cx, cy), v in votes.items():
        if v >= CELL_MIN_WEIGHT:
            x0, y0 = int(cx * cell), int(cy * cell)
            cv2.rectangle(over, (x0, y0), (int(x0 + cell), int(y0 + cell)), ORANGE, -1)
    img = cv2.addWeighted(over, 0.32, img, 0.68, 0)
    for k in range(1, int(ww / cell) + 1):
        cv2.line(img, (int(k * cell), 0), (int(k * cell), hh), (235, 235, 235), 1, cv2.LINE_AA)
    for k in range(1, int(hh / cell) + 1):
        cv2.line(img, (0, int(k * cell)), (ww, int(k * cell)), (235, 235, 235), 1, cv2.LINE_AA)
    for (cx, cy), v in votes.items():
        if v >= CELL_MIN_WEIGHT:
            x0, y0 = int(cx * cell), int(cy * cell)
            cv2.rectangle(img, (x0, y0), (int(x0 + cell), int(y0 + cell)), ORANGE, 3, cv2.LINE_AA)
    for e in ev:
        if e.log10_nfa_distinct < -3:
            for (x, y), wi in zip(e.ref_pts.astype(int), e.weights):
                if wi >= 0.7:
                    cv2.circle(img, (int(x), int(y)), 4, ORANGE, -1, cv2.LINE_AA)
    cv2.imwrite(str(out / "cells.jpg"), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])

    # Web export: the two photos and the evidence as data, so the site draws (and animates) the real lines itself.
    from carprint.identity.viz import match_lines  # noqa: E402
    for name, fr in (("ref", ref), ("cur", cur)):
        hh0, ww0 = fr.rgb.shape[:2]
        k = min(1.0, 1400 / max(hh0, ww0))
        small = cv2.resize(fr.rgb, (round(ww0 * k), round(hh0 * k)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(out / f"{name}.jpg"), cv2.cvtColor(small, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
    rh, rw = ref.rgb.shape[:2]
    web = {"ref": "ref.jpg", "cur": "cur.jpg", "ref_size": [rw, rh], "cur_size": [cur.rgb.shape[1], cur.rgb.shape[0]],
           "matches": match_lines(ev, ref.rgb.shape, cur.rgb.shape, limit=400),
           "cells": [[round(cx * cell / rw, 4), round(cy * cell / rh, 4), round(cell / rw, 4), round(cell / rh, 4), round(v, 2)]
                     for (cx, cy), v in votes.items() if v >= CELL_MIN_WEIGHT]}
    strong = [e for e in ev if e.log10_nfa_distinct < -3]
    stats = {"ref": a, "cur": b, "congruent_cells": score, "zones": len(ev), "strong_zones": len(strong),
             "inliers": int(sum(e.zone.n_inliers for e in ev)), "distinctive_lines": len(lines_hot),
             "design_lines": len(lines_dim), "best_log10_nfa_distinct": round(min((e.log10_nfa_distinct for e in ev), default=0), 1),
             "cohort_size": len(cohort), "credit": "Photos: Damian B Oh, CC BY-SA 4.0, Wikimedia Commons"}
    (out / "stats.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    web["stats"] = stats
    (out / "pair.json").write_text(json.dumps(web), encoding="utf-8")
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "web_legacy/public/evidence")
