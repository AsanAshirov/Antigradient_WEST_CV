import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.2, 0.7, 0, 1] as const;

/** Content enters once, when it scrolls into view: 12 px rise and a short fade. */
export function Reveal({ children, delay = 0, className, as = "div" }: {
  children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" | "figure";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.64, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

const wipe: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)" },
  show: { clipPath: "inset(0 0% 0 0)", transition: { duration: 1.1, ease: EASE } },
};

/** Image wipe: clip-path opens left to right, like a scanner pass. The observer watches the unclipped outer box:
 * Chrome's IntersectionObserver honours clip-path, so a fully clipped element would never count as visible. */
export function Wipe({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }}>
      <motion.div className={className} variants={wipe}>
        {children}
      </motion.div>
    </motion.div>
  );
}

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.64, ease: EASE } },
};

export function SectionHead({ index, label }: { index: string; label: string }) {
  return (
    <>
      <span className="sheet-number" aria-hidden="true">{index}</span>
      <div className="section-head label">
        <span>{index}</span>
        <span className="section-head__rule" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </>
  );
}

const lineUp: Variants = {
  hidden: { y: "108%" },
  show: { y: "0%", transition: { duration: 0.9, ease: EASE } },
};

/** A headline line that slides up from behind a mask (editorial reveal); static with reduced motion. */
export function MaskLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`mask-line ${className ?? ""}`}>
      <motion.span className="mask-line__inner" variants={lineUp}>{children}</motion.span>
    </span>
  );
}

/** Viewfinder corners over a photo (decorative). */
export function Viewfinder({ inset = 18, size = 28, color = "var(--signal)" }: { inset?: number; size?: number; color?: string }) {
  const s = { position: "absolute" as const, width: size, height: size, borderColor: color, borderStyle: "solid" };
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset, pointerEvents: "none" }}>
      <span style={{ ...s, left: 0, top: 0, borderWidth: "2px 0 0 2px" }} />
      <span style={{ ...s, right: 0, top: 0, borderWidth: "2px 2px 0 0" }} />
      <span style={{ ...s, left: 0, bottom: 0, borderWidth: "0 0 2px 2px" }} />
      <span style={{ ...s, right: 0, bottom: 0, borderWidth: "0 2px 2px 0" }} />
    </div>
  );
}

/** Engineering dimension line; draws itself when it scrolls into view. */
export function DimensionLine({ label }: { label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="dimension mono" role="img" aria-label={label}>
      <span className="dimension__tick" />
      <motion.span
        className="dimension__rule"
        style={{ originX: 1 }}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <span className="dimension__label">{label}</span>
      <motion.span
        className="dimension__rule"
        style={{ originX: 0 }}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <span className="dimension__tick" />
    </div>
  );
}
