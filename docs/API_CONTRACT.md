# CarPrint API — контракт для фронтенда (v0.1)

Базовый URL: `{API_BASE}/api/v1`. Все ответы — JSON (UTF-8), кроме картинок и PDF.
Статус: черновик, поля могут добавляться, но не переименовываться без согласования.

## Поток для сайта

```
1. POST /inspections            -> inspection_id, nonce, shot_plan
2. POST /inspections/{id}/frames (по одному кадру, multipart) -> quality, recapture_required
3. POST /inspections/{id}/analyze -> parts, damages
4. POST /verifications          -> SAME / DIFFERENT / REVIEW + damage timeline
5. POST /inspections/{id}/confirm -> запись паспорта (hash-chain)
6. GET  /vehicles/{vehicle_key}/timeline, GET /inspections/{id}/report.pdf
```

Быстрый режим для жюри (без регистрации осмотров): `POST /compare` — две пачки фото, один ответ.

---

## POST /inspections

Создаёт осмотр и выдаёт одноразовый `nonce` и план съёмки.

Запрос:
```json
{
  "vehicle_key": "optional-string",        // если машина уже есть в паспорте
  "vehicle_hint": {"make": "Chevrolet", "model": "Cobalt", "color": "white"},  // опционально
  "role": "dealer | insurer | owner",
  "type": "checkin | checkout | kasko | claim | tradein"
}
```
Ответ `201`:
```json
{
  "inspection_id": "ins_8f3a...",
  "vehicle_key": "veh_...",                 // создаётся, если не передан
  "nonce": "b64-string",                    // передавать с каждым кадром
  "expires_at": "2026-10-11T12:00:00Z",
  "shot_plan": [
    {"slot": "front", "instruction": "Перед целиком, 2-3 м", "required": true},
    {"slot": "front_left_45", "instruction": "Диагональ слева спереди", "required": true},
    {"slot": "left", "instruction": "Левый бок целиком", "required": true},
    {"slot": "rear_left_45", "instruction": "...", "required": true},
    {"slot": "rear", "instruction": "...", "required": true},
    {"slot": "rear_right_45", "instruction": "...", "required": true},
    {"slot": "right", "instruction": "...", "required": true},
    {"slot": "front_right_45", "instruction": "...", "required": true},
    {"slot": "wheel_fl", "instruction": "Левое переднее колесо крупно", "required": false},
    {"slot": "random_challenge", "instruction": "Покажите правое заднее колесо", "required": true}
  ]
}
```

## POST /inspections/{inspection_id}/frames

`multipart/form-data`:
| поле | тип | обяз. | описание |
|---|---|---|---|
| `file` | image/jpeg, image/png, image/heic | да | оригинал без пересжатия |
| `slot` | string | да | из `shot_plan` или `extra` |
| `nonce` | string | да | из `POST /inspections` |
| `capture_mode` | `camera` \| `gallery` | да | `camera` — снято через getUserMedia в сессии |
| `client_ts` | ISO-8601 | нет | время на устройстве |

Ответ `200`:
```json
{
  "frame_id": "frm_...",
  "sha256": "hex",
  "server_ts": "2026-10-10T19:02:11Z",
  "quality": {
    "ok": true,
    "blur": 182.4, "brightness": 0.47, "glare_ratio": 0.03, "car_area_ratio": 0.61,
    "issues": []                              // напр. ["blurry", "too_dark", "glare", "no_car"]
  },
  "recapture_required": false,
  "message_ru": "Кадр принят"
}
```

## POST /inspections/{inspection_id}/analyze

Запускает анализ всех кадров осмотра. Ответ `200` (синхронно, до ~10 с на CPU):
```json
{
  "inspection_id": "ins_...",
  "status": "PROCESSED | RECAPTURE_REQUIRED",
  "frames": [
    {
      "frame_id": "frm_...", "slot": "left",
      "privacy": {"plates_blurred": 1, "persons_blurred": 0},
      "parts": [{"part": "front_left_door", "score": 0.91, "bbox": [x, y, w, h]}],
      "damages": [
        {"damage_id": "dmg_...", "part": "front_left_door", "class": "scratch",
         "score": 0.78, "area_ratio": 0.012, "bbox": [x, y, w, h],
         "views_confirmed": 2, "status": "auto | needs_master"}
      ],
      "overlay_url": "/api/v1/artifacts/ovl_....jpg"
    }
  ]
}
```

