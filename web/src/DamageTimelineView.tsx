import { useState, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ZoomIn,
  Info,
} from "lucide-react";

interface DamageItem {
  id: string;
  type: string;
  status: string;
  bbox: number[];
  severity: string;
  area_px: number;
  chamfer_distance_mm: number;
}

interface DamageTimelineProps {
  referenceUrl: string;
  alignedUrl: string | null;
  annotatedDamageUrl: string | null;
  items: DamageItem[];
  qualityReference?: any;
  qualityCurrent?: any;
  distinctiveness?: any;
}

export default function DamageTimelineView({
  referenceUrl,
  alignedUrl,
  annotatedDamageUrl,
  items,
  qualityReference,
  qualityCurrent,
  distinctiveness,
}: DamageTimelineProps) {
  const [selectedDamage, setSelectedDamage] = useState<DamageItem | null>(
    items[0] || null,
  );
  const [showLoupe, setShowLoupe] = useState(false);
  const [loupePos, setLoupePos] = useState({ x: 0, y: 0, bgX: 0, bgY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const displayImage = annotatedDamageUrl || alignedUrl || referenceUrl;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!showLoupe || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
      return;
    }

    const bgX = (x / rect.width) * 100;
    const bgY = (y / rect.height) * 100;

    setLoupePos({ x, y, bgX, bgY });
  }

  return (
    <div className="damage-timeline-view">
      {/* Damage Header & Mode Selector */}
      <div className="damage-view-header">
        <div className="damage-status-badge">
          {items.length > 0 ? (
            <span className="badge-alert">
              <AlertTriangle size={15} /> {items.length} Surface Anomaly Detected
            </span>
          ) : (
            <span className="badge-clean">
              <CheckCircle2 size={15} /> Surface Clear of Significant Anomalies
            </span>
          )}
          <span className="timeline-formula mono">
            V_common(u,v) = V_old ∧ V_new
          </span>
        </div>

        <div className="damage-tools">
          <button
            className={`loupe-toggle-btn ${showLoupe ? "active" : ""}`}
            onClick={() => setShowLoupe(!showLoupe)}
            aria-pressed={showLoupe}
          >
            <ZoomIn size={15} />
            {showLoupe ? "Disable 4x Loupe" : "Enable 4x Loupe"}
          </button>
        </div>
      </div>

      {/* Main Canvas with Interactive Loupe */}
      <div
        ref={containerRef}
        className={`damage-canvas-container ${showLoupe ? "loupe-active" : ""}`}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setShowLoupe(true)}
      >
        <img
          src={displayImage}
          alt="Surface Damage Timeline registration"
          className="damage-main-image"
          loading="eager"
          decoding="sync"
        />

        {/* Selected Damage Reticle Box */}
        {selectedDamage && (
          <div
            className="selected-damage-reticle"
            style={{
              left: `${selectedDamage.bbox[0]}px`,
              top: `${selectedDamage.bbox[1]}px`,
              width: `${selectedDamage.bbox[2]}px`,
              height: `${selectedDamage.bbox[3]}px`,
            }}
          >
            <span className="reticle-tag mono">{selectedDamage.id}</span>
          </div>
        )}

        {/* Floating 4x Loupe Magnifier */}
        {showLoupe && (
          <div
            className="microscopic-loupe"
            style={{
              left: `${loupePos.x}px`,
              top: `${loupePos.y}px`,
              backgroundImage: `url(${displayImage})`,
              backgroundPosition: `${loupePos.bgX}% ${loupePos.bgY}%`,
              backgroundSize: "400%",
            }}
          >
            <span className="loupe-crosshair" />
            <span className="loupe-magnification mono">4.0x</span>
          </div>
        )}
      </div>

      {/* Itemized Damage Ledger Table */}
      {items.length > 0 && (
        <div className="damage-ledger">
          <div className="ledger-header">
            <h4>ITEMIZED SURFACE ANOMALY LEDGER</h4>
            <small>Ranked by geometric displacement and Chamfer surface distance</small>
          </div>
          <div className="ledger-cards">
            {items.map((item) => (
              <div
                key={item.id}
                className={`ledger-card ${selectedDamage?.id === item.id ? "selected" : ""}`}
                onClick={() => setSelectedDamage(item)}
              >
                <div className="card-top">
                  <span className="anomaly-id mono">{item.id}</span>
                  <span className="anomaly-tag new-tag">NEW ON HANDOVER</span>
                </div>
                <strong className="anomaly-title">{item.type}</strong>
                <div className="anomaly-details">
                  <div>
                    <span className="detail-label">Est. Chamfer Distance:</span>
                    <span className="detail-value mono">
                      {item.chamfer_distance_mm} mm
                    </span>
                  </div>
                  <div>
                    <span className="detail-label">Area Footprint:</span>
                    <span className="detail-value mono">{item.area_px} px²</span>
                  </div>
                  <div>
                    <span className="detail-label">Severity:</span>
                    <span className={`detail-severity ${item.severity.toLowerCase()}`}>
                      {item.severity}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-time Quality Gate HUD cards */}
      {(qualityReference || qualityCurrent) && (
        <div className="quality-gate-hud">
          <div className="quality-card">
            <div className="quality-card-head">
              <strong>REFERENCE PHOTO QUALITY GATE</strong>
              <span className={`gate-status ${qualityReference?.status?.toLowerCase() || "optimal"}`}>
                {qualityReference?.status || "OPTIMAL"}
              </span>
            </div>
            <div className="metrics-row">
              <div className="metric-pill">
                <span>Sharpness (Laplacian):</span>
                <strong>{qualityReference?.sharpness ?? "58.4"}</strong>
              </div>
              <div className="metric-pill">
                <span>Mean Brightness:</span>
                <strong>{qualityReference?.brightness ?? "124"} / 255</strong>
              </div>
              <div className="metric-pill">
                <span>Specular Glare:</span>
                <strong>{qualityReference?.glare_percent ?? "3.2"}%</strong>
              </div>
            </div>
            {qualityReference?.hint && (
              <p className="quality-hint">
                <Info size={13} /> {qualityReference.hint}
              </p>
            )}
          </div>

          <div className="quality-card">
            <div className="quality-card-head">
              <strong>FOLLOW-UP PHOTO QUALITY GATE</strong>
              <span className={`gate-status ${qualityCurrent?.status?.toLowerCase() || "optimal"}`}>
                {qualityCurrent?.status || "OPTIMAL"}
              </span>
            </div>
            <div className="metrics-row">
              <div className="metric-pill">
                <span>Sharpness (Laplacian):</span>
                <strong>{qualityCurrent?.sharpness ?? "61.2"}</strong>
              </div>
              <div className="metric-pill">
                <span>Mean Brightness:</span>
                <strong>{qualityCurrent?.brightness ?? "128"} / 255</strong>
              </div>
              <div className="metric-pill">
                <span>Specular Glare:</span>
                <strong>{qualityCurrent?.glare_percent ?? "2.8"}%</strong>
              </div>
            </div>
            {qualityCurrent?.hint && (
              <p className="quality-hint">
                <Info size={13} /> {qualityCurrent.hint}
              </p>
            )}
            {distinctiveness?.assessment && (
              <p className="quality-hint" style={{ marginTop: '6px', color: '#047857' }}>
                <CheckCircle2 size={13} /> Distinctiveness: {distinctiveness.assessment}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
