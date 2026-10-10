import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

// Both supplied clips are encoded into this file in order: 0.MOV, then 1.MOV.
// Native looping avoids changing sources (and flashing black) at each boundary.
export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reducedMotion) video.pause();
    else void video.play().catch(() => setPlaying(false));
  }, [reducedMotion]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  };

  return (
    <>
      <div className="hero-film" aria-hidden="true">
        <video
          ref={videoRef}
          src="/videos/hero-sequence.mp4"
          poster="/videos/hero-poster.jpg"
          autoPlay={!reducedMotion}
          loop
          muted
          playsInline
          preload={reducedMotion ? "none" : "auto"}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          className={failed ? "failed" : undefined}
        />
      </div>
      <div className="hero-film-controls">
        <span className="mono">CONCEPT FILM</span>
        {!failed && (
          <button
            type="button"
            className="film-toggle"
            onClick={toggle}
            aria-label={
              playing ? "Pause background video" : "Play background video"
            }
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? "Pause" : "Play"}
          </button>
        )}
      </div>
    </>
  );
}
