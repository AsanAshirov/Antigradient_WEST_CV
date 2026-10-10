# Data, models and licences

Every external resource used to build, train or evaluate CarPrint. Licences were checked at the original
source on 10 Oct 2026; "mirror" means the copy we downloaded, whose licence matches the upstream one.

## Training data

| Source | What we use | Licence | Commercial use | Link |
|---|---|---|---|---|
| Humans in the Loop — Car Parts and Car Damages | 998 images with 21 part classes, 814 images with 8 damage classes (polygons) | CC0 1.0 | Yes | https://www.kaggle.com/datasets/humansintheloop/car-parts-and-car-damages (uploaded by HITL) |
| lplenka — COCO Car Damage Detection | 80 images, used only as smoke-test inputs | CC0 1.0 (Kaggle) | Yes | https://www.kaggle.com/datasets/lplenka/coco-car-damage-detection-dataset |

Note: on Kaggle the folder "Car damages dataset" contains the part labels and "Car parts dataset" contains the
damage labels; our converter selects subsets by `meta.json`, not by folder name.

## Evaluation and cohort data

| Source | What we use | Licence | Commercial use | Link |
|---|---|---|---|---|
| Wikimedia Commons, per-model categories (Chevrolet Cobalt Gamma II, Ravon R4, Daewoo/Chevrolet Nexia, Chevrolet Spark M300, Lacetti/Gentra, Damas, Matiz, BYD Song Plus, Toyota Camry XV70) | Different physical cars of the same model: cohort for distinctiveness weights and hard impostors | Per file: CC0 / PD / CC BY / CC BY-SA — recorded in `data/cohort/MANIFEST.json` | Yes, with attribution; SA applies to redistributed copies | https://commons.wikimedia.org |
| Wikimedia Commons walk-around series (same car, numbered shots) | Weak genuine pairs for the public dev set | Per file, recorded in `data/test/commons_series/ATTRIBUTION.json` | Yes, with attribution | https://commons.wikimedia.org |
| Team captures | Same-car sessions and same-model impostors, with written owner consent; plates and faces blurred | Owned by the team | Yes | — |

Images with visible plates or people from Commons are used only server-side for evaluation; derived images are blurred.

## Models and libraries

| Component | Use | Licence |
|---|---|---|
| RF-DETR (roboflow/rf-detr 1.11.2), Seg Small / Seg Medium | Part and damage segmentation, fine-tuned by us | Apache-2.0 |
| ALIKED (via cvg/LightGlue) | Local features | BSD-3-Clause |
| LightGlue weights for ALIKED | Feature matching | Apache-2.0 |
| OpenCV (USAC MAGSAC++) | Geometric verification | Apache-2.0 |
| PyTorch, torchvision | Runtime | BSD-3-Clause |
| FastAPI, Uvicorn, Pydantic | API | MIT / BSD-3-Clause / MIT |
| cryptography | Ed25519 signatures | Apache-2.0 / BSD |

## Deliberately NOT used

| Resource | Reason |
|---|---|
| CarDD and any model trained on it | Non-commercial licence, redistribution forbidden |
| Ultralytics YOLO models (incl. HF "car damage" YOLO weights) | AGPL-3.0 extends to trained weights and SaaS |
| SuperPoint weights (and SuperPoint-LightGlue) | Magic Leap non-commercial research licence |
| MASt3R / DUSt3R, VGGT-1B, VideoMAEv2 | Non-commercial weights |
| VeRi-776, VehicleID, VERI-Wild, CityFlow, CO3D, KITTI | Non-commercial or research-only |
| VehiDE (Kaggle mirror) | Provenance unclear (description paraphrases CarDD, no authors) |
| State Farm, Carvana | Competition-only rules |
