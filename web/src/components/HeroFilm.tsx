import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Pause, Play } from "./Icons";

/** Full-bleed film rendered by our pipeline; poster first, never autoplays with reduced motion, can be paused. */
export function HeroFilm() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (reduce) v.pause();
    else void v.play().catch(() => setPlaying(false));
  }, [reduce]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  };

  return (
    <>
      <div className="film" aria-hidden="true">
        <img className="film__poster" src="/images/hero.jpg" alt="" />
        {!failed && (
          <video ref={video} className="film__video" src="/media/hero.mp4" poster="/images/hero.jpg"
            muted loop playsInline autoPlay={!reduce} preload={reduce ? "none" : "metadata"}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
        )}
        <div className="film__scrim" />
        <div className="film__fade" />
      </div>
      <HeroOverlay />
      {!failed && (
        <div className="film__controls on-ink">
          <span className="mono">{t.hero.filmLabel}</span>
          <button type="button" onClick={toggle} aria-label={playing ? t.hero.pause : t.hero.play}>
            {playing ? <Pause /> : <Play />}
          </button>
        </div>
      )}
    </>
  );
}

const POINTS: [number, number][] = [
  [842, 402], [901, 436], [968, 390], [1034, 452], [1097, 415], [1160, 472], [1214, 430], [1268, 500], [1012, 532],
  [1121, 548], [880, 520], [1302, 404], [946, 470], [1186, 520], [1240, 380],
];
const CELLS: [number, number][] = [[1084, 402], [1148, 402], [1148, 466], [1020, 466]];

/** The pipeline's vocabulary drawn over the film: viewfinder, scan line, keypoints, voting cells. */
function HeroOverlay() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const show = (delay: number) => (reduce ? {} : {
    initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay, duration: 0.5 },
  });
  return (
    <div className="hero__overlay" aria-hidden="true">
      <svg viewBox="0 0 1440 880" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="var(--signal)" strokeWidth="2">
          <motion.path d="M760 250 v-28 h28" {...show(0.3)} />
          <motion.path d="M1352 222 h28 v28" {...show(0.35)} />
          <motion.path d="M760 612 v28 h28" {...show(0.4)} />
          <motion.path d="M1352 640 h28 v-28" {...show(0.45)} />
        </g>
        {!reduce && (
          <motion.line x1="760" x2="1380" stroke="var(--signal)" strokeWidth="1"
            initial={{ y1: 240, y2: 240, opacity: 0 }} animate={{ y1: [240, 630, 468], y2: [240, 630, 468], opacity: [0, 1, 0.9] }}
            transition={{ duration: 2.4, delay: 0.6, ease: [0.65, 0, 0.35, 1] }} />
        )}
        <g fill="var(--signal)">
          {POINTS.map(([x, y], i) => (
            <motion.circle key={i} cx={x} cy={y} r={3.5} {...show(1.2 + i * 0.07)} />
          ))}
        </g>
        <g fill="none" stroke="#f2f1ed" strokeWidth="1" opacity="0.6">
          {CELLS.map(([x, y], i) => (
            <motion.rect key={i} x={x} y={y} width={64} height={64} {...show(2.4 + i * 0.12)} />
          ))}
        </g>
      </svg>
      <motion.div className="hero__readout mono" {...show(2.9)}>
        <div>{t.hero.overlayCells}</div>
        <div className="hero__readout--signal">{t.hero.overlayVerdict}</div>
      </motion.div>
      <motion.div className="hero__scanlabel mono" {...show(0.9)}>{t.hero.overlayScan}</motion.div>
    </div>
  );
}
