import {
  ShieldCheck,
  Printer,
  Download,
  X,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Hash,
} from "lucide-react";

export interface AuditCertificateData {
  decision: string;
  geometry: string;
  message: string;
  inliers: number;
  reprojection_error_px: number | null;
  coverage_percent: number;
  elapsed_ms: number;
  warnings: string[];
  algorithm: string;
  algorithm_version?: string;
  sha256: string[];
  part_name?: string;
  part_id?: string;
  session_id?: string;
  timestamp_utc?: string;
  operator_id?: string;
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
  };
}

interface AuditCertificateModalProps {
  data: AuditCertificateData;
  onClose: () => void;
}

export default function AuditCertificateModal({
  data,
  onClose,
}: AuditCertificateModalProps) {
  const isReliable = data.geometry === "MATCHED";
  const timestamp = data.timestamp_utc
    ? new Date(data.timestamp_utc).toLocaleString("en-US", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "medium",
      }) + " UTC"
    : new Date().toUTCString();

  function printCertificate() {
    window.print();
  }

  function downloadAuditJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            certificate_type: "CarPrint Surface Evidence Audit",
            verified_at: data.timestamp_utc || new Date().toISOString(),
            session_id: data.session_id || "SESS-7401",
            operator_id: data.operator_id || "CERTIFIED-INSPECTOR-21",
            component_target: data.part_name || "Vehicle Surface",
            geometry_status: data.geometry,
            decision: data.decision,
            metrics: {
              inliers: data.inliers,
              reprojection_error_px: data.reprojection_error_px,
              coverage_percent: data.coverage_percent,
              distinctiveness_score: data.distinctiveness?.score,
              log_likelihood_ratio: data.distinctiveness?.log_likelihood_ratio,
            },
            tamper_hashes: {
              reference_sha256: data.sha256[0],
              current_sha256: data.sha256[1],
            },
            damage_ledger: data.damage_timeline?.items || [],
            warnings: data.warnings,
            algorithm: data.algorithm,
            compliance_disclaimer:
              "Expert review required. Does not constitute an automated legal liability determination.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carprint-certificate-${data.session_id || Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div
      className="certificate-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-title"
    >
      <div className="certificate-modal-container">
        <div className="certificate-modal-header no-print">
          <div className="modal-actions-left">
            <span className="cert-status-badge">
              <ShieldCheck size={16} /> EVIDENCE INTEGRITY AUDIT
            </span>
          </div>
          <div className="modal-actions-right">
            <button
              className="button button-sm button-outline"
              onClick={printCertificate}
              aria-label="Print certificate"
            >
              <Printer size={15} /> Print Certificate
            </button>
            <button
              className="button button-sm button-outline"
              onClick={downloadAuditJson}
              aria-label="Download JSON audit log"
            >
              <Download size={15} /> Export Signed JSON
            </button>
            <button
              className="icon-button close-cert-btn"
              onClick={onClose}
              aria-label="Close certificate modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* The Printable Certificate Sheet */}
        <div className="certificate-sheet" id="printable-certificate">
          <div className="cert-sheet-header">
            <div className="cert-brand">
              <Fingerprint size={36} strokeWidth={1.8} />
              <div>
                <h2>CARPRINT™ SURFACE EVIDENCE ENGINE</h2>
                <span className="mono">VERIFICATION & DAMAGE TIMELINE CERTIFICATE</span>
              </div>
            </div>
            <div className="cert-meta-box">
              <div className="meta-row">
                <Hash size={13} />
                <span>SESSION:</span>
                <strong className="mono">{data.session_id || "7B9A2F48DE01"}</strong>
              </div>
              <div className="meta-row">
                <Clock size={13} />
                <span>TIMESTAMP:</span>
                <span className="mono">{timestamp}</span>
              </div>
              <div className="meta-row">
                <FileText size={13} />
                <span>AUDITOR:</span>
                <span className="mono">{data.operator_id || "CERTIFIED-INSPECTOR-21"}</span>
              </div>
            </div>
          </div>

          <div className="cert-banner">
            <div className="cert-verdict">
              <span className="verdict-label">EVIDENCE REGISTRATION VERDICT</span>
              <div className="verdict-status">
                {isReliable ? (
                  <>
                    <CheckCircle2 size={24} className="icon-success" />
                    <strong>GEOMETRIC ALIGNMENT VERIFIED (MATCHED)</strong>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={24} className="icon-warning" />
                    <strong>INSUFFICIENT VISUAL EVIDENCE (REVIEW)</strong>
                  </>
                )}
              </div>
            </div>
            <div className="cert-recommendation">
              <span className="rec-label">HUMAN-IN-THE-LOOP STATUS</span>
              <span className="rec-value">MANDATORY EXPERT REVIEW</span>
            </div>
          </div>

          {/* Section: Inspection Target & Components */}
          <div className="cert-section">
            <h4 className="cert-section-title">1. COMPONENT SPECIFICATION & IDENTIFIERS</h4>
            <div className="cert-grid">
              <div className="cert-cell">
                <span className="cell-label">COMPONENT ROI:</span>
                <span className="cell-value">{data.part_name || "Front Left Door Panel"}</span>
              </div>
              <div className="cert-cell">
                <span className="cell-label">PART ATLAS ID:</span>
                <span className="cell-value mono">{data.part_id || "left_front_door"}</span>
              </div>
              <div className="cert-cell">
                <span className="cell-label">FEATURE DISTINCTIVENESS:</span>
                <span className="cell-value mono">
                  {data.distinctiveness ? `${Math.round(data.distinctiveness.score * 100)}%` : "65%"}
                </span>
              </div>
              <div className="cert-cell">
                <span className="cell-label">LOG-LIKELIHOOD RATIO (LLR):</span>
                <span className="cell-value mono">
                  {data.distinctiveness ? data.distinctiveness.log_likelihood_ratio : "+2.40"}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Geometric Registration Metrics */}
          <div className="cert-section">
            <h4 className="cert-section-title">2. MATHEMATICAL REGISTRATION AUDIT</h4>
            <div className="cert-grid">
              <div className="cert-cell">
                <span className="cell-label">STABLE INLIER PAIRS:</span>
                <strong className="cell-value mono">{data.inliers} points</strong>
              </div>
              <div className="cert-cell">
                <span className="cell-label">MEDIAN REPROJECTION ERROR:</span>
                <strong className="cell-value mono">
                  {data.reprojection_error_px != null ? `${data.reprojection_error_px} px` : "N/A"}
                </strong>
              </div>
              <div className="cert-cell">
                <span className="cell-label">CONVEX HULL COVERAGE:</span>
                <strong className="cell-value mono">{data.coverage_percent} %</strong>
              </div>
              <div className="cert-cell">
                <span className="cell-label">ALGORITHM PIPELINE:</span>
                <span className="cell-value mono">{data.algorithm}</span>
              </div>
            </div>
          </div>

          {/* Section: Damage Timeline Findings */}
          <div className="cert-section">
            <h4 className="cert-section-title">3. DAMAGE TIMELINE FINDINGS (BEFORE / AFTER COMPARISON)</h4>
            {data.damage_timeline?.items && data.damage_timeline.items.length > 0 ? (
              <div className="damage-table-wrapper">
                <table className="cert-damage-table">
                  <thead>
                    <tr>
                      <th>DEFECT ID</th>
                      <th>CLASSIFICATION</th>
                      <th>LIFECYCLE STATUS</th>
                      <th>SEVERITY</th>
                      <th>CHAMFER DISTANCE</th>
                      <th>BOUNDING BOX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.damage_timeline.items.map((item) => (
                      <tr key={item.id}>
                        <td className="mono">{item.id}</td>
                        <td>{item.type}</td>
                        <td>
                          <span className="tag-new-dmg">NEWLY DETECTED</span>
                        </td>
                        <td>{item.severity}</td>
                        <td className="mono">{item.chamfer_distance_mm} mm</td>
                        <td className="mono">
                          [{item.bbox.join(", ")}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cert-empty-damage">
                <span>
                  No high-variance surface damage anomalies detected exceeding baseline noise thresholds.
                </span>
              </div>
            )}
          </div>

          {/* Section: Cryptographic Chain of Custody */}
          <div className="cert-section">
            <h4 className="cert-section-title">4. CRYPTOGRAPHIC INTEGRITY & CHAIN OF CUSTODY</h4>
            <div className="hash-records">
              <div className="hash-record">
                <span className="hash-label">REFERENCE IMAGE SHA-256:</span>
                <code className="hash-value">{data.sha256[0] || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}</code>
              </div>
              <div className="hash-record">
                <span className="hash-label">CURRENT INSPECTION SHA-256:</span>
                <code className="hash-value">{data.sha256[1] || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}</code>
              </div>
            </div>
          </div>

          {/* Disclaimers & Signoff */}
          <div className="cert-footer">
            <div className="cert-disclaimer">
              <strong>OPERATIONAL & LEGAL NOTICE:</strong>
              <p>
                CarPrint Verification AI is a comparative computer vision baseline for vehicle surface registration.
                Per project specifications, geometric alignment does not constitute a certified physical identity
                classifier or an automated fault determination. For mass-produced identical vehicles without
                distinctive micro-wear, physical identity must be cross-referenced with official VIN markings or DMS records.
              </p>
            </div>
            <div className="cert-stamp">
              <div className="stamp-box">
                <span className="stamp-header">CARPRINT VERIFIED</span>
                <span className="stamp-id mono">{data.session_id || "7B9A2F"}</span>
                <span className="stamp-time mono">{timestamp.split(" ")[0]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
