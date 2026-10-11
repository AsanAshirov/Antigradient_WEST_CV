import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const NUM = /(\d+(?:[.,]\d+)?)/;

/** Counts the first number in a string up from zero when it scrolls into view ("≤ 1,5 %", "6,14 млн", "8").
 * Keeps prefix, suffix and the decimal separator; the final text is exactly the given string. */
export function CountUp({ value, duration = 1.3, className }: { value: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const m = value.match(NUM);
  const [text, setText] = useState(() => (m && !reduce ? value.replace(NUM, zero(m[1])) : value));

  useEffect(() => {
    if (!m || reduce || !inView) {
      if (inView || reduce) setText(value);
      return;
    }
    const raw = m[1];
    const sep = raw.includes(",") ? "," : ".";
    const decimals = raw.includes(sep) ? raw.split(sep)[1].length : 0;
    const target = parseFloat(raw.replace(",", "."));
    const controls = animate(0, target, {
      duration,
      ease: [0.2, 0.7, 0, 1],
      onUpdate: (v) => setText(value.replace(NUM, v.toFixed(decimals).replace(".", sep))),
      onComplete: () => setText(value),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce]);

  return <span ref={ref} className={className}>{text}</span>;
}

function zero(raw: string) {
  const sep = raw.includes(",") ? "," : ".";
  const decimals = raw.includes(sep) ? raw.split(sep)[1].length : 0;
  return (0).toFixed(decimals).replace(".", sep);
}

/** A slow, endless band of the stack's names; pauses on hover, static with reduced motion. */
export function Marquee({ items, label }: { items: string[]; label: string }) {
  const row = (hidden: boolean) => (
    <ul className="marquee__row" aria-hidden={hidden || undefined}>
      {items.map((it) => (
        <li key={it}><span className="marquee__dot" aria-hidden="true" />{it}</li>
      ))}
    </ul>
  );
  return (
    <section className="marquee" aria-label={label}>
      <div className="marquee__track">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
