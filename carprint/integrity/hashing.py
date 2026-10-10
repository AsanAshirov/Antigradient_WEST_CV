"""Content hashes: cryptographic (exact copy) and perceptual (re-encoded / resized copy)."""
from __future__ import annotations

import hashlib

import cv2
import numpy as np


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def phash64(rgb: np.ndarray) -> int:
    """DCT perceptual hash (64 bit): survives recompression, resizing and screenshots of the full frame."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    small = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(small)[:8, :8].flatten()
    bits = dct[1:] > np.median(dct[1:])
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


DUPLICATE_MAX_DISTANCE = 10  # of 63 bits; tune on held-out re-encodings
