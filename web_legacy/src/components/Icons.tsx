// One stroke weight, one grid (24 px), drawn for this product — no icon-pack look.
type P = { size?: number; className?: string };

export function Mark({ size = 28, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 1v6M14 21v6M1 14h6M21 14h6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2.2" fill="var(--signal)" />
    </svg>
  );
}

export function Arrow({ size = 18, className }: P) {
  return (
    <svg className={`arrow ${className ?? ""}`} width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function Play({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}

export function Pause({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}

export function Close({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Check({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 6.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function Warn({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <rect x="5" y="1" width="2" height="6.5" fill="currentColor" />
      <rect x="5" y="9" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

export function Plus({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Camera({ size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 6.5h3l1.5-2h6l1.5 2h3v9h-15z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Doc({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10h-9z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Verdict markers differ by shape, not only by colour. */
export function VerdictMark({ decision, size = 12 }: { decision: string; size?: number }) {
  if (decision === "SAME")
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4.2" fill="currentColor" />
      </svg>
    );
  if (decision === "DIFFERENT")
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.2" y="1.2" width="7.6" height="7.6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
