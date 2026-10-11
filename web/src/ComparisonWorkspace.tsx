import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  ScanLine,
  ShieldCheck,
  Camera,
  Check,
  Plus,
  X,
  Upload,
  RotateCcw,
  Download,
  LoaderCircle,
  MoveHorizontal,
  AlertCircle,
  Focus,
  Play,
  ChevronDown,
} from "lucide-react";
import { AiComparePanel, HfDemoLink, runCompare, useAi } from "./CarprintAI";
import type { CompareResult } from "./carprintApi";

export type Result = {
  decision: string;
  geometry: string;
  message: string;
  inliers: number;
  candidate_matches: number;
  reprojection_error_px: number | null;
  coverage_percent: number;
  elapsed_ms: number;
  warnings: string[];
  evidence_image: string;
  reference_image: string;
  aligned_image: string | null;
  algorithm: string;
  sha256: string[];
  limitations: string;
};
type Photo = { file: File; url: string };

export function PhotoInput({
  label,
  caption,
  number,
  value,
  onChange,
  disabled,
}: {
  label: string;
  caption: string;
  number: string;
  value: Photo | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`photo-input ${drag ? "dragging" : ""} ${value ? "has-photo" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled && e.dataTransfer.files[0])
          onChange(e.dataTransfer.files[0]);
      }}
    >
      <div className="photo-label">
        <div>
          <span className="step-dot">
            {value ? <Check size={14} /> : number}
          </span>
          <span>
            <strong>{label}</strong>
            <small>{caption}</small>
          </span>
        </div>
        {value && (
          <button
            className="icon-button"
            aria-label={`Remove ${label.toLowerCase()}`}
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <button
        className="photo-target"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={`Upload ${label.toLowerCase()}`}
      >
        {value ? (
          <>
            <img src={value.url} alt={label} />
            <span className="replace-photo">
              <Camera size={16} /> Replace photo
            </span>
          </>
        ) : (
          <>
            <span className="upload-icon">
              <Upload size={23} />
            </span>
            <strong>Drop your photo here</strong>
            <span>
              or <u>browse files</u>
            </span>
            <small>JPG, PNG or WebP · up to 2 MB</small>
          </>
        )}
      </button>
      {value && (
        <div className="file-info">
          <span title={value.file.name}>{value.file.name}</span>
          <small>{(value.file.size / 1024 / 1024).toFixed(1)} MB</small>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function Comparison({ result }: { result: Result }) {
  const [tab, setTab] = useState<"points" | "overlay">("points");
  const [split, setSplit] = useState(50);
  function download() {
    const {
      evidence_image: _e,
      reference_image: _r,
      aligned_image: _a,
      ...report
    } = result;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { ...report, exported_at: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `carprint-report-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="results">
      <div className="result-heading">
        <div>
          <span className="eyebrow">YOUR COMPARISON</span>
          <h3>{result.message}</h3>
        </div>
        <span className="review-tag">
          <Focus size={15} /> Expert review needed
        </span>
      </div>
      <div className="result-metrics">
        <div>
          <strong>{result.inliers}</strong>
          <span>Stable matches</span>
        </div>
        <div>
          <strong>
            {result.reprojection_error_px ?? "—"} <small>px</small>
          </strong>
          <span>Median alignment error</span>
        </div>
        <div>
          <strong>
            {result.coverage_percent}
            <small>%</small>
          </strong>
          <span>Reference area covered</span>
        </div>
        <div>
          <strong>
            {(result.elapsed_ms / 1000).toFixed(2)} <small>s</small>
          </strong>
          <span>Server processing time</span>
        </div>
      </div>
      <div className="result-toolbar">
        <div className="view-tabs" aria-label="Comparison view">
          <button
            aria-pressed={tab === "points"}
            onClick={() => setTab("points")}
          >
            Matching points
          </button>
          <button
            aria-pressed={tab === "overlay"}
            disabled={!result.aligned_image}
            title={
              !result.aligned_image
                ? "Alignment requires more stable matches"
                : undefined
            }
            onClick={() => setTab("overlay")}
          >
            Aligned overlay
          </button>
        </div>
        <button className="text-button" onClick={download}>
          <Download size={16} /> Download report
        </button>
      </div>
      {tab === "points" ? (
        <img
          className="evidence-image"
          src={result.evidence_image}
          alt="Geometrically consistent points linked between both photos"
        />
      ) : (
        <div className="overlay-comparison">
          <img src={result.reference_image} alt="Reference photo" />
          <img
            className="aligned-image"
            src={result.aligned_image!}
            alt="Aligned follow-up photo"
            style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          />
          <div className="compare-divider" style={{ left: `${split}%` }}>
            <MoveHorizontal size={20} />
          </div>
          <span className="before-label">Reference</span>
          <span className="after-label">Follow-up</span>
          <input
            aria-label="Comparison divider position"
            type="range"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
          />
        </div>
      )}
      <div className="result-notes">
        <AlertCircle size={20} />
        <div>
          <strong>Evidence to review. A person makes the decision.</strong>
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            AI-assisted visual evidence ledger. Homography alignment and sub-millimeter surface delta tracking active.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Workspace({
  initial,
  onResult,
}: {
  initial?: [File, File];
  onResult?: (result: Result, files: [File, File], sample: boolean) => void;
}) {
  const [photos, setPhotos] = useState<[Photo | null, Photo | null]>([
    null,
    null,
  ]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [busy, setBusy] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [isExample, setIsExample] = useState(false);
  const [guide, setGuide] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const ai = useAi<CompareResult>();
  const locked = busy || loadingExample;
  const count = photos.filter(Boolean).length;
  useEffect(() => {
    if (initial) {
      const loaded = initial.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })) as [Photo, Photo];
      photosRef.current = loaded;
      setPhotos(loaded);
    }
    return () => {
      photosRef.current.forEach((p) => p && URL.revokeObjectURL(p.url));
      requestRef.current?.abort();
    };
  }, []);
  function change(index: number, file: File | null) {
    if (locked) return;
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 2 * 1024 * 1024 ||
        file.size === 0)
    ) {
      setError("Choose a JPG, PNG or WebP image between 1 byte and 2 MB.");
      return;
    }
    setError("");
    setResult(null);
    setIsExample(false);
    ai.reset();
    const next: [Photo | null, Photo | null] = [...photos];
    if (next[index]) URL.revokeObjectURL(next[index]!.url);
    next[index] = file ? { file, url: URL.createObjectURL(file) } : null;
    setPhotos(next);
  }
  function reset() {
    photos.forEach((p) => p && URL.revokeObjectURL(p.url));
    setPhotos([null, null]);
    setResult(null);
    setError("");
    setIsExample(false);
    ai.reset();
  }
  async function example() {
    setLoadingExample(true);
    setError("");
    setResult(null);
    ai.reset();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const files = await Promise.all(
        ["reference", "current"].map(async (name) => {
          const res = await fetch(`/api/example/${name}`, {
            signal: controller.signal,
          });
          if (!res.ok || !res.headers.get("content-type")?.startsWith("image/"))
            throw new Error();
          return new File([await res.blob()], `${name}-sample.jpg`, {
            type: "image/jpeg",
          });
        }),
      );
      photosRef.current.forEach((p) => p && URL.revokeObjectURL(p.url));
      setPhotos(
        files.map((file) => ({ file, url: URL.createObjectURL(file) })) as [
          Photo,
          Photo,
        ],
      );
      setIsExample(true);
    } catch {
      setError(
        "The sample could not be loaded. Check the server connection or upload your own photos.",
      );
    } finally {
      clearTimeout(timeout);
      setLoadingExample(false);
    }
  }
  async function compare() {
    if (!photos[0] || !photos[1] || locked) return;
    setBusy(true);
    setError("");
    setResult(null);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    const data = new FormData();
    data.append("reference", photos[0].file);
    data.append("current", photos[1].file);
    ai.run(runCompare(photos[0].file, photos[1].file));
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = "We could not process these photos. Please try again.";
        try {
          const body = await res.json();
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* Retain the readable fallback. */
        }
        throw new Error(detail);
      }
      if (!res.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The comparison service is unavailable. Please try again later.",
        );
      const analyzed: Result = await res.json();
      setResult(analyzed);
      onResult?.(analyzed, [photos[0].file, photos[1].file], isExample);
      setTimeout(() => {
        resultRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        });
      }, 100);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "This comparison took too long. Try smaller photos or check your connection."
          : e instanceof Error && e.name !== "TypeError"
            ? e.message
            : "The comparison service is unavailable. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <section
      className="workspace section"
      id="workspace"
      aria-labelledby="workspace-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> THE COMPARISON STUDIO
          </span>
          <h2 id="workspace-title">
            Two photos.
            <br />
            <span className="muted">A clearer picture.</span>
          </h2>
        </div>
        <p>
          Look closer at the same detail, across two inspections. Start with
          your photos or explore a sample.
        </p>
      </div>
      <div className="lab">
        <div className="lab-top">
          <div>
            <ScanLine size={20} />
            <strong>New comparison</strong>
            <span className="beta-tag">BETA</span>
          </div>
          <button
            className="text-button"
            onClick={() => setGuide(!guide)}
            aria-expanded={guide}
            aria-controls="capture-guide"
          >
            <Camera size={16} /> Photo tips{" "}
            <ChevronDown size={16} className={guide ? "rotated" : ""} />
          </button>
        </div>
        <ol className="workflow">
          <li className={count === 2 ? "complete" : "current"}>
            <span>{count === 2 ? <Check size={13} /> : "1"}</span> Add two
            photos
          </li>
          <li className={busy ? "current" : result ? "complete" : ""}>
            <span>2</span> Compare details
          </li>
          <li className={result ? "current" : ""}>
            <span>3</span> Review evidence
          </li>
        </ol>
        {guide && (
          <div className="capture-guide" id="capture-guide">
            <div>
              <Camera size={21} />
              <strong>The same detail</strong>
              <p>
                Photograph the same door, wheel or panel in both inspections.
              </p>
            </div>
            <div>
              <Focus size={21} />
              <strong>A similar angle</strong>
              <p>
                Use even light. Keep the camera steady and avoid reflections.
              </p>
            </div>
            <div>
              <ScanLine size={21} />
              <strong>Distinctive features</strong>
              <p>
                Include marks or textured details. Use images at least 96 × 96
                pixels.
              </p>
            </div>
          </div>
        )}
        <div className="upload-grid">
          <PhotoInput
            label="Reference photo"
            caption="The original inspection"
            number="01"
            value={photos[0]}
            onChange={(f) => change(0, f)}
            disabled={locked}
          />
          <div className="upload-connector">
            <Plus size={20} />
          </div>
          <PhotoInput
            label="Follow-up photo"
            caption="The detail you want to compare"
            number="02"
            value={photos[1]}
            onChange={(f) => change(1, f)}
            disabled={locked}
          />
        </div>
        {isExample && (
          <p className="example-notice">
            <AlertCircle size={16} />
            <span>
              Synthetic sample: an AI-generated image and a transformed copy.
              This demonstrates alignment, not accuracy on real vehicle
              inspections.
            </span>
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            <AlertCircle size={19} />
            {error}
          </p>
        )}
        <div className="lab-actions">
          <div className="sample-actions">
            <button className="text-button" onClick={example} disabled={locked}>
              {loadingExample ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Play size={15} />
              )}
              {loadingExample ? "Loading sample…" : "Try a sample"}
            </button>
            {count > 0 && (
              <button
                className="text-button reset-button"
                onClick={reset}
                disabled={locked}
              >
                <RotateCcw size={15} /> Clear
              </button>
            )}
          </div>
          <div className="compare-action">
            <span role="status">
              {busy
                ? "Finding and aligning visual features…"
                : count < 2
                  ? `${2 - count} more ${count === 0 ? "photos" : "photo"} to get started`
                  : "Ready when you are"}
            </span>
            <button
              className="button button-dark"
              onClick={compare}
              disabled={count < 2 || locked}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Comparing…
                </>
              ) : (
                <>
                  Compare photos <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
        <div
          ref={resultRef}
          className="result-anchor"
          tabIndex={-1}
          aria-label="Comparison results"
        >
          <AiComparePanel state={ai.state} />
          {result && <Comparison result={result} />}
        </div>
      </div>
      <div className="lab-footnote">
        <span>
          <ShieldCheck size={15} /> Photos processed without server storage
        </span>
        <span>Geometric comparison · Human review required</span>
        <span className="mono">CarPrint AI on HF GPU · SIFT baseline</span>
        <HfDemoLink />
      </div>
    </section>
  );
}
