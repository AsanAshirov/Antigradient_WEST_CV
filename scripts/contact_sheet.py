"""Contact sheets of candidate groups for manual same-car verification (index printed on every tile)."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data" / "test" / "commons_mined"
TILE_W, COLS = 360, 4


def sheet(files: list[Path], title: str) -> np.ndarray:
    tiles = []
    for i, f in enumerate(files):
        img = cv2.imread(str(f))
        if img is None:
            continue
        h = round(img.shape[0] * TILE_W / img.shape[1])
        img = cv2.resize(img, (TILE_W, h))
        img = cv2.copyMakeBorder(img, 0, max(0, 270 - h), 0, 0, cv2.BORDER_CONSTANT, value=(40, 40, 40))[:270]
        cv2.rectangle(img, (0, 0), (46, 34), (0, 0, 0), -1)
        cv2.putText(img, str(i), (6, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        tiles.append(img)
    while len(tiles) % COLS:
        tiles.append(np.full((270, TILE_W, 3), 40, np.uint8))
    rows = [np.concatenate(tiles[i:i + COLS], axis=1) for i in range(0, len(tiles), COLS)]
    grid = np.concatenate(rows, axis=0)
    head = np.full((40, grid.shape[1], 3), 255, np.uint8)
    cv2.putText(head, title, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    return np.concatenate([head, grid], axis=0)


def main(models: list[str]):
    out = BASE / "sheets"
    out.mkdir(exist_ok=True)
    cands = json.loads((BASE / "candidates.json").read_text(encoding="utf-8"))
    groups = {}
    for c in cands:
        groups.setdefault(c["group"], []).append(c)
    for g, items in groups.items():
        if models and g.split("/")[0] not in models:
            continue
        files = [BASE / it["file"] for it in items]
        dates = sorted({(it["taken"] or it["uploaded"])[:10] for it in items})
        img = sheet(files, f"{g}  user={items[0]['user'][:24]}  dates={','.join(dates)[:60]}")
        cv2.imwrite(str(out / f"{g.replace('/', '_')}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        print(g, len(files), dates)


if __name__ == "__main__":
    main(sys.argv[1:])
