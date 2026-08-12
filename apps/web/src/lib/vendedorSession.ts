/**
 * apps/web/src/lib/vendedorSession.ts
 * ──────────────────────────────────────
 * Sesión de vendedor guardada en sessionStorage. Reemplaza el antiguo
 * flag fijo de "admin" — ahora cada vendedor tiene su propio token de
 * sesión (obtenido en /api/auth/vendedor/login) y solo ve sus propios
 * clientes, tokens y apartados.
 */
export const VENDEDOR_SESSION_KEY = 'petravia_vendedor';

export interface VendedorSession {
  token: string;
  vendedorId: string;
  usuario: string;
  nombre: string;
  esAdmin: boolean;
}

export function getVendedorSession(): VendedorSession | null {
  const raw = sessionStorage.getItem(VENDEDOR_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VendedorSession;
  } catch {
    return null;
  }
}

export function setVendedorSession(session: VendedorSession) {
  sessionStorage.setItem(VENDEDOR_SESSION_KEY, JSON.stringify(session));
}

export function clearVendedorSession() {
  sessionStorage.removeItem(VENDEDOR_SESSION_KEY);
}
