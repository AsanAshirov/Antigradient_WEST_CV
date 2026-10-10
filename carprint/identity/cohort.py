"""Cohort bank selection shared by the API and the evaluation so both measure the same system."""
from __future__ import annotations

from pathlib import Path

BANK_SIZE = 8
IMAGE_EXT = (".jpg", ".jpeg", ".png")


def bank_paths(cohort_root: Path, model: str, k: int = BANK_SIZE) -> list[Path]:
    """First k images (sorted) of the model folder; with no model, the first image of every model folder
    in turn (a mixed-model cohort). Images after index k are held out for evaluation."""
    folder = cohort_root / model
    if model and folder.is_dir():
        return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT)[:k]
    per_model = [sorted(p for p in d.iterdir() if p.suffix.lower() in IMAGE_EXT)[:k]
                 for d in sorted(cohort_root.iterdir()) if d.is_dir()]
    mixed = [paths[i] for i in range(k) for paths in per_model if i < len(paths)]
    return mixed[:k]
