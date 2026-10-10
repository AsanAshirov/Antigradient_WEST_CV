# CarPrint — product and interface design

Design canvas (Claude Design): landing, studio result, phone capture and design-system foundations —
https://claude.ai/artifact/W1CzfcWXVE9LsvLLDkJeHN (private to the team until shared).

## Principles

1. **Evidence first.** Every verdict shows *why*: the lines, the cells, the reasons. Every number on the site has a
   source line or says "assumption".
2. **Honest uncertainty.** REVIEW is presented as a correct answer, costs are ranges, progress is real elapsed time
   with pipeline stages — never a fake percentage.
3. **A person decides.** Actions read "confirm findings", not "charge customer".
4. **Not a template.** No gradient washes, glass cards, emoji, icon grids or generic hero copy. The look comes from the
   subject: inspection photos, engineering drawings, instrument readouts.

## Visual language — "Кино + чертёж"

A dark, cinematic opening (the film is rendered by our own pipeline from real photos), then light "drawing sheet"
sections with hairlines, dimension lines, viewfinder corners and monospaced readouts.

| Token | Value | Use |
|---|---|---|
| Graphite | `#0C0D0F` / `#16181B` | film, evidence and science sections, studio bar |
| Paper / Sheet | `#F2F1ED` / `#FFFFFF` | content sections, cards |
| Line | `#D6D4CE` 1 px | all separation — no shadows |
| Signal | `#FF5B1F` (text on paper `#B6400C`, 5.5:1) | new damage and the primary action only |
| Verdicts | SAME `#1D5BD6` ● · REVIEW `#B7791F` ■ · DIFFERENT `#C2304A` ✕ | shape + label, never colour alone |
| Type | Onest (Cyrillic-first grotesque) + IBM Plex Mono for data | display 52–96 px, H2 36–58, body 17 |
| Grid | 12 columns, 64 px margins, 24 px gutters; spacing 4·8·12·16·24·32·48·64·96·128 | |
| Radius | 2 px | engineering crispness |
| Motion | `cubic-bezier(.2,.7,0,1)`, 160 / 320 / 640 ms; reveal = 12 px rise; images open with a scanner-like wipe | |

Tokens live in `web/src/styles/tokens.css`; the Foundations artboard on the canvas is the visual reference.

## Information architecture → hackathon criteria

| Landing section | What it proves | Criterion |
|---|---|---|
| Film hero + 4 readouts | the product in one sentence, measured numbers | presentation |
| 01 Check-in dispute | a real, local, costly problem (sourced facts, Tashkent photo) | impact |
| 02 Six steps (scroll-linked) | an end-to-end system, not a model call | technical depth |
| 03 Evidence (real pipeline output, drawn live) | how identity is decided, why design is discounted, REVIEW | innovation |
| 04 Estimate | sizes in cm, operation priors, Monte Carlo range | innovation, impact |
| 05 Numbers | frozen test, confidence intervals, honest TAR | quality |
| 06 Who pays | dealer subscription, insurer channel, ROI with assumptions | commercial |
| 07 Science and trust | NFA, scale fusion, integrity, privacy | technical depth |
| Closing CTA | "check it yourself on your own photos" → studio | prototype |

## Studio flows

* **Quick check.** Two drop zones (reference / current, up to 8 photos each), model selector, an example pair for
  instant trial. While processing: the six pipeline stages and real elapsed time. Result in three columns: frames
  with quality marks; viewer (match lines drawn from the evidence data, or a before/after slider on the frame aligned
  by the zone homography) with the damage timeline below; decision panel (verdict marker, reasons, cells, cohort,
  latency, cost range with drivers, PDF act).
* **Guided inspection.** VIN/plate (hashed at once), model, check-in/out → 8 slots + random challenge, each with a
  car silhouette guide; on a phone the native camera opens; every upload returns quality feedback and a retake
  button; analyse → cost of visible damage → compare with an earlier inspection of the same vehicle on this device.
* **States.** Empty (drop hint), loading (stages + time), partial (damage model not connected → identity only, said
  plainly), error (server message in the user's language), RECAPTURE (what to change).

## Accessibility and language

WCAG 2.2 AA contrast for text; focus rings; every control is a real `button`/`a`/`input`; the compare slider has a
keyboard range input; verdicts differ by shape; `prefers-reduced-motion` stops the film and all motion; alt text on
photos; RU default, EN toggle (all copy in `web/src/i18n/strings.ts`, EN is type-checked against RU).
