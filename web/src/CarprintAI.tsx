import { useRef, useState } from "react";
import { AlertCircle, ArrowRight, ArrowUpRight, Cpu, LoaderCircle, Sparkles, Upload } from "lucide-react";
import {
  DAMAGE_EN,
  HF_DEMO_URL,
  analyzeDamage,
  analyzeVideo,
  apiMessage,
  compareCars,
  opName,
  partName,
  sizeLabel,
  uzs,
  type CompareResult,
  type Cost,
  type DamageResult,
} from "./carprintApi";

export type AiState<T> =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; data: T }
  | { status: "error"; message: string };

/** One AI request at a time per panel; the latest call wins. */
export function useAi<T>() {
  const [state, setState] = useState<AiState<T>>({ status: "idle" });
  const token = useRef(0);
  function run(job: () => Promise<T>) {
    const mine = ++token.current;
    setState({ status: "running" });
    job()
      .then((data) => {
        if (mine === token.current) setState({ status: "done", data });
      })
      .catch((e: unknown) => {
        if (mine === token.current) setState({ status: "error", message: apiMessage(e) });
      });
  }
  function reset() {
    token.current++;
    setState({ status: "idle" });
  }
  return { state, run, reset };
}

export const runDamage = (files: File[]) => () => analyzeDamage(files);
export const runCompare = (reference: File, current: File) => () => compareCars([reference], [current]);

export function HfDemoLink({ className = "hf-link" }: { className?: string }) {
  return (
    <a className={className} href={HF_DEMO_URL} target="_blank" rel="noreferrer">
      Live AI demo <ArrowUpRight size={15} />
    </a>
  );
}

function Pending({ what }: { what: string }) {
  return (
    <div className="ai-panel ai-pending" role="status">
      <LoaderCircle className="spin" size={18} />
      <span>{what} on the CarPrint GPU server… usually 5–15 s.</span>
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <div className="ai-panel ai-failed" role="alert">
      <AlertCircle size={18} />
      <span>
        CarPrint AI could not answer: {message} The geometric check below is independent. You can also try the{" "}
        <a href={HF_DEMO_URL} target="_blank" rel="noreferrer">live demo on Hugging Face</a>.
      </span>
    </div>
  );
}

function Header({ eyebrow, title, device, ms }: { eyebrow: string; title: string; device: string; ms: number }) {
  return (
    <div className="ai-head">
      <div>
        <span className="eyebrow">
          <Sparkles size={12} /> {eyebrow}
        </span>
        <h3>{title}</h3>
      </div>
      <span className="ai-device" title="Where the models ran for this request">
        <Cpu size={14} /> {device} · {(ms / 1000).toFixed(1)} s
      </span>
    </div>
  );
}

function CostBlock({ cost, title }: { cost: Cost; title: string }) {
  return (
    <div className="ai-cost">
      <span className="eyebrow">{title}</span>
      <strong>{uzs(cost.p50)}</strong>
      <span>
        median · range {uzs(cost.p10)} – {uzs(cost.p90)} · ≈ ${cost.usd.p50}
      </span>
      <ul>
        {cost.parts.map((p) => {
          const [op] = Object.entries(p.operation_probs)
            .filter(([k]) => k !== "none")
            .sort((a, b) => b[1] - a[1]);
          return (
            <li key={p.part_key}>
              <span>{partName(p.part_key)}</span>
              <span>{op ? `${opName(op[0])} ${Math.round(op[1] * 100)}%` : ""}</span>
              <span className="mono">{uzs(p.cost_p50)}</span>
            </li>
          );
        })}
      </ul>
      <small>4,000 Monte Carlo scenarios on public Tashkent prices; range for findings confirmed by staff.</small>
    </div>
  );
}

