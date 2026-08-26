/**
 * apps/web/src/pages/VendedorPage.tsx
 * ─────────────────────────────────────
 * Si el vendedor ya inició sesión (sessionStorage), entra directo.
 * Si accede a /vendedor sin sesión, lo manda a /login.
 *
 * El header y la navegación (logo, nombre, "Cerrar sesión", pestañas)
 * ya no viven aquí — cada panel (AdminPanel/VendedorPanel) dibuja su
 * propio AppNavShell, que es dueño de todo ese "chrome".
 */
import { useEffect, useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import VendedorPanel from '@/components/vendedor/VendedorPanel';
import AdminPanel from '@/components/admin/AdminPanel';
import { getVendedorSession } from '@/lib/vendedorSession';

export default function VendedorPage() {
  const location = useLocation();
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

  return (
    <>
      {bienvenida && <BienvenidaToast nombre={bienvenida} />}
      {sesion.esAdmin ? <AdminPanel /> : <VendedorPanel />}
    </>
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