"""Build a public identity dev set from Wikimedia Commons walk-around series.

A "series" is a group of files whose titles differ only by a trailing "(n)" number, uploaded by the
same author on the same day — the same physical car. Each series is split into two pseudo-sessions
(odd / even shots). These are weak positives (same light, minutes apart) and are labelled as such.
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
OUT = ROOT / "data" / "test" / "commons_series"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "CarPrint-hackathon/0.1 (research)"}
CATS = {"matiz": ["Daewoo_Matiz", "Daewoo_Matiz_Groove"], "lacetti": ["Daewoo_Gentra", "Chevrolet_Lacetti"],
        "spark": ["Chevrolet_Spark_(M300)"], "nexia": ["Daewoo_Nexia", "Chevrolet_Nexia"],
        "cobalt": ["Chevrolet_Cobalt_(Gamma_II)", "Ravon_R4"]}
FREE = ("cc0", "public domain", "pd", "cc by", "cc-by")
STEM = re.compile(r"^File:(.*?)\s*\((\d+)\)\.(jpe?g|png)$", re.I)


def get(params):
    for attempt in range(5):
        try:
            url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 + 3 * attempt)
    return {}


def fetch(url, path):
    for attempt in range(5):
        try:
            path.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
            return True
        except Exception:
            time.sleep(3 + 5 * attempt)
    return False


def main(max_series_per_model=6, max_per_series=6):
    manifest, attribution = [], []
    for model, cats in CATS.items():
        groups = defaultdict(list)
        for c in cats:
            data = get({"action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{c}", "gcmtype": "file",
                        "gcmlimit": 500, "prop": "imageinfo", "iiprop": "url|user|timestamp|extmetadata", "iiurlwidth": 1280})
            for p in data.get("query", {}).get("pages", {}).values():
                m = STEM.match(p.get("title", ""))
                ii = (p.get("imageinfo") or [{}])[0]
                lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
                if m and lic.lower().startswith(FREE):
                    groups[(m.group(1), ii.get("user"))].append((int(m.group(2)), p["title"], ii, lic))
        series = sorted((g for g in groups.values() if len(g) >= 4), key=len, reverse=True)[:max_series_per_model]
        for si, g in enumerate(series):
            car_id = f"{model}_s{si}"
            (OUT / car_id).mkdir(parents=True, exist_ok=True)
            for k, (n, title, ii, lic) in enumerate(sorted(g)[:max_per_series]):
                path = OUT / car_id / f"{n:03d}.jpg"
                if not path.exists() and not fetch(ii.get("thumburl") or ii["url"], path):
                    continue
                manifest.append({"path": f"{car_id}/{path.name}", "car_id": car_id, "session": f"s{k % 2}",
                                 "model": model, "slot": "extra", "kind": "commons_series_weak_positive"})
                attribution.append({"file": f"{car_id}/{path.name}", "title": title, "page": ii.get("descriptionurl"),
                                    "author": ii.get("user"), "license": lic})
                time.sleep(0.5)
        print(model, len(series), "series", flush=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    (OUT / "ATTRIBUTION.json").write_text(json.dumps(attribution, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
