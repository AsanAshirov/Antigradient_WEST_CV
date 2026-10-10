import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { STRINGS, type Lang, type Strings } from "./strings";

type I18n = { lang: Lang; t: Strings; setLang: (lang: Lang) => void };

const Ctx = createContext<I18n | null>(null);
const KEY = "carprint.lang";

function initialLang(): Lang {
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl === "ru" || fromUrl === "en") return fromUrl;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    // storage blocked: fall back to the browser language
  }
  return "ru"; // the product's audience (Royal Motors, the jury in Tashkent) reads Russian first
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // per-viewer convenience only
    }
  }, []);

  useEffect(() => {
    const t = STRINGS[lang];
    document.documentElement.lang = lang;
    document.title = t.meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", t.meta.description);
  }, [lang]);

  const value = useMemo(() => ({ lang, t: STRINGS[lang], setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
