import { useState, useEffect } from "react";
import { X, Check, AlertCircle } from "lucide-react";

export interface HfStatus {
  status: string;
  provider: string;
  connected: boolean;
  model: string;
  endpoint: string;
  capabilities: string[];
  huggingface_ready: boolean;
}

interface HfConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: HfStatus | null;
  onConfigUpdated: (newStatus: HfStatus) => void;
}

export function HfConfigModal({
  isOpen,
  onClose,
  status,
  onConfigUpdated,
}: HfConfigModalProps) {
  const [token, setToken] = useState("");
  const [model, setModel] = useState("carprint/vehicle-damage-segmentation-v1");
  const [endpoint, setEndpoint] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status) {
      if (status.model) setModel(status.model);
      if (status.endpoint) setEndpoint(status.endpoint);
    }
  }, [status]);

  if (!isOpen) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const fd = new FormData();
      if (token.trim()) fd.append("token", token.trim());
      if (model.trim()) fd.append("model", model.trim());
      if (endpoint.trim()) fd.append("endpoint", endpoint.trim());

      const res = await fetch("/api/hf/config", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        throw new Error("Failed to update Hugging Face configuration.");
      }

      const updatedStatus: HfStatus = await res.json();
      onConfigUpdated(updatedStatus);
      setMessage(
        updatedStatus.connected
          ? "Connected to Hugging Face Hub successfully!"
          : "Configuration saved. Hybrid CV engine ready.",
      );
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="hf-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="hf-modal-header">
          <div>
            <span className="hf-modal-eyebrow">NEURAL INFERENCE PIPELINE</span>
            <h3>Hugging Face AI Vision Engine</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="hf-modal-body">
          <p className="hf-modal-desc">
            CarPrint integrates directly with Hugging Face Hub vision models for vehicle damage
            segmentation, surface defect classification, and sub-millimeter Chamfer distance verification.
          </p>

          <div className="hf-status-card">
            <div className="hf-status-row">
              <span>Provider Engine:</span>
              <strong>{status?.provider || "Local Hybrid (HF Compatible)"}</strong>
            </div>
            <div className="hf-status-row">
              <span>Connection Status:</span>
              <span className={`hf-status-badge ${status?.connected ? "connected" : "standby"}`}>
                {status?.connected ? "● HF Hub Connected" : "● Offline / Hybrid Standby"}
              </span>
            </div>
            <div className="hf-status-row">
              <span>Active Model:</span>
              <code className="mono">{status?.model || "carprint/vehicle-damage-segmentation-v1"}</code>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div className="hf-input-group">
              <label>
                Hugging Face API Token <small>(optional for local CV inference)</small>
              </label>
              <input
                type="password"
                className="hf-text-input mono"
                placeholder="hf_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>

            <div className="hf-input-group" style={{ marginTop: 12 }}>
              <label>Model Repository / Tag</label>
              <input
                type="text"
                className="hf-text-input mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div className="hf-capabilities-list" style={{ marginTop: 14 }}>
              <label>Engine Capabilities</label>
              <div className="capabilities-tags">
                {(status?.capabilities || [
                  "vehicle_damage_detection",
                  "surface_scratch_segmentation",
                  "photometric_homography_alignment",
                  "sub_millimeter_chamfer_mapping",
                  "probabilistic_cost_scoring",
                ]).map((cap) => (
                  <span key={cap} className="cap-tag mono">
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            {message && (
              <div className="hf-alert-msg" style={{ marginTop: 12 }}>
                <Check size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                {message}
              </div>
            )}
            {error && (
              <p className="error-message" role="alert" style={{ marginTop: 12 }}>
                <AlertCircle size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                {error}
              </p>
            )}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-dark"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
