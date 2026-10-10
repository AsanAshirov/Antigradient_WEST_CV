import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Pause, Play } from "./Icons";

/** Hero loop rendered by our pipeline (scripts/render_film.py): real keypoints on the car silhouette, a scan pass and
 * the voting-cell grid. Poster first; never autoplays with reduced motion; can be paused. */
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
        <img className="film__poster" src="/images/hero_poster.jpg" alt="" />
        {!failed && (
          <video ref={video} className="film__video" src="/media/hero.mp4" poster="/images/hero_poster.jpg"
            muted loop playsInline autoPlay={!reduce} preload={reduce ? "none" : "auto"}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
        )}
        <div className="film__scrim" />
        <div className="film__fade" />
      </div>
      <motion.div className="hero__readout mono" aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6, duration: 0.6 }}>
        <div>{t.hero.overlayCells}</div>
        <div className="hero__readout--signal">{t.hero.overlayVerdict}</div>
      </motion.div>
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
