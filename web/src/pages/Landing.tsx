import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CostCard } from "../components/CostCard";
import { MatchView } from "../components/EvidenceViewer";
import { HeroFilm, PipelineFilm } from "../components/HeroFilm";
import { Arrow, Play, VerdictMark } from "../components/Icons";
import { CountUp, Marquee } from "../components/Motion";
import { LandingNav } from "../components/Nav";
import { DimensionLine, MaskLine, Reveal, rise, SectionHead, stagger, Viewfinder, Wipe } from "../components/Primitives";
import sampleCost from "../data/sample_cost.json";
import { useI18n } from "../i18n";
import type { Cost } from "../lib/api";
import { Link } from "../lib/router";

const EASE = [0.2, 0.7, 0, 1] as const;

type PairData = {
  ref: string; cur: string; ref_size: [number, number]; cur_size: [number, number];
  matches: number[][]; cells: number[][];
  stats: { congruent_cells: number; strong_zones: number; zones: number; cohort_size: number; distinctive_lines: number; design_lines: number };
};

export default function Landing() {
  return (
    <>
      <LandingNav />
      <main id="main">
        <Hero />
        <Marquee label="Стек" items={["ALIKED", "LightGlue", "MAGSAC++", "ORSA · NFA < 10⁻³", "когорта K = 8", "RF-DETR-Seg",
          "силуэт машины", "Монте-Карло · 4 000", "SHA-256", "Ed25519", "HMAC", "WCAG AA"]} />
        <Problem />
        <How />
        <EvidenceSection />
        <Estimate />
        <Numbers />
        <Limits />
        <Business />
        <Science />
        <Closing />
      </main>
    </>
  );
}

function Hero() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  return (
    <header className="hero on-ink" id="top">
      <HeroFilm />
      <div className="hero__content wrap">
        <motion.div initial={reduce ? false : "hidden"} animate="show" variants={stagger}>
          <motion.div variants={rise} className="hero__eyebrow label">
            <span className="hero__eyebrow-rule" aria-hidden="true" />
            {t.hero.eyebrow}
          </motion.div>
          <h1 className="hero__title">
            <MaskLine className="hero__line">{t.hero.line1}</MaskLine>
            <MaskLine className="hero__line">{t.hero.line2a}<span className="hero__accent">{t.hero.line2b}</span></MaskLine>
          </h1>
          <motion.p variants={rise} className="hero__lead">{t.hero.lead}</motion.p>
          <motion.div variants={rise} className="hero__ctas">
            <Link to="/studio" className="btn btn--signal">{t.hero.primary}<Arrow /></Link>
            <a href="#how" className="btn btn--line"><Play />{t.hero.secondary}</a>
          </motion.div>
        </motion.div>
      </div>
      <div className="hero__stats wrap">
        <motion.dl className="stats" initial={reduce ? false : "hidden"} animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.9 } } }}>
          {t.hero.stats.map((s) => (
            <motion.div key={s.value} variants={rise} className="stats__item">
              <dt className="stats__value"><CountUp value={s.value} /></dt>
              <dd className="stats__text">{s.text}</dd>
            </motion.div>
          ))}
        </motion.dl>
        <p className="hero__footnote mono">{t.hero.footnote}</p>
      </div>
    </header>
  );
}

