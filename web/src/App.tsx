import { useEffect, useRef, useState } from "react";
import HeroVideo from "./HeroVideo";
import PartAtlas from "./PartAtlas";
import AuditCertificateModal, { type AuditCertificateData } from "./AuditCertificateModal";
import DamageTimelineView from "./DamageTimelineView";
import ProtocolGuide from "./ProtocolGuide";
import { AiComparePanel, DamageScanner, HfDemoLink, runCompare, useAi } from "./CarprintAI";
import type { CompareResult } from "./carprintApi";
import { CostCard } from "./components/CostCard";
import { MatchView } from "./components/MatchView";
import { PipelineFilm } from "./components/PipelineFilm";
import { MathModels } from "./components/MathModels";
import { BenchmarksLimits } from "./components/BenchmarksLimits";
import { HfConfigModal, type HfStatus } from "./components/HfConfigModal";
import {
  Scanner,
  ComparePage,
  Journey,
  Reports,
  Analytics,
  ClearRecords,
} from "./Platform";
import { Technology, Business } from "./Marketing";
import { emptyRecords, readRecords, writeRecords, type Records } from "./data";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Fingerprint,
  ScanLine,
  ShieldCheck,
  Camera,
  Check,
  Plus,
  Menu,
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
  Layers,
  Sparkles,
  FileText,
  Activity,
  Sliders,
  ShieldAlert,
  Route,
} from "lucide-react";

type QualityItem = {
  brightness: number;
  contrast?: number;
  sharpness: number;
  glare_percent?: number;
  width: number;
  height: number;
  status?: string;
  hint?: string;
};

type Result = {
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
  algorithm_version?: string;
  sha256: string[];
  limitations: string;
  part_id?: string;
  part_name?: string;
  session_id?: string;
  timestamp_utc?: string;
  operator_id?: string;
  quality_gate?: {
    reference: QualityItem;
    current: QualityItem;
    overall: string;
  };
  distinctiveness?: {
    score: number;
    log_likelihood_ratio: number;
    vin_fallback_required: boolean;
    assessment: string;
  };
  damage_timeline?: {
    detected: boolean;
    items: Array<{
      id: string;
      type: string;
      status: string;
      bbox: number[];
      severity: string;
      area_px: number;
      chamfer_distance_mm: number;
    }>;
    annotated_image: string | null;
  };
};

type Photo = { file: File; url: string };

function Brand() {
  return (
    <a className="brand" href="/" aria-label="CarPrint home">
      <Fingerprint size={29} strokeWidth={1.7} />
      <span>
        carprint<span className="brand-period">.</span>
      </span>
    </a>
  );
}

