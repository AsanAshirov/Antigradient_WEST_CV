import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { Lang } from "../i18n/strings";
import { Link } from "../lib/router";
import { Mark } from "./Icons";

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t.nav.language}>
      {(["ru", "en"] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Wordmark({ sub }: { sub?: string }) {
  return (
    <Link to="/" className="wordmark" aria-label="CarPrint">
      <Mark size={26} />
      <span className="wordmark__name">CarPrint</span>
      {sub && <span className="wordmark__sub mono">{sub}</span>}
    </Link>
  );
}

/** Landing navigation: transparent over the film, solid ink once the page scrolls. */
export function LandingNav() {
  const { t } = useI18n();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links: [string, string][] = [
    ["#problem", t.nav.problem], ["#how", t.nav.how], ["#evidence", t.nav.evidence], ["#estimate", t.nav.estimate],
    ["#numbers", t.nav.numbers], ["#business", t.nav.business], ["#science", t.nav.science],
  ];

  return (
    <header className={`topnav on-ink ${solid ? "is-solid" : ""} ${open ? "is-open" : ""}`}>
      <div className="topnav__inner wrap">
        <Wordmark />
        <nav className="topnav__links" aria-label="CarPrint">
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
          ))}
        </nav>
        <div className="topnav__actions">
          <LangToggle />
          <Link to="/studio" className="btn btn--line btn--small">{t.nav.studio}</Link>
          <button type="button" className="topnav__burger" aria-expanded={open} aria-label={t.nav.menu} onClick={() => setOpen(!open)}>
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
