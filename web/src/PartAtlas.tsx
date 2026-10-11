import { Layers, ShieldCheck, Activity, Target } from "lucide-react";

export interface PartInfo {
  id: string;
  name: string;
  category: string;
  oemTolerance: string;
  planarStability: string;
  distinctiveness: number;
}

export const CAR_PARTS: Record<string, PartInfo> = {
  left_front_door: {
    id: "left_front_door",
    name: "Front Left Door Panel",
    category: "Exterior Sheetmetal",
    oemTolerance: "± 0.5 mm CAD",
    planarStability: "High (Planar)",
    distinctiveness: 0.65,
  },
  left_rear_door: {
    id: "left_rear_door",
    name: "Rear Left Door Panel",
    category: "Exterior Sheetmetal",
    oemTolerance: "± 0.5 mm CAD",
    planarStability: "High (Planar)",
    distinctiveness: 0.62,
  },
  front_bumper: {
    id: "front_bumper",
    name: "Front Bumper Fascia",
    category: "Composite Fascia",
    oemTolerance: "± 1.2 mm CAD",
    planarStability: "Medium (Piecewise)",
    distinctiveness: 0.78,
  },
  rear_bumper: {
    id: "rear_bumper",
    name: "Rear Bumper Cover",
    category: "Composite Fascia",
    oemTolerance: "± 1.2 mm CAD",
    planarStability: "Medium (Piecewise)",
    distinctiveness: 0.74,
  },
  front_left_wheel: {
    id: "front_left_wheel",
    name: "Front Left Alloy Wheel",
    category: "Rotational Wheel",
    oemTolerance: "± 0.2 mm Runout",
    planarStability: "Radial Planar",
    distinctiveness: 0.92,
  },
  rear_right_wheel: {
    id: "rear_right_wheel",
    name: "Rear Right Alloy Wheel",
    category: "Rotational Wheel",
    oemTolerance: "± 0.2 mm Runout",
    planarStability: "Radial Planar",
    distinctiveness: 0.90,
  },
  hood: {
    id: "hood",
    name: "Engine Hood / Bonnet",
    category: "Exterior Sheetmetal",
    oemTolerance: "± 0.6 mm CAD",
    planarStability: "High (Planar)",
    distinctiveness: 0.58,
  },
  general: {
    id: "general",
    name: "General Component ROI",
    category: "Standard Inspection",
    oemTolerance: "± 1.0 mm Homography",
    planarStability: "Adaptive",
    distinctiveness: 0.70,
  },
};

interface PartAtlasProps {
  selectedPart: string;
  onSelectPart: (partId: string) => void;
  disabled?: boolean;
}

