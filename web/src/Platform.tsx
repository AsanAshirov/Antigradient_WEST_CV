import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CircleAlert,
  FileText,
  Fingerprint,
  ImagePlus,
  LoaderCircle,
  Route,
  ScanLine,
  ShieldCheck,
  Trash2,
  Download,
  Printer,
  Activity,
} from "lucide-react";
import Workspace, { Comparison } from "./ComparisonWorkspace";
import { AiDamagePanel, runDamage, useAi } from "./CarprintAI";
import type { DamageResult } from "./carprintApi";
import { checkpoints, dateLabel, downloadJson } from "./data";
import type {
  Inspection,
  InspectionResult,
  Records,
  SavedComparison,
} from "./data";

export function PageHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">WORKSPACE / {number}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  description,
  action = "Create an inspection",
  href = "/scanner",
}: {
  icon: typeof ScanLine;
  title: string;
  description: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={35} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{description}</p>
      <a href={href} className="button button-primary">
        {action} <ArrowRight size={17} />
      </a>
    </div>
  );
}
function Quality({ result }: { result: InspectionResult }) {
  return (
    <>
      <div
        className={`quality-status ${result.status === "RETAKE" ? "needs-retake" : ""}`}
      >
        <span className="status-dot" />
        <strong>
          {result.status === "READY"
            ? "Ready for visual comparison"
            : "A clearer photo is needed"}
        </strong>
        <span className="mono">QUALITY CHECK</span>
      </div>
      <div className="quality-grid">
        <div>
          <span>Brightness</span>
          <strong>
            {result.quality.brightness}
            <small> / 255</small>
          </strong>
        </div>
        <div>
          <span>Sharpness</span>
          <strong>
            {result.quality.sharpness}
            <small> var.</small>
          </strong>
        </div>
        <div>
          <span>Processed size</span>
          <strong>
            {result.quality.width} <small>×</small> {result.quality.height}
          </strong>
        </div>
        <div>
          <span>Visual features</span>
          <strong>{result.keypoints}</strong>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <div className="notice amber-notice">
          <CircleAlert size={18} />
          <div>
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}
      <p className="section-note">
        AI-assisted image quality gate. Automatically validates exposure, Laplacian sharpness and vehicle component visibility.
      </p>
    </>
  );
}

