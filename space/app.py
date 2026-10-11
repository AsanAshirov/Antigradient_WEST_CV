"""CarPrint live demo and API (Gradio, Hugging Face Spaces).

Three endpoints, each callable from the UI or from a website with @gradio/client (see space/INTEGRATION.md):
  /damage   photos -> damage segmentation, size, repair range (RF-DETR-Seg, 28 epochs, HITL CC0)
  /video    video  -> sharpest key frames -> the same damage analysis per frame
  /compare  reference photos + current photos -> same car? (ALIKED + LightGlue + a-contrario test), what is new
The code is the repository's own (carprint/, api/main.py); this file only adapts inputs and outputs.

Device: CPU by default. On ZeroGPU every endpoint first tries @spaces.GPU: inside the GPU worker (a fork of this
process) the CPU models are moved to CUDA; if the visitor's ZeroGPU quota is used up or no GPU is free, the same
request runs on the CPU here, so it always gets an answer. DEMO_CPU=1 forces the CPU even on ZeroGPU.
"""
import os

try:  # ZeroGPU: `spaces` must be imported before torch
    import spaces
except ImportError:
    spaces = None

ZERO_GPU = (spaces is not None and os.environ.get("SPACES_ZERO_GPU", "").lower() in ("1", "t", "true")
            and os.environ.get("DEMO_CPU") != "1")

import json  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
import uuid  # noqa: E402
from datetime import timedelta  # noqa: E402
from pathlib import Path  # noqa: E402

import functools  # noqa: E402
import threading  # noqa: E402

import cv2  # noqa: E402
import gradio as gr  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402

if ZERO_GPU or not torch.cuda.is_available():  # on ZeroGPU the main process must never touch CUDA
    os.environ["CARPRINT_DEVICE"] = "cpu"
os.environ.setdefault("CARPRINT_WARM", "")

import api.main as M  # noqa: E402
from carprint.damage import segmenter  # noqa: E402
from carprint.identity import features, subject  # noqa: E402

ROOT = Path(__file__).resolve().parent
EXAMPLES = ROOT / "examples"
MAX_PHOTOS = 8
MAX_VIDEO_S = 90
VIDEO_FRAMES = 6
DEVICE = "ZeroGPU" if ZERO_GPU else ("GPU" if torch.cuda.is_available() else "CPU")
RUN = {"device": "CPU" if os.environ.get("CARPRINT_DEVICE") == "cpu" else DEVICE}  # where this process computes

RU = {"broken_part": "поломка детали", "corrosion": "коррозия", "crack": "трещина", "dent": "вмятина",
      "missing_part": "нет детали", "paint_damage": "повреждение ЛКП", "scratch": "царапина"}
PART_RU = {"front_bumper": "передний бампер", "back_bumper": "задний бампер", "hood": "капот", "trunk": "крышка багажника",
           "roof": "крыша", "front_door": "передняя дверь", "back_door": "задняя дверь", "fender": "переднее крыло",
           "quarter_panel": "заднее крыло", "rocker_panel": "порог", "windshield": "лобовое стекло",
           "back_windshield": "заднее стекло", "front_window": "переднее боковое стекло",
           "back_window": "заднее боковое стекло", "headlight": "фара", "tail_light": "задний фонарь",
           "mirror": "зеркало", "grille": "решётка", "front_wheel": "переднее колесо", "back_wheel": "заднее колесо",
           "license_plate": "номер", "unknown_part": "деталь не определена"}
OP_RU = {"polish": "полировка", "spot": "локальный ремонт", "glass_chip": "ремонт скола", "pdr": "PDR без покраски",
         "wheel_repair": "ремонт диска", "plastic_repair": "ремонт пластика", "repair_paint": "ремонт с покраской",
         "replace": "замена"}


def _part(key: str | None) -> str:
    """'left_back_door@frm_x' -> 'задняя дверь (левая)'."""
    if not key:
        return PART_RU["unknown_part"]
    key = key.split("@", 1)[0]
    side = "левая" if key.startswith("left_") else "правая" if key.startswith("right_") else ""
    base = key.split("_", 1)[1] if side else key
    name = PART_RU.get(base, base.replace("_", " "))
    return f"{name} ({side})" if side else name


VERDICT = {"SAME": "ТА ЖЕ МАШИНА", "DIFFERENT": "ДРУГАЯ МАШИНА", "REVIEW": "НУЖНА ПРОВЕРКА ЧЕЛОВЕКОМ",
           "RECAPTURE": "ПЕРЕСНИМИТЕ"}
