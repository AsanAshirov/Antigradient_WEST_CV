import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "../i18n";
import type { Cost } from "../lib/api";
import { millions, money, pct, usd } from "../lib/format";
import { CountUp } from "./Motion";

const PART_RU: Record<string, string> = {
  front_bumper: "Передний бампер", back_bumper: "Задний бампер", hood: "Капот", trunk: "Крышка багажника", roof: "Крыша",
  front_door: "Передняя дверь", back_door: "Задняя дверь", fender: "Переднее крыло", quarter_panel: "Заднее крыло",
  rocker_panel: "Порог", windshield: "Лобовое стекло", back_windshield: "Заднее стекло", front_window: "Переднее боковое стекло",
  back_window: "Заднее боковое стекло", headlight: "Фара", tail_light: "Задний фонарь", mirror: "Зеркало", grille: "Решётка",
  front_wheel: "Переднее колесо", back_wheel: "Заднее колесо", unknown_part: "Деталь не определена",
};
const PART_EN: Record<string, string> = {
  front_bumper: "Front bumper", back_bumper: "Rear bumper", hood: "Bonnet", trunk: "Boot lid", roof: "Roof",
  front_door: "Front door", back_door: "Rear door", fender: "Front wing", quarter_panel: "Rear quarter",
  rocker_panel: "Sill", windshield: "Windscreen", back_windshield: "Rear screen", front_window: "Front side window",
  back_window: "Rear side window", headlight: "Headlamp", tail_light: "Tail lamp", mirror: "Mirror", grille: "Grille",
  front_wheel: "Front wheel", back_wheel: "Rear wheel", unknown_part: "Part not identified",
};
const OP_RU: Record<string, string> = {
  none: "ложная находка", polish: "полировка", spot: "локальный ремонт", glass_chip: "ремонт скола", pdr: "PDR без покраски",
  wheel_repair: "ремонт диска", plastic_repair: "ремонт пластика", repair_paint: "ремонт с покраской", replace: "замена",
};
const OP_EN: Record<string, string> = {
  none: "false finding", polish: "polish", spot: "spot repair", glass_chip: "chip repair", pdr: "PDR, no paint",
  wheel_repair: "wheel repair", plastic_repair: "plastic repair", repair_paint: "repair and paint", replace: "replace",
};

const DAMAGE_RU: Record<string, string> = {
  broken_part: "поломка детали", corrosion: "коррозия", crack: "трещина", dent: "вмятина", missing_part: "нет детали",
  paint_damage: "повреждение ЛКП", scratch: "царапина",
};
const DAMAGE_EN: Record<string, string> = {
  broken_part: "broken part", corrosion: "corrosion", crack: "crack", dent: "dent", missing_part: "missing part",
  paint_damage: "paint damage", scratch: "scratch",
};

export function damageName(cls: string, lang: "ru" | "en"): string {
  return (lang === "ru" ? DAMAGE_RU : DAMAGE_EN)[cls] ?? cls.replaceAll("_", " ");
}

export function partName(key: string, lang: "ru" | "en"): string {
  const side = key.startsWith("left_") ? "left" : key.startsWith("right_") ? "right" : "";
  const base = side ? key.slice(side.length + 1) : key;
  const name = (lang === "ru" ? PART_RU : PART_EN)[base] ?? base.replaceAll("_", " ");
  if (!side) return name;
  if (lang === "en") return `${side === "left" ? "Left" : "Right"} ${name.toLowerCase()}`;
  return `${name} (${side === "left" ? "левая сторона" : "правая сторона"})`;
}

export function opName(op: string, lang: "ru" | "en"): string {
  return (lang === "ru" ? OP_RU : OP_EN)[op] ?? op;
}

/** The range strip: P10–P90 band, median tick, scale from 0. */
export function RangeStrip({ cost }: { cost: Cost }) {
  const { lang } = useI18n();
  const reduce = useReducedMotion();
  const top = Math.max(cost.p90 * 1.15, 1);
  const left = (cost.p10 / top) * 100;
  const width = ((cost.p90 - cost.p10) / top) * 100;
  const mid = (cost.p50 / top) * 100;
  return (
    <div className="range" aria-hidden="true">
      <div className="range__track">
        <motion.div className="range__band" style={{ left: `${left}%`, width: `${width}%`, originX: 0 }}
          initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0, 1] }} />
        <div className="range__tick" style={{ left: `${left}%` }} />
        <motion.div className="range__median" style={{ left: `${mid}%` }}
          initial={reduce ? false : { opacity: 0, y: -6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.6 }} />
        <div className="range__tick" style={{ left: `${left + width}%` }} />
      </div>
      <div className="range__axis mono">
        <span>0</span>
        <span>{millions(top / 2, lang)}</span>
        <span>{lang === "ru" ? `${millions(top, lang)} млн сум` : `UZS ${millions(top, lang)}M`}</span>
      </div>
    </div>
  );
}

export function CostCard({ cost, title, note }: { cost: Cost; title: string; note?: string }) {
  const { lang, t } = useI18n();
  const drivers = [...cost.parts].sort((a, b) => b.variance_share - a.variance_share).slice(0, 2);
  return (
    <article className="cost" aria-label={title}>
      <header className="cost__head">
        <div>
          <div className="label">{title}</div>
          <div className="cost__value"><CountUp value={money(cost.p50, lang)} /></div>
          <div className="cost__sub">{t.estimate.median} · ≈ {usd(cost.usd.p50, lang)}</div>
        </div>
        <div className="cost__pq mono">
          <span>P10 {money(cost.p10, lang)}</span>
          <span>P90 {money(cost.p90, lang)}</span>
        </div>
      </header>
      <div className="cost__strip"><RangeStrip cost={cost} /></div>
      <table className="cost__table">
        <thead>
          <tr>
            <th scope="col">{t.estimate.part}</th>
            <th scope="col">{t.estimate.operation}</th>
            <th scope="col" className="num">P50</th>
          </tr>
        </thead>
        <tbody>
          {cost.parts.map((p) => {
            const ops = Object.entries(p.operation_probs).filter(([op]) => op !== "none").sort((a, b) => b[1] - a[1]);
            const [first, second] = ops;
            return (
              <tr key={p.part_key}>
                <td>{partName(p.part_key, lang)}</td>
                <td>
                  {first && <>{opName(first[0], lang)} {pct(first[1], lang)}</>}
                  {second && <div className="cost__alt">{opName(second[0], lang)} {pct(second[1], lang)}</div>}
                </td>
                <td className="num">{money(p.cost_p50, lang)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <footer className="cost__foot">
        {drivers.length > 0 && (
          <p>
            {lang === "ru" ? "Сильнее всего разброс даёт: " : "Most of the spread comes from: "}
            {drivers.map((d, i) => (
              <span key={d.part_key}>{i > 0 ? ", " : ""}{partName(d.part_key, lang).toLowerCase()} ({pct(Math.max(0, d.variance_share), lang)})</span>
            ))}
            .
          </p>
        )}
        <p>{note ?? (lang === "ru" ? cost.note_ru : cost.note_en)}</p>
      </footer>
    </article>
  );
}
