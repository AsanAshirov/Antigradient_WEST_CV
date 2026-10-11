---
title: CarPrint · Antigradient
emoji: 🚗
colorFrom: gray
colorTo: red
sdk: gradio
sdk_version: 6.28.0
python_version: "3.12"
app_file: app.py
pinned: true
license: apache-2.0
short_description: Car check-in by photo — damage, repair range, same-car proof
---

# CarPrint — live demo and API (team Antigradient, WEST Hackathon 2026, CV track)

- **Повреждения: фото** — RF-DETR-Seg (28 epochs on HITL Car Parts & Damages, CC0): masks, size, repair range
  P10–P50–P90 from 4,000 Monte Carlo scenarios on public Tashkent prices.
- **Повреждения: видео** — the sharpest key frames of a walk-around video, analysed the same way.
- **Та же машина?** — ALIKED + LightGlue, a-contrario registration and same-model cohort weights: proof that it is
  the same car, and what is new since the last visit.

API (for the team site): `/damage`, `/video`, `/compare` via `@gradio/client` — see `INTEGRATION.md`.
Code and evaluation: https://github.com/AsanAshirov/Antigradient_WEST_CV
