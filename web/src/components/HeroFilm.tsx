import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Pause, Play, VerdictMark } from "./Icons";

// Timings of the hero loop as rendered by scripts/render_film.py (8 s): scan 0.6–3.2 s, cells from 3.4 s.
const LOOP = 8;
const POINTS = 420;
const CELLS = 8;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Hero loop rendered by our pipeline: real keypoints on the car silhouette, a scan pass and the voting cells.
 * The instrument panel reads the film's own clock, so its numbers move with what is on screen. */
export function HeroFilm() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(reduce ? 5 : 0);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (reduce) v.pause();
    else void v.play().catch(() => setPlaying(false));
  }, [reduce]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      if (video.current) setClock(video.current.currentTime % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  };

  const points = Math.round(POINTS * ease((clock - 0.6) / 2.6));
  const cells = clock >= 3.4 ? Math.min(CELLS, Math.round(CELLS * ease((clock - 3.4) / 0.8))) : 0;
  const verdict = clock >= 4.3 && clock < LOOP - 0.9;

  return (
    <>
      <div className="film" aria-hidden="true">
        <img className="film__poster" src="/images/hero_poster.jpg" alt="" />
        {!failed && (
          <video ref={video} className="film__video" src="/media/hero.mp4" poster="/images/hero_poster.jpg"
            muted loop playsInline autoPlay={!reduce} preload={reduce ? "none" : "auto"}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
        )}
        <div className="film__scrim" />
        <div className="film__fade" />
        <div className="film__grain" />
      </div>
      <dl className="hud mono" aria-hidden="true">
        <div><dt>{t.hud.frame}</dt><dd>{t.hud.frameValue}</dd></div>
        <div><dt>{t.hud.points}</dt><dd className="hud__num">{String(points).padStart(3, "0")}</dd></div>
        <div><dt>{t.hud.cells}</dt><dd className="hud__num">{cells} / 6</dd></div>
        <div>
          <dt>{t.hud.verdict}</dt>
          <dd className={`hud__verdict ${verdict ? "is-on" : ""}`}><VerdictMark decision="SAME" size={9} /> SAME</dd>
        </div>
      </dl>
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

/** The 25-second pipeline film: plays (muted) while it is on screen, pauses when it leaves; native controls. */
export function PipelineFilm() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inView = useInView(box, { amount: 0.5 });

  useEffect(() => {
    const v = video.current;
    if (!v || reduce) return;
    if (inView) void v.play().catch(() => undefined);
    else v.pause();
  }, [inView, reduce]);

  return (
    <figure className="pipefilm" ref={box}>
      <video ref={video} src="/media/film.mp4" poster="/images/film_poster.jpg" muted playsInline controls
        preload="metadata" aria-label={t.how.filmLabel} />
      <figcaption className="source">{t.how.filmCaption}</figcaption>
    </figure>
  );
}
