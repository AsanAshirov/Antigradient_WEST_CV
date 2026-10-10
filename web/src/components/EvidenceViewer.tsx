import { useInView } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

const H = 1000; // SVG units: both photos share this height, widths follow their aspect ratios
const GAP = 24;
export const INDIVIDUAL_W = 0.7;

type Size = [number, number];

/** Two photos and the inlier lines between them, drawn from the evidence data (not a baked image). */
export function MatchView({ refSrc, curSrc, refSize, curSize, matches, cells, onlyMarks = false, label }: {
  refSrc: string; curSrc: string; refSize: Size; curSize: Size; matches: number[][]; cells?: number[][];
  onlyMarks?: boolean; label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const w1 = (H * refSize[0]) / refSize[1];
  const w2 = (H * curSize[0]) / curSize[1];
  const lines = useMemo(() => {
    const rows = matches.filter((m) => !onlyMarks || m[4] >= INDIVIDUAL_W);
    // design features first (underneath), individual marks last (on top)
    return [...rows].sort((a, b) => a[4] - b[4]);
  }, [matches, onlyMarks]);

  return (
    <svg ref={ref} className={`matchview ${inView ? "is-drawn" : ""}`} viewBox={`0 0 ${w1 + GAP + w2} ${H}`}
      role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <image href={refSrc} x="0" y="0" width={w1} height={H} preserveAspectRatio="none" className="matchview__photo" />
      <image href={curSrc} x={w1 + GAP} y="0" width={w2} height={H} preserveAspectRatio="none" className="matchview__photo" />
      {cells?.map(([x, y, w, h], i) => (
        <rect key={`c${i}`} className="matchview__cell" x={x * w1} y={y * H} width={w * w1} height={h * H}
          style={{ ["--i" as string]: i }} />
      ))}
      {lines.map(([x0, y0, x1, y1, w], i) => (
        <line key={i} pathLength={1}
          className={w >= INDIVIDUAL_W ? "matchview__mark" : "matchview__design"}
          x1={x0 * w1} y1={y0 * H} x2={w1 + GAP + x1 * w2} y2={y1 * H}
          style={{ ["--i" as string]: i }} />
      ))}
      {lines.filter((m) => m[4] >= INDIVIDUAL_W).map(([x0, y0, x1, y1], i) => (
        <g key={`p${i}`} className="matchview__dots" style={{ ["--i" as string]: i }}>
          <circle cx={x0 * w1} cy={y0 * H} r={5} />
          <circle cx={w1 + GAP + x1 * w2} cy={y1 * H} r={5} />
        </g>
      ))}
    </svg>
  );
}

/** Before / after: the current photo warped into the reference frame, revealed by a draggable divider. */
export function CompareSlider({ beforeSrc, afterSrc, beforeLabel, afterLabel, sliderLabel }: {
  beforeSrc: string; afterSrc: string; beforeLabel: string; afterLabel: string; sliderLabel: string;
}) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  return (
    <div className="slider" ref={box}
      onPointerDown={(e) => { dragging.current = true; fromPointer(e); }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}>
      <img src={beforeSrc} alt={beforeLabel} draggable={false} />
      <img src={afterSrc} alt={afterLabel} draggable={false} className="slider__after"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className="slider__divider" style={{ left: `${pos}%` }} aria-hidden="true">
        <span className="slider__knob">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6 4L2 9l4 5M12 4l4 5-4 5" stroke="currentColor" strokeWidth="1.8" /></svg>
        </span>
      </div>
      <span className="slider__tag slider__tag--left mono">{beforeLabel}</span>
      <span className="slider__tag slider__tag--right mono">{afterLabel}</span>
      <input className="slider__range" type="range" min={0} max={100} value={Math.round(pos)} aria-label={sliderLabel}
        onChange={(e) => setPos(Number(e.target.value))} />
    </div>
  );
}
