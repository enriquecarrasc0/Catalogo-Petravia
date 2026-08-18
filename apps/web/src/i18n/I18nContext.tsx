/**
 * apps/web/src/i18n/I18nContext.tsx
 * ───────────────────────────────────
 * Contexto de idioma para el catálogo del cliente. Guarda la preferencia
 * en localStorage, **por cliente** (usando su token como parte de la
 * llave) para que se recuerde entre sesiones sin imponerle a otro
 * cliente que use el mismo dispositivo el idioma que eligió el anterior.
 *
 * El panel de vendedor/admin SIEMPRE se ve en español — nunca lee ni
 * escribe la preferencia de ningún cliente.
 *
 * Expone:
 *   · t(key, params?)        → traduce una llave simple, con {placeholders}
 *   · tCount(key, n, params?) → traduce una llave con singular/plural
 *                                (usa `${key}.one` o `${key}.other`)
 *   · forzarEspanol()         → fuerza español en memoria sin tocar la
 *                                preferencia guardada de ningún cliente.
 *                                Se llama al iniciar sesión como
 *                                vendedor/admin (la navegación es SPA,
 *                                sin recargar la página, así que el
 *                                locale no se vuelve a calcular solo).
 *   · restaurarLocaleCliente() → vuelve a leer la preferencia del
 *                                cliente actual. Se llama al iniciar
 *                                sesión como cliente, por si el idioma
 *                                había quedado forzado en español por
 *                                una sesión de vendedor/admin previa en
 *                                la misma pestaña.
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { messages, DEFAULT_LOCALE, type Locale } from './dictionary';
import { getVendedorSession } from '@/lib/vendedorSession';
import { getStoredClientToken } from '@/hooks/useClientAuth';

const STORAGE_PREFIX = 'petravia_locale';

function esLocaleValida(v: string | null): v is Locale {
  return v === 'es' || v === 'en' || v === 'pt' || v === 'ja' || v === 'zh' || v === 'it';
}

/** Llave de localStorage para la preferencia de idioma de un cliente
 * en particular (identificado por su token). Sin token, se usa una
 * llave genérica de respaldo (no debería ocurrir en la práctica, ya
 * que solo los clientes pueden cambiar el idioma). */
function llaveLocale(token: string | null): string {
  return token ? `${STORAGE_PREFIX}:${token}` : STORAGE_PREFIX;
}

function localeInicial(): Locale {
  // El panel de vendedor/admin SIEMPRE se ve en español, sin importar
  // qué idioma haya elegido cualquier cliente en este mismo navegador.
  if (getVendedorSession()) return DEFAULT_LOCALE;
  try {
    const guardada = localStorage.getItem(llaveLocale(getStoredClientToken()));
    if (esLocaleValida(guardada)) return guardada;
  } catch {
    // localStorage no disponible (ej. modo privado) — seguimos con el default
  }
  return DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  forzarEspanol: () => void;
  restaurarLocaleCliente: () => void;
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
    try { localStorage.setItem(llaveLocale(getStoredClientToken()), l); } catch { /* ignorar si no hay storage */ }
  }, []);

  const forzarEspanol = useCallback(() => {
    setLocaleState(DEFAULT_LOCALE);
  }, []);

  const restaurarLocaleCliente = useCallback(() => {
    setLocaleState(localeInicial());
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

  const value = useMemo(
    () => ({ locale, setLocale, forzarEspanol, restaurarLocaleCliente, t, tCount }),
    [locale, setLocale, forzarEspanol, restaurarLocaleCliente, t, tCount]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook principal — expone { locale, setLocale, forzarEspanol, restaurarLocaleCliente, t, tCount }. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}

/** Atajo para cuando solo se necesita la función de traducción. */
export function useT() {
  return useI18n().t;
}