Классы повреждений: `dent, scratch, crack, glass_shatter, lamp_broken, tire_flat, paint_damage, broken_part, missing_part, corrosion`. Класс `fake_damage` (блик/грязь/наклейка) наружу не отдаётся как повреждение.

## POST /verifications

Сравнивает текущий осмотр с эталонным: та же ли машина и что изменилось.

Запрос:
```json
{"reference_inspection_id": "ins_old", "current_inspection_id": "ins_new"}
```
Ответ `200`:
```json
{
  "verification_id": "ver_...",
  "decision": "SAME | DIFFERENT | REVIEW | RECAPTURE_REQUIRED",
  "score_raw": 0.0,                           // НЕ вероятность; инженерная оценка
  "reasons_ru": ["Совпали 3 независимые зоны: левый передний диск, левая дверь, капот"],
  "evidence": [
    {"part": "wheel_fl", "inliers": 64, "reproj_err_px": 1.8, "log10_nfa": -12.3,
     "distinctiveness": 0.7, "visible_ratio": 0.82, "match_viz_url": "/api/v1/artifacts/m_....jpg"}
  ],
  "damage_timeline": [
    {"damage_id": "dmg_...", "part": "front_left_door", "class": "scratch",
     "status": "previously_recorded | newly_detected | previously_seen_now_absent | insufficient_evidence",
     "first_seen_inspection_id": "ins_old", "before_url": "...", "after_url": "..."}
  ],
  "integrity": {
    "flags": ["gallery_upload", "duplicate_of:frm_..."],
    "level": "green | yellow | red"
  },
  "latency_ms": 2140
}
```

## POST /inspections/{inspection_id}/confirm

Приёмщик подтверждает/отклоняет находки, клиент подписывает. Создаётся запись паспорта.
```json
{
  "operator_id": "op_17",
  "findings": [{"damage_id": "dmg_...", "action": "confirm | reject", "comment": ""}],
  "customer_signed": true
}
```
Ответ `200`:
```json
{"record_id": "rec_...", "record_hash": "hex", "prev_hash": "hex", "signature": "ed25519-b64",
 "public_key_url": "/api/v1/passport/public-key"}
```

## GET /vehicles/{vehicle_key}/timeline
Список записей паспорта (новые сверху): `[{record_id, inspection_id, type, role, server_ts, damages_confirmed[], record_hash, prev_hash}]` и `"chain_valid": true`.

## GET /inspections/{inspection_id}/report.pdf
PDF-акт: фото с размытыми номерами, карта повреждений, хеши кадров, подпись записи.

## POST /compare (демо для жюри)
`multipart/form-data`: `images_a` (1..16 файлов), `images_b` (1..16 файлов).
Ответ — как у `POST /verifications` плюс `analysis_a`, `analysis_b` (как у `/analyze`).

## GET /metrics
Метрики на замороженном тест-наборе для панели на сайте:
```json
{"test_manifest_sha256": "...", "identity": {"n_pairs_same": 0, "n_pairs_diff": 0, "fmr": null, "fnmr": null, "fmr_upper95": null},
 "damage": {"per_class": {}}, "latency_ms": {"p50": null, "p95": null}, "generated_at": "..."}
```

## GET /health
`{"status": "ok", "models": {"parts": "v...", "damage": "v...", "matcher": "aliked+lightglue"}, "device": "cpu|cuda"}`

## Ошибки
`{"error": {"code": "NONCE_EXPIRED | BAD_IMAGE | NOT_FOUND | ...", "message_ru": "..."}}` с кодами 400/404/409/422/500.

## Приватность
Номера и лица размываются на сервере до сохранения производных изображений. Открытый номер и VIN не возвращаются в API; `vehicle_key` — HMAC-хеш.
