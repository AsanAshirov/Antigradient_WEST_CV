# CarPrint — system architecture

## 1. Context

**Users.** Service advisor at a Royal Motors reception (check-in / check-out), later insurers (KASKO reference and
claim re-check) and fleets. **Input:** phone photos, either a guided 8-angle walk-around plus a random challenge, or
any two sets of photos (quick check). **Output:** identity verdict with evidence, per-part damage timeline, repair-cost
range, PDF act and a signed record in the vehicle's passport. **Rule:** the system never bills or rejects anything by
itself; a person confirms every finding.

**Constraints that shaped the design:** commodity phones (no tunnel, no controlled light), glossy paint, models that
are commercially licensable (no SuperPoint, CarDD, MASt3R, original 3DGS), a live demo that must process the jury's
own photos in seconds, Uzbek privacy expectations (licence plates and VINs are personal data).

## 2. Overview

```
 phone / browser ──HTTPS──► FastAPI (api/main.py, one process, one GPU)
   site + studio (React)        │
                                ├─ quality gate ......... blur, exposure, glare inside the car, car size
                                ├─ integrity ............ SHA-256, pHash recycled-photo check, session nonce
                                ├─ subject .............. RF-DETR-Seg Nano (COCO) → car box + silhouette
                                ├─ identity ............. ALIKED → LightGlue → MAGSAC++ zones → ORSA NFA gate
                                │                         → same-model cohort weights → congruent cells → verdict
                                ├─ damage & parts ....... RF-DETR-Seg fine-tuned on HITL (CC0): 21 parts, 7 damages
                                ├─ scale & cost ......... wheel / plate / body-height scale → size in cm
                                │                         → operation prior → Monte Carlo P10/P50/P90
                                ├─ timeline ............. old masks carried by the zone homography, visibility-aware
                                └─ passport ............. SQLite ledger, hash chain, Ed25519 signatures, PDF act
```

Everything runs in one container (`Dockerfile`): the API serves the built site from `web/dist` and the JSON API under
`/api`. State: inspections in memory (demo), originals and artefacts on disk (`CARPRINT_DATA`), the passport ledger in
SQLite. Model weights are baked into the image.

## 3. Request flows

**Quick check** — `POST /api/v1/compare` (1–16 photos per side, model hint):
1. ingest every photo: decode, quality, pHash, silhouette, features (ALIKED on the car crop at full resolution);
2. recycled-photo exclusion (a current photo equal to a reference photo by SHA-256 or pHash ≤ 10/63 bits);
3. verification over all reference × current pairs (same slot pairs only, when slots are known);
4. damage and part segmentation, metric scale, damage timeline for registered zones;
5. cost of new damage (new in some registered view and recorded in none) and of all visible damage;
6. evidence for the 6 strongest pairs: inlier lines (normalised), aligned frame, match visual.

**Guided inspection** — `POST /inspections` (nonce, expiry, shot plan) → `POST /inspections/{id}/frames` per slot
(quality feedback in the response, retake on failure) → `POST /inspections/{id}/analyze` → `POST /verifications`
against an earlier inspection of the same vehicle key → `POST /inspections/{id}/confirm` (staff decision, ledger record)
→ `GET /inspections/{id}/report.pdf`.

## 4. Identity decision (why it is hard to fool)

| Step | Method | Guards against |
|---|---|---|
| Car only | silhouette mask from RF-DETR-Seg, features on the car crop | a match carried by the background or a neighbouring car (observed, fixed) |
| Registration | sequential MAGSAC++ homographies per panel; plausibility (no mirror, scale, shear, perspective, collinearity) | chance alignments, degenerate fits |
| Significance | a-contrario NFA (exact ORSA, IPOL 2012) per zone | many weak matches that look like evidence |
| Design ≠ identity | cohort weight `w(f)=log((K+1)/(m_f+0.5))/log((K+1)/0.5)` from K same-model cars | two white Cobalts matching on grille and lamps |
| Aperture, reflections | structure-tensor corner factor, specular-highlight factor | matches sliding along body lines, mirrored lights |
| Independence | one vote per image cell (NIST Congruent Matching Cells analogue), ≥ 6 cells for SAME | bursts of matches on one emblem |
| Integrity | session nonce, random challenge, SHA-256 + pHash recycled check | re-submitting last visit's photos |

