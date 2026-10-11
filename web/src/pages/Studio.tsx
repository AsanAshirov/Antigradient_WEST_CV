import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CostCard, damageName, partName } from "../components/CostCard";
import { CompareSlider, MatchView } from "../components/EvidenceViewer";
import { Arrow, Camera, Check, Close, Doc, Plus, VerdictMark, Warn } from "../components/Icons";
import { LangToggle, Wordmark } from "../components/Nav";
import { useI18n } from "../i18n";
import { api, ApiError, type CompareResult, type Cost, type FrameAnalysis, type FrameUpload, type Inspection,
  type Verification } from "../lib/api";
import { money, num, pct, seconds } from "../lib/format";
import { Link } from "../lib/router";

const MODELS: [string, string][] = [
  ["cobalt", "Chevrolet Cobalt"], ["nexia", "Chevrolet Nexia"], ["gentra", "Chevrolet Gentra / Lacetti"],
  ["spark", "Chevrolet Spark"], ["matiz", "Daewoo Matiz"], ["damas", "Chevrolet Damas"],
  ["camry", "Toyota Camry"], ["song_plus", "BYD Song Plus"],
];
const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

type Shot = { file: File; url: string };

export default function Studio() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"quick" | "plan">("quick");
  return (
    <div className="studio">
      <header className="studio__bar on-ink">
        <Wordmark sub={t.studio.title} />
        <div role="tablist" aria-label={t.studio.title} className="studio__tabs">
          <button role="tab" type="button" aria-selected={tab === "quick"} onClick={() => setTab("quick")}>{t.studio.tabQuick}</button>
          <button role="tab" type="button" aria-selected={tab === "plan"} onClick={() => setTab("plan")}>{t.studio.tabPlan}</button>
        </div>
        <div className="studio__bar-right">
          <LangToggle />
          <Link to="/" className="studio__home">{t.nav.home}</Link>
        </div>
      </header>
      <main id="main" className="studio__main">
        {tab === "quick" ? <QuickCheck /> : <GuidedInspection />}
      </main>
    </div>
  );
}

/* ---------------- quick check ---------------- */