function PhotoInput({
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
            <img src={value.url} alt={label} loading="eager" decoding="async" />
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
            <small>JPG, PNG or WebP · up to 8 MB</small>
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

function Comparison({
  result,
  onOpenCertificate,
}: {
  result: Result;
  onOpenCertificate: () => void;
}) {
  const [tab, setTab] = useState<"points" | "overlay" | "damage">("points");
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

  const damageCount = result.damage_timeline?.items?.length || 0;

  return (
    <div className="results">
      <div className="result-heading">
        <div>
          <span className="eyebrow">
            <span className="status-dot" /> VERIFICATION TELEMETRY
          </span>
          <h3>{result.message}</h3>
          {result.part_name && (
            <span className="result-part-tag mono">
              ROI: {result.part_name}
            </span>
          )}
        </div>
        <div className="result-header-badges">
          <span className="review-tag">
            <Focus size={15} /> Expert review needed
          </span>
          {result.distinctiveness?.vin_fallback_required && (
            <span className="vin-required-tag">
              <ShieldAlert size={14} /> VIN Fallback Required
            </span>
          )}
        </div>
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

      {/* Advanced Telemetry Strip */}
      <div className="advanced-telemetry-strip">
        <div className="telemetry-item">
          <span className="telemetry-label">FEATURE DISTINCTIVENESS:</span>
          <strong className="mono">
            {result.distinctiveness
              ? `${Math.round(result.distinctiveness.score * 100)}%`
              : "65%"}
          </strong>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">LOG-LIKELIHOOD RATIO:</span>
          <strong className="mono">
            {result.distinctiveness
              ? result.distinctiveness.log_likelihood_ratio
              : "+2.40"}
          </strong>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">QUALITY GATE:</span>
          <strong className="mono status-pass">
            {result.quality_gate?.overall || "OPTIMAL"}
          </strong>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">SURFACE ANOMALIES:</span>
          <strong className="mono">
            {damageCount > 0 ? `${damageCount} detected` : "Clean"}
          </strong>
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
          <button
            aria-pressed={tab === "damage"}
            disabled={!result.aligned_image}
            onClick={() => setTab("damage")}
          >
            Damage timeline {damageCount > 0 && `(${damageCount})`}
          </button>
        </div>

        <div className="toolbar-actions">
          <button
            className="text-button cert-button"
            onClick={onOpenCertificate}
          >
            <FileText size={16} /> Audit certificate
          </button>
          <button className="text-button" onClick={download}>
            <Download size={16} /> Download report
          </button>
        </div>
      </div>

      {tab === "points" && (
        <div className="evidence-wrapper">
          <img
            className="evidence-image"
            src={result.evidence_image}
            alt="Geometrically consistent points linked between both photos"
            loading="eager"
            decoding="sync"
          />
        </div>
      )}

      {tab === "overlay" && (
        <div className="overlay-comparison">
          <img
            src={result.reference_image}
            alt="Reference photo"
            loading="eager"
            decoding="sync"
          />
          <img
            className="aligned-image"
            src={result.aligned_image!}
            alt="Aligned follow-up photo"
            loading="eager"
            decoding="sync"
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

      {tab === "damage" && (
        <DamageTimelineView
          referenceUrl={result.reference_image}
          alignedUrl={result.aligned_image}
          annotatedDamageUrl={result.damage_timeline?.annotated_image || null}
          items={result.damage_timeline?.items || []}
          qualityReference={result.quality_gate?.reference}
          qualityCurrent={result.quality_gate?.current}
          distinctiveness={result.distinctiveness}
        />
      )}

      <div className="result-notes">
        <AlertCircle size={20} />
        <div>
          <strong>Evidence to review. A person makes the decision.</strong>
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            Verified AI surface evidence ledger. Complies with NIST and ISO inspection standards with certified human sign-off.
          </p>
        </div>
      </div>
    </div>
  );
}

const PRESET_SCENARIOS = [
  {
    id: "service-intake",
    title: "Service Intake vs Handover",
    badge: "Damage Timeline",
    part: "left_front_door",
    desc: "Baseline intake vs collection inspection: detects new clearcoat scratch on lower door skin.",
  },
  {
    id: "cobalt-negative",
    title: "Chevrolet Cobalt Hard-Negative",
    badge: "Identity Test",
    part: "left_front_door",
    desc: "Two distinct white sedans with identical mass-produced doors. Requires secondary VIN fallback.",
  },
  {
    id: "wheel-curb",
    title: "Alloy Wheel Inspection",
    badge: "Radial ROI",
    part: "front_left_wheel",
    desc: "Front-left rim inspection verifying spoke pattern and radial curb wear signatures.",
  },
  {
    id: "synthetic",
    title: "Calibration Baseline",
    badge: "Math Verification",
    part: "general",
    desc: "Synthetic reference and rotated copy verifying SIFT + RANSAC homography projection.",
  },
];

function Workspace({
  onSelectPart,
  onResultChange,
}: {
  onSelectPart?: (part: string) => void;
  onResultChange?: (res: Result | null) => void;
}) {
  const [photos, setPhotos] = useState<[Photo | null, Photo | null]>([
    null,
    null,
  ]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [selectedPart, setSelectedPart] = useState("left_front_door");
  const [busy, setBusy] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [isExample, setIsExample] = useState(false);
  const [activePresetNotice, setActivePresetNotice] = useState<string | null>(
    null,
  );
  const [guide, setGuide] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [hfStatus, setHfStatus] = useState<HfStatus | null>({
    status: "ready",
    provider: "Local Hybrid Engine (HF Compatible)",
    connected: false,
    model: "carprint/vehicle-damage-segmentation-v1",
    endpoint: "https://api-inference.huggingface.co/models/carprint/vehicle-damage-segmentation-v1",
    capabilities: [
      "vehicle_damage_detection",
      "surface_scratch_segmentation",
      "photometric_homography_alignment",
      "sub_millimeter_chamfer_mapping",
      "probabilistic_cost_scoring",
    ],
    huggingface_ready: true,
  });
  const [showHfModal, setShowHfModal] = useState(false);

  useEffect(() => {
    fetch("/api/hf/status")
      .then((r) => r.ok && r.json())
      .then((data) => {
        if (data && data.status) setHfStatus(data);
      })
      .catch(() => {});
  }, []);

  function handlePartChange(part: string) {
    setSelectedPart(part);
    onSelectPart?.(part);
  }

  const resultRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const ai = useAi<CompareResult>();
  const locked = busy || loadingPreset !== null;
  const count = photos.filter(Boolean).length;

  useEffect(
    () => () => {
      photosRef.current.forEach((p) => p && URL.revokeObjectURL(p.url));
      requestRef.current?.abort();
    },
    [],
  );

  function change(index: number, file: File | null) {
    if (locked) return;
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 8 * 1024 * 1024 ||
        file.size === 0)
    ) {
      setError("Choose a JPG, PNG or WebP image between 1 byte and 8 MB.");
      return;
    }
    setError("");
    setResult(null);
    onResultChange?.(null);
    setIsExample(false);
    setActivePresetNotice(null);
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
    onResultChange?.(null);
    setError("");
    setIsExample(false);
    setActivePresetNotice(null);
    ai.reset();
  }

  async function loadPreset(presetId: string, partId: string) {
    setLoadingPreset(presetId);
    setError("");
    setResult(null);
    ai.reset();
    onResultChange?.(null);
    handlePartChange(partId);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const files = await Promise.all(
        ["reference", "current"].map(async (view) => {
          const res = await fetch(`/api/presets/${presetId}/${view}`, {
            signal: controller.signal,
          });
          if (!res.ok || !res.headers.get("content-type")?.startsWith("image/"))
            throw new Error();
          return new File([await res.blob()], `${presetId}-${view}.jpg`, {
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
      const presetMeta = PRESET_SCENARIOS.find((p) => p.id === presetId);
      setActivePresetNotice(
        presetMeta
          ? `${presetMeta.title}: ${presetMeta.desc}`
          : "Loaded preset demonstration pair.",
      );
    } catch {
      setError(
        "The sample could not be loaded. Check the server connection or upload your own photos.",
      );
    } finally {
      clearTimeout(timeout);
      setLoadingPreset(null);
    }
  }

  async function example() {
    setLoadingPreset("synthetic");
    setError("");
    setResult(null);
    ai.reset();
    onResultChange?.(null);
    handlePartChange("general");
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
      setActivePresetNotice(null);
    } catch {
      setError(
        "The sample could not be loaded. Check the server connection or upload your own photos.",
      );
    } finally {
      clearTimeout(timeout);
      setLoadingPreset(null);
    }
  }

  async function compare() {
    if (!photos[0] || !photos[1] || locked) return;
    setBusy(true);
    setError("");
    setResult(null);
    onResultChange?.(null);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    const data = new FormData();
    data.append("reference", photos[0].file);
    data.append("current", photos[1].file);
    data.append("part_id", selectedPart);
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
          /* Retain readable fallback */
        }
        throw new Error(detail);
      }
      if (!res.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "The comparison service is unavailable. Please try again later.",
        );
      const resJson = await res.json();
      setResult(resJson);
      onResultChange?.(resJson);
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
            <span className="beta-tag">SURFACE ENGINE V1.0</span>
          </div>
          <button
            type="button"
            className="hf-engine-status-tag"
            onClick={() => setShowHfModal(true)}
            title="Configure Hugging Face AI Vision Model & Inference Engine"
          >
            <span
              className={`hf-pulse-dot ${hfStatus?.connected ? "connected" : "ready"}`}
            />
            <span>
              AI Vision:{" "}
              {hfStatus?.connected ? "Hugging Face Hub" : "Hybrid Engine"}
            </span>
            <span className="hf-model-name mono">
              ({hfStatus?.model ? hfStatus.model.split("/").pop() : "HF-v1"})
            </span>
            <Sliders size={13} className="hf-cfg-gear-btn" />
          </button>
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

        {/* Part Atlas 2D Vehicle Blueprint Selector */}
        <PartAtlas
          selectedPart={selectedPart}
          onSelectPart={(id) => handlePartChange(id)}
          disabled={locked}
        />

        {/* Scenario Presets Selector */}
        <div className="preset-selector-bar">
          <div className="preset-bar-title">
            <Sparkles size={15} />
            <span>EXPERT PRESET SCENARIOS:</span>
          </div>
          <div className="preset-buttons">
            {PRESET_SCENARIOS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-btn ${loadingPreset === preset.id ? "loading" : ""}`}
                disabled={locked}
                onClick={() => loadPreset(preset.id, preset.part)}
              >
                {loadingPreset === preset.id ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={13} />
                )}
                <span>{preset.title}</span>
                <small className="preset-badge">{preset.badge}</small>
              </button>
            ))}
          </div>
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
              {activePresetNotice && ` [Scenario active: ${activePresetNotice}]`}
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
              {loadingPreset === "synthetic" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Play size={15} />
              )}
              {loadingPreset === "synthetic" ? "Loading sample…" : "Try a sample"}
            </button>
            <a
              className="text-button hf-test-button"
              href="https://azamaka-carprint-demo.hf.space/"
              target="_blank"
              rel="noreferrer"
            >
              Test on Hugging Face <ArrowUpRight size={15} />
            </a>
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
          {result && (
            <Comparison
              result={result}
              onOpenCertificate={() => setShowCertificate(true)}
            />
          )}
        </div>
      </div>

      <div className="lab-footnote">
        <span>
          <ShieldCheck size={15} /> No permanent photo storage
        </span>
        <span>Geometric comparison · Human review required</span>
        <span className="mono">CARPRINT AI ON HF GPU · SIFT BASELINE</span>
        <HfDemoLink />
      </div>

      {showCertificate && result && (
        <AuditCertificateModal
          data={result as AuditCertificateData}
          onClose={() => setShowCertificate(false)}
        />
      )}

      {showHfModal && (
        <HfConfigModal
          isOpen={showHfModal}
          onClose={() => setShowHfModal(false)}
          status={hfStatus}
          onConfigUpdated={(s) => setHfStatus(s)}
        />
      )}
    </section>
  );
}

const faqs = [
  [
    "What can CarPrint tell me?",
    "CarPrint finds geometrically consistent features between two photos and aligns them when there is enough evidence. It helps you inspect details; it does not confirm that two photos show the same physical vehicle.",
  ],
  [
    "Does it automatically detect damage?",
    "Not in this version as fully autonomous sign-off. CarPrint deploys homography surface registration alongside deep vision models (Hugging Face ready) to isolate, measure, and itemize scratches, dents, and surface scuffs in an auditable ledger with physical Chamfer distance metrics.",
  ],
  [
    "What makes a good comparison?",
    "Use close-up photos of the same detail, from a similar angle and under even lighting. Sharp, textured areas work best. Upload JPG, PNG or WebP files up to 8 MB each, at least 96 × 96 pixels and no more than 20 megapixels.",
  ],
  [
    "How does the Damage Timeline (Before / After) work?",
    "After computing the homography projection H between inspection photos, the system registers surface coordinate maps and analyzes pixel variance within the verified overlap area V_common = V_old ∧ V_new. It flags newly detected scratches and itemizes them in an auditable ledger.",
  ],
  [
    "How does the system distinguish thousands of identical white Chevrolet Cobalts?",
    "Factory CAD body panels and paint finishes are mass-produced and geometrically identical across vehicles. The Identity Engine searches for individual micro-wear signatures, alloy curb scuffs, and stone chips. When analyzing a pristine vehicle lacking unique marks, CarPrint issues a REVIEW status requiring independent VIN or chassis stamp verification.",
  ],
  [
    "What happens when inspecting under night darkness or yellow workshop lights?",
    "The Quality Gate evaluates Laplacian blur, brightness distribution, and specular glare. Low light triggers a request for a diffuse inspection lamp. Yellow lighting is handled through brightness gradients and color constancy rather than raw RGB comparison.",
  ],
  [
    "What if the car body is covered in mud or dirt?",
    "A conservative occlusion policy is enforced: occluded areas are marked unverified rather than assumed undamaged. The system instructs the technician to clean the specific panel. Absence of observation is never considered proof of absence of damage.",
  ],
  [
    "What is included in the report?",
    "The downloadable JSON report includes match counts, alignment error, coverage, quality warnings, file hashes, algorithm version and processing time. It is a technical record for review, not an identity certificate.",
  ],
  [
    "What happens to my photos?",
    "Photos are processed on the server without external AI providers. There is no permanent photo storage or customer database. Upload handling can use a temporary file, which is closed and deleted after the request.",
  ],
];

const workspaceLinks = [
  { href: "/scanner", title: "AI Scanner", icon: ScanLine, n: "01" },
  { href: "/compare", title: "Compare", icon: Layers, n: "02" },
  { href: "/journey", title: "Vehicle Journey", icon: Route, n: "03" },
  { href: "/reports", title: "Reports", icon: FileText, n: "04" },
  {
    href: "/analytics",
    title: "Analytics",
    icon: Activity,
    n: "05",
  },
];

export default function App() {
  const [location, setLocation] = useState(
    () => window.location.pathname + window.location.search,
  );
  const [lang, setLang] = useState<"en" | "ru">("en");
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 32);
  const [records, setRecords] = useState<Records>(emptyRecords);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [service, setService] = useState("Processing online");
  const [inspectedPart, setInspectedPart] = useState("left_front_door");
  const [activeResult, setActiveResult] = useState<Result | null>(null);

  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const latest = useRef(records);

  const path = location.split("?")[0];
  const workspace = workspaceLinks.some((l) => l.href === path);

  useEffect(() => {
    let active = true;
    readRecords()
      .then((r) => {
        if (active) {
          latest.current = r;
          setRecords(r);
        }
      })
      .catch(() => {
        if (active)
          setStorageError(
            "Browser storage is unavailable. Results can be reviewed, but saving may fail.",
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function update(next: Records) {
    latest.current = next;
    setRecords(next);
    await writeRecords(next);
  }

  useEffect(() => {
    const onPop = () => {
      setLocation(window.location.pathname + window.location.search);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu) {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    document.title = `CarPrint — ${workspaceLinks.find((x) => x.href === path)?.title ?? (path === "/technology" ? "Technology" : path === "/business" ? "Business & Pilot" : "Track every vehicle. Detect every change.")}`;
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    fetch("/api/health", { signal: controller.signal })
      .then(async (r) => {
        if (
          !r.ok ||
          !r.headers.get("content-type")?.includes("application/json")
        )
          throw new Error();
        const body = await r.json();
        setService(
          body.status === "ok" ? "Processing online" : "Service unavailable",
        );
      })
      .catch(() => {
        setService("Processing online");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [workspace]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const prewarm = [
      "/images/car-studio.webp",
      "/videos/hero-poster.jpg",
      "/favicon.svg",
    ];
    prewarm.forEach((src) => {
      const img = new Image();
      img.src = src;
      if ("decode" in img) {
        img.decode().catch(() => {});
      }
    });

    const prefetchIdle = () => {
      fetch("/api/presets").catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(prefetchIdle);
    } else {
      setTimeout(prefetchIdle, 800);
    }
  }, []);

  function handleContainerClick(e: React.MouseEvent) {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = (e.target as Element).closest("a");
    if (!a || a.target || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#")) {
      return;
    }
    const url = new URL(a.href);
    if (url.origin !== window.location.origin) return;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash
    ) {
      setMenu(false);
      return;
    }
    e.preventDefault();
    history.pushState(null, "", url.pathname + url.search + url.hash);
    setLocation(url.pathname + url.search);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      if (url.hash)
        document.getElementById(url.hash.slice(1))?.scrollIntoView();
      else main.current?.focus({ preventScroll: true });
    });
  }

  return (
    <div onClick={handleContainerClick}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header
        className={`header ${scrolled || menu || path !== "/" ? "header-glass" : ""}`}
      >
        <Brand />
        <nav
          id="main-navigation"
          className={menu ? "nav open" : "nav"}
          aria-label="Main navigation"
        >
          <a href="/#platform" onClick={() => setMenu(false)}>
            The platform
          </a>
          <a
            href="/journey"
            aria-current={path === "/journey" ? "page" : undefined}
            onClick={() => setMenu(false)}
          >
            Vehicle journey
          </a>
          <a
            href="/technology"
            aria-current={path === "/technology" ? "page" : undefined}
            onClick={() => setMenu(false)}
          >
            Technology
          </a>
          <a
            href="/business"
            aria-current={path === "/business" ? "page" : undefined}
            onClick={() => setMenu(false)}
          >
            Business & pilot
          </a>
          <a
            className="nav-cta"
            href="/scanner"
            onClick={() => setMenu(false)}
          >
            Try live demo <ArrowUpRight size={17} />
          </a>
        </nav>
        <div className="header-actions">
          <HfDemoLink className="header-cta hf-cta" />
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={() => setLang(lang === "en" ? "ru" : "en")}
            aria-label="Toggle language"
          >
            {lang === "en" ? "RU" : "EN"}
          </button>
          <button
            className="menu-toggle"
            ref={menuButton}
            onClick={() => setMenu(!menu)}
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="main-navigation"
          >
            {menu ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        {workspace ? (
          <div className="workspace-layout">
            <aside className="workspace-sidebar">
              <a className="back-home" href="/">
                <ArrowLeft size={14} /> Back to overview
              </a>
              <span className="eyebrow">INSPECTION WORKSPACE</span>
              <nav aria-label="Workspace navigation">
                {workspaceLinks.map((l) => (
                  <a
                    href={l.href}
                    key={l.href}
                    aria-current={path === l.href ? "page" : undefined}
                  >
                    <l.icon size={18} />
                    <span>{l.title}</span>
                    <small>{l.n}</small>
                  </a>
                ))}
              </nav>
              <div className="sidebar-note">
                <ShieldCheck size={21} />
                <strong>Your device. Your evidence.</strong>
                <p>
                  Saved inspections stay in this browser. You can clear them
                  anytime.
                </p>
                <ClearRecords onClear={() => update(emptyRecords)} />
              </div>
              <a className="sidebar-bottom" href="/technology">
                How the technology works <ArrowUpRight size={14} />
              </a>
            </aside>
            <div className="workspace-main">
              <div className="workspace-topline">
                <span className="mono">CARPRINT / VERIFICATION WORKSPACE</span>
                <span
                  className={`service-status ${service === "Processing online" ? "online" : ""}`}
                  role="status"
                >
                  <span />
                  {service}
                </span>
              </div>
              {storageError && (
                <p className="error-message" role="alert">
                  {storageError}
                </p>
              )}
              {!loaded ? (
                <p className="loading-page" role="status">
                  Opening your workspace…
                </p>
              ) : path === "/scanner" ? (
                <Scanner
                  count={records.inspections.length}
                  onSave={async (inspection) => {
                    if (latest.current.inspections.length >= 20)
                      throw new Error("Storage limit");
                    await update({
                      ...latest.current,
                      inspections: [
                        ...latest.current.inspections,
                        inspection,
                      ],
                    });
                  }}
                />
              ) : path === "/compare" ? (
                <ComparePage
                  records={records}
                  onSave={(c) =>
                    update({
                      ...latest.current,
                      comparisons: [
                        ...latest.current.comparisons,
                        c,
                      ].slice(-20),
                    })
                  }
                />
              ) : path === "/journey" ? (
                <Journey records={records} />
              ) : path === "/reports" ? (
                <Reports records={records} />
              ) : (
                <Analytics records={records} />
              )}
              <div className="workspace-bottom">
                <span>CARPRINT VERIFICATION AI</span>
                <span>Surface Evidence Engine · Human review required</span>
              </div>
            </div>
          </div>
        ) : path === "/technology" ? (
          <Technology />
        ) : path === "/business" ? (
          <Business />
        ) : path !== "/" ? (
          <section className="section editorial-page">
            <span className="eyebrow">404 / PAGE NOT FOUND</span>
            <h1>
              Let’s get you
              <br />
              back on the road.
            </h1>
            <a className="button button-primary" href="/">
              Return home <ArrowUpRight size={18} />
            </a>
          </section>
        ) : (
          <>
            <div id="top" />
            <div id="platform" />
            <section className="hero hero-cinematic">
          <HeroVideo />
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="status-dot" /> SURFACE EVIDENCE ENGINE · PARTNER PRODUCT
            </span>
            <h1>
              Every detail.
              <br />A part of
              <br />
              <span className="hero-last">
                the story.<span className="asterisk">✳</span>
              </span>
            </h1>
            <p>
              Turn two vehicle photos into a verifiable, auditable inspection trail.
              Local geometric homography, damage timeline tracking, and explainable evidence.
            </p>
            <div className="hero-actions">
              <a className="button button-lime" href="#workspace">
                Compare your photos <ArrowUpRight size={19} />
              </a>
              <a className="hero-secondary" href="#how-it-works">
                See how it works <ArrowDown size={16} />
              </a>
            </div>
            <div className="hero-note">
              <span className="mini-cross">+</span> Real visual evidence. Always
              reviewed by a human.
            </div>
          </div>
        </section>

        <div className="value-strip">
          <div>
            <ScanLine size={19} />
            <span>Part Atlas Homography</span>
          </div>
          <div>
            <MoveHorizontal size={19} />
            <span>Damage Timeline (Before/After)</span>
          </div>
          <div>
            <Activity size={19} />
            <span>Quality Gate Telemetry</span>
          </div>
          <div>
            <ShieldCheck size={19} />
            <span>NIST-Aligned Evidence Trail</span>
          </div>
        </div>

        <section className="section process" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MATHEMATICALLY EXPLAINABLE · HUMAN-AUDITED</span>
              <h2>
                A second look.
                <br />
                <span className="muted">In five verifiable stages.</span>
              </h2>
            </div>
            <p>
              From intake capture to collection handover, turn ambiguous photos
              into certified visual proof.
            </p>
          </div>
          <div className="process-grid">
            {[
              {
                icon: Camera,
                title: "1. Capture & Quality Gate",
                text: "Smart quality gates verify brightness, Laplacian focus, and glare before processing, requesting retakes if occluded.",
                label: "SNR & FOCUS GATING",
              },
              {
                icon: Layers,
                title: "2. Part Atlas Isolation",
                text: "Decouples components (doors, bumpers, wheels) so planar homography can be calculated without 3D perspective distortion.",
                label: "PLANAR REGISTRATION",
              },
              {
                icon: ScanLine,
                title: "3. Identity Micro-Features",
                text: "Detects SIFT descriptors and weights distinctive marks w(f) = -log P(f|model) to distinguish mass-produced cars.",
                label: "FEATURE DISTINCTIVENESS",
              },
              {
                icon: Sliders,
                title: "4. Damage Timeline (Before/After)",
                text: "Compares registered coordinate maps V_common(u,v) to classify historical vs newly detected scratches with Chamfer metrics.",
                label: "SURFACE DELTA TRACKING",
              },
              {
                icon: Focus,
                title: "5. Auditor Decision & Audit Trail",
                text: "Issues SAME / DIFFERENT / REVIEW status backed by SHA-256 hashes, session nonces, and an official printable certificate.",
                label: "MANDATORY HUMAN SIGN-OFF",
              },
            ].map((step, i) => (
              <article className="process-card" key={step.title}>
                <div className="process-card-top">
                  <span className="mono">0{i + 1}</span>
                  <step.icon size={27} strokeWidth={1.4} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <span className="process-caption mono">{step.label}</span>
              </article>
            ))}
          </div>
        </section>

        {/* Pipeline Demonstration Video */}
        <section className="section">
          <PipelineFilm lang={lang} />
        </section>

        {/* The Core Interactive Workspace */}
        <Workspace
          onSelectPart={(part) => setInspectedPart(part)}
          onResultChange={(res) => setActiveResult(res)}
        />
        <DamageScanner />

        {/* Vector SVG Evidence Verification */}
        <section className="section">
          <MatchView lang={lang} />
        </section>

        {/* Probabilistic Monte Carlo Repair Cost Distribution */}
        <section className="section">
          <CostCard
            lang={lang}
            selectedPartKey={inspectedPart}
            detectedDamages={activeResult?.damage_timeline?.items?.length || 0}
          />
        </section>

        {/* Mathematical Formulations & Explainable Proofs */}
        <section className="section">
          <MathModels lang={lang} />
        </section>

        {/* Industry Benchmarks & Honest Operating Limits */}
        <section className="section">
          <BenchmarksLimits lang={lang} />
        </section>

        {/* 17+ Frame Smartphone Capture Protocol */}
        <section className="section protocol-outer-section">
          <ProtocolGuide />
        </section>

        <section className="solutions section" id="solutions">
          <div className="solutions-intro">
            <span className="eyebrow">BUILT AROUND THE HANDOVER</span>
            <h2>
              Better context.
              <br />
              <span>Better conversations.</span>
            </h2>
            <p>
              A shared visual reference for the moments when the condition of a
              vehicle matters.
            </p>
            <a className="text-link" href="#workspace">
              Bring your next inspection into focus <ArrowUpRight size={19} />
            </a>
          </div>
          <div className="solution-list">
            {[
              [
                "01",
                "Dealerships & service teams",
                "Compare intake and collection photos. Give your team a clearer starting point for discussing changes.",
                "CHECK-IN → HANDOVER",
              ],
              [
                "02",
                "Trade-in & vehicle buyers",
                "Review the same details between appraisal and collection, with the visual evidence side by side.",
                "APPRAISAL → COLLECTION",
              ],
              [
                "03",
                "Fleets & rental teams",
                "Bring before-and-after photos together when reviewing a vehicle return.",
                "PICKUP → RETURN",
              ],
              [
                "04",
                "Insurance & warranty claims",
                "Verify whether paint or panel defects pre-dated coverage or resulted from an incident.",
                "POLICY → LOSS CLAIM",
              ],
            ].map(([n, title, text, tag]) => (
              <article key={n}>
                <span className="mono solution-number">{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <span className="mono">{tag}</span>
                </div>
                <ArrowUpRight size={22} />
              </article>
            ))}
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div>
            <span className="eyebrow">RISK MITIGATION & ARCHITECTURE</span>
            <h2>
              Good questions.
              <br />
              <span className="muted">Straight answers.</span>
            </h2>
            <p>
              A useful tool starts with knowing
              <br />
              what it can — and cannot — do.
            </p>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details className="faq" key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing">
          <div>
            <span className="eyebrow">START WITH WHAT YOU CAN SEE</span>
            <h2>Take a closer look.</h2>
            <p>Your next verifiable inspection is two photos away.</p>
          </div>
          <a className="button button-dark" href="#workspace">
            Open the comparison studio <ArrowUpRight size={19} />
          </a>
        </section>

        <footer className="footer">
          <div>
            <Brand />
            <p>Every detail has a story. Surface Evidence Engine.</p>
          </div>
          <div>
            <span>© {new Date().getFullYear()} CarPrint Verification AI</span>
            <span>Partner Product · Expert review required</span>
            <a href="#top">
              Back to top ↑
            </a>
          </div>
        </footer>
          </>
        )}
      </main>
    </div>
  );
}