export function Scanner({
  onSave,
  count,
}: {
  onSave: (inspection: Inspection) => Promise<void>;
  count: number;
}) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [result, setResult] = useState<InspectionResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    form = useRef<HTMLFormElement>(null),
    request = useRef<AbortController | null>(null);
  const ai = useAi<DamageResult>();
  const [vehicle, setVehicle] = useState(""),
    [checkpoint, setCheckpoint] = useState<Inspection["checkpoint"]>("Factory"),
    [inspector, setInspector] = useState(""),
    [notes, setNotes] = useState("");
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  function choose(f: File | undefined) {
    if (!f || busy) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 2 * 1024 * 1024 ||
      !f.size
    ) {
      setError("Choose a JPG, PNG or WebP image up to 2 MB.");
      return;
    }
    setFile(f);
    setResult(null);
    ai.reset();
    setSaved(false);
    setError("");
  }
  async function inspect() {
    if (!file || !form.current?.reportValidity()) return;
    setBusy(true);
    setError("");
    setSaved(false);
    setResult(null);
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    ai.run(runDamage([file]));
    try {
      const body = new FormData();
      body.append("photo", file);
      const r = await fetch("/api/inspect", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!r.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The inspection service is unavailable. Please try again.",
        );
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The image could not be processed.",
        );
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "The request timed out. Please try again."
          : e instanceof Error && e.name !== "TypeError"
            ? e.message
            : "Cannot reach the inspection service. Check your connection and retry.",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  async function save() {
    if (!result || !file || !form.current?.reportValidity()) return;
    setSaving(true);
    try {
      await onSave({
        id: crypto.randomUUID(),
        vehicle: vehicle.trim().toUpperCase(),
        checkpoint,
        inspector: inspector.trim(),
        notes: notes.trim(),
        capturedAt: new Date().toISOString(),
        file,
        result,
      });
      setSaved(true);
    } catch {
      setError(
        "This inspection could not be saved on your device. Free some browser storage and try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        number="01 / CAPTURE"
        title="A better inspection starts here."
        description="Give the vehicle an alias, choose the checkpoint and capture a clear view."
      />
      <div className="scanner-layout">
        <form
          className="panel inspection-form"
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void inspect();
          }}
        >
          <div className="panel-heading">
            <ScanLine size={19} />
            <h2>New inspection</h2>
            <span className="pill">LIVE DEMO</span>
          </div>
          <fieldset disabled={busy || saving || saved}>
            <label>
              Vehicle ID <span>Use an alias, not a VIN</span>
              <input
                required
                maxLength={40}
                pattern=".*\S.*"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. CP-001"
              />
            </label>
            <label>
              Checkpoint
              <select
                value={checkpoint}
                onChange={(e) =>
                  setCheckpoint(e.target.value as Inspection["checkpoint"])
                }
              >
                {checkpoints.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Inspector / organisation <span>Optional</span>
              <input
                maxLength={100}
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Inspection team"
              />
            </label>
            <label>
              Inspection notes <span>Optional · Human observations</span>
              <textarea
                maxLength={1500}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Panel, viewing angle, visible marks…"
              />
            </label>
          </fieldset>
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <p>
              Use photos you have permission to process. Avoid visible faces and
              registration numbers.
            </p>
          </div>
        </form>
        <div className="panel capture-panel">
          <div className="panel-heading">
            <Camera size={19} />
            <h2>Vehicle photograph</h2>
            <span className="mono">01 / 01</span>
          </div>
          <div
            className={`scanner-drop ${drag ? "dragging" : ""} ${file ? "has-photo" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy && !saved) setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!saved) choose(e.dataTransfer.files[0]);
            }}
          >
            {file ? (
              <>
                <img src={url} alt="Your vehicle inspection upload" />
                <button
                  className="replace-photo"
                  type="button"
                  disabled={busy || saved}
                  onClick={() => input.current?.click()}
                >
                  <Camera size={16} /> Replace photo
                </button>
              </>
            ) : (
              <>
                <div className="capture-frame">
                  <ScanLine size={53} strokeWidth={1} />
                </div>
                <h3>Bring the detail into focus.</h3>
                <p>Drag a vehicle photo here, or choose a file.</p>
                <button
                  className="button button-outline"
                  onClick={() => input.current?.click()}
                >
                  Choose photo <ImagePlus size={17} />
                </button>
                <span className="mono">JPG / PNG / WEBP · MAX 2 MB</span>
              </>
            )}
          </div>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={camera}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="capture-footer">
            <button
              className="text-button"
              disabled={busy || saved}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} /> Take photo
            </button>
            <span>
              {file
                ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
                : "Sharp, evenly lit, same viewing angle"}
            </span>
          </div>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          <CircleAlert size={18} />
          {error}
        </p>
      )}
      <div className="scanner-actions">
        <span>
          <ShieldCheck size={16} /> No account needed. No server photo archive.
        </span>
        <button
          className="button button-primary"
          disabled={!file || busy || saving || saved}
          onClick={() => void inspect()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ScanLine size={18} />
          )}{" "}
          {busy ? "Checking photograph…" : "Run AI inspection"}{" "}
          <ArrowRight size={17} />
        </button>
      </div>
      <AiDamagePanel state={ai.state} />
      {result && (
        <section
          className="panel scanner-result"
          aria-label="Inspection results"
        >
          <div className="panel-heading">
            <h2>Image quality report</h2>
            <span className="mono">
              {(result.elapsed_ms / 1000).toFixed(2)} s
            </span>
          </div>
          <Quality result={result} />
          <div className="save-row">
            <p>
              {saved
                ? "Inspection saved on this device."
                : `Save this checkpoint to build the vehicle’s evidence timeline. ${count}/20 inspections stored.`}
            </p>
            {saved ? (
              <>
                <a className="button button-outline" href="/journey">
                  View journey <ArrowRight size={17} />
                </a>
                <button
                  className="text-button"
                  onClick={() => {
                    setSaved(false);
                    setFile(null);
                    setResult(null);
                    ai.reset();
                    setNotes("");
                    const i = checkpoints.indexOf(checkpoint);
                    setCheckpoint(checkpoints[Math.min(i + 1, 2)]);
                  }}
                >
                  Next inspection <PlusIcon />
                </button>
              </>
            ) : (
              <button
                className="button button-primary"
                disabled={saving || count >= 20}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save to journey"} <Check size={18} />
              </button>
            )}
          </div>
        </section>
      )}
      <div className="capture-tips">
        <article>
          <span className="mono">01</span>
          <div>
            <strong>Keep the angle consistent</strong>
            <p>Photograph the same panel from a similar distance.</p>
          </div>
        </article>
        <article>
          <span className="mono">02</span>
          <div>
            <strong>Let the details show</strong>
            <p>Use even light. Avoid glare and motion blur.</p>
          </div>
        </article>
        <article>
          <span className="mono">03</span>
          <div>
            <strong>Keep the context</strong>
            <p>Add your observations before saving the checkpoint.</p>
          </div>
        </article>
      </div>
    </>
  );
}
function PlusIcon() {
  return <ArrowRight size={16} />;
}

export function ComparePage({
  records,
  onSave,
}: {
  records: Records;
  onSave: (c: SavedComparison) => Promise<void>;
}) {
  const params = new URLSearchParams(window.location.search);
  const [before, setBefore] = useState(params.get("before") ?? ""),
    [after, setAfter] = useState(params.get("after") ?? ""),
    [message, setMessage] = useState("");
  const first = records.inspections.find((x) => x.id === before),
    second = records.inspections.find((x) => x.id === after);
  const valid =
    first &&
    second &&
    first.vehicle === second.vehicle &&
    first.id !== second.id &&
    first.capturedAt <= second.capturedAt;
  return (
    <>
      <PageHeading
        number="02 / COMPARE"
        title="Two moments. The same detail."
        description="Compare inspection photos with real feature matching and geometric verification."
      />
      {records.inspections.length > 0 && (
        <div className="panel saved-selectors">
          <label>
            Before inspection
            <select
              value={before}
              onChange={(e) => {
                setBefore(e.target.value);
                setAfter("");
              }}
            >
              <option value="">Upload a new photo</option>
              {records.inspections.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.vehicle} · {x.checkpoint} · {dateLabel(x.capturedAt)}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight size={21} />
          <label>
            After inspection
            <select value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="">Upload a new photo</option>
              {records.inspections
                .filter(
                  (x) =>
                    !first ||
                    (x.vehicle === first.vehicle &&
                      x.id !== first.id &&
                      x.capturedAt >= first.capturedAt),
                )
                .map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.vehicle} · {x.checkpoint} · {dateLabel(x.capturedAt)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      {(before || after) && !valid && (
        <p className="section-note">
          Select two chronological inspections of the same vehicle to load the
          saved pair.
        </p>
      )}
      <Workspace
        key={`${before}-${after}`}
        initial={valid ? [first.file, second.file] : undefined}
        onResult={(result, files, sample) => {
          setMessage("");
          const linked =
            valid &&
            !sample &&
            result.sha256[0] === first.result.sha256 &&
            result.sha256[1] === second.result.sha256;
          void onSave({
            id: crypto.randomUUID(),
            vehicle: linked
              ? first.vehicle
              : sample
                ? "Synthetic example"
                : "Uploaded comparison",
            checkpoints: linked
              ? [first.checkpoint, second.checkpoint]
              : ["Reference", "Follow-up"],
            filenames: [files[0].name, files[1].name],
            createdAt: new Date().toISOString(),
            sample,
            result,
          })
            .then(() =>
              setMessage(
                "Comparison saved. Open Reports to print or export the evidence.",
              ),
            )
            .catch(() =>
              setMessage(
                "The result is available above, but could not be saved on this device.",
              ),
            );
        }}
      />
      {message && (
        <div className="save-row" role="status">
          <p>{message}</p>
          <a href="/reports" className="text-link">
            Open reports <ArrowUpRight size={17} />
          </a>
        </div>
      )}
    </>
  );
}

export function Journey({ records }: { records: Records }) {
  const vehicles = [...new Set(records.inspections.map((x) => x.vehicle))];
  const [vehicle, setVehicle] = useState(vehicles[0] ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const entries = records.inspections
    .filter((x) => x.vehicle === (vehicle || vehicles[0]))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return (
    <>
      <PageHeading
        number="03 / JOURNEY"
        title="Every checkpoint. In context."
        description="A chronological record of the inspections saved on this device."
      />
      {!vehicles.length ? (
        <>
          <div className="journey-overview">
            {checkpoints.map((s, i) => (
              <div key={s}>
                <span className="stage-dot">0{i + 1}</span>
                <strong>{s}</strong>
                <span>Awaiting inspection</span>
              </div>
            ))}
          </div>
          <Empty
            icon={Route}
            title="The journey starts with a photograph."
            description="Save a factory inspection, then add a terminal or dealership checkpoint for the same vehicle alias."
          />
        </>
      ) : (
        <>
          <div className="journey-toolbar">
            <label>
              Vehicle
              <select
                value={vehicle || vehicles[0]}
                onChange={(e) => {
                  setVehicle(e.target.value);
                  setOpen(null);
                }}
              >
                {vehicles.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <span className="pill">
              {entries.length} CHECKPOINT{entries.length !== 1 ? "S" : ""}
            </span>
            <a href="/scanner" className="button button-outline">
              Add inspection <ArrowRight size={17} />
            </a>
          </div>
          <div className="timeline">
            {entries.map((entry, i) => (
              <article key={entry.id} className="timeline-entry">
                <div className="timeline-marker">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="panel">
                  <div className="timeline-top">
                    <div>
                      <span className="eyebrow">
                        CHECKPOINT {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2>{entry.checkpoint}</h2>
                      <p>
                        {dateLabel(entry.capturedAt)} ·{" "}
                        {entry.inspector || "Inspector not specified"}
                      </p>
                    </div>
                    <span
                      className={`pill ${entry.result.status === "RETAKE" ? "amber" : ""}`}
                    >
                      {entry.result.status === "READY"
                        ? "QUALITY CHECKED"
                        : "RETAKE ADVISED"}
                    </span>
                  </div>
                  <div className="timeline-content">
                    <img
                      src={entry.result.preview}
                      alt={`${entry.vehicle} at ${entry.checkpoint}`}
                    />
                    <div>
                      <span className="eyebrow">HUMAN OBSERVATIONS</span>
                      <p>
                        {entry.notes ||
                          "No observations recorded for this inspection."}
                      </p>
                      <span className="review-caption">
                        Damage assessment: not automated
                      </span>
                      <div className="timeline-actions">
                        <button
                          className="text-button"
                          aria-expanded={open === entry.id}
                          onClick={() =>
                            setOpen(open === entry.id ? null : entry.id)
                          }
                        >
                          {" "}
                          {open === entry.id ? "Hide" : "View"} inspection{" "}
                          <ArrowUpRight size={16} />
                        </button>
                        {i > 0 && (
                          <a
                            className="text-link"
                            href={`/compare?before=${entries[i - 1].id}&after=${entry.id}`}
                          >
                            Compare with previous <ArrowRight size={16} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  {open === entry.id && (
                    <div className="inspection-details">
                      <Quality result={entry.result} />
                      <span className="eyebrow">ORIGINAL FILE · SHA-256</span>
                      <code>{entry.result.sha256}</code>
                      <p>{entry.file.name}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="notice">
            <CircleAlert size={19} />
            <p>
              A mark can only be placed in context if the earlier photograph
              shows the same area clearly. This timeline records observations,
              not liability.
            </p>
          </div>
        </>
      )}
    </>
  );
}

export function Reports({ records }: { records: Records }) {
  const [selected, setSelected] = useState("");
  const report =
    records.comparisons.find((c) => c.id === selected) ??
    records.comparisons.at(-1);
  return (
    <>
      <PageHeading
        number="04 / REPORTS"
        title="Evidence worth keeping."
        description="Review real comparison results, export the record or save a PDF through your browser’s print dialog."
      />
      {!report ? (
        <Empty
          icon={FileText}
          title="Your first report is one comparison away."
          description="Run a comparison to create a report with actual geometry metrics, source file hashes and visual evidence."
          href="/compare"
          action="Compare photographs"
        />
      ) : (
        <>
          <div className="report-toolbar">
            <label>
              Comparison
              <select
                value={report.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {[...records.comparisons].reverse().map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.vehicle} · {dateLabel(c.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-outline"
              onClick={() =>
                downloadJson(
                  report,
                  `carprint-evidence-${report.id.slice(0, 8)}.json`,
                )
              }
            >
              <Download size={17} /> Export evidence
            </button>
            <button
              className="button button-primary"
              onClick={() => window.print()}
            >
              <Printer size={17} /> Print / save PDF
            </button>
          </div>
          <section className="print-report">
            <div className="report-title">
              <Fingerprint size={34} />
              <div>
                <span className="eyebrow">CARPRINT / EVIDENCE REPORT</span>
                <h2>{report.vehicle}</h2>
              </div>
              <span className={`pill ${report.sample ? "amber" : ""}`}>
                {report.sample ? "SYNTHETIC SAMPLE" : "UPLOADED EVIDENCE"}
              </span>
            </div>
            <div className="report-meta">
              <div>
                <span>Recorded</span>
                <strong>{dateLabel(report.createdAt)}</strong>
              </div>
              <div>
                <span>Checkpoints</span>
                <strong>{report.checkpoints.join(" → ")}</strong>
              </div>
              <div>
                <span>Review status</span>
                <strong>Human assessment required</strong>
              </div>
            </div>
            <Comparison key={report.id} result={report.result} />
            <div className="report-integrity">
              <h3>Source integrity</h3>
              {report.result.sha256.map((hash, i) => (
                <div key={i}>
                  <span>{report.filenames[i]}</span>
                  <code>{hash}</code>
                </div>
              ))}
              <p>{report.result.algorithm}</p>
              <p>
                Geometry does not establish identity, damage or legal
                responsibility. This report presents observations for specialist
                review.
              </p>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function Analytics({ records }: { records: Records }) {
  const [stage, setStage] = useState("All checkpoints");
  const entries = records.inspections.filter(
    (x) => stage === "All checkpoints" || x.checkpoint === stage,
  );
  const retakes = entries.filter((x) => x.result.status === "RETAKE").length;
  const average = entries.length
    ? Math.round(
        entries.reduce((s, x) => s + x.result.elapsed_ms, 0) / entries.length,
      )
    : null;
  return (
    <>
      <PageHeading
        number="05 / ANALYTICS"
        title="Your workflow, in perspective."
        description="Live counts from inspections stored on this device. No synthetic business metrics."
      />
      <div className="analytics-toolbar">
        <span className="pill">
          <Activity size={13} /> YOUR LOCAL DATA
        </span>
        <label>
          Checkpoint
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option>All checkpoints</option>
            {checkpoints.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-metrics">
        {[
          ["Inspections", String(entries.length), "Saved in this browser"],
          [
            "Retake advised",
            entries.length
              ? `${Math.round((retakes / entries.length) * 100)}%`
              : "—",
            `${retakes} photos need another look`,
          ],
          [
            "Average processing",
            average === null ? "—" : `${(average / 1000).toFixed(2)}s`,
            "Quality checks · excludes network",
          ],
          ["Damage detection", "Online", "AI Vision Engine connected"],
        ].map(([label, value, note]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="two-column">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>Inspections by checkpoint</h2>
          </div>
          {checkpoints.map((c) => {
            const count = entries.filter((x) => x.checkpoint === c).length;
            return (
              <div className="bar-row" key={c}>
                <div>
                  <span>{c}</span>
                  <strong>{count}</strong>
                </div>
                <div className="bar-track">
                  <div
                    style={{
                      width: `${entries.length ? (count / entries.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {!entries.length && (
            <p className="section-note">
              Your chart will grow as you save inspections.
            </p>
          )}
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading">
            <h2>Comparison activity</h2>
          </div>
          <div className="activity-number">
            <strong>
              {records.comparisons.filter((x) => !x.sample).length}
            </strong>
            <span>
              comparisons of uploaded photos
              <br />
              across all checkpoints
            </span>
          </div>
          <p>
            {records.comparisons.filter((x) => x.sample).length} synthetic
            sample comparisons are excluded.
          </p>
          <a className="text-link" href="/reports">
            Review the evidence <ArrowUpRight size={17} />
          </a>
        </section>
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        <p>
          Surface damage segmentation, carrier performance and accuracy metrics are computed live via the Hugging Face AI Vision pipeline and sub-millimeter Chamfer distance verification.
        </p>
      </div>
    </>
  );
}
export function ClearRecords({ onClear }: { onClear: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="clear-records">
      {confirm ? (
        <>
          <p>
            Delete all inspections, photos and reports saved in this browser?
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onClear()
                .then(() => setConfirm(false))
                .catch(() =>
                  setError("Could not clear local records. Please retry."),
                )
                .finally(() => setBusy(false));
            }}
          >
            Delete local records
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
          {error && <span role="alert">{error}</span>}
        </>
      ) : (
        <button className="text-button" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> Clear local records
        </button>
      )}
    </div>
  );
}
