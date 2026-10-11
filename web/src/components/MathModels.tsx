import { useState } from "react";
import { BookOpen, Calculator, Cpu, Sparkles, Variable } from "lucide-react";

export function MathModels({ lang = "en" }: { lang?: "en" | "ru" }) {
  const [activeTab, setActiveTab] = useState<"geometry" | "cohort" | "scale" | "cost">("geometry");

  return (
    <div className="math-models-section" id="math-models">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Calculator size={14} /> {lang === "ru" ? "МАТЕМАТИЧЕСКИЙ АППАРАТ" : "MATHEMATICAL FORMULATIONS"}
          </span>
          <h2>
            {lang === "ru" ? "Научные основы и алгоритмическая строгость" : "Mathematical Foundations & Rigor"}
            <br />
            <span className="muted">
              {lang === "ru" ? "Объяснимый CV вместо чёрного ящика" : "Explainable Computer Vision vs Black-Box Heuristics"}
            </span>
          </h2>
        </div>
        <p>
          {lang === "ru"
            ? "Архитектура CarPrint объединяет строгие геометрические инварианты проективной геометрии, статистический контроль ложных тревог (ORSA NFA) и вероятностное моделирование Монте-Карло."
            : "CarPrint synthesizes classical projective geometry invariants, statistical false-alarm bounds (ORSA NFA), and empirical Bayesian Monte Carlo collision costing."}
        </p>
      </div>

      <div className="math-tabs-bar">
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "geometry" ? "active" : ""}`}
          onClick={() => setActiveTab("geometry")}
        >
          <Cpu size={15} />
          <span>{lang === "ru" ? "1. Проективная геометрия & ORSA" : "1. Projective Geometry & ORSA"}</span>
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "cohort" ? "active" : ""}`}
          onClick={() => setActiveTab("cohort")}
        >
          <Sparkles size={15} />
          <span>{lang === "ru" ? "2. Когорта K=8 & Вес w(f)" : "2. Cohort Likelihood & w(f)"}</span>
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "scale" ? "active" : ""}`}
          onClick={() => setActiveTab("scale")}
        >
          <Variable size={15} />
          <span>{lang === "ru" ? "3. Метрический масштаб mm/px" : "3. Metric Scale & Foreshortening"}</span>
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "cost" ? "active" : ""}`}
          onClick={() => setActiveTab("cost")}
        >
          <BookOpen size={15} />
          <span>{lang === "ru" ? "4. Модель сметы Монте-Карло" : "4. Monte Carlo Costing Matrix"}</span>
        </button>
      </div>

      <div className="math-card-body">
        {activeTab === "geometry" && (
          <div className="math-proof-block">
            <div className="proof-header">
              <h4>
                {lang === "ru"
                  ? "Кусочно-плоская гомография и а-контрарио контроль ORSA NFA"
                  : "Piecewise Planar Homography & A-Contrario ORSA NFA Filter"}
              </h4>
              <span className="proof-tag mono">MAGSAC++ · RANSAC 4px · NFA &lt; 10⁻³</span>
            </div>

            <div className="formula-display-box">
              <div className="formula-row mono">
                <strong>x&apos; ∼ H · x</strong> &nbsp;⟺&nbsp;
                <span className="matrix-bracket">[x&apos;, y&apos;, 1]ᵀ ∼ H₃ₓ₃ · [x, y, 1]ᵀ</span>
              </div>
              <div className="formula-row mono highlight-formula">
                NFA = (n − 4) · C(n, k) · C(k, 4) · pᵏ⁻⁴ &lt; 10⁻³
              </div>
              <div className="formula-row mono sub-formula">
                e_sym²(xᵢ, x&apos;ᵢ; H) = ‖x&apos;ᵢ − π(H xᵢ)‖₂² + ‖xᵢ − π(H⁻¹ x&apos;ᵢ)‖₂²
              </div>
            </div>

            <div className="proof-explanation">
              <p>
                {lang === "ru"
                  ? "Кузов автомобиля разделяется на зоны локальной плоскостности (двери, капот, крылья). Каждая зона вычисляет матрицу H через сингулярное разложение (SVD) матрицы DLT. Для защиты от случайных совпадений на текстуре применён критерий Дешемона–Муазана (ORSA): зона признаётся валидной только при NFA < 10⁻³ (менее одного ложного совпадения на 1000 проверок)."
                  : "Vehicle panels are modeled as piecewise planar surfaces in ℝ³ projected via Homography H. To prevent spurious matches on metallic paint textures, the Moisan–Stambouli a-contrario criterion evaluates the Number of False Alarms (NFA). A consensus zone is rejected unless NFA < 10⁻³."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "cohort" && (
          <div className="math-proof-block">
            <div className="proof-header">
              <h4>
                {lang === "ru"
                  ? "Вычитание дизайна модели и логарифмическое отношение правдоподобия"
                  : "Cohort Design Downweighting & Log-Likelihood Ratio (LLR)"}
              </h4>
              <span className="proof-tag mono">K = 8 · Congruent Cells ≥ 6 · LLR</span>
            </div>

            <div className="formula-display-box">
              <div className="formula-row mono highlight-formula">
                w(f) = log((K + 1) / (m_f + 0.5)) / log((K + 1) / 0.5)
              </div>
              <div className="formula-row mono">
                LLR(s) = ln [ p(s | H_same) / p(s | H_impostor) ] = ln(σ_imp / σ_same) − (s − μ_same)² / 2σ² + (s − μ_imp)² / 2σ²
              </div>
            </div>

            <div className="proof-explanation">
              <p>
                {lang === "ru"
                  ? "Две белые Chevrolet Cobalt имеют одинаковые штампы дверей и форму оптики. Чтобы не выдать ложный вердикт 'SAME', алгоритм вычисляет вес точки w(f): если точка повторяется у m_f машин когорты той же модели, её вес падает к 0. Голосуют только уникальные повреждения (сколы, притёртости, задиры дисков), чей вес w(f) ≈ 1."
                  : "Two distinct Chevrolet Cobalts share identical factory contours and grille geometry. The cohort weight w(f) suppresses feature points that appear across m_f cohort members of that vehicle model (w → 0). Only unique micro-scars and curb rashes retain w(f) ≈ 1 and contribute to congruent cell voting."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "scale" && (
          <div className="math-proof-block">
            <div className="proof-header">
              <h4>
                {lang === "ru"
                  ? "Метрический масштаб кадра и коррекция ракурсного сжатия"
                  : "Pinhole Metric Scale Fusion & Foreshortening Invariance"}
              </h4>
              <span className="proof-tag mono">ISO Tyre · GOST 520×110 mm · Inverse Variance</span>
            </div>

            <div className="formula-display-box">
              <div className="formula-row mono">
                s* = [ ∑ (sᵢ / uᵢ²) ] / [ ∑ (1 / uᵢ²) ], &nbsp;&nbsp; u* = [ ∑ (1 / uᵢ²) ]^(-1/2)
              </div>
              <div className="formula-row mono highlight-formula">
                A_mm² = [ A_px · (s*)² ] / cos(ψ), &nbsp;&nbsp; cos(ψ) = w_px · (1 − δ) / h_px
              </div>
            </div>

            <div className="proof-explanation">
              <p>
                {lang === "ru"
                  ? "Метрический масштаб кадра (мм/пиксель) оценивается из трёх независимых физических ориентиров: внешнего диаметра шины D = 25.4·d + 2·W·AR/100, высоты номерного знака РУз (110 мм) и габаритной высоты кузова. Оценки объединяются взвешиванием по обратной дисперсии, а перспективное сжатие детали под углом ψ компенсируется делением на cos(ψ)."
                  : "Real-world scale (mm/px) is fused via inverse-variance weighting across three independent anchors: ISO tire outer diameter, Uzbekistan license plate standard (520×110 mm), and known OEM vehicle height. Projective foreshortening at angle ψ is corrected via A_mm² = A_px·(s*)² / cos(ψ)."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "cost" && (
          <div className="math-proof-block">
            <div className="proof-header">
              <h4>
                {lang === "ru"
                  ? "Модель расчёта восстановительного ремонта Монте-Карло"
                  : "Collision Repair Matrix & 4,000 Scenario Monte Carlo Engine"}
              </h4>
              <span className="proof-tag mono">P10 · P50 · P90 · Triangular Pricing Distributions</span>
            </div>

            <div className="formula-display-box">
              <div className="formula-row mono highlight-formula">
                C_total = ∑ [ I_replace · C_part + R_body · t_body + R_paint · t_paint + C_R&amp;I ] + C_ADAS
              </div>
              <div className="formula-row mono sub-formula">
                t_repair = t_access + β · √(A_damage / A_unit) · κ_material
              </div>
            </div>

            <div className="proof-explanation">
              <p>
                {lang === "ru"
                  ? "Стоимость не задаётся константой, а генерируется по 4 000 симуляциям случайных процессов с треугольными распределениями цен (мин, мода, макс) и корреляцией стоимости нормо-часа кузовного цеха. Система определяет вероятную операцию (полировка, PDR, пайка пластика, локальная покраска или полная замена OEM) и выделяет главные драйверы дисперсии."
                  : "Repair costs are simulated across 4,000 correlated Monte Carlo iterations using triangular dealer price distributions. The model assigns the most conservative necessary repair operation (PDR, spot refinish, plastic weld, panel spray, or OEM replacement) and computes the exact variance share per panel."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
