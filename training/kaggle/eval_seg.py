"""Kaggle job: evaluate a checkpoint from train_seg.py on the same held-out split (seed 42, 15 %), CPU is enough.

TASK is substituted per kernel. The training kernel is attached as a kernel source (its output holds model_info.json
and the best checkpoint). Inference mirrors carprint/damage/segmenter.py: 0-based class names, class-agnostic NMS 0.5.
Writes eval_<task>.json: COCO box and mask AP (overall and per class), precision and recall at the operating
thresholds, a reliability table, and an isotonic map "detector score -> P(the finding is real)" for the cost model.
"""
import base64
import glob
import io
import json
import os
import random
import subprocess
import sys
import time
import zlib

TASK = "__TASK__"
SEED = 42
VAL_FRACTION = 0.15
MAX_SIDE = 1024
WORK = "/kaggle/working"
DS = f"{WORK}/ds_{TASK}"
NMS_IOU = 0.5
REAL_IOU = 0.3  # class-agnostic mask IoU for "there is a damage here" (damage outlines are fuzzy)
THRESHOLDS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7]
BINS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01]

DAMAGE_MAP = {"Dent": "dent", "Scratch": "scratch", "Cracked": "crack", "Flaking": "paint_damage",
              "Paint chip": "paint_damage", "Corrosion": "corrosion", "Broken part": "broken_part",
              "Missing part": "missing_part"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def pip_install():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "rfdetr==1.11.2", "pycocotools"], check=True)


def find_subset():
    for meta in glob.glob("/kaggle/input/**/meta.json", recursive=True):
        classes = [c["title"] for c in json.load(open(meta))["classes"]]
        if (TASK == "damage") == ("Scratch" in classes):
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


def build_valid():
    """Exactly the validation split of train_seg.build_dataset (same shuffle, same downscale, same polygons)."""
    from PIL import Image

    root, classes = find_subset()
    cmap = class_map(classes)
    names = sorted(set(cmap.values()))
    cat_id = {n: i + 1 for i, n in enumerate(names)}
    anns = sorted(glob.glob(f"{root}/**/ann/*.json", recursive=True))
    random.Random(SEED).shuffle(anns)
    files = anns[:max(1, int(len(anns) * VAL_FRACTION))]
    d = f"{DS}/valid"
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
    path = f"{d}/_annotations.coco.json"
    json.dump(coco, open(path, "w"))
    log(f"valid: {len(coco['images'])} images, {aid} instances, classes {names}")
    return names, cat_id, path


def find_model():
    for p in glob.glob("/kaggle/input/**/model_info.json", recursive=True):
        info = json.load(open(p))
        if info.get("task") == TASK:
            d = os.path.dirname(p)
            for c in ("checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth"):
                if os.path.exists(f"{d}/{c}"):
                    return info, f"{d}/{c}"
    raise FileNotFoundError("no trained checkpoint attached")


def coco_eval(gt, results, iou_type, names, cat_id):
    from pycocotools.cocoeval import COCOeval

    if not results:
        return {"AP": 0.0, "AP50": 0.0, "per_class_AP50": {}}
    res = [dict(r) for r in results] if iou_type == "segm" else [{k: v for k, v in r.items() if k != "segmentation"}
                                                                  for r in results]
    dt = gt.loadRes(res)
    e = COCOeval(gt, dt, iou_type)
    e.evaluate()
    e.accumulate()
    e.summarize()
    prec = e.eval["precision"]  # [T, R, K, A, M]
    per = {}
    for k, cid in enumerate(e.params.catIds):
        n = next((n for n, c in cat_id.items() if c == cid), None)
        p = prec[0, :, k, 0, 2]
        if n is not None and (p > -1).any():
            per[n] = round(float(p[p > -1].mean()), 4)
    return {"AP": round(float(e.stats[0]), 4), "AP50": round(float(e.stats[1]), 4), "per_class_AP50": per}


