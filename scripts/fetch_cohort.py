"""Download same-model hard negatives (distinct physical cars) from Wikimedia Commons with licence metadata.

Only free licences (CC0 / PD / CC BY / CC BY-SA) are kept; attribution is written to data/cohort/MANIFEST.json.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "cohort"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "CarPrint-hackathon/0.1 (research; contact: team)"}
CATEGORIES = {
    "cobalt": ["Chevrolet_Cobalt_(Gamma_II)", "Ravon_R4"],
    "nexia": ["Daewoo_Nexia", "Chevrolet_Nexia"],
    "spark": ["Chevrolet_Spark_(M300)"],
    "lacetti": ["Chevrolet_Lacetti", "Daewoo_Gentra"],
    "damas": ["Chevrolet_Damas"],
    "matiz": ["Daewoo_Matiz"],
    "song_plus": ["BYD_Song_Plus"],
    "camry": ["Toyota_Camry_(XV70)"],
}
FREE = ("cc0", "public domain", "pd", "cc by", "cc-by")


def get(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 + 5 * attempt)
    return {}


def download(url: str) -> bytes | None:
    for attempt in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception:
            time.sleep(3 + 5 * attempt)
    return None


def files_in(category: str, limit: int) -> list[str]:
    data = get({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{category}", "cmtype": "file",
                "cmlimit": min(limit * 2, 500)})
    return [m["title"] for m in data.get("query", {}).get("categorymembers", [])
            if m["title"].lower().endswith((".jpg", ".jpeg", ".png"))]


def info(titles: list[str]) -> list[dict]:
    data = get({"action": "query", "titles": "|".join(titles), "prop": "imageinfo",
                "iiprop": "url|extmetadata", "iiurlwidth": 1280})
    out = []
    for p in data.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        out.append({"title": p.get("title"), "url": ii.get("thumburl") or ii.get("url"),
                    "page": ii.get("descriptionurl"), "license": lic,
                    "license_url": meta.get("LicenseUrl", {}).get("value", ""),
                    "artist": meta.get("Artist", {}).get("value", "")})
    return out


def main(per_model: int = 25):
    manifest = []
    for model, cats in CATEGORIES.items():
        titles = []
        for c in cats:
            try:
                titles += files_in(c, per_model)
            except Exception as e:
                print("category failed", c, e)
        titles = titles[: per_model * 2]
        (OUT / model).mkdir(parents=True, exist_ok=True)
        saved = 0
        for i in range(0, len(titles), 20):
            for rec in info(titles[i:i + 20]):
                if saved >= per_model or not rec["url"] or not rec["license"].lower().startswith(FREE):
                    continue
                name = f"{model}_{saved:03d}.jpg"
                blob = download(rec["url"])
                if blob is None:
                    print("download failed", rec["title"])
                    continue
                (OUT / model / name).write_bytes(blob)
                manifest.append({**rec, "model": model, "file": f"{model}/{name}"})
                (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
                saved += 1
                time.sleep(0.5)
        print(model, saved, flush=True)
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 25)
