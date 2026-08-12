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

/**
 * Obtiene cliente desde sessionStorage (más seguro que localStorage para tokens).
 */
export function useCurrentClient(): ClientData | null {
  const stored = sessionStorage.getItem('petravia_client');
  return stored ? (JSON.parse(stored) as ClientData) : null;
}

/**
 * Guarda cliente en sessionStorage.
 */
export function useSaveClient() {
  return (client: ClientData) => {
    sessionStorage.setItem('petravia_client', JSON.stringify(client));
  };
}

/**
 * Logout de cliente.
 */
export function useClientLogout() {
  return () => {
    sessionStorage.removeItem('petravia_client');
  };
}
