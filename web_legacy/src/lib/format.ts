import type { Lang } from "../i18n/strings";

const locale = (lang: Lang) => (lang === "ru" ? "ru-RU" : "en-US");

export function money(uzs: number, lang: Lang): string {
  if (uzs >= 1_000_000) {
    const v = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(uzs / 1e6);
    return lang === "ru" ? `${v} млн сум` : `UZS ${v}M`;
  }
  const v = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(uzs);
  return lang === "ru" ? `${v} сум` : `UZS ${v}`;
}

export function millions(uzs: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(uzs / 1e6);
}

export function usd(v: number, lang: Lang): string {
  return lang === "ru" ? `$${new Intl.NumberFormat("ru-RU").format(v)}` : `$${new Intl.NumberFormat("en-US").format(v)}`;
}

export function pct(p: number, lang: Lang, digits = 0): string {
  const v = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(p * 100);
  return lang === "ru" ? `${v} %` : `${v}%`;
}

export function num(v: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(v);
}

export function seconds(ms: number, lang: Lang): string {
  const v = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000);
  return lang === "ru" ? `${v} с` : `${v} s`;
}
