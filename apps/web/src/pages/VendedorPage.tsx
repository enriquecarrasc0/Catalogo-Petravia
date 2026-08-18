/**
 * apps/web/src/pages/VendedorPage.tsx
 * ─────────────────────────────────────
 * Si el vendedor ya inició sesión (sessionStorage), entra directo.
 * Si accede a /vendedor sin sesión, lo manda a /login.
 */
import { useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import VendedorPanel from '@/components/vendedor/VendedorPanel';
import AdminPanel from '@/components/admin/AdminPanel';
import { getVendedorSession, clearVendedorSession } from '@/lib/vendedorSession';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function VendedorPage() {
  const navigate = useNavigate();
  const qc        = useQueryClient();
  const sesion    = getVendedorSession();

  // Si no tiene sesión, redirigir a login
  if (!sesion) return <Navigate to="/login" replace />;

  async function handleLogout() {
    try {
      await fetch(`${BASE_URL}/auth/vendedor/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sesion!.token}` },
      });
    } catch {
      // si falla la petición, igual cerramos la sesión localmente
    }
    clearVendedorSession();
    // Evita que datos cacheados de este vendedor (clientes, apartados)
    // queden visibles si otro vendedor inicia sesión en la misma pestaña.
    qc.clear();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/brand/isotipo-beige.png" alt="" className="h-7 w-auto" />
            <span
              className="font-display uppercase leading-none"
              style={{ fontSize: '12px', letterSpacing: '0.3em', color: 'var(--beige-dark)' }}
            >
              Petravia
            </span>
          </div>
          <span className="text-stone-300 hidden sm:inline">·</span>
          <span className="text-sm text-stone-500 truncate min-w-0">
            {sesion.esAdmin ? 'Panel Admin' : 'Panel Vendedor'} · {sesion.nombre}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="shrink-0 px-3 sm:px-4 py-1.5 text-sm text-stone-600 hover:text-stone-900
                     border border-stone-200 rounded-md hover:border-stone-400 transition"
        >
          Cerrar sesión
        </button>
      </div>

      {sesion.esAdmin ? <AdminPanel /> : <VendedorPanel />}
    </div>
  );
}