function QuickCheck() {
  const { t, lang } = useI18n();
  const [refShots, setRefShots] = useState<Shot[]>([]);
  const [curShots, setCurShots] = useState<Shot[]>([]);
  const [model, setModel] = useState("cobalt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [started, setStarted] = useState(0);
  const [loadingExample, setLoadingExample] = useState(false);

  const run = async () => {
    if (!refShots.length || !curShots.length) {
      setError(t.studio.needBoth);
      return;
    }
    setBusy(true);
    setError(null);
    setStarted(performance.now());
    try {
      const r = await api.compare(refShots.map((s) => s.file), curShots.map((s) => s.file), model);
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.studio.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const loadExample = async () => {
    setLoadingExample(true);
    setError(null);
    try {
      const files = await Promise.all(["ref", "cur"].map(async (n) => {
        const res = await fetch(`/evidence/${n}.jpg`);
        if (!res.ok) throw new Error(String(res.status));
        return new File([await res.blob()], `${n}-example.jpg`, { type: "image/jpeg" });
      }));
      setRefShots([{ file: files[0], url: URL.createObjectURL(files[0]) }]);
      setCurShots([{ file: files[1], url: URL.createObjectURL(files[1]) }]);
      setModel("matiz");
      setResult(null);
    } catch {
      setError(t.studio.errorGeneric);
    } finally {
      setLoadingExample(false);
    }
  };

  const reset = () => {
    setResult(null);
    setRefShots([]);
    setCurShots([]);
    setError(null);
  };

  if (result) {
    const srcs: Record<string, string> = {};
    result.analysis_a.forEach((a, i) => refShots[i] && (srcs[a.frame_id] = refShots[i].url));
    result.analysis_b.forEach((a, i) => curShots[i] && (srcs[a.frame_id] = curShots[i].url));
    return <ResultView result={result} srcs={srcs} analysisRef={result.analysis_a} analysisCur={result.analysis_b}
      inspectionId={result.inspections?.current} onReset={reset} />;
  }

  return (
    <section className="quick wrap" aria-labelledby="quick-title">
      <div className="quick__head">
        <div>
          <h1 className="h2" id="quick-title">{t.studio.tabQuick}</h1>
          <p className="lead quick__intro">{t.studio.intro}</p>
        </div>
        <button type="button" className="btn btn--line btn--small" onClick={loadExample} disabled={busy || loadingExample}
          aria-busy={loadingExample}>{loadingExample ? "…" : t.studio.example}</button>
      </div>
      <div className="quick__drops">
        <DropZone title={t.studio.reference} hint={t.studio.referenceHint} shots={refShots} setShots={setRefShots} disabled={busy} />
        <DropZone title={t.studio.current} hint={t.studio.currentHint} shots={curShots} setShots={setCurShots} disabled={busy} />
      </div>
      <div className="quick__run">
        <label className="field">
          <span className="label">{t.studio.model}</span>
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            {MODELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="">{t.studio.modelOther}</option>
          </select>
        </label>
        <button type="button" className="btn btn--signal" onClick={run} disabled={busy || loadingExample}>
          {busy ? t.studio.running : t.studio.run}<Arrow />
        </button>
      </div>
      <AnimatePresence>{busy && <Progress started={started} />}</AnimatePresence>
      {error && <p className="alert" role="alert"><Warn /> {error}</p>}
      <p className="quick__lang-note source">{lang === "ru" ? "Фото обрабатываются на сервере проверки и не публикуются." : "Photos are processed on the verification server and never published."}</p>
    </section>
  );
}

function DropZone({ title, hint, shots, setShots, disabled }: {
  title: string; hint: string; shots: Shot[]; setShots: (s: Shot[]) => void; disabled: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (files: FileList | File[]) => {
    const ok = Array.from(files).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= MAX_BYTES);
    setShots([...shots, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_FILES));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) add(e.dataTransfer.files);
  };

  return (
    <div className={`drop ${over ? "is-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="drop__head">
        <span className="drop__title">{title}</span>
        <span className="label">{hint}</span>
      </div>
      {shots.length === 0 ? (
        <button type="button" className="drop__empty" onClick={() => input.current?.click()} disabled={disabled}>
          <Plus size={22} />
          <span>{t.studio.drop}</span>
          <span className="source">{t.studio.dropNote}</span>
        </button>
      ) : (
        <ul className="drop__grid">
          {shots.map((s, i) => (
            <li key={s.url} className="drop__thumb">
              <img src={s.url} alt={`${title} ${i + 1}`} />
              <button type="button" aria-label={`${t.studio.remove} ${i + 1}`} disabled={disabled}
                onClick={() => setShots(shots.filter((_, j) => j !== i))}><Close size={12} /></button>
            </li>
          ))}
          {shots.length < MAX_FILES && (
            <li>
              <button type="button" className="drop__add" onClick={() => input.current?.click()} disabled={disabled}
                aria-label={`${t.studio.add}: ${title}`}><Plus /></button>
            </li>
          )}
        </ul>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/** Honest progress: the pipeline's stages as orientation and the real elapsed time — no fake percentage. */
function Progress({ started }: { started: number }) {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - started;
  const stage = Math.min(t.studio.stages.length - 1, Math.floor(elapsed / 900));
  return (
    <motion.div className="progress" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      role="status" aria-live="polite">
      <div className="progress__scan" aria-hidden="true"><span /></div>
      <ol className="progress__stages">
        {t.studio.stages.map((s, i) => (
          <li key={s} className={i < stage ? "is-done" : i === stage ? "is-now" : ""}>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span>{s}
          </li>
        ))}
      </ol>
      <span className="progress__time mono">{t.studio.elapsed} {seconds(elapsed, lang)}</span>
    </motion.div>
  );
}

/* ---------------- result ---------------- */

function ResultView({ result, srcs, analysisRef, analysisCur, inspectionId, onReset }: {
  result: Verification; srcs: Record<string, string>; analysisRef?: FrameAnalysis[]; analysisCur?: FrameAnalysis[];
  inspectionId?: string; onReset: () => void;
}) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const [pick, setPick] = useState(0);
  const [mode, setMode] = useState<"compare" | "matches" | "damage">("matches");
  const ev = result.evidence[pick];
  const reasons = (lang === "en" && result.reasons_en?.length ? result.reasons_en : result.reasons_ru) ?? [];
  const damageMissing = !!analysisCur && analysisCur.every((a) => a.damages.length === 0 && a.parts.length === 0);
  const refSrc = ev ? srcs[ev.ref_frame] ?? null : null;
  const curSrc = ev ? srcs[ev.cur_frame] ?? null : null;
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    // natural sizes of the two photos, so the match lines land on the right pixels
    [refSrc, curSrc].forEach((src) => {
      if (!src || sizes[src]) return;
      const img = new Image();
      img.onload = () => setSizes((s) => ({ ...s, [src]: [img.naturalWidth, img.naturalHeight] }));
      img.src = src;
    });
  }, [refSrc, curSrc, sizes]);

  const damageFrame = (analysisCur ?? []).find((f) => f.frame_id === ev?.cur_frame)
    ?? (analysisCur ?? []).find((f) => f.damages.length > 0) ?? analysisCur?.[0];
  const cost: Cost | null = result.cost_estimate_new ?? null;
  const decision = result.decision;
  const cells = Math.round(result.score_raw);

  return (
    <motion.section className="result" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }} aria-labelledby="verdict-title">
      <aside className="result__frames" aria-label={t.studio.reference}>
        {analysisRef && <FrameList title={t.studio.reference} frames={analysisRef} srcs={srcs} />}
        {analysisCur && <FrameList title={t.studio.current} frames={analysisCur} srcs={srcs} />}
        <p className="source result__integrity">
          {t.studio.integrity}: {t.studio.integrityLevel[result.integrity.level]}
          {result.integrity.flags.length > 0 && <> · {result.integrity.flags.join(", ")}</>}
        </p>
      </aside>

      <div className="result__center">
        <div className="result__toolbar">
          <div role="tablist" className="seg" aria-label={t.studio.viewer.compare}>
            <button role="tab" type="button" aria-selected={mode === "matches"} onClick={() => setMode("matches")}>{t.studio.viewer.matches}</button>
            <button role="tab" type="button" aria-selected={mode === "compare"} onClick={() => setMode("compare")}>{t.studio.viewer.compare}</button>
            <button role="tab" type="button" aria-selected={mode === "damage"} onClick={() => setMode("damage")}>{t.studio.viewer.damage}</button>
          </div>
          {ev && (
            <span className="mono result__meta">
              {num(ev.inliers, lang)} inliers · {lang === "ru" ? "ошибка" : "error"} {num(ev.reproj_err_px, lang, 1)} px · NFA 10<sup>{Math.round(ev.log10_nfa)}</sup>
            </span>
          )}
        </div>
        <div className="result__viewer">
          {!ev && mode !== "damage" && <div className="result__empty">{t.studio.noAlignment}</div>}
          {ev && mode === "matches" && refSrc && curSrc && sizes[refSrc] && sizes[curSrc] && (
            <MatchView refSrc={refSrc} curSrc={curSrc} refSize={sizes[refSrc]} curSize={sizes[curSrc]}
              matches={ev.matches ?? []} label={t.evidence.hint} />
          )}
          {mode === "damage" && (damageFrame?.overlay_url ? (
            <img className="result__overlay" src={damageFrame.overlay_url} alt={t.studio.viewer.damage} />
          ) : <div className="result__empty">{damageMissing ? t.studio.damageModelMissing : t.studio.noFindings}</div>)}
          {ev && mode === "compare" && (ev.aligned_url && refSrc ? (
            <CompareSlider beforeSrc={refSrc} afterSrc={ev.aligned_url} beforeLabel={t.studio.viewer.before}
              afterLabel={t.studio.viewer.after} sliderLabel={t.studio.viewer.compare} />
          ) : <div className="result__empty">{t.studio.noAlignment}</div>)}
        </div>
        {result.evidence.length > 1 && (
          <div className="result__pairs">
            {result.evidence.map((e, i) => (
              <button key={`${e.ref_frame}-${e.cur_frame}`} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>
                {e.slot !== "extra" ? e.slot : `${i + 1}`} · {e.congruent_cells} {t.studio.cells}
              </button>
            ))}
          </div>
        )}
        <div className="timeline">
          <div className="timeline__head label">
            <span>{t.studio.timeline}</span>
            <span>{result.damage_timeline.length} {t.studio.findings}</span>
          </div>
          {damageMissing ? (
            <p className="timeline__empty">{t.studio.damageModelMissing}</p>
          ) : result.damage_timeline.length === 0 ? (
            <p className="timeline__empty">{t.studio.noFindings}</p>
          ) : (
            <ul className="timeline__grid">
              {result.damage_timeline.map((d, i) => (
                <li key={i}>
                  <span className={`chip ${d.status === "newly_detected" ? "chip--new" : d.status === "previously_recorded" ? "chip--old"
                    : d.status === "previously_seen_now_absent" ? "chip--absent" : "chip--unknown"}`}>{t.studio.status[d.status]}</span>
                  <strong>{d.part ? partName(d.part, lang) : partName("unknown_part", lang)}</strong>
                  <span>
                    {damageName(d.class, lang)}
                    {d.score != null && <> · {pct(d.score, lang)}</>}
                    {d.score != null && d.score < 0.6 && d.status !== "previously_seen_now_absent" && (
                      <em className="timeline__check"> · {t.studio.checkByStaff}</em>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="result__side" aria-label={t.studio.verdictLabel}>
        <div className="label">{t.studio.verdictLabel}</div>
        <h1 className={`verdict verdict--${decision.toLowerCase()}`} id="verdict-title">
          <VerdictMark decision={decision} size={16} />
          {t.studio.verdict[decision]}
        </h1>
        <ul className="reasons">
          {reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div className="result__facts mono">
          <span>{decision}</span>
          <span>{cells} {t.studio.cells}</span>
          <span>{t.studio.cohort} K = {result.cohort_size}</span>
          <span>{t.studio.latency} {seconds(result.latency_ms, lang)}</span>
        </div>
        <div className="result__cost">
          {cost ? <CostCard cost={cost} title={t.studio.costNew} /> : (
            <p className="result__nocost">
              {result.cost_estimate_current ? <>{t.studio.costCurrent}: <strong>{money(result.cost_estimate_current.p50, lang)}</strong></> : t.studio.costNone}
            </p>
          )}
        </div>
        <div className="result__actions">
          {inspectionId && (
            <a className="btn btn--line btn--small" href={api.reportUrl(inspectionId)} target="_blank" rel="noreferrer"><Doc />{t.studio.pdf}</a>
          )}
          <button type="button" className="btn btn--ink btn--small" onClick={onReset}>{t.studio.reset}</button>
        </div>
        <p className="source">{t.studio.disclaimer}</p>
      </aside>
    </motion.section>
  );
}

function FrameList({ title, frames, srcs }: { title: string; frames: FrameAnalysis[]; srcs: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <div className="frames">
      <div className="label">{title}</div>
      <ul>
        {frames.map((f, i) => {
          const issues = f.quality?.issues ?? [];
          const src = srcs[f.frame_id] ?? f.overlay_url ?? undefined;
          return (
            <li key={f.frame_id}>
              {src ? <img src={src} alt={`${title} ${i + 1}`} /> : <span className="frames__ph" />}
              <span className="frames__slot">{f.slot === "extra" ? `${i + 1}` : f.slot}</span>
              <span className={`mono frames__q ${issues.length ? "is-bad" : ""}`}>
                {issues.length ? <><Warn /> {issues.map((q) => t.studio.quality[q as keyof typeof t.studio.quality] ?? q).join(", ")}</>
                  : <><Check /> {t.studio.quality.ok}</>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- guided inspection ---------------- */

type Stored = { inspection_id: string; vehicle_key: string; created: string; type: string; model: string };
const HISTORY_KEY = "carprint.inspections";

function loadHistory(): Stored[] {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as Stored[];
  } catch {
    return [];
  }
}

function saveHistory(items: Stored[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // per-device convenience only
  }
}

function GuidedInspection() {
  const { t, lang } = useI18n();
  const [vehicle, setVehicle] = useState("");
  const [model, setModel] = useState("cobalt");
  const [type, setType] = useState<"checkin" | "checkout">("checkin");
  const [ins, setIns] = useState<Inspection | null>(null);
  const [shots, setShots] = useState<Record<string, { url: string; up?: FrameUpload; busy?: boolean; error?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [analysis, setAnalysis] = useState<{ frames: FrameAnalysis[]; cost_estimate: Cost | null } | null>(null);
  const history = useMemo(loadHistory, [ins]);
  const previous = ins ? history.filter((h) => h.vehicle_key === ins.vehicle_key && h.inspection_id !== ins.inspection_id) : [];

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createInspection({ vehicle_id_plain: vehicle.trim() || undefined, model, type });
      setIns(created);
      setShots({});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.studio.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const shoot = async (slot: string, file: File) => {
    if (!ins) return;
    const url = URL.createObjectURL(file);
    setShots((s) => ({ ...s, [slot]: { url, busy: true } }));
    try {
      const up = await api.uploadFrame(ins.inspection_id, file, slot, ins.nonce, "camera");
      setShots((s) => ({ ...s, [slot]: { url, up } }));
    } catch (e) {
      setShots((s) => ({ ...s, [slot]: { url, error: e instanceof ApiError ? e.message : t.studio.errorGeneric } }));
    }
  };

  const finish = async () => {
    if (!ins) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.analyze(ins.inspection_id);
      setAnalysis(a);
      saveHistory([...loadHistory(), { inspection_id: ins.inspection_id, vehicle_key: ins.vehicle_key, created: new Date().toISOString(), type, model }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.studio.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const compare = async (refId: string) => {
    if (!ins) return;
    setBusy(true);
    try {
      setVerification(await api.verify(refId, ins.inspection_id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.studio.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  if (verification && ins) {
    const srcs: Record<string, string> = {};
    Object.values(shots).forEach((s) => s.up && (srcs[s.up.frame_id] = s.url));
    return <ResultView result={verification} srcs={srcs} analysisCur={analysis?.frames} inspectionId={ins.inspection_id}
      onReset={() => { setVerification(null); setIns(null); setAnalysis(null); }} />;
  }

  if (!ins) {
    return (
      <section className="plan wrap" aria-labelledby="plan-title">
        <h1 className="h2" id="plan-title">{t.studio.tabPlan}</h1>
        <p className="lead quick__intro">{t.studio.planIntro}</p>
        <div className="plan__form">
          <label className="field">
            <span className="label">{t.studio.planVehicle}</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} autoComplete="off" placeholder="01 A 123 BC" />
            <span className="source">{t.studio.planVehicleNote}</span>
          </label>
          <label className="field">
            <span className="label">{t.studio.model}</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <fieldset className="field">
            <legend className="label">{t.studio.planRole}</legend>
            <div className="seg">
              <button type="button" aria-pressed={type === "checkin"} onClick={() => setType("checkin")}>{t.studio.planCheckin}</button>
              <button type="button" aria-pressed={type === "checkout"} onClick={() => setType("checkout")}>{t.studio.planCheckout}</button>
            </div>
          </fieldset>
          <button type="button" className="btn btn--signal" onClick={start} disabled={busy}>{t.studio.planStart}<Arrow /></button>
        </div>
        {error && <p className="alert" role="alert"><Warn /> {error}</p>}
      </section>
    );
  }

  const done = ins.shot_plan.filter((p) => shots[p.slot]?.up).length;
  return (
    <section className="plan wrap" aria-labelledby="plan-run-title">
      <div className="plan__top">
        <h1 className="h3" id="plan-run-title">{type === "checkin" ? t.studio.planCheckin : t.studio.planCheckout} · {MODELS.find((m) => m[0] === model)?.[1]}</h1>
        <span className="mono source">{t.studio.session} {ins.nonce.slice(0, 6).toUpperCase()} · {t.studio.expires} {new Date(ins.expires_at).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" })} · {done}/{ins.shot_plan.length}</span>
      </div>
      <div className="plan__progress" aria-hidden="true">
        {ins.shot_plan.map((p) => <span key={p.slot} className={shots[p.slot]?.up ? (shots[p.slot]?.up?.recapture_required ? "is-bad" : "is-done") : ""} />)}
      </div>
      <ol className="plan__grid">
        {ins.shot_plan.map((p, i) => {
          const s = shots[p.slot];
          const q = s?.up?.quality;
          return (
            <li key={p.slot} className="shot">
              <div className="shot__frame">
                {s ? <img src={s.url} alt={p.instruction} /> : <SlotSilhouette slot={p.slot} />}
                <span className="shot__num mono">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="shot__text">{p.instruction}</div>
              <div className="shot__status mono">
                {s?.busy && "…"}
                {s?.error && <span className="is-bad"><Warn /> {s.error}</span>}
                {q && (q.ok ? <span className="is-ok"><Check /> {t.studio.planDone}</span>
                  : <span className="is-bad"><Warn /> {q.issues.map((x) => t.studio.quality[x as keyof typeof t.studio.quality] ?? x).join(", ")}</span>)}
              </div>
              <label className="btn btn--line btn--small shot__btn">
                <Camera />{s ? t.studio.planRetake : t.studio.planShot}
                <input type="file" accept="image/*" capture="environment" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void shoot(p.slot, f); e.target.value = ""; }} />
              </label>
            </li>
          );
        })}
      </ol>
      <div className="plan__finish">
        <button type="button" className="btn btn--signal" onClick={finish} disabled={busy || done === 0}>{t.studio.planAnalyze}<Arrow /></button>
        {error && <p className="alert" role="alert"><Warn /> {error}</p>}
      </div>
      {analysis && (
        <div className="plan__after">
          {analysis.cost_estimate && <CostCard cost={analysis.cost_estimate} title={t.studio.costCurrent} />}
          <div className="plan__compare">
            <div className="label">{t.studio.planCompareWith}</div>
            {previous.length === 0 ? <p>{t.studio.planNoPrevious}</p> : (
              <ul>
                {previous.map((h) => (
                  <li key={h.inspection_id}>
                    <button type="button" className="btn btn--ink btn--small" onClick={() => compare(h.inspection_id)} disabled={busy}>
                      {new Date(h.created).toLocaleString(lang === "ru" ? "ru-RU" : "en-GB")} · {h.type === "checkin" ? t.studio.planCheckin : t.studio.planCheckout}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <a className="btn btn--line btn--small" href={api.reportUrl(ins.inspection_id)} target="_blank" rel="noreferrer"><Doc />{t.studio.pdf}</a>
          </div>
        </div>
      )}
    </section>
  );
}

/** Line drawing of the car for the current slot of the shot plan. */
function SlotSilhouette({ slot }: { slot: string }) {
  const side = slot === "left" || slot === "right";
  const end = slot === "front" || slot === "rear";
  return (
    <svg className="silhouette" viewBox="0 0 320 200" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="6 5">
        {side && <>
          <path d="M20 140 L34 110 Q44 96 66 92 L112 86 L150 60 Q160 54 178 54 L238 56 Q258 58 270 72 L292 100 Q304 104 306 118 L306 136 Q306 146 296 146 L30 146 Q20 146 20 140 Z" />
          <ellipse cx="82" cy="146" rx="24" ry="24" /><ellipse cx="250" cy="146" rx="24" ry="24" />
        </>}
        {end && <>
          <path d="M70 150 L74 96 Q78 80 96 76 L224 76 Q242 80 246 96 L250 150 Z" />
          <path d="M100 76 L118 46 L202 46 L220 76" />
          <rect x="88" y="160" width="30" height="20" /><rect x="202" y="160" width="30" height="20" />
        </>}
        {!side && !end && <>
          <path d="M28 146 L40 112 Q48 98 68 94 L108 88 L142 58 Q152 52 168 52 L226 54 Q244 56 254 68 L280 98 Q296 104 298 118 L300 140 Q300 150 290 150 L44 154 Q30 154 28 146 Z" />
          <ellipse cx="86" cy="152" rx="26" ry="28" /><ellipse cx="248" cy="148" rx="21" ry="25" />
        </>}
      </g>
    </svg>
  );
}
