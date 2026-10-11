import { useState, useEffect } from "react";
import sampleCostData from "../data/sample_cost.json";
import { ShieldAlert, Wrench } from "lucide-react";

export interface CostPart {
  part_key: string;
  part: string;
  damages: number;
  likely_operation: string;
  operation_probs: Record<string, number>;
  p_replace: number;
  cost_p50: number;
  cost_p90: number;
  cost_mean: number;
  evidence: string[];
  variance_share: number;
}

export interface CostData {
  currency: string;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  usd: { p10: number; p50: number; p90: number };
  p_zero: number;
  parts: CostPart[];
}

const PART_NAMES: Record<string, { en: string; ru: string }> = {
  front_bumper: { en: "Front Bumper Fascia", ru: "Передний бампер" },
  back_bumper: { en: "Rear Bumper Cover", ru: "Задний бампер" },
  hood: { en: "Engine Bonnet / Hood", ru: "Капот" },
  left_front_door: { en: "Front Left Door Panel", ru: "Передняя левая дверь" },
  right_front_door: { en: "Front Right Door Panel", ru: "Передняя правая дверь" },
  left_fender: { en: "Front Left Fender Wing", ru: "Переднее левое крыло" },
  front_left_wheel: { en: "Front Left Alloy Wheel", ru: "Переднее левое колесо" },
};

const OP_NAMES: Record<string, { en: string; ru: string }> = {
  none: { en: "False detection (none)", ru: "Ложная находка" },
  polish: { en: "Surface polish", ru: "Полировка" },
  spot: { en: "SMART spot touch-up", ru: "Локальный ремонт" },
  glass_chip: { en: "Resin chip injection", ru: "Ремонт скола" },
  pdr: { en: "PDR (paintless dent removal)", ru: "PDR без покраски" },
  wheel_repair: { en: "Alloy wheel rim refurbishment", ru: "Ремонт диска" },
  plastic_repair: { en: "Plastic weld & reshaping", ru: "Ремонт пластика" },
  repair_paint: { en: "Panel repair & refinish paint", ru: "Ремонт с покраской" },
  replace: { en: "OEM Part replacement", ru: "Замена детали" },
};

export function formatMoney(val: number, currency: "UZS" | "USD", lang: "en" | "ru"): string {
  if (currency === "USD") {
    return `$${val.toLocaleString("en-US")}`;
  }
  return lang === "ru"
    ? `${val.toLocaleString("ru-RU")} сум`
    : `${val.toLocaleString("en-US")} UZS`;
}

