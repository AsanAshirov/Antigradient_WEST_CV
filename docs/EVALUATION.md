# Evaluation protocol and results

All numbers below are produced by scripts in `eval/` and `scripts/`; nothing is hand-entered.

## Protocol

* **Count cars, not photos.** A physical car is the subject; a capture session is a sample (ISO/IEC 19795 practice).
  Genuine comparisons = the same car across different sessions. Impostor comparisons = different cars, stratified into
  **hard** (same model) and **other**.
* **Bounds, not point estimates.** Error rates carry exact Clopper–Pearson 95% upper bounds, per comparison and per
  vehicle. With zero errors the bound is ≈ 3/N (rule of three).
* **Frozen manifests.** The SHA-256 of a test manifest is committed before the first evaluation on it
  (`eval/test_manifest.sha256`). Thresholds are never tuned on a set after it has been used as a test set.
* **Set roles.**
  * *dev* — Commons cohort hold-out (73 distinct cars) + one walk-around series: used while developing.
  * *test v1* — 92 photos / 61 cars, visually verified (incl. a car shot on four dates and NHTSA "twins": identical
    new 2014 Spark 1LS cars). Frozen as `9fb4432a…`. After its first run it is used for **calibration** only.
  * *test v2* — new verified groups (Cobalt, Lacetti/Gentra, Damas, …), frozen before its single final run.
* **Decision states.** SAME / DIFFERENT / REVIEW / RECAPTURE_REQUIRED. REVIEW is a correct, safe outcome when the
  photos do not contain enough individual evidence — never an error to be hidden.

## Results so far

### Identity, dev set (Commons hold-out, 73 cars, 6 models)

| Stratum | Comparisons | False SAME | 95% upper bound |
|---|---|---|---|
| Different cars, same model | 200 | 0 confirmed* | 2.3% (per comparison) |
| Different models | 200 | 0 | 1.5% |

\* The three SAME decisions on "impostor" pairs were, on inspection, the **same physical car** (consecutive shots by
one photographer; a cropped copy of the same photo) — label noise in the dev set, correctly detected by the system.

### Identity, test v1 — first run (frozen `9fb4432a`)

| Stratum | Comparisons | Outcome |
|---|---|---|
| Different cars, same model | 200 | 0 SAME (upper bound 1.5%; per vehicle 4.8%), 1 DIFFERENT, 199 REVIEW |
| Different models | 200 | 0 SAME, 1 DIFFERENT, 199 REVIEW |
| Same car, different session | 25 | **1 SAME (TAR 4%)**, 24 REVIEW, **0 DIFFERENT (FNMR 0%)** |

The system is **safe but too conservative**. Diagnosis (`eval/diagnose_pairs.py`):
1. ALIKED spends most of its 2048 keypoints on textured background (paving, gravel); the glossy car gets few, so
   wide-baseline pairs end with < 10 inliers and no zone passes registration.
2. Many test pairs compare different viewpoints (front-left vs rear-left); the product compares the same shot-plan slot.

Fix in progress: vehicle-centric extraction (RF-DETR COCO detector → car crop at full resolution, background excluded —
this also removes the risk of two cars matching on the same reception-bay background), then slot-aware comparison.

### Latency (scripts/bench.py; p50 per stage, ms)

| Hardware | Feature extraction / frame | Cohort weights / reference frame (K=8) | Verify / pair |
|---|---|---|---|
| NVIDIA T4 (HF Jobs, fp16 LightGlue) | 70 | 121 | 153 |
| GTX 1650 4 GB (dev laptop) | 278 | 2005 | 1305 |
| 4 vCPU (HF Jobs, CPU only) | 2434 | 8663 | 1100 |

An 8-frame inspection needs ≈ 3 s of T4 time. Cohort weights are precomputed in the background when a reference frame
is uploaded, so verification does not pay for them. CPU-only serving is too slow for a live demo; the demo runs on a T4.

### Unit and API tests

`pytest tests` — 21 tests: ledger tamper detection, ORSA NFA behaviour, homography plausibility, quality gate
(exposure invariance, white paint ≠ glare), perceptual hash robustness, identity decisions (incl. "a cohort that
shares the reference design must prevent SAME"), timeline statuses, API nonce/recycled-photo/chain/PDF.

## Known failure modes (found and fixed)

| Failure | Cause | Fix |
|---|---|---|
| Different cars of one model matched | Degenerate homographies over edge-only matches | Plausibility checks (no mirroring, scale/anisotropy/perspective limits, non-collinear support) |
| Same | Aperture problem on long body edges | Structure-tensor corner factor on identity evidence |
| Significance overstated by 5–8 orders | Binomial approximation of NFA | Exact ORSA formula (IPOL 2012) |
| White cars rejected as "glare" | Bright, colourless paint counted as specular | Glare = near-clipped pixels only, gated inside the car |
| Re-submitted reference photo → SAME | Identical pixels match perfectly | Recycled-photo exclusion (SHA-256 + pHash) and red integrity flag |
| Identical new cars ("twins") | No individual marks exist | Correct answer is REVIEW + VIN check; never SAME by design |
