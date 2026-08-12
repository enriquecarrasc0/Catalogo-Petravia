/**
 * apps/web/src/pages/AdminPage.tsx
 * ─────────────────────────────────
 * Si el admin ya autenticó en LoginPage (sessionStorage), entra directo.
 * Si accede a /admin sin sesión, lo manda a /login.
 */
import { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import AdminPanel from '@/components/admin/AdminPanel';
import { ADMIN_SESSION_KEY } from './LoginPage';

export default function AdminPage() {
  const navigate    = useNavigate();
  const esAdmin     = sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';

  // Si no tiene sesión, redirigir a login
  if (!esAdmin) return <Navigate to="/login" replace />;

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/brand/isotipo-beige.png" alt="" className="h-7 w-auto" />
            <span
              className="font-display uppercase leading-none"
              style={{ fontSize: '12px', letterSpacing: '0.3em', color: 'var(--beige-dark)' }}
            >
              Petravia
            </span>
          </div>
          <span className="text-stone-300">·</span>
          <span className="text-sm text-stone-500">Panel Admin</span>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-1.5 text-sm text-stone-600 hover:text-stone-900
                     border border-stone-200 rounded-md hover:border-stone-400 transition"
        >
          Cerrar sesión
        </button>
      </div>

      <AdminPanel />
    </div>
  );
}