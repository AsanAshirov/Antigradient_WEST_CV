"""Deploy the Gradio demo + API Space (space/app.py): stage the code, the damage model, the cohort and the examples,
scan for secrets, upload, set the hardware.

Usage: python scripts/deploy_demo.py [--space Azamaka/carprint-demo] [--hardware cpu-basic|zero-a10g] [--no-hardware]
Needs `hf auth login`. Rollback: revert the last commit of the Space repository, or --hardware cpu-basic.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from deploy_space import SECRET  # noqa: E402

SPACE_FILES = ["app.py", "README.md", "requirements.txt", "packages.txt", "INTEGRATION.md"]
CODE = ["carprint", "api", "eval/evaluate_identity.py", "data/cohort", "models/damage"]
EXAMPLES = {"examples/damage": ROOT / "web/public/examples/damage",
            "examples/same_car/visit_1.jpg": ROOT / "web/public/evidence/ref.jpg",
            "examples/same_car/visit_2.jpg": ROOT / "web/public/evidence/cur.jpg"}


def stage(dst: Path):
    for name in SPACE_FILES:
        if (ROOT / "space" / name).exists():
            shutil.copy2(ROOT / "space" / name, dst / name)
    for rel in CODE:
        src, out = ROOT / rel, dst / rel
        if not src.exists():
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, out, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "metrics.csv"))
        else:
            shutil.copy2(src, out)
    for rel, src in EXAMPLES.items():
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, out)
        else:
            shutil.copy2(src, out)
    leaks = [p for p in dst.rglob("*") if p.is_file() and p.stat().st_size < 5_000_000 and SECRET.search(p.read_bytes())]
    if leaks:
        raise SystemExit(f"refusing to deploy, secret-like content in: {leaks}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", default="Azamaka/carprint-demo")
    ap.add_argument("--hardware", default="cpu-basic")
    ap.add_argument("--no-hardware", action="store_true")
    a = ap.parse_args()
    api = HfApi()
    api.create_repo(a.space, repo_type="space", space_sdk="gradio", exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        stage(Path(tmp))
        api.upload_folder(repo_id=a.space, repo_type="space", folder_path=tmp, commit_message="deploy CarPrint demo")
    if not a.no_hardware:
        api.request_space_hardware(a.space, a.hardware)
    rt = api.get_space_runtime(a.space)
    print(f"https://huggingface.co/spaces/{a.space} · {rt.stage} · requested {rt.requested_hardware}")


if __name__ == "__main__":
    main()
