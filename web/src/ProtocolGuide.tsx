import { useState } from "react";
import { Camera, ShieldCheck, HelpCircle } from "lucide-react";

interface Step {
  frames: string;
  action: string;
  target: string;
  tip: string;
}

const PROTOCOL_STEPS: Step[] = [
  {
    frames: "Frames 01–02",
    action: "Front & Rear Overview",
    target: "Chassis context, trim specifications, general geometric proportions.",
    tip: "Maintain 3 meters distance. Ensure the license plate and headlight alignment are squarely in frame.",
  },
  {
    frames: "Frames 03–04",
    action: "Left & Right Side Profiles",
    target: "Door panel maps, rocker panels, roof arches, body swage lines.",
    tip: "Keep camera level with vehicle waistline. Avoid direct reflection of overhead sun.",
  },
  {
    frames: "Frames 05–08",
    action: "Four 45° Diagonal Angles",
    target: "Multi-panel continuity, bumper-to-fender seam alignment.",
    tip: "Essential for 3D perspective recovery and connecting adjacent component homographies.",
  },
  {
    frames: "Frames 09–12",
    action: "Four Wheels Close-Up",
    target: "Alloy rim spoke wear, curb rash, tire sidewall DOT codes.",
    tip: "Wheels provide the highest individual micro-feature density. Photograph perpendicular to hub.",
  },
  {
    frames: "Frames 13–16",
    action: "Door Edges, Sills & Door Skins",
    target: "Vulnerable paint surfaces, parking lot contact points, clearcoat micro-chips.",
    tip: "Capture at 30–50 cm distance. Natural diffuse light reveals hairline contact marks.",
  },
  {
    frames: "Frames 17+",
    action: "Itemized Defect Close-Ups",
    target: "High-resolution historical damage masks for Before vs After timeline registration.",
    tip: "Use 96×96 px minimum ROI. If surface is covered with opaque road grime, wipe clean first.",
  },
  {
    frames: "Verification",
    action: "VIN & Stamped Chassis ID",
    target: "Independent non-visual identifier for identical mass-produced vehicles.",
    tip: "Required when two identical factory-fresh vehicles share identical panel geometry (e.g. Cobalt).",
  },
];

export default function ProtocolGuide() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="protocol-guide-section" id="protocol-guide">
      <div className="protocol-header">
        <div className="protocol-title-group">
          <span className="eyebrow">
            <span className="status-dot" /> SMARTPHONE OPERATOR PROTOCOL
          </span>
          <h3>Standardized 17+ Frame Capture Flow</h3>
          <p>
            Designed for dealership intake, trade-in appraisals, and lease returns.
            Takes ~2 minutes per vehicle to compile a full auditable visual baseline.
          </p>
        </div>
        <div className="protocol-badge">
          <Camera size={16} />
          <span>ISO/NIST 800-63B ALIGNED WORKFLOW</span>
        </div>
      </div>

      <div className="protocol-cards-grid">
        {PROTOCOL_STEPS.map((step, idx) => (
          <div
            key={step.frames}
            className={`protocol-step-card ${activeStep === idx ? "active" : ""}`}
            onClick={() => setActiveStep(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setActiveStep(idx)}
          >
            <div className="step-card-top">
              <span className="step-frame-badge mono">{step.frames}</span>
              <span className="step-num mono">0{idx + 1}</span>
            </div>
            <strong className="step-action">{step.action}</strong>
            <p className="step-target">{step.target}</p>
            <div className="step-tip">
              <HelpCircle size={14} />
              <span>{step.tip}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="protocol-footer-note">
        <ShieldCheck size={16} />
        <span>
          <strong>Conservative Occlusion Principle:</strong> If a panel is heavily obscured by mud or glare,
          the system issues a <code>REVIEW</code> status requiring the operator to clean the spot or adjust lighting.
          Absence of evidence is never equated with evidence of absence.
        </span>
      </div>
    </div>
  );
}
