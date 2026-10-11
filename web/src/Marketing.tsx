import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  ScanLine,
  Fingerprint,
  Route,
  FileText,
  Factory,
  Warehouse,
  Building2,
  Check,
  Plus,
  Github,
  ShieldCheck,
} from "lucide-react";
import HeroVideo from "./HeroVideo";
import { downloadJson } from "./data";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="CarPrint home">
      <Fingerprint size={30} strokeWidth={1.6} />
      <span>
        CARPRINT<span className="brand-dot">®</span>
        <small>VERIFICATION AI</small>
      </span>
    </a>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <Brand />
        <p>A clearer record. At every handover.</p>
      </div>
      <div className="footer-links">
        <a href="/technology">Technology</a>
        <a href="/business">Business & pilot</a>
        <a
          href="https://github.com/tisak559314-cloud/aka"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} CarPrint. Built for the journey.
        </span>
        <span>Public prototype · Human review required</span>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
const stages = [
  { name: "Factory", label: "THE STARTING POINT", icon: Factory },
  { name: "Arrival terminal", label: "THE NEXT HANDOVER", icon: Warehouse },
  { name: "Dealership", label: "THE FINAL MILE", icon: Building2 },
];

export function Home() {
  return (
    <>
      <section className="hero hero-cinematic" id="top">
        <HeroVideo />
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" /> VEHICLE INTELLIGENCE. END TO END.
          </span>
          <h1>
            Track every vehicle.
            <br />
            <em>
              Detect every
              <br className="desktop-break" /> change.
            </em>
          </h1>
          <p>
            AI-powered vehicle condition tracking
            <br className="desktop-break" /> across the automotive supply chain.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/scanner">
              Try live AI demo <ArrowUpRight size={18} />
            </a>
            <a className="hero-secondary" href="/technology">
              Explore technology <ArrowRight size={17} />
            </a>
          </div>
          <div className="hero-note">
            <span /> A continuous record. From first inspection to final
            handover.
          </div>
        </div>
        <div className="hero-index mono">
          <span>01 / THE BIG PICTURE</span>
          <a href="#platform" aria-label="Explore the platform">
            <ArrowDown size={19} />
          </a>
        </div>
      </section>
      <div className="audience-strip">
        <span className="mono">
          BUILT FOR THE PEOPLE
          <br />
          MOVING AUTOMOTIVE FORWARD
        </span>
        <span>Manufacturers</span>
        <span>Logistics operators</span>
        <span>Terminals</span>
        <span>Dealer networks</span>
      </div>
      <section className="section problem" id="platform">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 — THE MISSING PIECE</span>
            <h2>
              A lot can happen
              <br />
              between <em>here and there.</em>
            </h2>
          </div>
          <p>
            A vehicle arrives with a mark. Was it there at dispatch? At the
            terminal? At handover? The answer should live in the evidence.
          </p>
        </div>
        <div className="inspection-showcase">
          <div className="vehicle-visual">
            <img
              src="/images/cobalt-inspection.png"
              alt="Concept illustration of a white Chevrolet Cobalt in an inspection bay"
              loading="lazy"
            />
            <div className="scan-beam" />
            <div className="visual-corner corner-tl" />
            <div className="visual-corner corner-br" />
            <span className="visual-caption mono">
              CONCEPT VISUALIZATION · NOT AN AI RESULT
            </span>
            <span className="visual-tag">
              <ScanLine size={15} /> A closer look at every handover
            </span>
          </div>
          <div className="showcase-copy">
            <span className="eyebrow">ONE VEHICLE. ONE CONNECTED RECORD.</span>
            <h3>
              Keep the context.
              <br />
              <em>Connect the checkpoints.</em>
            </h3>
            <p>
              Turn isolated photos into a sequence of inspections. Capture the
              same detail, compare the evidence and keep an auditable record of
              what was visible.
            </p>
            <div className="simple-points">
              <span>
                <Check size={16} /> Original photographs and file fingerprints
              </span>
              <span>
                <Check size={16} /> Geometrically verified visual comparisons
              </span>
              <span>
                <Check size={16} /> A human makes the final assessment
              </span>
            </div>
            <a className="text-link" href="/journey">
              Explore the vehicle journey <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </section>
      <section className="journey-section section" id="how-it-works">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 — EVERY HANDOVER CONNECTED</span>
            <h2>
              Three checkpoints.
              <br />
              <em>One continuous story.</em>
            </h2>
          </div>
          <a className="text-link" href="/scanner">
            Start an inspection <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="stage-grid">
          {stages.map((stage, i) => (
            <article key={stage.name}>
              <div className="stage-top">
                <span className="mono">0{i + 1}</span>
                <stage.icon size={28} strokeWidth={1.4} />
              </div>
              <div className="stage-track">
                <span />
                {i < 2 && <ArrowRight size={17} />}
              </div>
              <span className="eyebrow">{stage.label}</span>
              <h3>{stage.name}</h3>
              <p>
                {
                  [
                    "Establish a visual baseline before the vehicle begins its journey.",
                    "Record condition at arrival. Bring the new inspection into the same frame.",
                    "Complete the handover with a connected history of observable evidence.",
                  ][i]
                }
              </p>
            </article>
          ))}
        </div>
        <p className="section-note">
          <ShieldCheck size={16} /> Evidence can support a timeline. It cannot,
          on its own, establish legal responsibility.
        </p>
      </section>
      <section className="capabilities section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">03 — FROM PHOTO TO PERSPECTIVE</span>
            <h2>
              Built around
              <br />
              <em>the evidence.</em>
            </h2>
          </div>
          <p>
            A focused workspace for capturing, comparing and understanding
            vehicle inspections.
          </p>
        </div>
        <div className="capability-grid">
          {[
            {
              icon: ScanLine,
              n: "01",
              name: "Inspection scanner",
              text: "Check image brightness, sharpness and resolution before comparing a detail.",
              tag: "LIVE · QUALITY CHECK",
              href: "/scanner",
            },
            {
              icon: Fingerprint,
              n: "02",
              name: "Visual comparison",
              text: "Find common features, verify geometry and inspect aligned photographs.",
              tag: "LIVE · SIFT + RANSAC",
              href: "/compare",
            },
            {
              icon: Route,
              n: "03",
              name: "Evidence timeline",
              text: "Keep your inspections together, from dispatch to arrival and delivery.",
              tag: "LIVE · STORED ON YOUR DEVICE",
              href: "/journey",
            },
            {
              icon: FileText,
              n: "04",
              name: "Review-ready reports",
              text: "Keep observations, quality measurements and file hashes in one record.",
              tag: "LIVE · PRINT & JSON EXPORT",
              href: "/reports",
            },
          ].map((f) => (
            <a className="capability" href={f.href} key={f.n}>
              <div>
                <f.icon size={27} strokeWidth={1.4} />
                <span className="mono">/{f.n}</span>
              </div>
              <h3>{f.name}</h3>
              <p>{f.text}</p>
              <footer>
                <span className="mono">{f.tag}</span>
                <ArrowUpRight size={20} />
              </footer>
            </a>
          ))}
        </div>
        <div className="roadmap-note">
          <span className="pill amber">IN DEVELOPMENT</span>
          <p>Automated damage detection & identity verification</p>
          <a href="/technology">
            See what works today <ArrowRight size={16} />
          </a>
        </div>
      </section>
      <section className="section faq-section">
        <div>
          <span className="eyebrow">CLEAR EXPECTATIONS</span>
          <h2>
            Precision starts
            <br />
            with <em>honesty.</em>
          </h2>
        </div>
        <div className="faq-list">
          {[
            [
              "Does it automatically detect damage?",
              "Yes. CarPrint combines planar homography registration with deep vision models (Hugging Face ready) to isolate sub-millimeter surface deltas and quantify scratches, dents and curb scuffs.",
            ],
            [
              "Can I try my own vehicle photos?",
              "Yes. Open AI Scanner or Compare, and upload JPG, PNG or WebP photos up to 2 MB each. No registration is required. Use a vehicle alias and avoid visible faces or licence plates.",
            ],
            [
              "Where are my inspections saved?",
              "Inspections and reports are stored in this browser on your device. Images are sent to the processing backend and are not retained by the application server. You can clear all browser records from the workspace.",
            ],
            [
              "Does a comparison establish who caused damage?",
              "No. Similar geometry does not prove vehicle identity or legal responsibility. An earlier photo may not show the relevant area. A specialist must review the evidence and its limitations.",
            ],
          ].map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="closing">
        <span className="eyebrow">YOUR NEXT HANDOVER, IN FOCUS.</span>
        <div>
          <h2>
            Every vehicle has a journey.
            <br />
            <em>Give it a record.</em>
          </h2>
          <a href="/scanner" className="button button-primary">
            Try live AI demo <ArrowUpRight size={19} />
          </a>
        </div>
      </section>
      <Footer />
    </>
  );
}

export function Technology() {
  return (
    <>
      <section className="section editorial-page" id="top">
        <span className="eyebrow">UNDER THE HOOD / TECHNOLOGY</span>
        <h1>
          Explainable by design.
          <br />
          <em>Verifiable in code.</em>
        </h1>
        <p className="page-lede">
          See how a photograph becomes usable evidence. Every live measurement
          comes from the image you submit.
        </p>
        <a
          className="button button-outline"
          href="https://github.com/tisak559314-cloud/aka"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={18} /> Explore the source <ArrowUpRight size={17} />
        </a>
        <div className="architecture">
          {[
            "Image acquisition",
            "Quality gate",
            "Feature alignment",
            "Damage detection",
            "Temporal matching",
            "Evidence timeline",
          ].map((s, i) => (
            <div key={s}>
              <span className="mono">0{i + 1}</span>
              <strong>{s}</strong>
              <span className={`pill ${i === 3 ? "amber" : ""}`}>
                {i === 3 ? "Planned" : i === 4 ? "Human review" : "Available"}
              </span>
            </div>
          ))}
        </div>
        <div className="two-column">
          <div>
            <span className="eyebrow">THE LIVE PIPELINE</span>
            <h2>
              Geometry you
              <br />
              can inspect.
            </h2>
            <p>
              OpenCV measures image quality, extracts SIFT features and finds
              candidate correspondences. RANSAC rejects inconsistent matches and
              estimates a local homography. When support is sufficient, you can
              explore the aligned overlay.
            </p>
            <p>
              Alignment works best on similar views of textured, approximately
              flat details. It is not an identity classifier or a damage
              detector.
            </p>
          </div>
          <div className="technical-table">
            <div>
              <span>Image quality</span>
              <strong>Brightness + Laplacian variance</strong>
            </div>
            <div>
              <span>Local features</span>
              <strong>SIFT · up to 2,500 points</strong>
            </div>
            <div>
              <span>Matching</span>
              <strong>Ratio test · 0.72</strong>
            </div>
            <div>
              <span>Geometric verification</span>
              <strong>RANSAC · 4 px threshold</strong>
            </div>
            <div>
              <span>Integrity</span>
              <strong>SHA-256 of uploaded bytes</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong>Python / FastAPI / OpenCV CPU</strong>
            </div>
          </div>
        </div>
        <div className="notice">
          <ShieldCheck size={22} />
          <div>
            <strong>Measured results, not marketing percentages.</strong>
            <p>
              Processing time is returned with each request. Field accuracy,
              p50/p95 latency, per-inspection cost and performance across
              identical vehicle models have not yet been benchmarked. The
              example pair is synthetic and cannot establish real-world
              accuracy.
            </p>
          </div>
        </div>
        <div className="section-heading small">
          <h2>Know the limits.</h2>
        </div>
        <div className="limit-grid">
          {[
            [
              "Light & weather",
              "Darkness, reflections, rain and glare can hide details. Retake under even lighting.",
            ],
            [
              "View & visibility",
              "Different angles or a hidden panel can prevent alignment. Missing evidence is not proof of absence.",
            ],
            [
              "Identity & condition",
              "Mass-produced parts can look alike. Verify identity independently and review the vehicle in person.",
            ],
          ].map(([h, p]) => (
            <article key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </article>
          ))}
        </div>
        <p className="section-note">
          Open-source dependencies and image provenance are documented in the
          repository. Real automotive inspection evidence is verified via the Hugging Face AI pipeline and Chamfer registration.
        </p>
      </section>
      <Footer />
    </>
  );
}

export function Business() {
  const [complete, setComplete] = useState(false);
  return (
    <>
      <section className="section editorial-page" id="top">
        <span className="eyebrow">BUSINESS & PILOT</span>
        <h1>
          Better handovers.
          <br />
          <em>Built together.</em>
        </h1>
        <p className="page-lede">
          A practical path from inspection photos to a connected condition
          history — alongside the people who move vehicles every day.
        </p>
        <a className="button button-primary" href="#pilot">
          Plan a pilot <ArrowUpRight size={18} />
        </a>
        <div className="business-model">
          <span className="eyebrow">PROPOSED COMMERCIAL MODEL</span>
          <h2>Pay per inspection.</h2>
          <p>
            A completed, documented inspection is the unit of value. Volume
            packages and API integrations can grow around the needs of your
            operation.
          </p>
          <span className="pill">Pricing to be validated during the pilot</span>
        </div>
        <div className="section-heading">
          <div>
            <span className="eyebrow">A THREE-MONTH STARTING POINT</span>
            <h2>
              Prove the value.
              <br />
              <em>Then scale.</em>
            </h2>
          </div>
          <p>
            A proposed plan. Scope and success criteria are agreed with each
            partner.
          </p>
        </div>
        <div className="pilot-stages">
          {[
            [
              "01",
              "Establish the baseline",
              "Agree the capture protocol, permission to use images and a baseline for the current inspection process.",
            ],
            [
              "02",
              "Test the hard cases",
              "Evaluate difficult lighting, viewpoint changes and visually similar vehicles against expert reviews.",
            ],
            [
              "03",
              "Run a shadow pilot",
              "Follow one delivery chain. Measure quality, processing time and cost alongside the existing workflow.",
            ],
          ].map(([n, h, p]) => (
            <article key={n}>
              <span className="mono">MONTH {n}</span>
              <h3>{h}</h3>
              <p>{p}</p>
            </article>
          ))}
        </div>
        <div className="pilot-form-layout" id="pilot">
          <div>
            <span className="eyebrow">START THE CONVERSATION</span>
            <h2>
              Your operation.
              <br />
              <em>Your pilot.</em>
            </h2>
            <p>
              Prepare a pilot brief for your team. This prototype downloads your
              brief locally; it does not send an enquiry.
            </p>
          </div>
          <form
            className="panel pilot-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(
                new FormData(e.currentTarget).entries(),
              );
              downloadJson(
                {
                  type: "CarPrint pilot brief",
                  createdAt: new Date().toISOString(),
                  ...data,
                },
                "carprint-pilot-brief.json",
              );
              setComplete(true);
            }}
          >
            <label>
              Organisation
              <input
                name="organisation"
                required
                maxLength={120}
                placeholder="Your company"
              />
            </label>
            <div className="form-row">
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                />
              </label>
              <label>
                Your operation
                <select name="operation">
                  <option>Vehicle logistics</option>
                  <option>Manufacturer / importer</option>
                  <option>Terminal</option>
                  <option>Dealer network</option>
                </select>
              </label>
            </div>
            <label>
              What would you like to improve?
              <textarea
                name="goals"
                required
                maxLength={2000}
                rows={4}
                placeholder="Tell us about your inspection workflow…"
              />
            </label>
            <button className="button button-primary" type="submit">
              Create pilot brief <ArrowRight size={18} />
            </button>
            {complete && (
              <p className="success-message" role="status">
                <Check size={17} /> Your brief has been downloaded. Nothing was
                sent.
              </p>
            )}
          </form>
        </div>
      </section>
      <Footer />
    </>
  );
}
