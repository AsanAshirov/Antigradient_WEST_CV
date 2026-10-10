"""Capture quality gate: blur, exposure, glare and subject size.

Thresholds are initial values and must be re-calibrated on the frozen calibration split.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

BLUR_MIN = 0.010  # variance of Laplacian of the unit-variance image at 1024 px long side
DARK_P95_MAX = 0.30  # even the brightest 5% of the subject is darker than this -> underexposed
CLIPPED_MAX = 0.25  # fraction of clipped (>=250) pixels -> overexposed
GLARE_MAX = 0.12  # fraction of near-saturated, low-saturation pixels inside the subject
SUBJECT_MIN = 0.15  # fraction of frame covered by the car


@dataclass
class QualityReport:
    blur: float
    brightness: float
    glare_ratio: float
    subject_ratio: float | None
    issues: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues

    def to_dict(self) -> dict:
        return {**asdict(self), "ok": self.ok}


def glare_mask(rgb: np.ndarray) -> np.ndarray:
    """Specular highlights: very bright and nearly colourless pixels, slightly dilated."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    mask = (hsv[..., 2] >= 245) & (hsv[..., 1] <= 40)
    mask = cv2.dilate(mask.astype(np.uint8), np.ones((7, 7), np.uint8))
    return mask.astype(bool)


def laplacian_variance(gray: np.ndarray) -> float:
    """Variance of the Laplacian of the contrast-normalised image at 1024 px: invariant to exposure scaling."""
    h, w = gray.shape
    s = 1024 / max(h, w)
    if abs(s - 1) > 0.05:
        gray = cv2.resize(gray, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    g = gray.astype(np.float32)
    g = (g - g.mean()) / (g.std() + 1e-6)
    return float(cv2.Laplacian(g, cv2.CV_32F).var())


def assess(rgb: np.ndarray, subject_mask: np.ndarray | None = None) -> QualityReport:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    region = subject_mask if subject_mask is not None and subject_mask.any() else np.ones_like(gray, bool)
    blur = laplacian_variance(gray)
    lum = gray[region]
    brightness = float(lum.mean() / 255.0)
    p95 = float(np.percentile(lum, 95) / 255.0)
    clipped = float((lum >= 250).mean())
    glare_ratio = float(glare_mask(rgb)[region].mean())
    subject_ratio = float(subject_mask.mean()) if subject_mask is not None else None

    issues = []
    if blur < BLUR_MIN:
        issues.append("blurry")
    if p95 < DARK_P95_MAX:
        issues.append("too_dark")
    if clipped > CLIPPED_MAX:
        issues.append("overexposed")
    if glare_ratio > GLARE_MAX:
        issues.append("glare")
    if subject_ratio is not None and subject_ratio < SUBJECT_MIN:
        issues.append("car_too_small" if subject_ratio > 0 else "no_car")
    return QualityReport(blur, brightness, glare_ratio, subject_ratio, issues)


MESSAGES_RU = {
    "blurry": "Кадр смазан — держите телефон неподвижно",
    "too_dark": "Слишком темно — включите вспышку или фонарь",
    "overexposed": "Пересвет — смените угол",
    "glare": "Сильный блик — сместитесь, чтобы убрать отражение",
    "car_too_small": "Подойдите ближе — машина занимает мало кадра",
    "no_car": "Машина не найдена в кадре",
}