function Problem() {
  const { t } = useI18n();
  return (
    <section className="section" id="problem" aria-labelledby="problem-title">
      <div className="wrap">
        <SectionHead index="01" label={t.problem.label} />
        <div className="split">
          <div className="split__text">
            <Reveal><h2 className="h2" id="problem-title">{t.problem.title}</h2></Reveal>
            <Reveal delay={0.08}><p className="lead problem__lead">{t.problem.lead}</p></Reveal>
            <dl className="facts">
              {t.problem.facts.map((f, i) => (
                <Reveal key={f.value} delay={0.06 * i} className="facts__item">
                  <dt className="facts__value"><CountUp value={f.value} /></dt>
                  <dd>
                    <span className="facts__text">{f.text}</span>
                    <span className="source">{f.source}</span>
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <figure className="split__figure">
            <Wipe className="photo">
              <img src="/images/tashkent.jpg" alt="Chevrolet Cobalt, Chilonzor-5, Tashkent" width={1600} height={1236} />
              <Viewfinder />
            </Wipe>
            <DimensionLine label={t.problem.dimension} />
            <figcaption className="caption mono">{t.problem.caption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

function How() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const [active, setActive] = useState(reduce ? 5 : 0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!reduce) setActive(Math.min(5, Math.floor(v * 6.2)));
  });

  return (
    <section className="section section--sheet" id="how" ref={ref} aria-labelledby="how-title">
      <div className="wrap">
        <SectionHead index="02" label={t.how.label} />
        <div className="head-row">
          <Reveal><h2 className="h2" id="how-title">{t.how.title}</h2></Reveal>
          <Reveal delay={0.08}><p className="lead head-row__aside">{t.how.lead}</p></Reveal>
        </div>
        <div className="steps__rail" aria-hidden="true">
          <motion.div className="steps__fill" style={{ scaleX: reduce ? 1 : progress, originX: 0 }} />
        </div>
        <ol className="steps">
          {t.how.steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={0.07 * i} className={`steps__item ${i <= active ? "is-active" : ""}`}>
              <span className="steps__num mono">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="steps__title">{s.title}</h3>
              <p className="steps__text">{s.text}</p>
              <span className="steps__tag mono">{s.tag}</span>
            </Reveal>
          ))}
        </ol>
        <Reveal className="how__film"><PipelineFilm /></Reveal>
      </div>
    </section>
  );
}

function EvidenceSection() {
  const { t } = useI18n();
  const [pair, setPair] = useState<PairData | null>(null);
  const [onlyMarks, setOnlyMarks] = useState(false);

  useEffect(() => {
    fetch("/evidence/pair.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPair(d))
      .catch(() => setPair(null));
  }, []);

  const s = pair?.stats;
  return (
    <section className="section section--ink on-ink" id="evidence" aria-labelledby="evidence-title">
      <div className="wrap">
        <SectionHead index="03" label={t.evidence.label} />
        <Reveal><h2 className="h2 evidence__title" id="evidence-title">{t.evidence.title}</h2></Reveal>
        <div className="evidence__frame">
          {pair ? (
            <MatchView refSrc={`/evidence/${pair.ref}`} curSrc={`/evidence/${pair.cur}`} refSize={pair.ref_size}
              curSize={pair.cur_size} matches={pair.matches} cells={pair.cells} onlyMarks={onlyMarks} label={t.evidence.hint} />
          ) : (
            <div className="evidence__placeholder mono">{t.evidence.hint}</div>
          )}
        </div>
        <div className="evidence__bar">
          <div className="legend mono">
            <span><i className="legend__mark" />{t.evidence.legendMark}</span>
            <span><i className="legend__design" />{t.evidence.legendDesign}</span>
          </div>
          <label className="toggle mono">
            <input type="checkbox" checked={onlyMarks} onChange={(e) => setOnlyMarks(e.target.checked)} />
            <span>{t.evidence.legendMark}</span>
          </label>
        </div>
        <dl className="readouts">
          <div><dt className="label">{t.evidence.statCells}</dt><dd>{s ? <CountUp value={String(s.congruent_cells)} /> : "—"} <small>{t.evidence.statCellsNeed}</small></dd></div>
          <div><dt className="label">{t.evidence.statZones}</dt><dd>{s ? <CountUp value={String(s.strong_zones)} /> : "—"} <small>{t.evidence.statZonesNote}</small></dd></div>
          <div><dt className="label">{t.evidence.statCohort}</dt><dd>K = {s?.cohort_size ?? 8} <small>{t.evidence.statCohortNote}</small></dd></div>
          <div><dt className="label">{t.evidence.statVerdict}</dt><dd className="readouts__same">SAME</dd></div>
        </dl>
        <p className="source evidence__credit">{t.evidence.credit}</p>
        <div className="split split--top">
          <Reveal className="split__text">
            <h3 className="h3">{t.evidence.cohortTitle}</h3>
            <p className="lead">{t.evidence.cohortText}</p>
            <div className="formula mono">w(f) = log((K+1) / (m<sub>f</sub>+0,5)) / log((K+1) / 0,5)</div>
            <p className="source">{t.evidence.cohortNote}</p>
          </Reveal>
          <Reveal className="split__text" delay={0.08}>
            <h3 className="h3">{t.evidence.reviewTitle}</h3>
            <p className="lead">{t.evidence.reviewText}</p>
            <div className="chips">
              <span className="chip chip--same"><VerdictMark decision="SAME" size={10} />{t.evidence.same}</span>
              <span className="chip chip--review"><VerdictMark decision="REVIEW" size={10} />{t.evidence.review}</span>
              <span className="chip chip--different"><VerdictMark decision="DIFFERENT" size={10} />{t.evidence.different}</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Estimate() {
  const { t } = useI18n();
  return (
    <section className="section" id="estimate" aria-labelledby="estimate-title">
      <div className="wrap">
        <SectionHead index="04" label={t.estimate.label} />
        <div className="split">
          <div className="split__text">
            <Reveal><h2 className="h2" id="estimate-title">{t.estimate.title}</h2></Reveal>
            <Reveal delay={0.08}><p className="lead">{t.estimate.lead}</p></Reveal>
            <ol className="abcd">
              {t.estimate.steps.map((s, i) => (
                <Reveal as="li" key={s} delay={0.05 * i}>
                  <span className="mono">{"ABCD"[i]}</span><span>{s}</span>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal className="split__figure">
            <CostCard cost={sampleCost as unknown as Cost} title={t.estimate.cardTitle} />
            <p className="source estimate__sample">{t.estimate.sample}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Numbers() {
  const { t } = useI18n();
  return (
    <section className="section section--sheet" id="numbers" aria-labelledby="numbers-title">
      <div className="wrap">
        <SectionHead index="05" label={t.numbers.label} />
        <div className="head-row">
          <Reveal><h2 className="h2" id="numbers-title">{t.numbers.title}</h2></Reveal>
          <Reveal delay={0.08}><p className="lead head-row__aside">{t.numbers.lead}</p></Reveal>
        </div>
        <Reveal className="table-box">
          <table className="data">
            <thead>
              <tr>{t.numbers.cols.map((c, i) => <th key={c} scope="col" className={i === 3 ? "num" : undefined}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.numbers.rows.map((r) => (
                <tr key={r[0]}>
                  <th scope="row">{r[0]}</th><td>{r[1]}</td><td>{r[2]}</td><td className="num strong">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <div className="numbers__notes">
          <p className="lead">{t.numbers.note}</p>
          <p className="numbers__honest">{t.numbers.honest}</p>
        </div>
      </div>
    </section>
  );
}

function Limits() {
  const { t } = useI18n();
  return (
    <section className="section" id="limits" aria-labelledby="limits-title">
      <div className="wrap">
        <SectionHead index="06" label={t.limits.label} />
        <div className="head-row">
          <Reveal><h2 className="h2" id="limits-title">{t.limits.title}</h2></Reveal>
          <Reveal delay={0.08}><p className="lead head-row__aside">{t.limits.lead}</p></Reveal>
        </div>
        <Reveal className="table-box">
          <table className="data limits">
            <thead>
              <tr>{t.limits.cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.limits.rows.map((r) => (
                <tr key={r[0]}>
                  <th scope="row">{r[0]}</th><td className="limits__answer">{r[1]}</td><td className="limits__why">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

function Business() {
  const { t } = useI18n();
  const [dealer, insurer] = t.business.cols;
  return (
    <section className="section" id="business" aria-labelledby="business-title">
      <div className="wrap">
        <SectionHead index="07" label={t.business.label} />
        <Reveal><h2 className="h2 business__title" id="business-title">{t.business.title}</h2></Reveal>
        <div className="columns">
          {[dealer, insurer].map((c, i) => (
            <Reveal key={c.title} delay={0.06 * i} className="columns__item">
              <span className={`mono columns__tag ${i === 0 ? "is-signal" : ""}`}>{c.tag}</span>
              <h3 className="h3">{c.title}</h3>
              <p>{c.text}</p>
              <div className="columns__value"><CountUp value={c.value} /></div>
              <div className="columns__note">{c.note}</div>
            </Reveal>
          ))}
          <Reveal delay={0.12} className="columns__item">
            <span className="mono columns__tag">{t.business.cols[2].tag}</span>
            <h3 className="h3">{t.business.cols[2].title}</h3>
            <dl className="roi">
              <div><dt>{t.business.roiBase}</dt><dd>{t.business.roiBaseValue}</dd></div>
              <div><dt>{t.business.roiPess}</dt><dd>{t.business.roiPessValue}</dd></div>
            </dl>
            <p className="columns__note">{t.business.roiNote}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Science() {
  const { t } = useI18n();
  return (
    <section className="section section--ink on-ink" id="science" aria-labelledby="science-title">
      <div className="wrap">
        <SectionHead index="08" label={t.science.label} />
        <h2 className="visually-hidden" id="science-title">{t.science.label}</h2>
        <div className="science">
          {t.science.items.map((it, i) => (
            <Reveal key={it.title} delay={0.05 * i} className="science__item">
              <div className="label">{it.title}</div>
              {it.formula && <div className="science__formula mono">{it.formula}</div>}
              <p>{it.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  return (
    <footer className="closing on-ink">
      <div className="wrap">
        <div className="closing__row">
          <motion.h2 className="closing__title" initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}>
            {t.cta.title}
          </motion.h2>
          <Link to="/studio" className="btn btn--signal closing__btn">{t.cta.button}<Arrow /></Link>
        </div>
        <div className="closing__meta">
          <span>{t.cta.team}</span>
          <nav aria-label="Links">
            <a href="https://github.com/AsanAshirov/Antigradient_WEST_CV">{t.cta.links.github}</a>
            <a href="https://github.com/AsanAshirov/Antigradient_WEST_CV/blob/main/DATA_SOURCES.md">{t.cta.links.data}</a>
            <a href="/docs">{t.cta.links.api}</a>
            <a href="https://github.com/AsanAshirov/Antigradient_WEST_CV/blob/main/docs/EVALUATION.md">{t.cta.links.method}</a>
          </nav>
        </div>
        <p className="closing__partners">{t.cta.partners}</p>
      </div>
    </footer>
  );
}