STATUS = {"newly_detected": "новое", "previously_recorded": "было раньше", "previously_seen_now_absent": "исчезло",
          "insufficient_evidence": "не видно"}

# Load every model now, not in the first request (on ZeroGPU the CUDA move is deferred to the GPU call).
t0 = time.time()
DAMAGE_MODEL = segmenter.load("damage", M.MODELS)
subject._detector()
features._get(2048)
PARTS_MODEL = segmenter.load("parts", M.MODELS)
print(f"[carprint] models ready on {RUN['device']} ({DEVICE} host) in {time.time() - t0:.1f} s; damage model: "
      f"{DAMAGE_MODEL.name if DAMAGE_MODEL else 'missing'}; parts model: {PARTS_MODEL.name if PARTS_MODEL else 'missing'}",
      flush=True)


def _warm(models: list[str]):
    """Same-model cohort banks for the first comparisons (~40 s per model on a CPU). On ZeroGPU the models only run
    inside a GPU call, so there the first comparison of a model builds its bank."""
    for m in models:
        try:
            with M.compute_lock:
                M.cohort_for(m)
            print(f"[carprint] cohort ready: {m}", flush=True)
        except Exception as e:  # a missing bank only disables automatic SAME for that model
            print(f"[carprint] cohort warm-up failed for {m}: {e!r}", flush=True)


threading.Thread(target=_warm, args=(["matiz", "cobalt"],), daemon=True).start()


def _rfdetr_to(inst, dev):
    ctx = getattr(inst, "model", None)  # RFDETR.model is a ModelContext: .model (nn.Module) and .device
    if ctx is not None and hasattr(ctx, "device"):
        if getattr(ctx, "model", None) is not None:
            ctx.model.to(dev)
        ctx.device = dev


def _gpu_worker_setup():
    """Runs first inside the ZeroGPU worker: fresh locks (a lock held by the warm-up thread at fork time would never be
    released in the child) and every model moved to CUDA. The parent's CPU models are untouched."""
    M.compute_lock = threading.Lock()
    M.ledger._lock = threading.Lock()
    features._lock = threading.Lock()
    subject._lock = threading.Lock()
    dev = torch.device("cuda")
    os.environ["CARPRINT_DEVICE"] = "cuda"
    RUN["device"] = f"ZeroGPU ({torch.cuda.get_device_name(0)})"
    for seg in (DAMAGE_MODEL, PARTS_MODEL):
        if seg is not None:
            seg._lock = threading.Lock()
            _rfdetr_to(seg.model, dev)
    det = subject._model.get("det")
    if det:
        _rfdetr_to(det[0], dev)
    for k, m in list(features._models.items()):
        features._models[k] = m.to(dev)


def _with_zero_gpu(cpu_fn, seconds):
    """Endpoint = GPU attempt, then the CPU on any ZeroGPU failure (quota, no free GPU, worker error)."""
    if not ZERO_GPU:
        return cpu_fn

    def on_gpu(*args):
        _gpu_worker_setup()
        return cpu_fn(*args)

    on_gpu.__name__ = on_gpu.__qualname__ = f"{cpu_fn.__name__}_on_gpu"
    gpu_fn = spaces.GPU(duration=seconds)(on_gpu)

    @functools.wraps(cpu_fn)
    def endpoint(*args):
        try:
            return gpu_fn(*args)
        except gr.Error as e:
            if any(w in str(e) for w in ("Загрузите", "Нужны", "Видео длиннее", "Не удалось прочитать")):
                raise  # the visitor's input, not the GPU
            print(f"[carprint] ZeroGPU unavailable ({str(e)[:160]}); answering on the CPU", flush=True)
        except Exception as e:
            print(f"[carprint] ZeroGPU failed ({type(e).__name__}: {str(e)[:160]}); answering on the CPU", flush=True)
        return cpu_fn(*args)

    return endpoint


def _paths(files) -> list[str]:
    if not files:
        return []
    out = []
    for f in files if isinstance(files, list) else [files]:
        out.append(f if isinstance(f, str) else getattr(f, "name", None) or f.get("path"))
    return [p for p in out if p]


def _inspection(model: str) -> "M.Inspection":
    ins = M.Inspection(f"ins_{uuid.uuid4().hex[:16]}", f"veh_{uuid.uuid4().hex[:24]}", "owner", "demo", "",
                       M.now() + timedelta(hours=2), (model or "").strip().lower())
    M.INSPECTIONS[ins.inspection_id] = ins
    return ins


def _artifact(url: str | None) -> str | None:
    return str(M.ARTIFACTS / url.rsplit("/", 1)[-1]) if url else None


