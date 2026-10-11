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

### Identity, test v1 as calibration — vehicle silhouette (run r6, RF-DETR-Seg Nano, 116/116 frames segmented)

| Stratum | Comparisons | Outcome | 95% upper bound |
|---|---|---|---|
| Different cars, same model | 200 | **0 SAME**, 185 REVIEW, 14 RECAPTURE, 1 DIFFERENT | FMR 1.5% (per vehicle 4.8%) |
| Different models | 200 | **0 SAME**, 190 REVIEW, 10 RECAPTURE | FMR 1.5% |
| Same car, different session | 25 | 1 SAME, 23 REVIEW, 1 RECAPTURE, **0 DIFFERENT** | FNMR 11.3% |

What changed between the first run and this one, and why it matters:
1. **A same-car verdict carried by the background (found, fixed).** Drawing the inliers of the only SAME of the first
   run showed them on fallen leaves, a kerb and a Kia parked next to the Matiz: two shots taken seconds apart at one
   spot. A box crop is not enough (the neighbour sits inside the box), so identity keypoints now come only from the
   dilated car silhouette (`carprint/identity/subject.py`). With it the pair is still SAME — now on the car body.
2. **The detector silently disappeared on the GPU jobs (found, fixed).** `rfdetr 1.11.2` needs transformers 5.x,
   which does not import on torch 2.5; the pipeline fell back to the whole frame without telling. Images now use
   torch 2.8, and every evaluation records the detector name and `subject_stats` (frames cropped / failed).
3. **Quality gate calibrated** on 224 real photos (`scripts/quality_stats.py`): glare inside the car box has median
   0.09 and p95 0.22; the original 0.12 / 0.15 thresholds asked for a retake on 31% / 8% of usable photos. Now 0.25 /
   0.08 — the worst few percent.
4. **Evidence drawn from what the decision used.** Zones keep their own inlier coordinates and weights; visuals and the
   API no longer re-run the matcher (a re-run can return a different match list and misplace lines).

Recall is the open item: Commons photos of one car are mostly taken from different sides, the product compares the
same shot-plan angle. A same-angle test (two sessions × 8 slots for several cars) is the first pilot measurement.

### Damage segmentation (RF-DETR-Seg Medium on HITL, CC0)

Held-out 15% split of HITL Car Parts & Damages (seed 42), 7 classes, Kaggle T4 (images downscaled once to 1024 px;
the first 40-epoch run on raw 3,000 px PNGs was CPU-bound and hit Kaggle's 12-hour limit). Served: the 28-epoch run.

| Metric (validation) | 12 epochs | 28 epochs (best epoch 19, served) |
|---|---|---|
| Box mAP@0.5 | 0.177 | **0.248** |
| Box mAP@0.5:0.95 | 0.103 | 0.155 |
| Mask mAP@0.5 | 0.156 | 0.222 |
| Mask mAP@0.5:0.95 | 0.077 | 0.126 |
| Training time on a T4 | 50 min | 68 min |
| Training instances | 7,299 (scratch 2,599 · dent 1,407 · broken part 1,280 · paint damage 1,192 · missing part 531 · corrosion 219 · crack 71) |

Honest reading: a suggestion tool for a person, not an automatic judge. Longer training gave +40% relative mAP; the
validation curve peaked at epoch 19. Cracks have only 71 training instances. Detector scores are not probabilities:
on clean cars it still proposes findings at 0.40–0.45, so anything below 0.6 is marked "staff to confirm" and a
reference finding is reported as gone only above 0.6. Every finding is confirmed by staff, and the
timeline only compares damages inside registered panels of the same car.

### Latency on the live server

| Hardware | Pair of photos, browser to answer | Note |
|---|---|---|
| NVIDIA T4 (HF Space) | 2.7 s warm (server verify 0.36 s) | first request after start ≈ 12 s |
| 2 vCPU (free HF Space) | ≈ 10.5 s warm | cohorts of 5 common models are warmed at start-up |

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
