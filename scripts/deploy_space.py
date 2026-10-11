"""Deploy to the Hugging Face Space: stage exactly what the Docker image needs, scan for secrets, upload, request a T4.

Usage: python scripts/deploy_space.py [--space Azamaka/carprint] [--hardware t4-small] [--no-hardware]
Needs `hf auth login`. Rollback: revert the last commit of the Space repository.
"""
from __future__ import annotations

import argparse
import re
import shutil
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
INCLUDE = ["Dockerfile", "requirements.txt", "carprint", "api", "eval/evaluate_identity.py", "data/cohort", "models",
           "web_legacy/src", "web_legacy/public", "web_legacy/index.html", "web_legacy/package.json", "web_legacy/package-lock.json", "web_legacy/tsconfig.json",
           "web_legacy/vite.config.ts"]
SECRET = re.compile(rb"hf_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\"key\"\s*:\s*\"[0-9a-f]{32}\"")
SPACE_README = """---
title: CarPrint
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: true
short_description: Evidence-grade vehicle check-in from phone photos
---

# CarPrint — evidence-grade vehicle check-in

Same car? What changed since the last visit? What will the repair cost? CarPrint answers from phone photos, with
evidence anyone can verify. Team Antigradient · WEST Hackathon 2026 · Computer Vision track.
Code, data sources and licences: https://github.com/AsanAshirov/Antigradient_WEST_CV
"""


def stage(dst: Path):
    for rel in INCLUDE:
        src = ROOT / rel
        if not src.exists():
            continue
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, out, ignore=shutil.ignore_patterns("__pycache__", "node_modules", "dist", "*.pyc"))
        else:
            shutil.copy2(src, out)
    (dst / "models").mkdir(exist_ok=True)
    (dst / "models" / "README.txt").write_text("Trained part/damage weights: model_info.json + checkpoint per task.\n")
    (dst / "README.md").write_text(SPACE_README, encoding="utf-8")
    (dst / ".dockerignore").write_text("**/node_modules\n**/dist\n**/__pycache__\n")
    leaks = [p for p in dst.rglob("*") if p.is_file() and p.stat().st_size < 5_000_000 and SECRET.search(p.read_bytes())]
    if leaks:
        raise SystemExit(f"refusing to deploy, secret-like content in: {leaks}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", default="Azamaka/carprint")
    ap.add_argument("--hardware", default="t4-small")
    ap.add_argument("--no-hardware", action="store_true")
    a = ap.parse_args()
    api = HfApi()
    api.create_repo(a.space, repo_type="space", space_sdk="docker", exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        stage(Path(tmp))
        api.upload_folder(repo_id=a.space, repo_type="space", folder_path=tmp, commit_message="deploy CarPrint",
                          delete_patterns=["web_legacy/src/**", "web_legacy/public/**"])
    if not a.no_hardware:
        api.request_space_hardware(a.space, a.hardware)
    rt = api.get_space_runtime(a.space)
    print(f"https://huggingface.co/spaces/{a.space} · {rt.stage} · requested {rt.requested_hardware}")


if __name__ == "__main__":
    main()
