"""Inspection act as a PDF built with PIL (no extra dependencies): summary page + one page per frame overlay."""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

A4 = (1240, 1754)  # 150 dpi
FONT_CANDIDATES = ["DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"]


def _font(size: int):
    for f in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + ([cur] if cur else [])


def build_pdf(title: str, rows: list[tuple[str, str]], overlays: list[tuple[str, Path]], footer: str) -> bytes:
    pages = []
    page = Image.new("RGB", A4, "white")
    d = ImageDraw.Draw(page)
    h1, body, small = _font(44), _font(26), _font(20)
    y = 80
    d.text((80, y), title, fill="black", font=h1)
    y += 90
    for key, value in rows:
        d.text((80, y), key, fill=(90, 90, 90), font=body)
        for line in _wrap(d, value, body, A4[0] - 520):
            d.text((440, y), line, fill="black", font=body)
            y += 36
        y += 10
    footer_lines = _wrap(d, footer, small, A4[0] - 160)
    fy = A4[1] - 80 - 28 * len(footer_lines)
    for line in footer_lines:
        d.text((80, fy), line, fill=(110, 110, 110), font=small)
        fy += 28
    pages.append(page)
    for caption, path in overlays:
        if not path.exists():
            continue
        img = Image.open(path).convert("RGB")
        img.thumbnail((A4[0] - 160, A4[1] - 300))
        p = Image.new("RGB", A4, "white")
        pd = ImageDraw.Draw(p)
        pd.text((80, 80), caption, fill="black", font=body)
        p.paste(img, (80, 150))
        pages.append(p)
    buf = io.BytesIO()
    pages[0].save(buf, format="PDF", save_all=True, append_images=pages[1:], resolution=150)
    return buf.getvalue()
