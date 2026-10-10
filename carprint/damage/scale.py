"""Metric scale of a frame (mm per pixel) from objects of known size, with an uncertainty for every number.

Pinhole camera; the reference objects lie at roughly the depth of the measured panel. Estimator i gives s_i with
relative standard uncertainty u_i:

  wheel  s = D (1 - delta) / h_px    D = tyre outer diameter from the tyre size W/AR Rd: D = 25.4 d + 2 W AR / 100 mm;
                                     delta = share of the tyre hidden by the wheel arch (prior 0.08 +- 0.04).
                                     A circle seen at yaw psi spans D cos(psi) horizontally and D vertically, so the
                                     vertical extent does not depend on yaw.
  plate  s = 110 / h_px              vertical size of the plate (UZ standard 520 x 110 mm), also yaw-free
  body   s = H_car / h_px            overall height of the model, vehicle box from the detector

Independent estimators are fused by inverse-variance weighting:
  s* = sum(s_i / u_i^2) / sum(1 / u_i^2),    u* = (sum 1 / u_i^2)^(-1/2)

Yaw of the side plane comes from the shot-plan slot, or from the wheel ellipse: cos(psi) = w_px (1 - delta) / h_px.
A panel whose normal makes angle psi with the viewing direction is foreshortened by cos(psi), so
  A_mm2 = A_px s*^2 / cos(psi),   u_A = sqrt((2 u*)^2 + u_mask^2),   u_mask = perimeter_px * 1 px / A_px.
Horizontal parts (hood, roof, trunk lid) are seen at grazing angles from eye level: no metric area for them.
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

DATA = Path(__file__).resolve().parent / "data"
ARCH_DELTA, ARCH_DELTA_SD = 0.08, 0.04
PLATE_MM = (520.0, 110.0)  # UZ standard plate, https://en.wikipedia.org/wiki/Vehicle_registration_plates_of_Uzbekistan
MASK_EDGE_PX = 1.0
MAX_FORESHORTENING = 2.5  # 1/cos(psi) above this (psi > 66 deg) gives no usable metric area
MIN_WHEEL_PX, MIN_PLATE_PX = 40, 12

SIDE_PARTS = {"front_door", "back_door", "fender", "quarter_panel", "rocker_panel", "front_wheel", "back_wheel",
              "front_window", "back_window", "mirror"}
END_PARTS = {"front_bumper", "back_bumper", "grille", "headlight", "tail_light", "license_plate", "windshield",
             "back_windshield"}
TOP_PARTS = {"hood", "roof", "trunk"}
SLOT_YAW = {"left": 0.0, "right": 0.0, "front": 90.0, "rear": 90.0, "front_left_45": 45.0, "front_right_45": 45.0,
            "rear_left_45": 45.0, "rear_right_45": 45.0}


def tyre_diameter_mm(size: str) -> float:
    """'185/75 R14' -> 25.4 * 14 + 2 * 185 * 0.75 = 633.1 mm."""
    m = re.match(r"\s*(\d{3})\s*/\s*(\d{2})\s*Z?R\s*(\d{2})", size.upper())
    if not m:
        raise ValueError(f"bad tyre size {size!r}")
    w, ar, d = (int(g) for g in m.groups())
    return 25.4 * d + 2 * w * ar / 100


@lru_cache(maxsize=1)
def _vehicles() -> dict:
    return json.loads((DATA / "vehicles.json").read_text(encoding="utf-8"))


def vehicle_spec(model: str) -> dict:
    """Spec of a known model, else the generic passenger car with wider uncertainties."""
    v = _vehicles()
    key = (model or "").strip().lower().replace(" ", "_")
    return {**v["generic"], **v["models"].get(key, {}), "model": key if key in v["models"] else "generic"}


@dataclass
class ScaleEstimate:
    kind: str
    mm_per_px: float
    rel_unc: float


@dataclass
class Scale:
    mm_per_px: float | None
    rel_unc: float | None
    yaw_side_deg: float | None
    yaw_source: str
    estimates: list[ScaleEstimate] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"mm_per_px": None if self.mm_per_px is None else round(self.mm_per_px, 3),
                "rel_unc": None if self.rel_unc is None else round(self.rel_unc, 3),
                "yaw_side_deg": None if self.yaw_side_deg is None else round(self.yaw_side_deg, 1),
                "yaw_source": self.yaw_source,
                "estimates": [{"kind": e.kind, "mm_per_px": round(e.mm_per_px, 3), "rel_unc": round(e.rel_unc, 3)}
                              for e in self.estimates]}


def _vertical_extent(mask: np.ndarray, bbox) -> float:
    ys = np.where(mask.any(axis=1))[0]
    return float(ys[-1] - ys[0] + 1) if len(ys) else float(bbox[3])


def _horizontal_extent(mask: np.ndarray, bbox) -> float:
    xs = np.where(mask.any(axis=0))[0]
    return float(xs[-1] - xs[0] + 1) if len(xs) else float(bbox[2])


def _touches_border(bbox, shape, margin: int = 2) -> bool:
    x, y, w, h = bbox
    return x <= margin or y <= margin or x + w >= shape[1] - margin or y + h >= shape[0] - margin


def estimate_scale(parts: list, spec: dict, shape, vehicle_box=None, slot: str = "extra") -> Scale:
    """parts: segmenter Instances (cls, score, bbox x,y,w,h, mask); vehicle_box: raw detector box x0,y0,x1,y1."""
    est: list[ScaleEstimate] = []
    D = tyre_diameter_mm(spec["tyre"])
    u_D = spec.get("tyre_rel_unc", 0.01)
    yaw_from_wheels = []
    for p in parts:
        if p.cls in ("front_wheel", "back_wheel") and not _touches_border(p.bbox, shape):
            h = _vertical_extent(p.mask, p.bbox)
            if h < MIN_WHEEL_PX:
                continue
            u = math.sqrt((ARCH_DELTA_SD / (1 - ARCH_DELTA)) ** 2 + (2 * MASK_EDGE_PX / h) ** 2 + u_D ** 2)
            est.append(ScaleEstimate("wheel", D * (1 - ARCH_DELTA) / h, u))
            w = _horizontal_extent(p.mask, p.bbox)
            yaw_from_wheels.append(math.degrees(math.acos(min(1.0, w * (1 - ARCH_DELTA) / h))))
        elif p.cls == "license_plate" and not _touches_border(p.bbox, shape):
            h = _vertical_extent(p.mask, p.bbox)
            if h < MIN_PLATE_PX:
                continue
            u = math.sqrt((2 * MASK_EDGE_PX / h) ** 2 + 0.03 ** 2)  # plus tilt of the plate holder
            est.append(ScaleEstimate("plate", PLATE_MM[1] / h, u))
    if vehicle_box is not None:
        x0, y0, x1, y1 = vehicle_box
        clipped = y0 <= 2 or y1 >= shape[0] - 2
        if not clipped and y1 - y0 > 50:
            est.append(ScaleEstimate("body_height", spec["height"] / (y1 - y0), spec.get("height_rel_unc", 0.08)))

    if slot in SLOT_YAW:
        yaw, yaw_src = SLOT_YAW[slot], "shot_plan"
    elif yaw_from_wheels:
        yaw, yaw_src = float(np.median(yaw_from_wheels)), "wheel_ellipse"
    else:
        yaw, yaw_src = None, "unknown"
    if not est:
        return Scale(None, None, yaw, yaw_src, [])
    inv = np.array([1 / e.rel_unc ** 2 for e in est])
    s = float(np.sum(inv * np.array([e.mm_per_px for e in est])) / inv.sum())
    return Scale(s, float(1 / math.sqrt(inv.sum())), yaw, yaw_src, est)


YAW_SD_DEG = {"shot_plan": 10.0, "wheel_ellipse": 8.0}
UNKNOWN_YAW_REL_UNC = 0.15  # no view information: no correction, larger uncertainty


def panel_yaw(part: str | None, scale: Scale) -> float | None:
    """Angle between the panel normal and the viewing direction (horizontal), or None if not measurable."""
    if part in TOP_PARTS:
        return None
    if scale.yaw_side_deg is None:
        return 0.0
    if part in END_PARTS:
        return 90.0 - scale.yaw_side_deg
    return scale.yaw_side_deg  # side parts and unknown parts: the side plane dominates a walk-around


def foreshortening_unc(psi_deg: float, scale: Scale) -> float:
    """Relative uncertainty of 1/cos(psi): d ln(1/cos psi) / d psi = tan psi."""
    sd = YAW_SD_DEG.get(scale.yaw_source)
    if sd is None:
        return UNKNOWN_YAW_REL_UNC
    return math.tan(math.radians(psi_deg)) * math.radians(sd)


def measure(mask: np.ndarray, part: str | None, scale: Scale) -> dict:
    """Area (cm2) and largest extent (mm) of a damage mask, with relative uncertainty; metric=False if unusable."""
    a_px = float(mask.sum())
    out = {"area_px": int(a_px), "metric": False, "area_cm2": None, "length_mm": None, "rel_unc_area": None}
    if a_px == 0 or scale.mm_per_px is None:
        return out
    psi = panel_yaw(part, scale)
    if psi is None:
        return out
    fore = 1 / max(math.cos(math.radians(psi)), 1e-6)
    if fore > MAX_FORESHORTENING:
        return out
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    perim = float(sum(cv2.arcLength(c, True) for c in contours))
    ys, xs = np.nonzero(mask)
    dx, dy = float(xs.max() - xs.min() + 1), float(ys.max() - ys.min() + 1)
    s = scale.mm_per_px
    u_mask = perim * MASK_EDGE_PX / a_px
    u_fore = foreshortening_unc(psi, scale)
    return {"area_px": int(a_px), "metric": True,
            "area_cm2": a_px * s * s * fore / 100.0,
            "length_mm": s * math.hypot(dx * fore, dy),
            "rel_unc_area": math.sqrt((2 * scale.rel_unc) ** 2 + u_mask ** 2 + u_fore ** 2),
            "rel_unc_length": math.sqrt(scale.rel_unc ** 2 + (2 * MASK_EDGE_PX / max(dx, dy)) ** 2 + u_fore ** 2),
            "foreshortening": round(fore, 3)}
