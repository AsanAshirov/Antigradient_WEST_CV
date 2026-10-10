"""Render the site's films from the system's own outputs (no stock footage, no generated imagery).

Usage: python scripts/render_film.py <out_dir>   (needs the vehicle segmenter: run it on a GPU job)

  hero.mp4  8 s seamless loop: slow push-in on the hero car, a scan pass, the real ALIKED keypoints on the car
            silhouette appearing behind it, and the voting-cell grid
  film.mp4  ~24 s: keypoints -> inlier lines between two shoots of one car (real evidence, design vs individual) ->
            Monte Carlo repair estimate (the real 4,000 simulated totals) -> signed passport chain
  *.jpg     posters
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

os.environ.setdefault("CARPRINT_SUBJECT", "1")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from carprint.core.image_io import load_image  # noqa: E402
from carprint.damage.estimate import DamageInput, estimate, group_key  # noqa: E402
from carprint.identity.cohort import bank_paths  # noqa: E402
from carprint.identity.pipeline import make_frame  # noqa: E402
from carprint.identity.subject import locate  # noqa: E402
from carprint.identity.verify import CELL_FRACTION, CELL_MIN_WEIGHT, compare_frames, distinctiveness  # noqa: E402

W, H, FPS = 1600, 900, 30
ORANGE, INK, PAPER, DIM, BLUE = (255, 91, 31), (12, 13, 15), (242, 241, 237), (200, 204, 210), (127, 166, 245)
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


F_LABEL, F_BIG, F_MID = font(MONO, 17), font(SANS, 46), font(MONO, 22)


def clamp(x):
    return max(0.0, min(1.0, x))


def ease(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


class Writer:
    def __init__(self, path: Path):
        import imageio_ffmpeg

        self.p = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo",
                                   "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an",
                                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "25", "-preset", "slow",
                                   "-movflags", "+faststart", str(path)], stdin=subprocess.PIPE)

    def add(self, rgb: np.ndarray):
        self.p.stdin.write(np.ascontiguousarray(rgb, dtype=np.uint8).tobytes())

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def text(img: np.ndarray, items):
    """items: (xy, string, font, rgb, alpha)."""
    pil = Image.fromarray(img)
    layer = Image.new("RGBA", pil.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for xy, s, f, rgb, a in items:
        if a > 0:
            d.text(xy, s, font=f, fill=(*rgb, int(255 * clamp(a))))
    return np.asarray(Image.alpha_composite(pil.convert("RGBA"), layer).convert("RGB"))


def cover(img: np.ndarray, zoom: float, focus=(0.55, 0.58)) -> tuple[np.ndarray, callable]:
    """Crop-scale `img` to W x H at `zoom` around `focus`; returns the frame and an image->frame mapper."""
    h, w = img.shape[:2]
    s = max(W / w, H / h) * zoom
    cx, cy = focus[0] * w, focus[1] * h
    x0 = min(max(cx - W / (2 * s), 0), w - W / s)
    y0 = min(max(cy - H / (2 * s), 0), h - H / s)
    M = np.array([[s, 0, -x0 * s], [0, s, -y0 * s]], np.float32)
    frame = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
    return frame, lambda p: (p - np.array([x0, y0])) * s


def hero_assets():
    rgb = load_image((ROOT / "web" / "public" / "images" / "hero.jpg").read_bytes()).rgb
    fr = make_frame("hero", "front_left_45", rgb)
    kp, sc = fr.feats.keypoints, fr.feats.scores
    keep = np.argsort(-sc)[:420]
    kp = kp[keep]
    cell = max(rgb.shape[:2]) * CELL_FRACTION
    ids, counts = np.unique(np.floor(kp / cell).astype(int), axis=0, return_counts=True)
    cells = [tuple(c) for c, n in zip(ids, counts) if n >= 6]
    box = locate(rgb).raw_box
    return rgb, kp, cells, cell, box


def draw_hero(rgb, kp, cells, cell, box, t, total, film=False):
    zoom = 1.0 + 0.045 * (0.5 - 0.5 * np.cos(2 * np.pi * t / total))  # seamless push-in and back
    frame, to_frame = cover(rgb, zoom)
    frame = frame.astype(np.float32)
    y0, y1 = box[1], box[3]
    scan = y0 + (y1 - y0) * ease((t - 0.6) / 2.6)  # scan pass over the car, in image coordinates
    fade_out = 1.0 - clamp((t - (total - 1.2)) / 1.0)
    over = frame.copy()
    if 0.6 < t < 3.4:
        ys = to_frame(np.array([[0, scan]]))[0][1]
        xa, xb = to_frame(np.array([[box[0], 0], [box[2], 0]]))[:, 0]
        cv2.line(over, (int(xa) - 40, int(ys)), (int(xb) + 40, int(ys)), ORANGE, 2, cv2.LINE_AA)
    pts = to_frame(kp)
    for (px, py), (_, iy) in zip(pts, kp):
        if iy <= scan:
            a = clamp((scan - iy) / 60.0) * fade_out
            c = tuple(int(v) for v in np.array(ORANGE) * a + frame[int(min(max(py, 0), H - 1)), int(min(max(px, 0), W - 1))] * (1 - a))
            cv2.circle(over, (int(px), int(py)), 3, c, -1, cv2.LINE_AA)
    a_cells = ease((t - 3.4) / 1.2) * fade_out
    if a_cells > 0:
        grid = over.copy()
        for cx, cy in cells:
            p0 = to_frame(np.array([[cx * cell, cy * cell]]))[0]
            p1 = to_frame(np.array([[(cx + 1) * cell, (cy + 1) * cell]]))[0]
            cv2.rectangle(grid, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), PAPER, 1, cv2.LINE_AA)
        over = over * (1 - 0.55 * a_cells) + grid * 0.55 * a_cells
    out = np.clip(over, 0, 255).astype(np.uint8)
    if film:
        out = text(out, [((48, H - 64), f"KEYPOINTS {len(kp)} ON THE CAR SILHOUETTE · ALIKED", F_LABEL, PAPER, ease((t - 1.0) / 0.6)),
                         ((48, H - 40), "BACKGROUND NEVER VOTES", F_LABEL, ORANGE, ease((t - 2.4) / 0.6))])
    return out


def pair_assets():
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
            score = len({c for e in ev if e.log10_nfa_distinct < -3 for c in e.cells})
            if best is None or score > best[0]:
                best = (score, frames[a], frames[b], ev)
    return best


def draw_pair(best, t):
    score, ref, cur, ev = best
    frame = np.full((H, W, 3), INK, np.float32)
    gap, top, hh = 24, 90, 560
    sa, sb = hh / ref.rgb.shape[0], hh / cur.rgb.shape[0]
    A = cv2.resize(ref.rgb, (round(ref.rgb.shape[1] * sa), hh), interpolation=cv2.INTER_AREA)
    B = cv2.resize(cur.rgb, (round(cur.rgb.shape[1] * sb), hh), interpolation=cv2.INTER_AREA)
    total_w = A.shape[1] + gap + B.shape[1]
    s = min(1.0, (W - 96) / total_w)
    A = cv2.resize(A, (round(A.shape[1] * s), round(hh * s)))
    B = cv2.resize(B, (round(B.shape[1] * s), round(hh * s)))
    sa, sb = sa * s, sb * s
    left = (W - (A.shape[1] + gap + B.shape[1])) // 2
    xa, xb = left, left + A.shape[1] + gap
    appear = ease(t / 0.8)
    frame[top:top + A.shape[0], xa:xa + A.shape[1]] = A * 0.82 * appear + frame[top:top + A.shape[0], xa:xa + A.shape[1]] * (1 - appear)
    frame[top:top + B.shape[0], xb:xb + B.shape[1]] = B * 0.82 * appear + frame[top:top + B.shape[0], xb:xb + B.shape[1]] * (1 - appear)
    lines = []
    for e in ev:
        for p, q, w in zip(e.ref_pts, e.cur_pts, e.weights):
            lines.append((float(w), (xa + p[0] * sa, top + p[1] * sa), (xb + q[0] * sb, top + q[1] * sb)))
    lines.sort(key=lambda r: r[0])
    n = max(len(lines), 1)
    dim = frame.copy()
    for i, (w, p, q) in enumerate(lines):
        k = ease((t - 1.0 - 3.6 * i / n) / 0.5)
        if k <= 0:
            continue
        end = (p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k)
        if w >= 0.7:
            cv2.line(frame, tuple(map(int, p)), tuple(map(int, end)), ORANGE, 2, cv2.LINE_AA)
            cv2.circle(frame, tuple(map(int, p)), 4, ORANGE, -1, cv2.LINE_AA)
            if k >= 1:
                cv2.circle(frame, tuple(map(int, q)), 4, ORANGE, -1, cv2.LINE_AA)
        else:
            cv2.line(dim, tuple(map(int, p)), tuple(map(int, end)), DIM, 1, cv2.LINE_AA)
    frame = frame * 0.6 + dim * 0.4
    a_cells = ease((t - 5.0) / 0.8)
    if a_cells > 0:
        cell = max(ref.rgb.shape[:2]) * CELL_FRACTION
        votes = {}
        for e in ev:
            if e.log10_nfa_distinct < -3:
                for c, v in e.votes.items():
                    votes[c] = votes.get(c, 0.0) + v
        grid = frame.copy()
        for (cx, cy), v in votes.items():
            if v >= CELL_MIN_WEIGHT:
                p0 = (int(xa + cx * cell * sa), int(top + cy * cell * sa))
                p1 = (int(xa + (cx + 1) * cell * sa), int(top + (cy + 1) * cell * sa))
                cv2.rectangle(grid, p0, p1, ORANGE, 2, cv2.LINE_AA)
        frame = frame * (1 - a_cells) + grid * a_cells
    out = np.clip(frame, 0, 255).astype(np.uint8)
    marks = sum(1 for w, _, _ in lines if w >= 0.7)
    out = text(out, [((48, 40), "SAME CAR, TWO SHOOTS · INLIERS THE DECISION USED", F_LABEL, DIM, appear),
                     ((48, H - 150), f"{len(lines) - marks} SHARED WITH THE MODEL (GREY)   {marks} INDIVIDUAL MARKS (ORANGE)", F_LABEL, PAPER, ease((t - 3.0) / 0.6)),
                     ((48, H - 112), f"SAME   {score} CELLS / 6 NEEDED", F_BIG, BLUE, ease((t - 6.0) / 0.6)),
                     ((48, H - 46), "PHOTOS: DAMIAN B OH, CC BY-SA 4.0", F_LABEL, (110, 112, 118), appear)])
    return out


def cost_assets():
    r = estimate([("front_bumper", DamageInput("crack", "front_bumper", 0.9, 120, 0.08, 0.03, False, "d1")),
                  (group_key("front_door", "front_left_45"), DamageInput("scratch", "front_door", 0.85, 280, 0.08, 0.06, False, "d2")),
                  (group_key("fender", "front_left_45"), DamageInput("dent", "fender", 0.7, 60, 0.1, 0.02, False, "d3"))],
                 model="cobalt", return_samples=True)
    return r


def draw_cost(r, t):
    frame = np.full((H, W, 3), INK, np.uint8)
    samples = np.asarray(r["total_samples"]) / 1e6
    top = float(np.percentile(samples, 99.5)) * 1.08
    bins = np.linspace(0, top, 49)
    hist, _ = np.histogram(samples, bins=bins)
    x0, x1, base, hmax = 120, W - 120, H - 190, 470
    bw = (x1 - x0) / len(hist)
    for i, n in enumerate(hist):
        k = ease((t - 0.3 - 1.6 * i / len(hist)) / 0.5)
        h = hmax * n / hist.max() * k
        if h > 0:
            cv2.rectangle(frame, (int(x0 + i * bw + 2), int(base - h)), (int(x0 + (i + 1) * bw - 2), base), (58, 61, 66), -1)
    cv2.line(frame, (x0, base), (x1, base), DIM, 1, cv2.LINE_AA)
    items = [((x0, 60), "REPAIR ESTIMATE · 4,000 MONTE CARLO SCENARIOS · CHEVROLET COBALT", F_LABEL, DIM, ease(t / 0.5)),
             ((x0, 88), "EXAMPLE: BUMPER CRACK 12 CM · DOOR SCRATCH 28 CM · WING DENT 6 CM", F_LABEL, (140, 143, 150), ease(t / 0.5))]
    for j, (key, label) in enumerate((("p10", "P10"), ("p50", "P50"), ("p90", "P90"))):
        a = ease((t - 2.2 - 0.25 * j) / 0.5)
        if a <= 0:
            continue
        v = r[key] / 1e6
        x = int(x0 + (x1 - x0) * v / top)
        col = ORANGE if key == "p50" else PAPER
        cv2.line(frame, (x, base - hmax - 20), (x, base), tuple(int(c * a) for c in col), 3 if key == "p50" else 1, cv2.LINE_AA)
        items.append(((x - 30, base - hmax - 60), f"{label} {v:.2f}M", F_MID, col, a))
    items.append(((x0, H - 120), f"UZS {r['p10'] / 1e6:.2f}M – {r['p90'] / 1e6:.2f}M · MEDIAN {r['p50'] / 1e6:.2f}M · A RANGE, NOT A QUOTE", F_MID, PAPER, ease((t - 3.2) / 0.6)))
    return text(frame, items)


def draw_chain(t):
    frame = np.full((H, W, 3), INK, np.uint8)
    names = ["CHECK-IN 12.09", "CHECK-OUT 10.10", "SERVICE 03.11"]
    prev = "0" * 64
    items = [((120, 60), "VEHICLE PASSPORT · HASH-CHAINED, ED25519-SIGNED", F_LABEL, DIM, ease(t / 0.5))]
    bw, bh, gap, y = 380, 210, 70, 300
    x = (W - (3 * bw + 2 * gap)) // 2
    for i, name in enumerate(names):
        a = ease((t - 0.3 - 0.6 * i) / 0.5)
        if a <= 0:
            continue
        h = hashlib.sha256((prev + name).encode()).hexdigest()
        bx = x + i * (bw + gap)
        col = tuple(int(c * a) for c in PAPER)
        cv2.rectangle(frame, (bx, y), (bx + bw, y + bh), col, 1, cv2.LINE_AA)
        if i:
            cv2.line(frame, (bx - gap, y + bh // 2), (bx, y + bh // 2), tuple(int(c * a) for c in ORANGE), 2, cv2.LINE_AA)
        items += [((bx + 22, y + 22), name, F_MID, PAPER, a), ((bx + 22, y + 70), f"prev  {prev[:16]}…", F_LABEL, DIM, a),
                  ((bx + 22, y + 100), f"hash  {h[:16]}…", F_LABEL, DIM, a), ((bx + 22, y + 150), "ED25519 SIGNED", F_LABEL, ORANGE, a)]
        prev = h
    items.append(((120, H - 120), "EDIT ANY RECORD AND EVERY LATER HASH BREAKS", F_MID, PAPER, ease((t - 2.6) / 0.6)))
    return text(frame, items)


def fade(img, a):
    return (img.astype(np.float32) * clamp(a)).astype(np.uint8)


def main(out_dir: str):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rgb, kp, cells, cell, box = hero_assets()
    total = 8.0
    w = Writer(out / "hero.mp4")
    for i in range(int(total * FPS)):
        f = draw_hero(rgb, kp, cells, cell, box, i / FPS, total)
        w.add(f)
        if i == int(4.6 * FPS):
            cv2.imwrite(str(out / "hero_poster.jpg"), cv2.cvtColor(f, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
    w.close()

    best = pair_assets()
    cost = cost_assets()
    w = Writer(out / "film.mp4")
    scenes = [(6.0, lambda t: draw_hero(rgb, kp, cells, cell, box, t, 6.0, film=True)),
              (8.0, lambda t: draw_pair(best, t)), (6.0, lambda t: draw_cost(cost, t)), (4.5, draw_chain)]
    poster_done = False
    for dur, fn in scenes:
        for i in range(int(dur * FPS)):
            t = i / FPS
            f = fn(t)
            f = fade(f, min(ease(t / 0.4), ease((dur - t) / 0.4)))
            w.add(f)
            if not poster_done and fn is scenes[1][1] and t > 6.5:
                cv2.imwrite(str(out / "film_poster.jpg"), cv2.cvtColor(f, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
                poster_done = True
    w.close()
    print(json.dumps({"keypoints": int(len(kp)), "cells": len(cells), "pair_cells": best[0],
                      "files": sorted(p.name for p in out.iterdir())}))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out/film")
