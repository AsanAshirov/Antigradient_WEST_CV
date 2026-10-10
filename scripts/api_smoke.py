"""End-to-end API smoke test against a running server: inspections -> frames -> analyze -> verify -> confirm."""
import json
import sys
from pathlib import Path

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api/v1"
imgs = sorted(Path(sys.argv[2] if len(sys.argv) > 2 else "data/raw/coco_car_damage/img").glob("*.jpg"))


def inspection(paths, kind):
    r = requests.post(f"{BASE}/inspections", json={"role": "dealer", "type": kind, "vehicle_hint": {"model": "cobalt"}})
    r.raise_for_status()
    ins = r.json()
    for p in paths:
        fr = requests.post(f"{BASE}/inspections/{ins['inspection_id']}/frames",
                           files={"file": (p.name, p.read_bytes(), "image/jpeg")},
                           data={"slot": "extra", "nonce": ins["nonce"], "capture_mode": "camera"})
        fr.raise_for_status()
        print(" frame", p.name, fr.json()["quality"]["issues"], fr.json()["integrity_flags"])
    return ins


print(requests.get(f"{BASE}/health").json())
a = inspection(imgs[1:3], "checkin")
b = inspection(imgs[1:2] + imgs[5:6], "checkout")
an = requests.post(f"{BASE}/inspections/{a['inspection_id']}/analyze").json()
print("analyze", an["status"], an["latency_ms"], "ms")
v = requests.post(f"{BASE}/verifications", json={"reference_inspection_id": a["inspection_id"],
                                                  "current_inspection_id": b["inspection_id"]}).json()
print("verify", v["decision"], v["score_raw"], v["reasons_ru"], v["latency_ms"], "ms", "evidence:", len(v["evidence"]))
c = requests.post(f"{BASE}/inspections/{a['inspection_id']}/confirm", json={"operator_id": "op_1", "customer_signed": True}).json()
print("confirm", c["record_hash"][:16])
t = requests.get(f"{BASE}/vehicles/{a['vehicle_key']}/timeline").json()
print("timeline", len(t["records"]), "chain_valid", t["chain_valid"])
if v["evidence"]:
    r = requests.get(BASE.replace("/api/v1", "") + v["evidence"][0]["match_viz_url"])
    print("artifact", r.status_code, len(r.content), "bytes")
print(json.dumps(v["evidence"][:1], ensure_ascii=False)[:400])
