"""Kaggle job: HITL Car Parts & Damages (CC0, Supervisely polygons) -> COCO -> RF-DETR-Seg (Apache-2.0) -> ONNX.

TASK is substituted per kernel ("damage" or "parts"). On Kaggle the "Car damages dataset" folder
holds PART labels and "Car parts dataset" holds DAMAGE labels, so the subset is chosen by meta.json.
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

TASK = "__TASK__"
EPOCHS = {"damage": 40, "parts": 30}[TASK]
SEED = 42
VAL_FRACTION = 0.15
WORK = "/kaggle/working"
DS = f"{WORK}/ds_{TASK}"
OUT = f"{WORK}/out_{TASK}"

DAMAGE_MAP = {"Dent": "dent", "Scratch": "scratch", "Cracked": "crack", "Flaking": "paint_damage",
              "Paint chip": "paint_damage", "Corrosion": "corrosion", "Broken part": "broken_part",
              "Missing part": "missing_part"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def pip_install():
    for spec in ("rfdetr[train,onnx]==1.11.2", "rfdetr==1.11.2"):
        r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", spec, "onnx", "onnxsim", "pycocotools"])
        if r.returncode == 0:
            return
    raise RuntimeError("rfdetr install failed")


def find_subset():
    for meta in glob.glob("/kaggle/input/**/meta.json", recursive=True):
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
            fname = f"{i:05d}{os.path.splitext(img_path)[1].lower()}"
            os.symlink(img_path, f"{d}/{fname}")
            coco["images"].append({"id": i, "file_name": fname, "width": a["size"]["width"], "height": a["size"]["height"]})
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
    json.dump({"classes": names, "instances": stats, "seed": SEED}, open(f"{WORK}/dataset_{TASK}.json", "w"), indent=1)
    return names


def train(names):
    import rfdetr

    cls_name = {"damage": "RFDETRSegMedium", "parts": "RFDETRSegSmall"}[TASK]
    Model = getattr(rfdetr, cls_name, None) or getattr(rfdetr, "RFDETRSegPreview")
    log("model", Model.__name__, "rfdetr", getattr(rfdetr, "__version__", "?"))
    model = Model()
    kw = dict(dataset_dir=DS, epochs=EPOCHS, batch_size=4, grad_accum_steps=4, lr=1e-4, output_dir=OUT)
    try:
        model.train(**kw, early_stopping=True, early_stopping_patience=10)
    except TypeError:
        model.train(**kw)
    try:
        model.export(output_dir=OUT)
    except Exception as e:  # keep the .pth even if ONNX export fails
        log("export failed:", repr(e))
    json.dump({"task": TASK, "model": Model.__name__, "classes": names}, open(f"{OUT}/model_info.json", "w"), indent=1)


if __name__ == "__main__":
    t0 = time.time()
    pip_install()
    names = build_dataset()
    train(names)
    for f in glob.glob(f"{OUT}/**/*", recursive=True):
        log("artifact", f, os.path.getsize(f) if os.path.isfile(f) else "")
    shutil.rmtree(DS, ignore_errors=True)
    log(f"done in {(time.time() - t0) / 60:.1f} min")
