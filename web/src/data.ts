import type { Result } from "./ComparisonWorkspace";

export const checkpoints = [
  "Factory",
  "Arrival Terminal",
  "Dealership",
] as const;
export type Checkpoint = (typeof checkpoints)[number];
export type InspectionResult = {
  status: "READY" | "RETAKE";
  quality: {
    brightness: number;
    sharpness: number;
    width: number;
    height: number;
  };
  keypoints: number;
  warnings: string[];
  preview: string;
  sha256: string;
  elapsed_ms: number;
  algorithm_version: string;
};
export type Inspection = {
  id: string;
  vehicle: string;
  checkpoint: Checkpoint;
  capturedAt: string;
  inspector: string;
  notes: string;
  file: File;
  result: InspectionResult;
};
export type SavedComparison = {
  id: string;
  vehicle: string;
  createdAt: string;
  sample: boolean;
  checkpoints: [string, string];
  filenames: [string, string];
  result: Result;
};
export type Records = {
  inspections: Inspection[];
  comparisons: SavedComparison[];
};
export const emptyRecords: Records = { inspections: [], comparisons: [] };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("carprint-evidence", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readRecords(): Promise<Records> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const request = tx.objectStore("records").get("current");
    request.onsuccess = () => resolve(request.result ?? emptyRecords);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeRecords(records: Records) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(records, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const dateLabel = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
