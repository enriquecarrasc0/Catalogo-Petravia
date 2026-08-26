/**
 * apps/web/src/hooks/useVendedorLogout.ts
 * ──────────────────────────────────────────
 * Cierre de sesión de vendedor/admin, compartido entre AdminPanel y
 * VendedorPanel (ambos ahora dibujan su propio AppNavShell con el botón
 * de logout adentro, en vez de depender de un header separado en
 * VendedorPage.tsx).
 *
 * No espera la respuesta del servidor antes de limpiar la sesión local
 * y navegar — así se siente instantáneo sin importar qué tan lenta esté
 * la red (ver fix anterior en VendedorPage.tsx).
 */
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clearVendedorSession, getVendedorSession } from '@/lib/vendedorSession';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export function useVendedorLogout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return function logout() {
    const sesion = getVendedorSession();
    if (sesion) {
      fetch(`${BASE_URL}/auth/vendedor/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sesion.token}` },
      }).catch(() => { /* no importa si falla, la sesión local ya se limpió */ });
    }
    clearVendedorSession();
    // Evita que datos cacheados de este vendedor (clientes, apartados)
    // queden visibles si otro vendedor inicia sesión en la misma pestaña.
    qc.clear();
    navigate('/login');
  };
}