export function AiDamagePanel({ state }: { state: AiState<DamageResult> }) {
  if (state.status === "idle") return null;
  if (state.status === "running") return <Pending what="Segmenting damage and car parts" />;
  if (state.status === "error") return <Failed message={state.message} />;
  const d = state.data;
  const findings = d.frames.flatMap((f) => f.damages);
  return (
    <div className="ai-panel">
      <Header
        eyebrow="CARPRINT AI · RF-DETR-SEG DAMAGE + PARTS"
        title={findings.length ? `${findings.length} damage finding${findings.length > 1 ? "s" : ""}` : "No damage found"}
        device={d.device}
        ms={d.latency_ms}
      />
      <div className="ai-body">
        {d.overlays[0] && <img className="ai-image" src={d.overlays[0]} alt="Damage masks found by the model" />}
        <div className="ai-side">
          {findings.length > 0 && (
            <ul className="ai-findings">
              {findings.map((f) => (
                <li key={f.damage_id}>
                  <strong>{DAMAGE_EN[f.class] ?? f.class}</strong>
                  <span>{partName(f.part)}</span>
                  <span className="mono">
                    {[sizeLabel(f), `${Math.round(f.score * 100)}%`].filter(Boolean).join(" · ")}
                    {f.score < 0.6 && <em> · staff to confirm</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.cost_estimate && <CostBlock cost={d.cost_estimate} title="Indicative repair" />}
        </div>
      </div>
    </div>
  );
}

const VERDICT: Record<string, string> = {
  SAME: "Same vehicle",
  DIFFERENT: "Different vehicle",
  REVIEW: "Needs human review",
  RECAPTURE: "Retake the photos",
};
const STATUS: Record<string, string> = {
  newly_detected: "New",
  previously_recorded: "Recorded before",
  previously_seen_now_absent: "Gone",
  insufficient_evidence: "Not visible",
};

export function AiComparePanel({ state }: { state: AiState<CompareResult> }) {
  if (state.status === "idle") return null;
  if (state.status === "running") return <Pending what="Checking the vehicle's identity" />;
  if (state.status === "error") return <Failed message={state.message} />;
  const r = state.data;
  // score_raw is the verdict's own count of distinct congruent cells (panels overlap, so a sum would overcount).
  const cells = Math.round(r.score_raw ?? r.evidence.reduce((n, e) => n + (e.congruent_cells ?? 0), 0));
  const inliers = r.evidence.reduce((n, e) => n + (e.inliers ?? 0), 0);
  const nfa = r.evidence.reduce<number | null>(
    (m, e) => (e.log10_nfa == null ? m : m == null ? e.log10_nfa : Math.min(m, e.log10_nfa)),
    null,
  );
  return (
    <div className={`ai-panel ai-verdict-${r.decision.toLowerCase()}`}>
      <Header
        eyebrow="CARPRINT AI · ALIKED + LIGHTGLUE + A-CONTRARIO"
        title={VERDICT[r.decision] ?? r.decision}
        device={r.device}
        ms={r.latency_ms}
      />
      <div className="result-metrics ai-metrics">
        <div>
          <strong>{cells}</strong>
          <span>Cells with individual marks, all panels (≥ 6 for “same”)</span>
        </div>
        <div>
          <strong>{inliers}</strong>
          <span>Verified point matches</span>
        </div>
        <div>
          <strong>{nfa != null ? <>10<sup>{Math.round(nfa)}</sup></> : "—"}</strong>
          <span>Chance of a random match (NFA)</span>
        </div>
        <div>
          <strong>{r.cohort_size ?? 0}</strong>
          <span>Same-model cars used to discount design</span>
        </div>
      </div>
      {r.match_image && (
        <figure className="ai-figure">
          <img className="ai-image" src={r.match_image} alt="Point matches between the two photos" />
          <figcaption>Orange: individual marks of this car · grey: design shared by the model.</figcaption>
        </figure>
      )}
      {r.reasons_en && r.reasons_en.length > 0 && (
        <ul className="ai-reasons">
          {r.reasons_en.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {r.damage_timeline.length > 0 && (
        <ul className="ai-findings ai-timeline">
          {r.damage_timeline.map((t, i) => (
            <li key={i}>
              <strong>{STATUS[t.status] ?? t.status}</strong>
              <span>
                {DAMAGE_EN[t.class] ?? t.class} · {partName(t.part)}
              </span>
              <span className="mono">{t.score != null ? `${Math.round(t.score * 100)}%` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {r.cost_estimate_new && <CostBlock cost={r.cost_estimate_new} title="Repair of what is new" />}
    </div>
  );
}

const SAMPLES = [
  { file: "prius_rear_quarter.jpg", label: "Crushed rear quarter" },
  { file: "megane_quarter_dent.jpg", label: "Rear quarter dent" },
  { file: "micra_front_dent.jpg", label: "Front wing dent" },
];

/** Landing section: photos or a walk-around video -> damage, part, size and repair range from the GPU models. */
export function DamageScanner() {
  const ai = useAi<DamageResult>();
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const busy = ai.state.status === "running";

  function pick(list: File[]) {
    setError("");
    ai.reset();
    const clip = list.find((f) => f.type.startsWith("video/"));
    const images = list.filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type)).slice(0, 8);
    if (clip && clip.size > 100 * 1024 * 1024) return setError("Choose a video up to 100 MB and 90 seconds.");
    if (images.some((f) => f.size > 15 * 1024 * 1024)) return setError("Choose JPG, PNG or WebP photos up to 15 MB each.");
    if (!clip && !images.length) return setError("Choose JPG, PNG or WebP photos, or an MP4/MOV video.");
    if (preview) URL.revokeObjectURL(preview);
    setVideo(clip ?? null);
    setPhotos(clip ? [] : images);
    setPreview(clip ? "" : URL.createObjectURL(images[0]));
  }
  async function sample(name: string) {
    setError("");
    try {
      const res = await fetch(`/carprint-examples/${name}`);
      if (!res.ok) throw new Error();
      pick([new File([await res.blob()], name, { type: "image/jpeg" })]);
    } catch {
      setError("The sample could not be loaded. Upload your own photo instead.");
    }
  }
  function scan() {
    if (busy) return;
    if (video) ai.run(() => analyzeVideo(video));
    else if (photos.length) ai.run(() => analyzeDamage(photos));
  }
  const ready = video ? `Video: ${video.name}` : photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""} ready` : "";
  return (
    <section className="workspace section ai-scan" id="ai-damage" aria-labelledby="ai-damage-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> AI DAMAGE SCAN · LIVE GPU
          </span>
          <h2 id="ai-damage-title">
            One photo or a walk-around video.
            <br />
            <span className="muted">Damage, part, size and repair range.</span>
          </h2>
        </div>
        <p>
          Our RF-DETR-Seg models (7 damage classes, 21 car parts) run on the CarPrint GPU server on Hugging Face.
          Try a damaged car the model never saw in training, or upload up to 8 photos or a video up to 90 s.
        </p>
      </div>
      <div className="lab ai-scan-lab">
        <div className="ai-scan-row">
          <label className={`button button-dark ai-upload${busy ? " disabled" : ""}`}>
            <Upload size={17} /> Choose photos or video
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                pick(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <div className="ai-samples" aria-label="Samples">
            {SAMPLES.map((s) => (
              <button key={s.file} type="button" className="ai-sample" disabled={busy} onClick={() => void sample(s.file)}>
                <img src={`/carprint-examples/${s.file}`} alt="" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
        {preview && <img className="ai-preview" src={preview} alt="Selected photo" />}
        {error && (
          <p className="error-message" role="alert">
            <AlertCircle size={19} />
            {error}
          </p>
        )}
        <div className="lab-actions">
          <span role="status">{busy ? "The models are looking at your photos…" : ready || "Add a photo or a video to start"}</span>
          <button className="button button-dark" onClick={scan} disabled={busy || (!video && !photos.length)}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={18} /> Scanning…
              </>
            ) : (
              <>
                Scan for damage <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
        <AiDamagePanel state={ai.state} />
        <div className="lab-footnote">
          <span>Samples: HITL Car Parts &amp; Damages (CC0), held-out split</span>
          <span className="mono">RF-DETR-SEG · MONTE CARLO COSTING</span>
          <HfDemoLink />
        </div>
      </div>
    </section>
  );
}