export default function PartAtlas({
  selectedPart,
  onSelectPart,
  disabled = false,
}: PartAtlasProps) {
  const current = CAR_PARTS[selectedPart] || CAR_PARTS.general;

  return (
    <div className="part-atlas-container" aria-label="Vehicle Part Atlas selector">
      <div className="part-atlas-header">
        <div className="atlas-title">
          <Layers size={18} className="atlas-icon" />
          <div>
            <strong>PART ATLAS™ COORDINATE SELECTOR</strong>
            <small>Decoupled component homography — isolated planar verification</small>
          </div>
        </div>
        <div className="atlas-telemetry-badge">
          <Activity size={14} />
          <span>Active ROI: {current.name}</span>
        </div>
      </div>

      <div className="part-atlas-body">
        {/* Interactive SVG Blueprint */}
        <div className="blueprint-wrapper">
          <svg
            viewBox="0 0 680 260"
            className="vehicle-blueprint"
            role="img"
            aria-label="Interactive 2D vehicle blueprint schematic"
          >
            <defs>
              <linearGradient id="blueprintGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
              </linearGradient>
              <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#253248" strokeWidth="0.5" />
              </pattern>
            </defs>

            {/* Background Grid */}
            <rect width="680" height="260" fill="url(#gridPattern)" rx="8" />

            {/* Vehicle Chassis Outline (Side & 3/4 perspective silhouette) */}
            <path
              d="M 60 170 Q 70 120 120 110 L 210 100 Q 280 40 370 40 L 460 40 Q 520 40 560 105 L 610 125 Q 635 140 640 170 L 640 180 Q 640 195 620 195 L 565 195 Q 560 155 515 155 Q 470 155 465 195 L 245 195 Q 240 155 195 155 Q 150 155 145 195 L 75 195 Q 60 195 60 170 Z"
              fill="url(#blueprintGrad)"
              stroke="#475569"
              strokeWidth="1.6"
              strokeDasharray="4 2"
            />

            {/* Greenhouse / Glass Windows */}
            <path
              d="M 290 95 L 365 52 L 455 52 L 530 95 L 435 95 Z"
              fill="#1e293b"
              stroke="#64748b"
              strokeWidth="1.2"
              opacity="0.7"
            />

            {/* Front Bumper Zone */}
            <g
              className={`part-hotspot ${selectedPart === "front_bumper" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("front_bumper")}
              role="button"
              tabIndex={0}
              aria-label="Select Front Bumper"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("front_bumper")}
            >
              <path
                d="M 60 145 Q 62 120 100 115 L 105 185 Q 70 185 60 145 Z"
                className="hotspot-area"
              />
              <circle cx="80" cy="150" r="5" className="hotspot-reticle" />
              <text x="50" y="215" className="hotspot-label">Front Bumper</text>
            </g>

            {/* Hood / Engine Bay Zone */}
            <g
              className={`part-hotspot ${selectedPart === "hood" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("hood")}
              role="button"
              tabIndex={0}
              aria-label="Select Engine Hood"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("hood")}
            >
              <path
                d="M 105 115 L 210 100 L 265 100 L 195 140 L 105 140 Z"
                className="hotspot-area"
              />
              <circle cx="170" cy="120" r="5" className="hotspot-reticle" />
              <text x="145" y="90" className="hotspot-label">Hood / Bonnet</text>
            </g>

            {/* Front Left Door Zone */}
            <g
              className={`part-hotspot ${selectedPart === "left_front_door" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("left_front_door")}
              role="button"
              tabIndex={0}
              aria-label="Select Front Left Door Panel"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("left_front_door")}
            >
              <path
                d="M 235 105 L 355 105 L 350 185 L 235 185 Q 235 160 215 155 L 235 105 Z"
                className="hotspot-area"
              />
              <circle cx="290" cy="145" r="5" className="hotspot-reticle" />
              <text x="245" y="148" className="hotspot-label bold">Front Door (Primary)</text>
            </g>

            {/* Rear Left Door Zone */}
            <g
              className={`part-hotspot ${selectedPart === "left_rear_door" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("left_rear_door")}
              role="button"
              tabIndex={0}
              aria-label="Select Rear Left Door Panel"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("left_rear_door")}
            >
              <path
                d="M 360 105 L 470 105 L 465 185 L 355 185 Z"
                className="hotspot-area"
              />
              <circle cx="410" cy="145" r="5" className="hotspot-reticle" />
              <text x="380" y="148" className="hotspot-label">Rear Door</text>
            </g>

            {/* Rear Bumper Zone */}
            <g
              className={`part-hotspot ${selectedPart === "rear_bumper" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("rear_bumper")}
              role="button"
              tabIndex={0}
              aria-label="Select Rear Bumper"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("rear_bumper")}
            >
              <path
                d="M 575 115 L 635 135 Q 640 170 630 190 L 570 190 Z"
                className="hotspot-area"
              />
              <circle cx="605" cy="155" r="5" className="hotspot-reticle" />
              <text x="565" y="215" className="hotspot-label">Rear Bumper</text>
            </g>

            {/* Front Left Alloy Wheel */}
            <g
              className={`part-hotspot ${selectedPart === "front_left_wheel" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("front_left_wheel")}
              role="button"
              tabIndex={0}
              aria-label="Select Front Left Alloy Wheel"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("front_left_wheel")}
            >
              <circle cx="195" cy="190" r="38" className="hotspot-area wheel-zone" />
              <circle cx="195" cy="190" r="22" className="wheel-inner" />
              <circle cx="195" cy="190" r="5" className="hotspot-reticle" />
              <text x="145" y="245" className="hotspot-label">Front Wheel (LF)</text>
            </g>

            {/* Rear Right / Left Alloy Wheel */}
            <g
              className={`part-hotspot ${selectedPart === "rear_right_wheel" ? "active" : ""}`}
              onClick={() => !disabled && onSelectPart("rear_right_wheel")}
              role="button"
              tabIndex={0}
              aria-label="Select Rear Alloy Wheel"
              onKeyDown={(e) => e.key === "Enter" && !disabled && onSelectPart("rear_right_wheel")}
            >
              <circle cx="515" cy="190" r="38" className="hotspot-area wheel-zone" />
              <circle cx="515" cy="190" r="22" className="wheel-inner" />
              <circle cx="515" cy="190" r="5" className="hotspot-reticle" />
              <text x="475" y="245" className="hotspot-label">Rear Wheel (LR)</text>
            </g>
          </svg>
        </div>

        {/* Part Telemetry Quick Specs */}
        <div className="part-spec-card">
          <div className="spec-item">
            <span className="spec-label">
              <Target size={13} /> Selected Part:
            </span>
            <strong className="spec-value">{current.name}</strong>
          </div>
          <div className="spec-item">
            <span className="spec-label">Part Classification:</span>
            <span className="spec-value">{current.category}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Planar Geometry:</span>
            <span className="spec-value">{current.planarStability}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">CAD Surface Tolerance:</span>
            <span className="spec-value mono">{current.oemTolerance}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Distinctiveness Weight:</span>
            <div className="distinctiveness-meter">
              <div
                className="meter-bar"
                style={{ width: `${Math.round(current.distinctiveness * 100)}%` }}
              />
              <span className="mono">{Math.round(current.distinctiveness * 100)}%</span>
            </div>
          </div>
          <div className="spec-footnote">
            <ShieldCheck size={13} />
            <span>
              Homography is calculated on single component planar surfaces to prevent 3D curvature skew.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
