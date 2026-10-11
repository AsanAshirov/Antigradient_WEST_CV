import { useRef } from "react";
import { Film } from "lucide-react";

export function PipelineFilm({ lang = "en" }: { lang?: "en" | "ru" }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="pipeline-film-section" id="demo-video">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Film size={14} /> {lang === "ru" ? "ДЕМОНСТРАЦИЯ КОНВЕЙЕРА" : "PIPELINE DEMONSTRATION"}
          </span>
          <h2>
            {lang === "ru" ? "Как CarPrint принимает решение" : "How CarPrint Reaches a Decision"}
            <br />
            <span className="muted">
              {lang === "ru" ? "25 секунд от первого кадра до сметы" : "25 seconds from initial capture to signed audit"}
            </span>
          </h2>
        </div>
        <p>
          {lang === "ru"
            ? "Видео отрендерено нашим конвейером из реальных фото: ключевые точки на силуэте автомобиля, совмещение двух съёмок одной машины, 4 000 сценариев Монте-Карло и цепочка паспорта."
            : "Video generated directly by our pipeline: real vehicle silhouette keypoints, multi-temporal image registration, 4,000 Monte Carlo estimate scenarios, and cryptographic passport chaining."}
        </p>
      </div>

      <div className="pipeline-player-card">
        <div className="video-viewport">
          <video
            ref={videoRef}
            src="/media/film.mp4"
            poster="/images/film_poster.jpg"
            playsInline
            controls
            className="film-video-element"
            aria-label={lang === "ru" ? "Видео конвейера CarPrint" : "CarPrint pipeline demonstration film"}
          />
        </div>

        <div className="pipeline-steps-grid">
          <div className="pipeline-step-item">
            <span className="step-num mono">01</span>
            <strong>{lang === "ru" ? "Съёмка по протоколу" : "Protocol Capture"}</strong>
            <p>
              {lang === "ru"
                ? "8 ракурсов обхода и динамический вызов сервера (nonce). Старое фото не подсунуть."
                : "8 standard angles + dynamic server nonce challenge. Prevents spoofing recycled photos."}
            </p>
          </div>

          <div className="pipeline-step-item">
            <span className="step-num mono">02</span>
            <strong>{lang === "ru" ? "Гейт качества" : "Quality Gate"}</strong>
            <p>
              {lang === "ru"
                ? "Контроль резкости (Лапласиан), экспозиции и бликов. Плохой кадр переснимают сразу."
                : "Real-time Laplacian sharpness, exposure, and glare rejection before processing."}
            </p>
          </div>

          <div className="pipeline-step-item">
            <span className="step-num mono">03</span>
            <strong>{lang === "ru" ? "Идентификация (K=8)" : "Cohort Verification"}</strong>
            <p>
              {lang === "ru"
                ? "ALIKED + LightGlue с вычитанием дизайна когорты. Ищем только уникальные метки."
                : "ALIKED + LightGlue with cohort design downweighting. Only micro-scars vote."}
            </p>
          </div>

          <div className="pipeline-step-item">
            <span className="step-num mono">04</span>
            <strong>{lang === "ru" ? "Дельта повреждений" : "Damage Delta Timeline"}</strong>
            <p>
              {lang === "ru"
                ? "Сегментация RF-DETR-Seg: было раньше, новое, отремонтировано, скрыто."
                : "Historical vs new surface anomalies classified by panel zone and severity."}
            </p>
          </div>

          <div className="pipeline-step-item">
            <span className="step-num mono">05</span>
            <strong>{lang === "ru" ? "Смета Монте-Карло" : "Monte Carlo Estimate"}</strong>
            <p>
              {lang === "ru"
                ? "4 000 сценариев с тарифами Ташкента. Честный разброс P10–P90 и P(замена)."
                : "P10–P50–P90 empirical cost distribution calibrated on local dealer repair orders."}
            </p>
          </div>

          <div className="pipeline-step-item">
            <span className="step-num mono">06</span>
            <strong>{lang === "ru" ? "Хеш-паспорт Ed25519" : "Ed25519 Blockchain"}</strong>
            <p>
              {lang === "ru"
                ? "SHA-256 + Ed25519 подпись каждого акта. Задним числом документ не изменить."
                : "Immutable hash-chained passport entry per vehicle inspection with tamper-proof signatures."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
