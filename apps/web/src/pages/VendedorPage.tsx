/**
 * apps/web/src/pages/VendedorPage.tsx
 * ─────────────────────────────────────
 * Si el vendedor ya inició sesión (sessionStorage), entra directo.
 * Si accede a /vendedor sin sesión, lo manda a /login.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import VendedorPanel from '@/components/vendedor/VendedorPanel';
import AdminPanel from '@/components/admin/AdminPanel';
import { getVendedorSession, clearVendedorSession } from '@/lib/vendedorSession';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function VendedorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc        = useQueryClient();
  const sesion    = getVendedorSession();

  // Si venimos justo de iniciar sesión (LoginPage nos manda el nombre
  // por location.state), mostramos un mensaje de bienvenida breve que
  // se desvanece solo.
  const [bienvenida, setBienvenida] = useState<string | null>(
    (location.state as { bienvenida?: string } | null)?.bienvenida ?? null
  );

  useEffect(() => {
    if (!bienvenida) return;
    // Limpia el state de la ruta para que un refresh (F5) no lo vuelva
    // a mostrar.
    window.history.replaceState({}, '');
    const timer = setTimeout(() => setBienvenida(null), 3200);
    return () => clearTimeout(timer);
  }, [bienvenida]);

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
      {bienvenida && <BienvenidaToast nombre={bienvenida} />}

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

/** Mensaje breve de bienvenida al entrar como vendedor/admin — se
 * desvanece solo, sin necesidad de que la persona lo cierre. */
function BienvenidaToast({ nombre }: { nombre: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Arranca invisible y un frame después pasa a visible, para que la
    // transición de entrada realmente se vea (si empezara ya visible,
    // no habría nada que animar).
    const entrar = requestAnimationFrame(() => setVisible(true));
    const salir  = setTimeout(() => setVisible(false), 2500);
    return () => { cancelAnimationFrame(entrar); clearTimeout(salir); };
  }, []);

  return (
    <div
      className={`fixed top-5 left-1/2 -translate-x-1/2 z-[60] transition-all duration-500
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
    >
      <div className="flex items-center gap-2.5 bg-stone-900 text-white pl-4 pr-5 py-3 rounded-full shadow-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <p className="text-sm font-medium whitespace-nowrap">Bienvenido, {nombre}</p>
      </div>
    </div>
  );
}