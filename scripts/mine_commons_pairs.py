"""Mine candidate same-car photo groups from Wikimedia Commons for the genuine (same physical car) test set.

Candidates = files of one model uploaded by one user. They are only CANDIDATES: every group is then verified by
eye on a contact sheet (scripts/contact_sheet.py) and the verified labels are written to verified_pairs.json.
Files already used in the cohort bank are excluded so the bank never contains a test car.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "test" / "commons_mined"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "CarPrint-hackathon/0.1 (research; identity test set)"}
FREE = ("cc0", "public domain", "pd", "cc by", "cc-by")
CATEGORIES = {
    "matiz": ["Daewoo_Matiz", "Daewoo_Matiz_Groove", "Chevrolet_Matiz"],
    "spark": ["Chevrolet_Spark_(M300)", "Daewoo_Matiz_Creative"],
    "nexia": ["Daewoo_Nexia", "Chevrolet_Nexia"],
    "cobalt": ["Chevrolet_Cobalt_(Gamma_II)", "Ravon_R4"],
    "lacetti": ["Chevrolet_Lacetti", "Daewoo_Gentra", "Daewoo_Lacetti"],
    "damas": ["Chevrolet_Damas", "Daewoo_Damas"],
    "song_plus": ["BYD_Song_Plus"],
    "camry": ["Toyota_Camry_(XV70)"],
}


def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 + 5 * attempt)
    return {}


def download(url, path):
    for attempt in range(6):
        try:
            path.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
            return True
        except Exception:
            time.sleep(3 + 5 * attempt)
    return False


def files_with_meta(category):
    out, cont = [], {}
    while True:
        data = get({"action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
                    "gcmtype": "file", "gcmlimit": 100, "prop": "imageinfo",
                    "iiprop": "url|user|timestamp|extmetadata", "iiurlwidth": 1280, **cont})
        for p in data.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            out.append({"title": p.get("title", ""), "user": ii.get("user", ""), "url": ii.get("thumburl") or ii.get("url"),
                        "page": ii.get("descriptionurl"), "license": em.get("LicenseShortName", {}).get("value", ""),
                        "artist": re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip(),
                        "taken": em.get("DateTimeOriginal", {}).get("value", "")[:19],
                        "uploaded": ii.get("timestamp", "")})
        if "continue" not in data or len(out) > 600:
            return out
        cont = {k: v for k, v in data["continue"].items() if k != "continue"}


def subcategories(category, depth=2):
    found, frontier = [category], [category]
    for _ in range(depth):
        nxt = []
        for c in frontier:
            data = get({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{c}", "cmtype": "subcat",
                        "cmlimit": 100})
            for m in data.get("query", {}).get("categorymembers", []):
                name = m["title"].split(":", 1)[1].replace(" ", "_")
                if name not in found:
                    found.append(name)
                    nxt.append(name)
        frontier = nxt
    return found[:25]


def main(max_groups_per_model=6, max_files_per_group=8):
    bank = {m["title"] for m in json.loads((ROOT / "data" / "cohort" / "MANIFEST.json").read_text(encoding="utf-8"))}
    OUT.mkdir(parents=True, exist_ok=True)
    candidates = []
    for model, cats in CATEGORIES.items():
        files = {}
        expanded = []
        for c in cats:
            expanded += [x for x in subcategories(c) if x not in expanded]
        for c in expanded:
            for f in files_with_meta(c):
                if f["title"].lower().endswith((".jpg", ".jpeg", ".png")) and f["license"].lower().startswith(FREE) \
                        and f["title"] not in bank:
                    files[f["title"]] = f
        groups = defaultdict(list)
        for f in files.values():
            groups[f["user"]].append(f)
        ranked = sorted((g for g in groups.values() if len(g) >= 2), key=len, reverse=True)[:max_groups_per_model]
        for gi, g in enumerate(ranked):
            g = sorted(g, key=lambda f: (f["taken"] or f["uploaded"], f["title"]))[:max_files_per_group]
            gdir = OUT / model / f"g{gi}"
            gdir.mkdir(parents=True, exist_ok=True)
            for fi, f in enumerate(g):
                path = gdir / f"{fi:02d}.jpg"
                if path.exists() or download(f["url"], path):
                    candidates.append({**f, "model": model, "group": f"{model}/g{gi}", "file": f"{model}/g{gi}/{fi:02d}.jpg"})
                time.sleep(0.4)
            (OUT / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=1), encoding="utf-8")
        print(model, len(files), "files,", len(ranked), "groups", flush=True)


if __name__ == "__main__":
    main()
