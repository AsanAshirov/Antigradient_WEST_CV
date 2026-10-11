"""HF Jobs training: HITL Car Parts & Damages (CC0) -> COCO -> RF-DETR-Seg (Apache-2.0) on one A100.

Same data handling as training/kaggle/train_seg.py (the Kaggle kernels did not finish within their 12 h limit).
Env: TASK=damage|parts, EPOCHS, KAGGLE_USERNAME/KAGGLE_KEY (secrets), HF_TOKEN (secret).
Outputs to the private dataset repo Azamaka/carprint-data under models/<task>/: model_info.json, the best checkpoint,
training logs (per-epoch COCO box and mask metrics on the held-out split) and the class statistics.
"""
import base64
import glob
import io
import json
import os
import random
import shutil
import subprocess
import sys
import time
import zlib

TASK = os.environ.get("TASK", "damage")
EPOCHS = int(os.environ.get("EPOCHS", {"damage": 30, "parts": 24}[TASK]))
SEED = 42
VAL_FRACTION = 0.15
MAX_SIDE = 1280
DATA = "/data/hitl"
WORK = "/work"
DS = f"{WORK}/ds_{TASK}"
OUT = f"{WORK}/out_{TASK}"
REPO = "Azamaka/carprint-data"

DAMAGE_MAP = {"Dent": "dent", "Scratch": "scratch", "Cracked": "crack", "Flaking": "paint_damage",
              "Paint chip": "paint_damage", "Corrosion": "corrosion", "Broken part": "broken_part",
              "Missing part": "missing_part"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def sh(cmd):
    log("$", cmd if "KAGGLE" not in cmd else "<kaggle command>")
    subprocess.run(cmd, shell=True, check=True)


def download():
    os.makedirs(DATA, exist_ok=True)
    sh(f"kaggle datasets download -d humansintheloop/car-parts-and-car-damages -p {DATA} --unzip -q")
    log("downloaded", sum(len(f) for _, _, f in os.walk(DATA)), "files")


def find_subset():
    for meta in glob.glob(f"{DATA}/**/meta.json", recursive=True):
        classes = [c["title"] for c in json.load(open(meta))["classes"]]
        is_damage = "Scratch" in classes
        if (TASK == "damage") == is_damage:
            return os.path.dirname(meta), classes
    raise FileNotFoundError("subset meta.json not found")


def class_map(classes):
    if TASK == "damage":
        return DAMAGE_MAP
    return {c: c.lower().replace("-", "_").replace(" ", "_") for c in classes}


def bitmap_polygons(obj):
    import cv2
    import numpy as np
    from PIL import Image

    data = zlib.decompress(base64.b64decode(obj["bitmap"]["data"]))
    mask = np.array(Image.open(io.BytesIO(data)))
    mask = (mask[..., 3] if mask.ndim == 3 and mask.shape[2] == 4 else mask).astype(np.uint8) > 0
    ox, oy = obj["bitmap"]["origin"]
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [[(float(x + ox), float(y + oy)) for x, y in c.reshape(-1, 2)] for c in contours if len(c) >= 3]


def poly_area_bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    area = 0.5 * abs(sum(xs[i] * ys[i - 1] - xs[i - 1] * ys[i] for i in range(len(pts))))
    return area, [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]


def build_dataset():
    root, classes = find_subset()
    cmap = class_map(classes)
    names = sorted(set(cmap.values()))
    cat_id = {n: i + 1 for i, n in enumerate(names)}
    anns = sorted(glob.glob(f"{root}/**/ann/*.json", recursive=True))
    log(f"subset {root}: {len(anns)} annotation files, classes -> {names}")
    random.Random(SEED).shuffle(anns)
    n_val = max(1, int(len(anns) * VAL_FRACTION))
    splits = {"valid": anns[:n_val], "train": anns[n_val:]}
    splits["test"] = splits["valid"]
    stats = {}
    for split, files in splits.items():
        d = f"{DS}/{split}"
        os.makedirs(d, exist_ok=True)
        coco = {"images": [], "annotations": [],
                "categories": [{"id": 0, "name": TASK, "supercategory": "none"}] +
                              [{"id": cat_id[n], "name": n, "supercategory": TASK} for n in names]}
        aid = 0
        for i, af in enumerate(files):
            img_path = af.replace("/ann/", "/img/")[:-len(".json")]
            if not os.path.exists(img_path):
                continue
            a = json.load(open(af))
            # The originals are multi-megabyte PNGs up to ~3000 px; decoding them every epoch made the Kaggle runs
            # CPU-bound. Downscale once to <= MAX_SIDE JPEG and scale the polygons with the image.
            from PIL import Image

            im = Image.open(img_path).convert("RGB")
            s = min(1.0, MAX_SIDE / max(im.size))
            if s < 1.0:
                im = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
            fname = f"{i:05d}.jpg"
            im.save(f"{d}/{fname}", quality=92)
            coco["images"].append({"id": i, "file_name": fname, "width": im.size[0], "height": im.size[1]})
            for o in a["objects"]:
                name = cmap.get(o["classTitle"])
                if name is None:
                    continue
                if o["geometryType"] == "polygon":
                    polys = [[tuple(p) for p in o["points"]["exterior"]]]
                elif o["geometryType"] == "bitmap":
                    polys = bitmap_polygons(o)
                else:
                    continue
                for pts in polys:
                    if len(pts) < 3:
                        continue
                    pts = [(x * s, y * s) for x, y in pts]
                    area, bbox = poly_area_bbox(pts)
                    if area < 16:
                        continue
                    coco["annotations"].append({"id": aid, "image_id": i, "category_id": cat_id[name], "iscrowd": 0,
                                                "segmentation": [[c for p in pts for c in p]], "area": area, "bbox": bbox})
                    aid += 1
                    stats.setdefault(split, {}).setdefault(name, 0)
                    stats[split][name] += 1
        json.dump(coco, open(f"{d}/_annotations.coco.json", "w"))
        log(f"{split}: {len(coco['images'])} images, {aid} instances")
    os.makedirs(OUT, exist_ok=True)
    json.dump({"classes": names, "instances": stats, "seed": SEED, "val_fraction": VAL_FRACTION},
              open(f"{OUT}/dataset_{TASK}.json", "w"), indent=1)
    return names


def train(names):
    import rfdetr

    cls_name = {"damage": "RFDETRSegMedium", "parts": "RFDETRSegSmall"}[TASK]
    Model = getattr(rfdetr, cls_name)
    log("model", Model.__name__, "rfdetr", getattr(rfdetr, "__version__", "?"), "epochs", EPOCHS)
    model = Model()
    kw = dict(dataset_dir=DS, epochs=EPOCHS, batch_size=8, grad_accum_steps=2, lr=1e-4, output_dir=OUT)
    try:
        model.train(**kw, early_stopping=True, early_stopping_patience=8)
    except TypeError:
        model.train(**kw)
    json.dump({"task": TASK, "model": Model.__name__, "classes": names, "epochs": EPOCHS, "trained_on": "HF Jobs A100",
               "data": "HITL Car Parts & Damages, CC0 (Kaggle humansintheloop/car-parts-and-car-damages)"},
              open(f"{OUT}/model_info.json", "w"), indent=1)


def upload():
    from huggingface_hub import HfApi

    keep = f"{WORK}/upload_{TASK}"
    os.makedirs(keep, exist_ok=True)
    for f in glob.glob(f"{OUT}/*"):
        name = os.path.basename(f)
        big = name.endswith(".pth") and not name.startswith("checkpoint_best")
        if os.path.isfile(f) and not big:
            shutil.copy2(f, keep)
            log("keep", name, os.path.getsize(f))
    HfApi().upload_folder(folder_path=keep, repo_id=REPO, repo_type="dataset", path_in_repo=f"models/{TASK}",
                          commit_message=f"RF-DETR-Seg {TASK} trained on HITL")
    log("uploaded models/" + TASK)


if __name__ == "__main__":
    t0 = time.time()
    download()
    names = build_dataset()
    train(names)
    upload()
    log(f"done in {(time.time() - t0) / 60:.1f} min")
    sys.exit(0)
