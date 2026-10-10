"""Image loading with EXIF orientation and bounded resolution."""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 1600


@dataclass
class LoadedImage:
    rgb: np.ndarray  # HxWx3 uint8, orientation-corrected, resized to <= MAX_SIDE
    original_size: tuple[int, int]  # (width, height) before resizing
    scale: float  # rgb pixels per original pixel
    exif: dict


def _exif_dict(img: Image.Image) -> dict:
    try:
        raw = img.getexif()
    except Exception:
        return {}
    from PIL.ExifTags import TAGS

    return {TAGS.get(k, str(k)): (v if isinstance(v, (int, float, str)) else str(v)) for k, v in raw.items()}


def load_image(data: bytes, max_side: int = MAX_SIDE) -> LoadedImage:
    img = Image.open(io.BytesIO(data))
    exif = _exif_dict(img)
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return LoadedImage(rgb=np.asarray(img), original_size=(w, h), scale=scale, exif=exif)
