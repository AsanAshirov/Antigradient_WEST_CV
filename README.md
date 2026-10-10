# CarPrint Verification AI

**Partner product — Royal Motors After-Sales. Process changed: vehicle check-in / check-out at service reception.**
Second channel: insurers (KASKO pre-inspection and claims).

CarPrint turns a phone walk-around of a car into an evidence record that answers three questions:

1. **Is this the same physical car as last time?** — `SAME / DIFFERENT / REVIEW`, decided from individual marks
   (curb rash, chips, scratches) after discounting design features shared by every car of the same model.
2. **What changed?** — per-part damage timeline: previously recorded / newly detected / previously seen, now absent /
   insufficient evidence.
3. **Can the record be trusted?** — in-session capture with a server nonce, SHA-256 and perceptual hashes,
   recycled-photo detection, human confirmation, and an Ed25519 hash-chained passport per vehicle.

The system never bills or rejects anything automatically: every finding is confirmed by a person.

## Architecture

```
phone (PWA)  ──frames + nonce──►  API (FastAPI)
                                   │
   quality gate ── blur / exposure / glare / subject size        carprint/core/quality.py
   integrity ───── SHA-256, pHash, gallery vs camera, recycled   carprint/integrity/hashing.py
   identity ────── ALIKED (BSD-3) + LightGlue (Apache-2.0)        carprint/identity/features.py
                   sequential MAGSAC++ homographies per planar zone, a-contrario NFA gate
                                                                  carprint/identity/geometry.py
                   cohort distinctiveness w(f) from same-model cars, congruent-cell voting
                                                                  carprint/identity/verify.py
   segmentation ── RF-DETR-Seg (Apache-2.0) fine-tuned: 21 parts, 7 damage classes
                                                                  carprint/damage/segmenter.py
   timeline ────── old masks warped by the zone homography, visibility-aware status
                                                                  carprint/timeline/diff.py
   passport ────── hash-chained, Ed25519-signed records           carprint/integrity/ledger.py
```

### Identity method in one paragraph
LightGlue matches are verified by fitting several homographies (one per roughly planar panel). Each zone passes a
registration gate when its a-contrario number of false alarms is small (Moisan & Stival). Registration proves the
*part* lines up, not that it is the *same car*: two white Cobalts share grille, lamps and panel gaps. Each reference
keypoint therefore gets a distinctiveness weight from a cohort of K other cars of the same model,
`w(f) = log((K+1)/(m_f+0.5)) / log((K+1)/0.5)`, where `m_f` is how many cohort cars also match it. Identity
evidence is the number of independent image cells (one vote per cell, as in NIST Congruent Matching Cells) holding
weighted inliers. ≥6 cells → SAME, contradicted design-aligned zones → DIFFERENT, otherwise REVIEW.
Thresholds are starting values to be calibrated on the frozen calibration split (see `eval/`).

## Run locally

```bash
python -m pip install -r requirements.txt          # Python 3.11–3.14; torch with CUDA if available
python scripts/fetch_cohort.py 20                   # same-model cohort from Wikimedia Commons (+ MANIFEST.json)
uvicorn api.main:app --port 8000                    # API at http://127.0.0.1:8000/api/v1, docs at /docs
python scripts/api_smoke.py                         # end-to-end smoke test
```

Trained segmentation weights go to `models/parts/` and `models/damage/` (each with `model_info.json` and a
`checkpoint_best_*.pth`). Without them the API still runs identity and integrity; `/health` shows what is loaded.

## Train

`training/kaggle/train_seg.py` converts HITL Car Parts & Damages (Supervisely polygons) to COCO and fine-tunes
RF-DETR-Seg on a Kaggle T4:

```bash
cd training/kaggle && sed "s/__TASK__/damage/" train_seg.py > k_damage/train_damage.py
kaggle kernels push -p k_damage --accelerator NvidiaTeslaT4
```

## Evaluate

```bash
python eval/evaluate_identity.py data/test/<set>/manifest.json data/cohort eval/results.json
```

Counting follows ISO/IEC 19795 practice: genuine comparisons are the same car across different sessions; impostor
comparisons are split into **hard** (same model) and other. We report false-match rate per comparison and bounded per
vehicle with exact Clopper–Pearson 95% upper bounds (≈3/N with zero errors), plus REVIEW rate and latency p50/p95.
The SHA-256 of the test manifest is written into `results.json` and committed before any threshold tuning.

## Deploy

`Dockerfile` builds a CPU image listening on port 7860 (Hugging Face Spaces Docker SDK or any server).

## Data and licences

See [DATA_SOURCES.md](DATA_SOURCES.md). Non-commercial resources (CarDD, SuperPoint, MASt3R, VeRi-776, …) are not used.

## API

See [docs/API_CONTRACT.md](docs/API_CONTRACT.md).
