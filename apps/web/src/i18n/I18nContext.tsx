/**
 * apps/web/src/i18n/I18nContext.tsx
 * ───────────────────────────────────
 * Contexto de idioma para el catálogo del cliente. Guarda la preferencia
 * en localStorage para que se recuerde entre sesiones, y expone:
 *   · t(key, params?)        → traduce una llave simple, con {placeholders}
 *   · tCount(key, n, params?) → traduce una llave con singular/plural
 *                                (usa `${key}.one` o `${key}.other`)
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { messages, DEFAULT_LOCALE, type Locale } from './dictionary';

const STORAGE_KEY = 'petravia_locale';

function esLocaleValida(v: string | null): v is Locale {
  return v === 'es' || v === 'en' || v === 'pt' || v === 'ja' || v === 'zh' || v === 'it';
}

function localeInicial(): Locale {
  try {
    const guardada = localStorage.getItem(STORAGE_KEY);
    if (esLocaleValida(guardada)) return guardada;
  } catch {
    // localStorage no disponible (ej. modo privado) — seguimos con el default
  }
  return DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  tCount: (key: string, n: number, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolar(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  let out = str;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(localeInicial);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignorar si no hay storage */ }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const str = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key;
    return interpolar(str, params);
  }, [locale]);

  const tCount = useCallback((key: string, n: number, params?: Record<string, string | number>) => {
    const sufijo = n === 1 ? 'one' : 'other';
    const llaveCompleta = `${key}.${sufijo}`;
    const str = messages[locale]?.[llaveCompleta] ?? messages[DEFAULT_LOCALE]?.[llaveCompleta] ?? llaveCompleta;
    return interpolar(str, { n, ...params });
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, tCount }), [locale, setLocale, t, tCount]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook principal — expone { locale, setLocale, t, tCount }. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}

/** Atajo para cuando solo se necesita la función de traducción. */
export function useT() {
  return useI18n().t;
}
