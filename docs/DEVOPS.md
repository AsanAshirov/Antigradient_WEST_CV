# CarPrint — build, deploy, operate

## Environments

| Environment | Where | Purpose |
|---|---|---|
| Local dev | `uvicorn api.main:app --port 8000` + `cd web && npm run dev` (Vite proxies `/api`) | code, UI |
| Batch GPU | Hugging Face Jobs (T4), code and data mounted from the private dataset repo `Azamaka/carprint-data` | evaluation, benchmarks, renders (`scripts/hf_eval_job.sh`, `scripts/render_film.py`) |
| Training | Kaggle T4 kernels `carprint-{damage,parts}-rfdetr` (`training/kaggle/train_seg.py`) | RF-DETR-Seg fine-tuning on HITL (CC0) |
| Demo / production | Hugging Face Space `Azamaka/carprint` (Docker SDK, `t4-small`) | the live site and API for the jury |

## Build

`Dockerfile` is multi-stage: Node 22 builds the site (`npm ci && npm run build`), then the runtime image
`pytorch/pytorch:2.8.0-cuda12.8-cudnn9-runtime` installs `requirements.txt`, bakes the ALIKED, LightGlue and
RF-DETR-Seg-Nano weights as the runtime user (no download on the first request), and copies the code, the cohort bank,
trained weights (`models/`) and `web/dist`. It runs as uid 1000 on port 7860 with a health check on `/api/v1/health`.

*Why torch 2.8:* `rfdetr==1.11.2` requires `transformers` 5.x, which fails to import on torch 2.5 (`AutoBackbone`,
`GenerationMixin`); on older images the vehicle detector silently disappears. The evaluation records the detector name
and how many frames were cropped (`subject_stats`) so this can never pass unnoticed again.

## Deploy

```bash
python scripts/deploy_space.py            # stage → upload to the Space → request t4-small
```
The script stages exactly what the image needs (no `node_modules`, no caches, no secrets), scans the staged files for
tokens and keys, uploads, and prints the build stage. The Space keeps every upload as a git commit: rollback = revert
the last commit on the Space.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CARPRINT_VEHICLE_SECRET` | dev value | HMAC key turning VIN/plate into the vehicle key. **Set as a Space secret.** |
| `CARPRINT_DATA` | `/data/store` | originals, artefacts, passport SQLite, Ed25519 key (created on first start) |
| `CARPRINT_MODELS` | `/app/models` | `parts/` and `damage/` (model_info.json + checkpoint) |
| `CARPRINT_COHORT` | `/app/data/cohort` | same-model cohort bank (Commons, see DATA_SOURCES.md) |
| `CARPRINT_SUBJECT` | `1` | 0 disables the vehicle silhouette (tests, CPU dev) |
| `CARPRINT_DEVICE` | auto | force `cpu` or `cuda` |

Secrets never enter the repository: the HF token lives in the CLI login, the Kaggle key in `~/.kaggle`, the signing
key is generated inside the container.

## Observability and runbook

* `GET /api/v1/health` — device, loaded models; every response carries `latency_ms`; Space logs show stage errors.
* Detector missing → identity runs on the whole frame and the eval/health say so; fix the image, do not ship.
* Damage model missing → identity, integrity and timeline structure still work; the studio says so plainly.
* GPU busy → requests queue behind the compute lock (one heavy job at a time); 8-frame inspection ≈ 3 s on T4.
* Cold start after the Space sleeps: ~1–2 min (weights are in the image); sleep is 48 h.

## Cost

T4 small ≈ $0.40/hour while running. One 8-frame inspection ≈ 3 s of GPU ≈ $0.0003 of compute. The dealer price
assumed in the business model (≈ $0.49 per inspection) leaves the compute cost negligible; storage and support
dominate.

## CI

`.github/workflows/ci.yml`: Python unit and API tests (`pytest`, CPU, vehicle crop off) and the site's type check and
build on every push.
