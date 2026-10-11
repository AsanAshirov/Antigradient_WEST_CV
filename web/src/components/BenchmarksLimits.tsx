import { AlertTriangle, Award, CheckCircle } from "lucide-react";

export function BenchmarksLimits({ lang = "en" }: { lang?: "en" | "ru" }) {
  const benchmarkRows = [
    {
      slice: lang === "ru" ? "Разные машины одной модели" : "Distinct cars of same model (Cobalt twins)",
      n: "200",
      res: lang === "ru" ? "0 ложных SAME" : "0 false SAME",
      bound: "≤ 1.5%",
    },
    {
      slice: lang === "ru" ? "Разные модели кузова" : "Distinct vehicle models",
      n: "200",
      res: lang === "ru" ? "0 ложных SAME" : "0 false SAME",
      bound: "≤ 1.5%",
    },
    {
      slice: lang === "ru" ? "Та же машина, повторная съёмка" : "Same vehicle, follow-up inspection",
      n: "25",
      res: lang === "ru" ? "0 ложных DIFFERENT" : "0 false DIFFERENT",
      bound: "≤ 11%",
    },
    {
      slice: lang === "ru" ? "Автоматический вердикт SAME" : "Autonomous SAME classification",
      n: "25",
      res: lang === "ru" ? "1 из 25 (остальные REVIEW)" : "1 of 25 (rest escalated to REVIEW)",
      bound: "—",
    },
    {
      slice: lang === "ru" ? "Время инспекции (8 кадров, T4)" : "Processing latency (8 frames, T4 GPU)",
      n: "—",
      res: lang === "ru" ? "≈ 2.7 с" : "≈ 2.7 s",
      bound: "—",
    },
  ];

  const failureCases = [
    {
      case: lang === "ru" ? "Две новые одинаковые машины без отметин" : "Brand new identical cars without unique marks",
      behavior: lang === "ru" ? "REVIEW + сверка VIN" : "Escalated to REVIEW with mandatory VIN verification",
      reason: lang === "ru" ? "Индивидуальных улик нет — система не имеет права угадывать." : "Zero individual micro-scars exist; machine cannot invent probabilistic claims.",
    },
    {
      case: lang === "ru" ? "Снимки с разных несоответствующих сторон" : "Mismatched viewpoint angles between inspections",
      behavior: lang === "ru" ? "RECAPTURE: «Снимите тот же ракурс»" : "Prompts inspector to capture matching pose",
      reason: lang === "ru" ? "Невозможно сопоставить проективные плоскости без общего поля зрения." : "Planar zones do not overlap; strictly prevented by 8-shot protocol guide.",
    },
    {
      case: lang === "ru" ? "Ночь, дождь, сильный засвет от фонарей" : "Nighttime, heavy rain, or blinding optical glare",
      behavior: lang === "ru" ? "Гейт качества отклоняет кадр на месте" : "Quality gate triggers immediate camera recapture",
      reason: lang === "ru" ? "Лапласиан резкости и порог насыщенности отсекают нечитаемые снимки." : "Laplacian variance and saturation ratio reject compromised evidence.",
    },
    {
      case: lang === "ru" ? "Модель без когорты в банке данных" : "Vehicle model lacking baseline cohort data",
      behavior: lang === "ru" ? "Автоматический SAME отключен" : "Autonomous SAME disabled; manual confirmation required",
      reason: lang === "ru" ? "Без K ≥ 4 машин одной модели невозможно вычесть общий дизайн." : "Shared factory design cannot be statistically downweighted without K ≥ 4 samples.",
    },
  ];

  return (
    <div className="benchmarks-limits-section" id="benchmarks">
      <div className="partner-banner-card">
        <div className="partner-eyebrow">
          <Award size={15} />
          <span>WEST HACKATHON 2026 · COMPUTER VISION TRACK</span>
        </div>
        <h3>
          {lang === "ru"
            ? "Партнёры трека автомобильной инспекции и безопасности"
            : "Industry Partners: Automotive Inspection & Road Safety Track"}
        </h3>
        <div className="partner-badges-row">
          <div className="partner-badge">
            <strong>TOYOTA</strong>
            <span>Royal Motors</span>
          </div>
          <div className="partner-badge">
            <strong>BYD</strong>
            <span>Royal Motors</span>
          </div>
          <div className="partner-badge">
            <strong>DUCATI</strong>
            <span>Tashkent Hub</span>
          </div>
        </div>
      </div>

      <div className="benchmarks-grid">
        {/* Verification Numbers */}
        <div className="benchmarks-card">
          <div className="card-top-title">
            <CheckCircle size={18} />
            <h4>{lang === "ru" ? "Замороженный тестовый протокол v1" : "Frozen Benchmark Evaluation v1"}</h4>
          </div>
          <p className="card-subtitle">
            {lang === "ru"
              ? "Пороги алгоритма не подгонялись под тест. Доверительный интервал Клоппера–Пирсона (95%)."
              : "Zero test-set tuning. Strict Clopper–Pearson 95% confidence bounds across all models."}
          </p>

          <div className="benchmarks-table-wrapper">
            <table className="benchmarks-table">
              <thead>
                <tr>
                  <th>{lang === "ru" ? "Тестовый срез" : "Evaluation Slice"}</th>
                  <th>{lang === "ru" ? "Пар" : "Pairs"}</th>
                  <th>{lang === "ru" ? "Результат" : "Finding"}</th>
                  <th>{lang === "ru" ? "Верхняя грань 95%" : "95% Upper Bound"}</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.slice}</td>
                    <td className="mono">{r.n}</td>
                    <td><strong>{r.res}</strong></td>
                    <td className="mono">{r.bound}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Known Failure Boundaries */}
        <div className="limits-card" id="limits">
          <div className="card-top-title alert-title">
            <AlertTriangle size={18} />
            <h4>{lang === "ru" ? "Честные границы применимости (Отказы)" : "Transparent AI Operating Limits"}</h4>
          </div>
          <p className="card-subtitle">
            {lang === "ru"
              ? "Инженерный аудит: как система реагирует на нештатные ситуации без вымышленных утверждений."
              : "Engineering failure safety: how the system fails safely without hallucinations."}
          </p>

          <div className="failure-cases-list">
            {failureCases.map((f, i) => (
              <div key={i} className="failure-case-item">
                <div className="case-trigger">
                  <span className="dot-marker" />
                  <strong>{f.case}</strong>
                </div>
                <div className="case-response mono">
                  <span>→ {f.behavior}</span>
                </div>
                <div className="case-reason">
                  <small>{f.reason}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