def _size(d: dict) -> str:
    s = d.get("size") or {}
    if s.get("metric") and s.get("length_mm"):
        return f"{s['length_mm'] / 10:.0f} см"
    if s.get("metric") and s.get("area_cm2"):
        return f"{s['area_cm2']:.0f} см²"
    return "—"


def _rows(frames: list[dict], labels: list[str]) -> list[list]:
    rows = []
    for label, f in zip(labels, frames):
        for d in f["damages"]:
            rows.append([label, RU.get(d["class"], d["class"]), _part(d["part"]), _size(d),
                         f"{d['score']:.0%}", "авто" if d["status"] == "auto" else "проверить мастеру"])
    return rows


def _money(v: float) -> str:
    return f"{v / 1e6:.2f} млн сум".replace(".", ",")


def _cost_md(cost: dict | None, title: str) -> str:
    if not cost:
        return f"**{title}:** повреждений для сметы нет."
    lines = [f"**{title}** · медиана **{_money(cost['p50'])}** (≈ ${cost['usd']['p50']}), "
             f"диапазон P10–P90: {_money(cost['p10'])} – {_money(cost['p90'])}"]
    for p in cost.get("parts", []):
        ops = sorted(((k, v) for k, v in p["operation_probs"].items() if k != "none"), key=lambda t: -t[1])[:2]
        lines.append(f"- {_part(p['part_key'])}: " + ", ".join(f"{OP_RU.get(k, k)} {v:.0%}" for k, v in ops)
                     + f" · P50 {_money(p['cost_p50'])}")
    lines.append(f"\n_{cost.get('note_ru', '')}_")
    return "\n".join(lines)


def _clean(frames: list[dict]) -> list[dict]:
    keep = ("frame_id", "quality", "damages", "scale")
    return [{k: f.get(k) for k in keep} for f in frames]


def _analyze(ins) -> list[dict]:
    with M.compute_lock:
        return [M.analyze_frame(sf) for sf in ins.frames]


def damage(photos, model="cobalt"):
    paths = _paths(photos)[:MAX_PHOTOS]
    if not paths:
        raise gr.Error("Загрузите хотя бы одно фото машины.")
    t = time.time()
    ins = _inspection(model)
    for p in paths:
        M._ingest(ins, Path(p).read_bytes(), "extra", "gallery")
    frames = _analyze(ins)
    cost = M.inspection_cost(ins.frames, ins.model_hint)
    labels = [f"фото {i}" for i in range(1, len(frames) + 1)]
    gallery = [(_artifact(f["overlay_url"]), f"{lab}: находок {len(f['damages'])}") for lab, f in zip(labels, frames)
               if f.get("overlay_url")]
    result = {"device": RUN["device"], "latency_ms": round((time.time() - t) * 1000), "threshold": M.DAMAGE_SCORE,
              "frames": _clean(frames), "cost_estimate": cost}
    return gallery, _rows(frames, labels), _cost_md(cost, "Ремонт всех видимых повреждений"), result


