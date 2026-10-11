// Typed client for the CarPrint API (docs/API_CONTRACT.md). Same origin in production; Vite proxies /api in dev.

export type Decision = "SAME" | "DIFFERENT" | "REVIEW" | "RECAPTURE_REQUIRED";
export type TimelineStatus = "newly_detected" | "previously_recorded" | "previously_seen_now_absent" | "insufficient_evidence";

export type CostPart = {
  part_key: string;
  part: string;
  damages: number;
  likely_operation: string;
  operation_probs: Record<string, number>;
  p_replace: number;
  cost_p50: number;
  cost_p90: number;
  cost_mean: number;
  variance_share: number;
  evidence: string[];
};

export type Cost = {
  currency: string;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  usd: { p10: number; p50: number; p90: number };
  p_zero: number;
  parts: CostPart[];
  n_damages: number;
  samples: number;
  price_table: string;
  status: string;
  note_ru: string;
  note_en: string;
};

export type Evidence = {
  ref_frame: string;
  cur_frame: string;
  inliers: number;
  tentative: number;
  distinct_inliers: number;
  reproj_err_px: number;
  log10_nfa: number;
  log10_nfa_distinct: number;
  congruent_cells: number;
  slot: string;
  match_viz_url: string;
  aligned_url?: string | null;
  matches?: number[][]; // [x0, y0, x1, y1, w], normalised to each image
};

export type TimelineItem = {
  status: TimelineStatus;
  class: string;
  part: string | null;
  slot: string;
  ref_frame: string;
  cur_frame: string;
  cur_bbox: number[] | null;
  ref_bbox: number[] | null;
  damage_id: string | null;
  score?: number | null;
};

export type Quality = {
  blur: number;
  brightness: number;
  glare_ratio: number;
  subject_ratio: number | null;
  issues: string[];
  ok: boolean;
};

export type DamageFinding = {
  damage_id: string;
  part: string | null;
  class: string;
  score: number;
  bbox: number[];
  size?: { metric: boolean; area_cm2: number | null; length_mm: number | null };
  status: string;
};

export type FrameAnalysis = {
  frame_id: string;
  slot: string;
  parts: { part: string; score: number; bbox: number[] }[];
  damages: DamageFinding[];
  overlay_url: string | null;
  quality?: Quality;
};

export type Verification = {
  verification_id: string;
  decision: Decision;
  score_raw: number;
  reasons_ru: string[];
  reasons_en?: string[];
  cohort_size: number;
  evidence: Evidence[];
  damage_timeline: TimelineItem[];
  cost_estimate_new: Cost | null;
  cost_estimate_current: Cost | null;
  integrity: { flags: string[]; level: "green" | "yellow" | "red" };
  latency_ms: number;
};

export type CompareResult = Verification & {
  analysis_a: FrameAnalysis[];
  analysis_b: FrameAnalysis[];
  inspections?: { reference: string; current: string };
};

export type ShotPlanItem = { slot: string; instruction: string; required: boolean };
export type Inspection = { inspection_id: string; vehicle_key: string; nonce: string; expires_at: string; shot_plan: ShotPlanItem[] };
export type FrameUpload = {
  frame_id: string;
  sha256: string;
  quality: Quality;
  integrity_flags: string[];
  recapture_required: boolean;
  message_ru: string;
};

export type Health = { status: string; device: string; models: Record<string, string | null> };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: controller.signal });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        const d = body?.detail;
        message = typeof d === "string" ? d : d?.error?.message_ru ?? d?.error?.message ?? message;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => call<Health>("/api/v1/health", undefined, 15_000),

  compare(reference: File[], current: File[], model: string) {
    const fd = new FormData();
    reference.forEach((f) => fd.append("images_a", f));
    current.forEach((f) => fd.append("images_b", f));
    fd.append("model_hint", model);
    return call<CompareResult>("/api/v1/compare", { method: "POST", body: fd }, 180_000);
  },

  createInspection(body: { vehicle_id_plain?: string; vehicle_key?: string; model: string; type: "checkin" | "checkout" }) {
    return call<Inspection>("/api/v1/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicle_id_plain: body.vehicle_id_plain || undefined,
        vehicle_key: body.vehicle_key || undefined,
        vehicle_hint: { model: body.model },
        role: "dealer",
        type: body.type,
      }),
    });
  },

  uploadFrame(inspectionId: string, file: File, slot: string, nonce: string, captureMode: "camera" | "gallery") {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slot", slot);
    fd.append("nonce", nonce);
    fd.append("capture_mode", captureMode);
    return call<FrameUpload>(`/api/v1/inspections/${inspectionId}/frames`, { method: "POST", body: fd }, 90_000);
  },

  analyze: (inspectionId: string) =>
    call<{ frames: FrameAnalysis[]; cost_estimate: Cost | null; status: string }>(
      `/api/v1/inspections/${inspectionId}/analyze`, { method: "POST" }, 180_000),

  verify: (referenceId: string, currentId: string) =>
    call<Verification>("/api/v1/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference_inspection_id: referenceId, current_inspection_id: currentId }),
    }, 180_000),

  confirm: (inspectionId: string, findings: { damage_id: string; action: string }[]) =>
    call<{ record_hash: string; prev_hash: string; signature: string }>(`/api/v1/inspections/${inspectionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operator_id: "studio", findings, customer_signed: false }),
    }),

  reportUrl: (inspectionId: string) => `/api/v1/inspections/${inspectionId}/report.pdf`,
};
