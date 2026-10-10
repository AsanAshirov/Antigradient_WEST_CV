"""Frozen identity TEST set from visually verified Commons groups (data/test/commons_mined/verified.json).

Protocol: labels are written by eye before any evaluation on these images; this script writes the manifest and its
SHA-256 to eval/test_manifest.sha256, which is committed BEFORE the first evaluation run. Thresholds are tuned only
on the dev set (cohort hold-out), never on this set.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "test" / "commons_mined"
OUT = ROOT / "data" / "test" / "commons_mined" / "manifest.json"


def main():
    labels = json.loads((SRC / "verified.json").read_text(encoding="utf-8"))
    meta = {c["file"]: c for c in json.loads((SRC / "candidates.json").read_text(encoding="utf-8"))}
    items = []
    for lab in labels:
        m = meta.get(lab["file"], {})
        items.append({"path": lab["file"], "car_id": lab["car_id"], "session": lab["session"], "model": lab["model"],
                      "slot": "extra", "author": m.get("user", ""), "kind": "commons_verified",
                      "distinct_group": lab.get("distinct_group"), "note": lab.get("note", ""),
                      "title": m.get("title", ""), "license": m.get("license", ""), "page": m.get("page", "")})
    blob = json.dumps(items, indent=1, ensure_ascii=False).encode("utf-8")
    OUT.write_bytes(blob)
    digest = hashlib.sha256(blob).hexdigest()
    (ROOT / "eval" / "test_manifest.sha256").write_text(f"{digest}  data/test/commons_mined/manifest.json\n")
    cars = {i["car_id"] for i in items}
    genuine = {i["car_id"] for i in items if i["session"] == "s1"}
    print(f"{len(items)} images, {len(cars)} cars ({len(genuine)} with two sessions), sha256 {digest[:16]}")


if __name__ == "__main__":
    main()