def main():
    t0 = time.time()
    pip_install()
    names, cat_id, gt_path = build_valid()

    import numpy as np
    import rfdetr
    from PIL import Image
    from pycocotools import mask as mu
    from pycocotools.coco import COCO

    info, ckpt = find_model()
    classes = info["classes"]
    log("model", info["model"], ckpt, "classes", classes)
    model = getattr(rfdetr, info["model"])(pretrain_weights=ckpt)
    gt = COCO(gt_path)

    results, records, n_gt, secs = [], [], 0, []
    for im in gt.dataset["images"]:
        img = Image.open(f"{DS}/valid/{im['file_name']}").convert("RGB")
        t = time.time()
        det = model.predict(img, threshold=0.05)
        if len(det):
            det = det.with_nms(threshold=NMS_IOU, class_agnostic=True)
        secs.append(time.time() - t)
        pred_names = det.data.get("class_name") if getattr(det, "data", None) else None
        h, w = im["height"], im["width"]
        gts = gt.loadAnns(gt.getAnnIds(imgIds=[im["id"]]))
        gt_masks = [gt.annToMask(a).astype(bool) for a in gts]
        gt_cls = [a["category_id"] for a in gts]
        n_gt += len(gts)
        preds = []
        for k, (xyxy, conf, cid) in enumerate(zip(det.xyxy, det.confidence, det.class_id)):
            p = str(pred_names[k]) if pred_names is not None else None
            cls = p if p in classes else (classes[int(cid)] if 0 <= int(cid) < len(classes) else None)
            if cls is None or cls not in cat_id:
                continue
            x0, y0, x1, y1 = (float(v) for v in xyxy)
            if det.mask is not None:
                m = np.asarray(det.mask[k]).astype(bool)
            else:
                m = np.zeros((h, w), bool)
                m[int(y0):int(y1), int(x0):int(x1)] = True
            rle = mu.encode(np.asfortranarray(m.astype(np.uint8)))
            rle["counts"] = rle["counts"].decode()
            results.append({"image_id": im["id"], "category_id": cat_id[cls], "bbox": [x0, y0, x1 - x0, y1 - y0],
                            "score": float(conf), "segmentation": rle})
            preds.append((float(conf), cat_id[cls], m))
        # greedy matching in score order: class-agnostic (is there damage here) and class-aware (is it this class)
        used_any, used_cls = set(), set()
        for conf, c, m in sorted(preds, key=lambda t: -t[0]):
            ious = [float((m & g).sum()) / max(1.0, float((m | g).sum())) for g in gt_masks]
            real = max(((i, v) for i, v in enumerate(ious) if i not in used_any and v >= REAL_IOU),
                       key=lambda t: t[1], default=None)
            if real:
                used_any.add(real[0])
            same = max(((i, v) for i, v in enumerate(ious) if i not in used_cls and v >= 0.5 and gt_cls[i] == c),
                       key=lambda t: t[1], default=None)
            if same:
                used_cls.add(same[0])
            records.append({"score": round(conf, 4), "cls": next(n for n, i in cat_id.items() if i == c),
                            "real": bool(real), "correct": bool(same)})
    log(f"predicted {len(results)} instances on {len(secs)} images, {np.mean(secs):.2f} s/image")

    out = {"task": TASK, "model": info["model"], "checkpoint": os.path.basename(ckpt), "split": "valid (seed 42, 15%)",
           "images": len(secs), "gt_instances": n_gt, "seconds_per_image_cpu": round(float(np.mean(secs)), 3),
           "box": coco_eval(gt, results, "bbox", names, cat_id), "mask": coco_eval(gt, results, "segm", names, cat_id)}
    s = np.array([r["score"] for r in records])
    real = np.array([r["real"] for r in records])
    correct = np.array([r["correct"] for r in records])
    out["operating_points"] = [{"threshold": t, "detections": int((s >= t).sum()),
                                "precision_real": round(float(real[s >= t].mean()), 3) if (s >= t).any() else None,
                                "recall_real": round(float(real[s >= t].sum()) / max(1, n_gt), 3),
                                "precision_class": round(float(correct[s >= t].mean()), 3) if (s >= t).any() else None,
                                "recall_class": round(float(correct[s >= t].sum()) / max(1, n_gt), 3)}
                               for t in THRESHOLDS]
    out["reliability"] = [{"bin": [lo, min(hi, 1.0)], "n": int(((s >= lo) & (s < hi)).sum()),
                           "p_real": round(float(real[(s >= lo) & (s < hi)].mean()), 3) if ((s >= lo) & (s < hi)).any() else None}
                          for lo, hi in zip(BINS[:-1], BINS[1:])]
    try:
        from sklearn.isotonic import IsotonicRegression

        iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(s, real.astype(float))
        grid = [round(x, 2) for x in np.arange(0.05, 1.0001, 0.05)]
        out["calibration"] = {"method": "isotonic, class-agnostic, mask IoU >= %.1f" % REAL_IOU,
                              "x": grid, "y": [round(float(v), 4) for v in iso.predict(grid)]}
    except Exception as e:  # the AP numbers are still worth having
        out["calibration_error"] = repr(e)
    json.dump(out, open(f"{WORK}/eval_{TASK}.json", "w"), indent=1)
    json.dump(records, open(f"{WORK}/eval_{TASK}_records.json", "w"))
    log(json.dumps({k: out[k] for k in ("box", "mask")}, indent=1))
    log(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
