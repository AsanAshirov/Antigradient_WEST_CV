"""Top up a model's cohort bank from Commons (incl. subcategories), excluding every file and every uploader
used by the identity test set, so no test car can enter the distinctiveness bank."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mine_commons_pairs import CATEGORIES, FREE, download, files_with_meta, subcategories  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
COHORT = ROOT / "data" / "cohort"


def main(model: str, target: int = 20):
    manifest_path = COHORT / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    test = json.loads((ROOT / "data" / "test" / "commons_mined" / "candidates.json").read_text(encoding="utf-8"))
    banned_titles = {c["title"] for c in test} | {m["title"] for m in manifest}
    banned_users = {c["user"] for c in test}
    folder = COHORT / model
    folder.mkdir(parents=True, exist_ok=True)
    have = len(list(folder.glob("*.jpg")))
    cats = []
    for c in CATEGORIES[model]:
        cats += [x for x in subcategories(c) if x not in cats]
    pool = []
    for c in cats:
        pool += [f for f in files_with_meta(c) if f["title"].lower().endswith((".jpg", ".jpeg"))
                 and f["license"].lower().startswith(FREE) and f["title"] not in banned_titles
                 and f["user"] not in banned_users]
        if len(pool) > 3 * target:
            break
    seen_users = {}
    for f in pool:  # at most 2 files per uploader to spread over many physical cars
        if have >= target or seen_users.get(f["user"], 0) >= 2:
            continue
        name = f"{model}_{have:03d}.jpg"
        if download(f["url"], folder / name):
            manifest.append({"title": f["title"], "url": f["url"], "page": f["page"], "license": f["license"],
                             "license_url": "", "artist": f["artist"], "model": model, "file": f"{model}/{name}",
                             "user": f["user"]})
            seen_users[f["user"]] = seen_users.get(f["user"], 0) + 1
            have += 1
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
            time.sleep(0.4)
    print(model, have, "images in bank folder")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 20)
