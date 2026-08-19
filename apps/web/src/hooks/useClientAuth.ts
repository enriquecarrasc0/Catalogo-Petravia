/**
 * apps/web/src/hooks/useClientAuth.ts
 * ──────────────────────────────────
 * Autenticación de clientes con tokens.
 * FIX: valida contra el backend, no localmente.
 */
import { useMutation } from '@tanstack/react-query';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface ClientData {
  token: string;
  email: string;
  nombre?: string;
}

/**
 * Hook para login de cliente con token.
 * Llama al backend POST /api/auth/login
 */
export function useClientLogin() {
  return useMutation({
    mutationFn: async (token: string): Promise<ClientData> => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Token inválido o expirado');
      }

      return {
        token: json.token,
        email: json.email,
        nombre: json.nombre,
      };
    },
  });
}

const CLIENT_STORAGE_KEY = 'petravia_client';

function leerClienteAlmacenado(): ClientData | null {
  const stored = sessionStorage.getItem(CLIENT_STORAGE_KEY);
  return stored ? (JSON.parse(stored) as ClientData) : null;
}

/**
 * Obtiene cliente desde sessionStorage (más seguro que localStorage para tokens).
 */
export function useCurrentClient(): ClientData | null {
  return leerClienteAlmacenado();
}

/**
 * Solo el token del cliente actual (si hay uno), sin el resto de sus
 * datos. Se usa fuera de React (ej. en I18nContext) para que la
 * preferencia de idioma se guarde por-cliente y no se comparta entre
 * distintos clientes que usen el mismo navegador/dispositivo.
 */
export function getStoredClientToken(): string | null {
  return leerClienteAlmacenado()?.token ?? null;
}

/**
 * Guarda cliente en sessionStorage.
 */
export function useSaveClient() {
  return (client: ClientData) => {
    sessionStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(client));
  };
}

/**
 * Logout de cliente.
 */
export function useClientLogout() {
  return () => {
    sessionStorage.removeItem(CLIENT_STORAGE_KEY);
  };
}

/**
 * Igual que useClientLogout() pero sin ser un hook — se usa fuera de
 * React (ej. en el manejador global de sesión expirada en main.tsx).
 */
export function clearStoredClient() {
  sessionStorage.removeItem(CLIENT_STORAGE_KEY);
}