`DIFFERENT` needs contradicted, design-aligned zones; anything weaker is `REVIEW`. Identical new cars ("twins") are
correctly `REVIEW` + VIN check: there is no individual evidence to find.

## 5. Repair estimate

Size: three rulers (tyre diameter from the model's tyre size, UZ plate 520×110 mm, body height), fused by inverse
variance, foreshortening from the shot-plan slot or the wheel ellipse; uncertainty propagated to area and length.
Cost: per part, the operation is drawn from an expert prior (PDR only for small dents away from edges and not on
plastic; glass and lamps replaced when cracked …); triangular prices from public Tashkent sources; the labour rate is
shared across parts in a sample. 4,000 Monte Carlo samples give P10/P50/P90, P(replace) and each part's share of the
variance. What must be learned from partner data is explicit: the operation prior (repair orders with photos) and the
price table (dealer DMS). Details and formulas: `carprint/damage/scale.py`, `carprint/damage/estimate.py`.

## 6. Data model

| Entity | Key fields |
|---|---|
| Inspection | id, vehicle_key (HMAC of VIN/plate), role, type, nonce, expires_at, model_hint, frames |
| Frame | id, slot, sha256, phash, capture_mode, server_ts, quality, silhouette box, features |
| Evidence zone | ref/cur frame, homography, inliers (coordinates + weights), NFA raw/distinct, cells, votes |
| Timeline item | status (new / recorded / gone / not visible), class, part, bboxes, damage id |
| Cost | p10/p50/p90/mean, usd, parts (operation probabilities, P(replace), variance share), price table version |
| Passport record | vehicle_key, record_hash, prev_hash, Ed25519 signature, payload (frames, findings, operator) |

## 7. Non-functional

| Concern | Now (demo) | Next (pilot) |
|---|---|---|
| Latency | T4: extraction 66 ms/frame, verify 154 ms/pair; 8-frame inspection ≈ 3 s | ONNX/TensorRT for ALIKED and RF-DETR |
| Throughput | one GPU, compute lock: ~1,000 inspections/hour | queue + GPU workers, autoscaling |
| Storage | memory + local disk + SQLite | Postgres for inspections, object storage for frames, ledger anchored daily |
| Privacy | plates blurred in artefacts, VIN/plate → HMAC key, originals never served | per-dealer keys, retention policy, DPIA under the UZ personal-data law |
| Integrity | Ed25519 hash chain, public key endpoint | key in HSM/KMS, external timestamping |
| Degradation | no detector → whole frame + flag; no damage model → identity only; bad frame → RECAPTURE | — |

## 8. Decisions

1. **Local features + geometry, not an embedding.** A re-ID embedding says "similar"; geometry plus a cohort says
   *which marks* match and *how unlikely* that is by chance, and draws them. Licences: ALIKED (BSD-3) and LightGlue
   (Apache-2.0); SuperPoint is non-commercial.
2. **REVIEW is a first-class answer.** The cost of a false SAME (a swapped car accepted) is far higher than a
   human look; thresholds are set so that 0 of 400 impostor pairs pass (95% upper bound 1.5%).
3. **Ranges, not a number.** Human appraisers differ by 15–25%; a single figure would be false precision.
4. **No photogrammetric 3D in the demo.** Glossy paint breaks multi-view reconstruction, it needs 60–200 frames and
   minutes of GPU per car, and dents of 1–10 mm are below its noise. Kept on the roadmap (commercially licensable
   options: VGGT-1B-Commercial, MapAnything Apache, COLMAP + gsplat).
5. **One container on one GPU.** The simplest thing that serves the live demo reliably; the module boundaries map
   one-to-one onto services when the pilot needs to scale.
