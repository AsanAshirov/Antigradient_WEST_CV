// CarPrint AI models (team Antigradient, WEST_CV) served by the Hugging Face Space Azamaka/carprint-demo.
// The browser calls the Space directly with @gradio/client, so every visitor uses their own ZeroGPU quota;
// when it is used up the Space answers from its CPU instead of failing. No token is needed or allowed here
// (VITE_* variables end up in the public bundle).
import { Client, handle_file } from "@gradio/client";

export const HF_SPACE = "Azamaka/carprint-demo";
export const HF_DEMO_URL = "https://huggingface.co/spaces/Azamaka/carprint-demo";

export type Damage = {
  damage_id: string;
  part: string | null;
  class: string;
  score: number;
  bbox: number[];
  size?: { metric?: boolean; length_mm?: number | null; area_cm2?: number | null } | null;
  status: string;
};
export type CostPart = {
  part_key: string;
  cost_p50: number;
  operation_probs: Record<string, number>;
};
export type Cost = {
  p10: number;
  p50: number;
  p90: number;
  usd: { p10: number; p50: number; p90: number };
  parts: CostPart[];
  note_en?: string;
};
export type DamageResult = {
  device: string;
  latency_ms: number;
  frames: { frame_id: string; damages: Damage[] }[];
  cost_estimate: Cost | null;
  overlays: string[];
};
export type TimelineItem = {
  status: string;
  class: string;
  part: string | null;
  score?: number | null;
};
export type CompareResult = {
  device: string;
  latency_ms: number;
  decision: string;
  /** Congruent cells over all significant panels: the number the SAME rule (>= 6) uses. */
  score_raw?: number;
  reasons_en?: string[];
  cohort_size?: number;
  evidence: {
    congruent_cells?: number;
    inliers?: number;
    distinct_inliers?: number;
    log10_nfa?: number;
  }[];
  damage_timeline: TimelineItem[];
  cost_estimate_new: Cost | null;
  match_image: string | null;
};

let client: Promise<Client> | null = null;

function connect(): Promise<Client> {
  if (!client) {
    client = Client.connect(HF_SPACE).catch((e: unknown) => {
      client = null; // retry on the next request
      throw e;
    });
  }
  return client!;
}

/** Gradio rejects with a status object, not an Error. */
export function apiMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "The CarPrint AI service did not answer. Please try again.";
}

function fileUrl(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { url?: unknown; image?: unknown };
  if (typeof o.url === "string") return o.url;
  return o.image ? fileUrl(o.image) : null;
}

function gallery(v: unknown): string[] {
  return Array.isArray(v) ? (v.map(fileUrl).filter(Boolean) as string[]) : [];
}

export async function analyzeDamage(files: File[], model = "cobalt"): Promise<DamageResult> {
  const c = await connect();
  const res = await c.predict("/damage", { photos: files.map((f) => handle_file(f)), model });
  const data = res.data as unknown[];
  const json = data[3] as Omit<DamageResult, "overlays">;
  return { ...json, overlays: gallery(data[0]) };
}

export async function analyzeVideo(file: File, model = "cobalt"): Promise<DamageResult> {
  const c = await connect();
  const res = await c.predict("/video", { clip: handle_file(file), model });
  const data = res.data as unknown[];
  const json = data[3] as Omit<DamageResult, "overlays">;
  return { ...json, overlays: gallery(data[0]) };
}

export async function compareCars(reference: File[], current: File[], model = "cobalt"): Promise<CompareResult> {
  const c = await connect();
  const res = await c.predict("/compare", {
    reference: reference.map((f) => handle_file(f)),
    current: current.map((f) => handle_file(f)),
    model,
  });
  const data = res.data as unknown[];
  const json = data[4] as Omit<CompareResult, "match_image">;
  return { ...json, match_image: fileUrl(data[1]) };
}

export const DAMAGE_EN: Record<string, string> = {
  broken_part: "Broken part",
  corrosion: "Corrosion",
  crack: "Crack",
  dent: "Dent",
  missing_part: "Missing part",
  paint_damage: "Paint damage",
  scratch: "Scratch",
};
const PART_EN: Record<string, string> = {
  front_bumper: "front bumper",
  back_bumper: "rear bumper",
  hood: "bonnet",
  trunk: "boot lid",
  roof: "roof",
  front_door: "front door",
  back_door: "rear door",
  fender: "front wing",
  quarter_panel: "rear quarter",
  rocker_panel: "sill",
  windshield: "windscreen",
  back_windshield: "rear screen",
  front_window: "front side window",
  back_window: "rear side window",
  headlight: "headlamp",
  tail_light: "tail lamp",
  mirror: "mirror",
  grille: "grille",
  front_wheel: "front wheel",
  back_wheel: "rear wheel",
  license_plate: "number plate",
};
const OP_EN: Record<string, string> = {
  polish: "polish",
  spot: "spot repair",
  glass_chip: "chip repair",
  pdr: "PDR, no paint",
  wheel_repair: "wheel repair",
  plastic_repair: "plastic repair",
  repair_paint: "repair and paint",
  replace: "replace",
};

export function partName(key: string | null): string {
  if (!key) return "part not identified";
  const base = key.split("@")[0];
  const side = base.startsWith("left_") ? "left" : base.startsWith("right_") ? "right" : "";
  const name = PART_EN[side ? base.slice(side.length + 1) : base] ?? base.replaceAll("_", " ");
  return side ? `${side} ${name}` : name;
}
export const opName = (op: string) => OP_EN[op] ?? op;
export const uzs = (v: number) => `${(v / 1e6).toFixed(2)}M UZS`;
export function sizeLabel(d: Damage): string | null {
  const s = d.size;
  if (!s?.metric) return null;
  if (s.length_mm) return `${Math.round(s.length_mm / 10)} cm`;
  if (s.area_cm2) return `${Math.round(s.area_cm2)} cm²`;
  return null;
}