export function CostCard({
  data: initialData = sampleCostData as unknown as CostData,
  lang = "en",
  selectedPartKey,
  detectedDamages = 0,
}: {
  data?: CostData;
  lang?: "en" | "ru";
  selectedPartKey?: string;
  detectedDamages?: number;
}) {
  const [data, setData] = useState<CostData>(initialData);
  const [currency, setCurrency] = useState<"UZS" | "USD">("UZS");
  const [selectedPart, setSelectedPart] = useState<string | null>(selectedPartKey || null);

  useEffect(() => {
    if (selectedPartKey) {
      setSelectedPart(selectedPartKey);
    }
  }, [selectedPartKey]);

  useEffect(() => {
    const q = selectedPartKey ? `?part_id=${encodeURIComponent(selectedPartKey)}` : "";
    fetch(`/api/estimate${q}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((live) => {
        if (live && live.parts) {
          setData(live);
        }
      })
      .catch(() => {});
  }, [selectedPartKey]);

  const top = Math.max(data.p90 * 1.15, 1);
  const leftPct = (data.p10 / top) * 100;
  const widthPct = ((data.p90 - data.p10) / top) * 100;
  const midPct = (data.p50 / top) * 100;

  const currentP10 = currency === "USD" ? data.usd.p10 : data.p10;
  const currentP50 = currency === "USD" ? data.usd.p50 : data.p50;
  const currentP90 = currency === "USD" ? data.usd.p90 : data.p90;

  const activePart = data.parts.find((p) => p.part_key === selectedPart) || data.parts[0];

  return (
    <div className="cost-card-container" id="estimate">
      <div className="cost-card-header">
        <div>
          <div className="cost-eyebrow">
            <Wrench size={14} />
            <span>
              {lang === "ru"
                ? "Смета ремонта · 4 000 сценариев Монте-Карло"
                : "Repair Estimate · 4,000 Monte Carlo Scenarios"}
            </span>
          </div>
          <h3 className="cost-title">
            {lang === "ru"
              ? "Оценка стоимости восстановительных работ"
              : "Probabilistic Collision Repair Cost Distribution"}
          </h3>
          <p className="cost-subtitle">
            {lang === "ru"
              ? "Оценка рассчитывается по открытым тарифам и прайс-листам Ташкента. Модель показывает честный диапазон P10–P90 вместо обманчивой единственной цифры."
              : "Calibrated against Tashkent OEM dealer pricing and labor rates. Outputs an empirical P10–P90 spread instead of an over-confident single estimate."}
          </p>
          {detectedDamages > 0 && (
            <div className="cost-live-badge mono">
              <span className="live-dot" />
              <span>
                {lang === "ru"
                  ? `В текущей проверке выявлено дефектов: ${detectedDamages}`
                  : `Active inspection detected anomalies: ${detectedDamages}`}
              </span>
            </div>
          )}
        </div>

        <div className="currency-toggle-group">
          <button
            type="button"
            className={`currency-btn ${currency === "UZS" ? "active" : ""}`}
            onClick={() => setCurrency("UZS")}
          >
            {lang === "ru" ? "UZS (сум)" : "UZS"}
          </button>
          <button
            type="button"
            className={`currency-btn ${currency === "USD" ? "active" : ""}`}
            onClick={() => setCurrency("USD")}
          >
            USD ($)
          </button>
        </div>
      </div>

      {/* Main Range Strip */}
      <div className="cost-range-box">
        <div className="cost-stat-row">
          <div className="stat-col">
            <span className="stat-label">P10 (Optimistic)</span>
            <strong className="stat-num">{formatMoney(currentP10, currency, lang)}</strong>
          </div>
          <div className="stat-col median-col">
            <span className="stat-label">P50 (Median Expected)</span>
            <strong className="stat-num median-num">{formatMoney(currentP50, currency, lang)}</strong>
            <small className="stat-sub">
              {currency === "UZS"
                ? `≈ $${data.usd.p50} USD`
                : `≈ ${(data.p50 / 1_000_000).toFixed(2)}M UZS`}
            </small>
          </div>
          <div className="stat-col">
            <span className="stat-label">P90 (Conservative)</span>
            <strong className="stat-num">{formatMoney(currentP90, currency, lang)}</strong>
          </div>
        </div>

        {/* Visual Spread Bar */}
        <div className="range-bar-track">
          <div
            className="range-bar-band"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
          <div className="range-bar-tick" style={{ left: `${leftPct}%` }} title="P10" />
          <div
            className="range-bar-median-marker"
            style={{ left: `${midPct}%` }}
            title="P50 Median"
          />
          <div
            className="range-bar-tick"
            style={{ left: `${leftPct + widthPct}%` }}
            title="P90"
          />
        </div>

        <div className="range-axis-labels mono">
          <span>0</span>
          <span>
            {currency === "USD"
              ? `$${Math.round(top / 12000)}`
              : lang === "ru"
                ? `${(top / 2_000_000).toFixed(1)}M сум`
                : `${(top / 2_000_000).toFixed(1)}M UZS`}
          </span>
          <span>
            {currency === "USD"
              ? `$${Math.round((top * 1.1) / 12000)}`
              : lang === "ru"
                ? `${(top / 1_000_000).toFixed(1)}M сум`
                : `${(top / 1_000_000).toFixed(1)}M UZS`}
          </span>
        </div>
      </div>

      {/* Part Breakdown & Variance Drivers */}
      <div className="cost-breakdown-section">
        <div className="breakdown-headline">
          <ShieldAlert size={16} />
          <strong>
            {lang === "ru" ? "Детализация по повреждённым узлам" : "Itemized Panel Variance & Likely Operations"}
          </strong>
        </div>

        <div className="parts-cost-table-wrapper">
          <table className="parts-cost-table">
            <thead>
              <tr>
                <th>{lang === "ru" ? "Деталь" : "Vehicle Panel"}</th>
                <th>{lang === "ru" ? "Вероятная операция" : "Likely Repair Operation"}</th>
                <th>{lang === "ru" ? "P(Замена)" : "P(Replace)"}</th>
                <th>{lang === "ru" ? "Медиана (P50)" : "Cost (P50)"}</th>
                <th>{lang === "ru" ? "Доля дисперсии" : "Variance Share"}</th>
              </tr>
            </thead>
            <tbody>
              {data.parts.map((p) => {
                const partTitle = PART_NAMES[p.part_key]?.[lang] || p.part_key.replace(/_/g, " ");
                const opTitle = OP_NAMES[p.likely_operation]?.[lang] || p.likely_operation;
                const isSelected = p.part_key === activePart?.part_key;
                const convertedP50 = currency === "USD" ? Math.round(p.cost_p50 / 12000) : p.cost_p50;

                return (
                  <tr
                    key={p.part_key}
                    className={isSelected ? "selected-row" : ""}
                    onClick={() => setSelectedPart(p.part_key)}
                  >
                    <td>
                      <strong>{partTitle}</strong>
                      <div className="mono-sub mono">{p.part_key}</div>
                    </td>
                    <td>
                      <span className="badge-operation">{opTitle}</span>
                    </td>
                    <td className="mono">{(p.p_replace * 100).toFixed(1)}%</td>
                    <td className="mono strong">{formatMoney(convertedP50, currency, lang)}</td>
                    <td>
                      <div className="variance-bar-cell">
                        <div
                          className="variance-fill"
                          style={{ width: `${Math.round(p.variance_share * 100)}%` }}
                        />
                        <span className="mono">{(p.variance_share * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="cost-footnote mono">
          {lang === "ru"
            ? "* Наибольший вклад в неопределённость вносят дверь (46%) и бампер (35%). Мастер сервиса осматривает их в первую очередь."
            : "* Variance drivers: Front door explains 46.2% of spread, Front bumper explains 34.8%. Human inspector inspects these two components first."}
        </div>
      </div>
    </div>
  );
}
