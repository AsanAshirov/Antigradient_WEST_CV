"""Public identity dev set: Commons walk-around series (weak genuine) + held-out same-model cars (hard impostors).

The first 8 images per model in data/cohort are the distinctiveness bank used at inference; impostors are taken
only from the remaining images so the bank never contains a car under test.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "test" / "dev"
BANK = 8


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    series = ROOT / "data" / "test" / "commons_series" / "manifest.json"
    if series.exists():
        for it in json.loads(series.read_text()):
            items.append({**it, "path": f"../commons_series/{it['path']}"})
    meta = {m["file"]: m for m in json.loads((ROOT / "data" / "cohort" / "MANIFEST.json").read_text(encoding="utf-8"))}
    for model_dir in sorted((ROOT / "data" / "cohort").iterdir()):
        if not model_dir.is_dir():
            continue
        for p in sorted(model_dir.glob("*.jpg"))[BANK:]:
            author = re.sub(r"<[^>]+>", "", meta.get(f"{model_dir.name}/{p.name}", {}).get("artist", "")).strip()
            items.append({"path": f"../../cohort/{model_dir.name}/{p.name}", "car_id": f"{model_dir.name}_{p.stem}",
                          "session": "s0", "model": model_dir.name, "slot": "extra", "author": author,
                          "kind": "commons_holdout_impostor"})
    (OUT / "manifest.json").write_text(json.dumps(items, indent=1), encoding="utf-8")
    print(len(items), "images,", len({i["car_id"] for i in items}), "cars")


if __name__ == "__main__":
    main()
