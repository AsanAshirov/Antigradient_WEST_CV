import { useState, useEffect, useRef, useId, useMemo, type PointerEvent } from "react";
import pairData from "../data/pair.json";
import { CheckCircle2, Eye, Filter, ShieldCheck } from "lucide-react";

const H = 1000;
const GAP = 24;
const INDIVIDUAL_W = 0.7;

export function MatchView({ lang = "en" }: { lang?: "en" | "ru" }) {
  const [data, setData] = useState(pairData);
  const [onlyMarks, setOnlyMarks] = useState(false);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    fetch("/api/evidence/pair")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d && d.matches) setData(d);
      })
      .catch(() => {});
  }, []);

  const refSize = data.ref_size as [number, number];
  const curSize = data.cur_size as [number, number];
  const w1 = (H * refSize[0]) / refSize[1];
  const w2 = (H * curSize[0]) / curSize[1];

  const lines = useMemo(() => {
    const rows = data.matches.filter((m) => !onlyMarks || m[4] >= INDIVIDUAL_W);
    return [...rows].sort((a, b) => a[4] - b[4]);
  }, [data, onlyMarks]);

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    setLens({ x: p.x, y: p.y });
  };

  const s = data.stats;

  return (
    <div className="matchview-section" id="evidence">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={14} /> {lang === "ru" ? "ДОКАЗАТЕЛЬНАЯ БАЗА" : "EVIDENCE-GRADE VERIFICATION"}
          </span>
          <h2>
            {lang === "ru" ? "Совпадение формы ничего не доказывает" : "Matching Shapes Prove Nothing"}
            <br />
            <span className="muted">
              {lang === "ru" ? "Мы ищем то, чего нет у других машин этой модели." : "We identify what identical cohort models lack."}
            </span>
          </h2>
        </div>
        <p>
          {lang === "ru"
            ? "Две белые машины одной модели совпадут по решётке, фарам и швам. Поэтому каждую точку эталона мы сравниваем с когортой (K=8): чем чаще она встречается у других, тем ниже её вес."
            : "Two identical white sedans match on headlights and panel seams. We downweight shared model design via cohort voting (K=8) and isolate unique micro-scars."}
        </p>
      </div>

      <div className="evidence-canvas-card">
        <div className="evidence-toolbar">
          <div className="legend-items mono">
            <span className="legend-mark-indicator">
              <span className="legend-color-mark" />
              {lang === "ru" ? "Индивидуальная метка (w ≥ 0.7)" : "Individual mark (w ≥ 0.7)"}
            </span>
            <span className="legend-design-indicator">
              <span className="legend-color-design" />
              {lang === "ru" ? "Общий дизайн модели (w < 0.7)" : "Shared model design (w < 0.7)"}
            </span>
          </div>

          <label className="filter-toggle mono">
            <Filter size={14} />
            <input
              type="checkbox"
              checked={onlyMarks}
              onChange={(e) => setOnlyMarks(e.target.checked)}
            />
            <span>{lang === "ru" ? "Только уникальные метки" : "Unique marks only"}</span>
          </label>
        </div>

        <div className="svg-frame-wrapper">
          <svg
            ref={svgRef}
            className="vector-match-svg is-drawn"
            viewBox={`0 0 ${w1 + GAP + w2} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setLens(null)}
          >
            <g id={`scene-${uid}`}>
              <image
                href="/evidence/ref.jpg"
                x="0"
                y="0"
                width={w1}
                height={H}
                preserveAspectRatio="none"
                className="match-photo"
              />
              <image
                href="/evidence/cur.jpg"
                x={w1 + GAP}
                y="0"
                width={w2}
                height={H}
                preserveAspectRatio="none"
                className="match-photo"
              />

              {pairData.cells.map(([x, y, w, h], i) => (
                <rect
                  key={`c${i}`}
                  className="match-cell"
                  x={x * w1}
                  y={y * H}
                  width={w * w1}
                  height={h * H}
                />
              ))}

              {lines.map(([x0, y0, x1, y1, w], i) => (
                <line
                  key={i}
                  className={w >= INDIVIDUAL_W ? "match-line-mark" : "match-line-design"}
                  x1={x0 * w1}
                  y1={y0 * H}
                  x2={w1 + GAP + x1 * w2}
                  y2={y1 * H}
                />
              ))}

              {lines
                .filter((m) => m[4] >= INDIVIDUAL_W)
                .map(([x0, y0, x1, y1], i) => (
                  <g key={`p${i}`} className="match-dots">
                    <circle cx={x0 * w1} cy={y0 * H} r={4.5} />
                    <circle cx={w1 + GAP + x1 * w2} cy={y1 * H} r={4.5} />
                  </g>
                ))}
            </g>

            {/* Interactive 2.6x Vector Magnifier Loupe */}
            {lens && (
              <g pointerEvents="none">
                <defs>
                  <clipPath id={`lens-${uid}`}>
                    <circle cx={lens.x} cy={lens.y} r={120} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#lens-${uid})`}>
                  <rect
                    x={lens.x - 120}
                    y={lens.y - 120}
                    width={240}
                    height={240}
                    fill="#0c0d0f"
                  />
                  <g
                    transform={`translate(${lens.x} ${lens.y}) scale(2.6) translate(${-lens.x} ${-lens.y})`}
                  >
                    <use href={`#scene-${uid}`} />
                  </g>
                </g>
                <circle
                  className="match-lens-ring"
                  cx={lens.x}
                  cy={lens.y}
                  r={120}
                  stroke="#10b981"
                  strokeWidth="3"
                  fill="none"
                />
              </g>
            )}
          </svg>
        </div>

        {/* Readout Statistics Bar */}
        <div className="evidence-readouts">
          <div className="readout-box">
            <span className="readout-label">
              {lang === "ru" ? "КОНГРУЭНТНЫЕ ЯЧЕЙКИ" : "CONGRUENT CELLS"}
            </span>
            <div className="readout-val">
              <strong>{s.congruent_cells}</strong>
              <small>{lang === "ru" ? "порог ≥ 6" : "threshold ≥ 6"}</small>
            </div>
          </div>

          <div className="readout-box">
            <span className="readout-label">
              {lang === "ru" ? "ЗОНЫ СОВМЕЩЕНИЯ" : "MAGSAC ZONES"}
            </span>
            <div className="readout-val">
              <strong>{s.strong_zones}</strong>
              <small>NFA &lt; 10⁻³</small>
            </div>
          </div>

          <div className="readout-box">
            <span className="readout-label">
              {lang === "ru" ? "КОГОРТА МОДЕЛИ" : "COHORT BANK"}
            </span>
            <div className="readout-val">
              <strong>K = {s.cohort_size}</strong>
              <small>{lang === "ru" ? "машин той же модели" : "same-model cars"}</small>
            </div>
          </div>

          <div className="readout-box verdict-box">
            <span className="readout-label">{lang === "ru" ? "ВЕРДИКТ" : "IDENTITY VERDICT"}</span>
            <div className="readout-val verdict-same">
              <CheckCircle2 size={20} />
              <strong>SAME</strong>
            </div>
          </div>
        </div>

        <div className="evidence-caption mono">
          <Eye size={14} />
          <span>
            {lang === "ru"
              ? "Фото: Damian B Oh, CC BY-SA 4.0. Векторные линии и зоны построены конвейером CarPrint ALIKED + LightGlue + ORSA NFA без ретуши."
              : "Photos: Damian B Oh, CC BY-SA 4.0. Raw vector consensus output from CarPrint ALIKED + LightGlue + ORSA NFA without retouching."}
          </span>
        </div>
      </div>
    </div>
  );
}
