"""Fetch trained segmentation weights from the Kaggle training kernels into models/<task>/ (best checkpoint only)."""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OWNER = "asanashirov"
PATTERN = r"(model_info\.json|checkpoint_best_total\.pth|log\.txt|results.*\.json|dataset_.*\.json|metrics.*\.json)$"


def fetch(task: str):
    tmp = ROOT / "data" / f"kaggle_{task}"
    tmp.mkdir(parents=True, exist_ok=True)
    subprocess.run(["kaggle", "kernels", "output", f"{OWNER}/carprint-{task}-rfdetr", "-p", str(tmp), "-o",
                    "--file-pattern", PATTERN], check=True)
    dest = ROOT / "models" / task
    dest.mkdir(parents=True, exist_ok=True)
    for f in tmp.rglob("*"):
        if f.is_file():
            shutil.copy2(f, dest / f.name)
            print(task, f.name, f.stat().st_size)


if __name__ == "__main__":
    for t in sys.argv[1:] or ["damage", "parts"]:
        fetch(t)
