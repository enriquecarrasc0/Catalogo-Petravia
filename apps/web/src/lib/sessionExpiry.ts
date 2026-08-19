/**
 * apps/web/src/lib/sessionExpiry.ts
 * ──────────────────────────────────
 * Detecta, en un solo lugar, cuando el backend responde que la sesión
 * (de vendedor/admin, o el token de un cliente) ya no es válida —
 * expiró, o el servidor se reinició y perdió las sesiones en memoria —
 * y saca a la persona a la pantalla de login en vez de dejar ese error
 * suelto dentro de una tarjeta de la pantalla (ej. "Sesión de vendedor
 * inválida o expirada" en medio de la pestaña de Vendedores).
 *
 * Se conecta una sola vez, de forma global, a través de QueryCache /
 * MutationCache en main.tsx — así cubre TODAS las llamadas que pasan
 * por react-query (que son la totalidad de las del proyecto), sin
 * tener que tocar cada fetch uno por uno.
 */
import { clearVendedorSession } from './vendedorSession';
import { clearStoredClient } from '@/hooks/useClientAuth';

/** Mensajes exactos que devuelven los middlewares de auth del backend
 * (ver apps/api/src/middleware/authClient.ts) cuando la sesión/token ya
 * no es válido. Se comparan tal cual, sin adivinar variaciones. */
export const MENSAJE_SESION_VENDEDOR = 'Sesión de vendedor inválida o expirada';
export const MENSAJE_TOKEN_CLIENTE   = 'Token inválido o expirado';

export function esErrorDeSesion(mensaje: string): boolean {
  return mensaje === MENSAJE_SESION_VENDEDOR || mensaje === MENSAJE_TOKEN_CLIENTE;
}

let yaRedirigiendo = false;

function irALogin() {
  // Evita redirigir más de una vez si varias peticiones fallan a la vez
  // (ej. 3 queries en paralelo reciben 401 al mismo tiempo), y no hace
  // nada si ya estamos en /login.
  if (yaRedirigiendo || window.location.pathname === '/login') return;
  yaRedirigiendo = true;
  window.location.href = '/login?expirada=1';
}

/**
 * Revisa un error de react-query (query o mutation). Si es por sesión
 * de vendedor/admin o token de cliente inválido/expirado, limpia esa
 * sesión y redirige a /login con un aviso. No hace nada si el error es
 * de otro tipo (ej. de red, o de validación de un formulario).
 */
export function manejarErrorDeSesion(error: unknown): void {
  const mensaje = error instanceof Error ? error.message : String(error);
  if (!esErrorDeSesion(mensaje)) return;

  if (mensaje === MENSAJE_SESION_VENDEDOR) clearVendedorSession();
  if (mensaje === MENSAJE_TOKEN_CLIENTE) clearStoredClient();

  irALogin();
}
