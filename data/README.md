# Data

Images are **not** committed: they are third-party photos (with per-file licences and, in places, visible plates).
Everything is reproducible from the scripts below; only manifests, labels and hashes are versioned.

| Folder | What | How to rebuild | Licence |
|---|---|---|---|
| `cohort/<model>/` | Same-model "background population" (different physical cars) for distinctiveness weights. First 8 images per model = inference bank; the rest = held-out dev impostors | `python scripts/fetch_cohort.py 20` then `python scripts/fill_cohort.py matiz 12` | Per file, recorded in `cohort/MANIFEST.json` (Commons: CC0 / PD / CC BY / CC BY-SA) |
| `test/commons_mined/` | Identity test sets: Commons photo groups verified **by eye** (same car vs distinct cars), with capture timestamps | `python scripts/mine_commons_pairs.py`, labels in `test/commons_mined/verified.json`, manifest via `python scripts/build_test_manifest.py` | Per file, in `candidates.json` |
| `test/dev/` | Dev set: Commons walk-around series + held-out cohort cars | `python scripts/fetch_series.py && python scripts/build_dev_manifest.py` | Per file |
| `raw/` | Smoke-test images (Kaggle `lplenka/coco-car-damage-detection-dataset`, CC0) | `kaggle datasets download -d lplenka/coco-car-damage-detection-dataset -p data/raw/coco_car_damage --unzip` | CC0 |
| `store/` | Runtime evidence store of the API (originals, artifacts, passport ledger, signing key) | created by the API | — never commit |

Labelling method for the identity test sets: groups of photos by one Commons uploader are shown as contact sheets
(`scripts/contact_sheet.py`); a pair is labelled *same car* only when colour, body details and the EXIF capture
times (seconds or days apart) agree, and *distinct cars* only when colour, generation or place clearly differ.
Anything ambiguous is excluded. Impostor pairs between photos of one uploader are used only inside groups verified
as distinct (`distinct_group`), because the same photographer often shoots the same car twice.

Privacy: plates and faces are blurred in every derived image the API returns; the identity method does not read
plates. The hackathon rules forbid real personal data of non-consenting people, so no raw test image is shipped.