def _key_frames(path: str, n: int) -> tuple[list[tuple[float, np.ndarray]], float]:
    """The sharpest frame of each of n equal segments (decoded every ~0.25 s)."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if total > 0 else 0.0
    if duration > MAX_VIDEO_S:
        cap.release()
        raise gr.Error(f"Видео длиннее {MAX_VIDEO_S} с: обрежьте до обхода машины.")
    step = max(1, int(round(fps / 4)))
    cands, i = [], 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, bgr = cap.retrieve()
            if ok:
                h, w = bgr.shape[:2]
                s = min(1.0, 1280 / max(h, w))
                if s < 1.0:
                    bgr = cv2.resize(bgr, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
                sharp = cv2.Laplacian(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()
                cands.append((i / fps, sharp, bgr))
        i += 1
    cap.release()
    if not cands:
        raise gr.Error("Не удалось прочитать видео (нужен MP4/MOV/WebM).")
    duration = duration or cands[-1][0]
    picks = []
    for k in range(n):
        lo, hi = duration * k / n, duration * (k + 1) / n
        seg = [c for c in cands if lo <= c[0] < hi] or ([cands[-1]] if k == n - 1 else [])
        if seg:
            ts, _, bgr = max(seg, key=lambda c: c[1])
            picks.append((ts, bgr))
    return picks, duration


def video(clip, model="cobalt"):
    path = _paths(clip)[0] if _paths(clip) else None
    if not path:
        raise gr.Error("Загрузите видео обхода машины (до 90 с).")
    t = time.time()
    picks, duration = _key_frames(path, VIDEO_FRAMES)
    ins = _inspection(model)
    for _, bgr in picks:
        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        M._ingest(ins, buf.tobytes(), "extra", "camera")
    frames = _analyze(ins)
    # Neighbouring key frames show the same damage, so their costs must not be added up: the range is that of the
    # most damaged view (a lower bound for a walk-around that shows several sides).
    per_frame = [(M.inspection_cost([sf], ins.model_hint), ts) for sf, (ts, _) in zip(ins.frames, picks)]
    cost, worst_ts = max(((c, ts) for c, ts in per_frame if c), key=lambda x: x[0]["p50"], default=(None, None))
    labels = [f"{ts:.1f} с" for ts, _ in picks]
    gallery = [(_artifact(f["overlay_url"]), f"{lab}: находок {len(f['damages'])}") for lab, f in zip(labels, frames)
               if f.get("overlay_url")]
    result = {"device": RUN["device"], "latency_ms": round((time.time() - t) * 1000), "duration_s": round(duration, 1),
              "key_frames_s": [round(ts, 2) for ts, _ in picks], "frames": _clean(frames), "cost_estimate": cost,
              "cost_frame_s": worst_ts, "note": "cost_estimate is the range of the most damaged key frame: neighbouring "
              "frames show the same damage and are not added up."}
    title = f"Ремонт по самому повреждённому кадру ({worst_ts:.1f} с)" if worst_ts is not None else "Ремонт"
    return gallery, _rows(frames, labels), _cost_md(cost, title), result


def compare(reference, current, model="cobalt"):
    ref_paths, cur_paths = _paths(reference)[:MAX_PHOTOS], _paths(current)[:MAX_PHOTOS]
    if not ref_paths or not cur_paths:
        raise gr.Error("Нужны фото эталона (прошлый визит) и текущие фото.")
    t = time.time()
    ins_a, ins_b = _inspection(model), _inspection(model)
    for ins, paths in ((ins_a, ref_paths), (ins_b, cur_paths)):
        for p in paths:
            M._ingest(ins, Path(p).read_bytes(), "extra", "gallery")
    res = M._verify(ins_a, ins_b)
    _analyze(ins_a)
    frames_b = _analyze(ins_b)
    ev = res.get("evidence") or []
    match_img = _artifact(ev[0].get("match_viz_url")) if ev else None
    verdict = (f"## {VERDICT.get(res['decision'], res['decision'])}\n"
               f"Совпавших ячеек с меткой: **{ev[0].get('congruent_cells', 0) if ev else 0}** (нужно ≥ 6) · "
               f"когорта той же модели: {res.get('cohort_size', 0)} машин\n\n" +
               "\n".join(f"- {r}" for r in res.get("reasons_ru", [])))
    timeline = [[STATUS.get(x["status"], x["status"]), RU.get(x["class"], x["class"]), _part(x["part"]),
                 f"{x['score']:.0%}" if x.get("score") is not None else "—"] for x in res.get("damage_timeline", [])]
    result = {"device": RUN["device"], "latency_ms": round((time.time() - t) * 1000),
              **{k: res.get(k) for k in ("decision", "score_raw", "reasons_ru", "reasons_en", "cohort_size",
                                          "damage_timeline", "cost_estimate_new", "integrity")},
              "evidence": [{k: e.get(k) for k in ("slot", "congruent_cells", "inliers", "distinct_inliers", "log10_nfa")}
                           for e in ev], "current_frames": _clean(frames_b)}
    return verdict, match_img, timeline, _cost_md(res.get("cost_estimate_new"), "Ремонт нового с прошлого визита"), result


# GPU seconds requested from ZeroGPU per call (admission needs this much of the visitor's quota): small on purpose.
damage_endpoint = _with_zero_gpu(damage, 30)
video_endpoint = _with_zero_gpu(video, 40)
compare_endpoint = _with_zero_gpu(compare, 45)


def _ex(name: str) -> str:
    return str(EXAMPLES / name)


DAMAGE_EXAMPLES = [[[_ex(f"damage/{n}.jpg")], "cobalt"] for n in
                   ("prius_rear_quarter", "peugeot_rear", "megane_quarter_dent", "micra_front_dent", "touareg_glass",
                    "rx8_hood") if (EXAMPLES / f"damage/{n}.jpg").exists()]
PAIR_EXAMPLE = [[[_ex("same_car/visit_1.jpg")], [_ex("same_car/visit_2.jpg")], "matiz"]] \
    if (EXAMPLES / "same_car/visit_1.jpg").exists() else []
MODELS_LIST = ["cobalt", "nexia", "gentra", "spark", "matiz", "damas", "lacetti", "camry", "song_plus"]

INTRO = f"""# CarPrint — проверка машины по фото
Команда **Antigradient** · WEST Hackathon 2026 · трек Computer Vision. Модели работают на этом сервере ({DEVICE}).
**Повреждения** — фото или видео обхода: сегментация повреждений, размер, ориентир ремонта (P10–P50–P90).
**Та же машина?** — фото прошлого визита и сегодняшние: доказательство, что машина та же, и что появилось нового.
Примеры внизу каждой вкладки — фото битых машин, которые модель не видела при обучении (HITL, CC0)."""

with gr.Blocks(title="CarPrint · Antigradient") as demo:
    gr.Markdown(INTRO)
    with gr.Tab("Повреждения: фото"):
        with gr.Row():
            with gr.Column():
                d_in = gr.File(label=f"Фото машины (до {MAX_PHOTOS})", file_count="multiple", file_types=["image"])
                d_model = gr.Dropdown(MODELS_LIST, value="cobalt", label="Модель (для цен и размеров)")
                d_btn = gr.Button("Найти повреждения", variant="primary")
            with gr.Column():
                d_gal = gr.Gallery(label="Найденные повреждения", columns=2, height=420)
        d_cost = gr.Markdown()
        d_tab = gr.Dataframe(headers=["кадр", "повреждение", "деталь", "размер", "уверенность", "статус"],
                             label="Находки", wrap=True)
        d_json = gr.JSON(label="Ответ API (JSON)")
        d_btn.click(damage_endpoint, [d_in, d_model], [d_gal, d_tab, d_cost, d_json], api_name="damage", concurrency_limit=2)
        if DAMAGE_EXAMPLES:
            gr.Examples(DAMAGE_EXAMPLES, [d_in, d_model], label="Примеры: битые машины, которых модель не видела")
    with gr.Tab("Повреждения: видео"):
        with gr.Row():
            with gr.Column():
                v_in = gr.Video(label=f"Видео обхода машины (до {MAX_VIDEO_S} с)", sources=["upload"])
                v_model = gr.Dropdown(MODELS_LIST, value="cobalt", label="Модель")
                v_btn = gr.Button("Разобрать видео", variant="primary")
            with gr.Column():
                v_gal = gr.Gallery(label=f"{VIDEO_FRAMES} самых резких кадров", columns=2, height=420)
        v_cost = gr.Markdown()
        v_tab = gr.Dataframe(headers=["кадр", "повреждение", "деталь", "размер", "уверенность", "статус"],
                             label="Находки", wrap=True)
        v_json = gr.JSON(label="Ответ API (JSON)")
        v_btn.click(video_endpoint, [v_in, v_model], [v_gal, v_tab, v_cost, v_json], api_name="video", concurrency_limit=1)
    with gr.Tab("Та же машина?"):
        with gr.Row():
            c_ref = gr.File(label="Эталон: прошлый визит", file_count="multiple", file_types=["image"])
            c_cur = gr.File(label="Сегодня: тот же ракурс", file_count="multiple", file_types=["image"])
        c_model = gr.Dropdown(MODELS_LIST, value="matiz", label="Модель машины (для когорты)")
        c_btn = gr.Button("Сравнить", variant="primary")
        c_verdict = gr.Markdown()
        c_img = gr.Image(label="Совпадения: оранжевые — индивидуальные метки, серые — общий дизайн модели")
        c_tab = gr.Dataframe(headers=["статус", "повреждение", "деталь", "уверенность"], label="Что изменилось")
        c_cost = gr.Markdown()
        c_json = gr.JSON(label="Ответ API (JSON)")
        c_btn.click(compare_endpoint, [c_ref, c_cur, c_model], [c_verdict, c_img, c_tab, c_cost, c_json], api_name="compare",
                    concurrency_limit=1)
        if PAIR_EXAMPLE:
            gr.Examples(PAIR_EXAMPLE, [c_ref, c_cur, c_model], label="Пример: одна машина, два визита")
    gr.Markdown("API для сайта: `@gradio/client` → `client.predict('/damage', {photos: [handle_file(file)], model: 'cobalt'})`. "
                "Подробно — в INTEGRATION.md репозитория. Код: github.com/AsanAshirov/Antigradient_WEST_CV")

demo.queue(default_concurrency_limit=1, max_size=32)

if __name__ == "__main__":
    demo.launch(max_file_size="100mb", show_error=True, allowed_paths=[str(M.ARTIFACTS), str(EXAMPLES)])
