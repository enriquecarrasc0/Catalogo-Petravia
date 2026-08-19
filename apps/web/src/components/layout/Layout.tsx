import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { clearVendedorSession, getVendedorSession } from '@/lib/vendedorSession';
import { useCurrentClient, useClientLogout } from '@/hooks/useClientAuth';
import { useT } from '@/i18n/I18nContext';
import LanguageSwitcher from './LanguageSwitcher';
import OnboardingTour from '@/components/onboarding/OnboardingTour';

/** Llave de localStorage para recordar que ESTE cliente (por su token)
 * ya vio el recorrido de bienvenida, para no repetírselo en su
 * próxima visita ni imponérselo a otro cliente que use el mismo
 * dispositivo (mismo criterio que la preferencia de idioma). */
function llaveOnboardingVisto(token: string): string {
  return `petravia_onboarding_visto:${token}`;
}

export default function Layout() {
  const navigate     = useNavigate();
  const cliente      = useCurrentClient();
  const logout       = useClientLogout();
  const esVendedor   = Boolean(getVendedorSession());
  const t            = useT();

  const [mostrarOnboarding, setMostrarOnboarding] = useState(() => {
    if (!cliente) return false;
    try { return localStorage.getItem(llaveOnboardingVisto(cliente.token)) !== '1'; }
    catch { return false; }
  });

  function cerrarOnboarding() {
    setMostrarOnboarding(false);
    if (cliente) {
      try { localStorage.setItem(llaveOnboardingVisto(cliente.token), '1'); } catch { /* ignorar */ }
    }
  }

  function handleLogout() {
    if (esVendedor) {
      clearVendedorSession();
    } else {
      logout();
    }
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col app-background">
      {mostrarOnboarding && <OnboardingTour onClose={cerrarOnboarding} />}

      <header
        className="sticky top-0 z-40 backdrop-blur-sm"
        style={{ background: 'rgba(255,255,255,0.9)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-24 flex items-center justify-between">
          <Link to={cliente ? '/seleccion' : '/catalogo'} className="flex flex-col items-center gap-1.5">
            <img src="/brand/isotipo-beige.png" alt="" className="h-11 w-auto" />
            <span
              className="font-display uppercase leading-none"
              style={{ fontSize: '13px', letterSpacing: '0.38em', color: 'var(--beige-dark)', paddingLeft: '0.38em' }}
            >
              Petravia
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {esVendedor && (
              <Link to="/vendedor"
                className="flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-dark)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <LayoutDashboard size={14} />
                {t('layout.sellerPanel')}
              </Link>
            )}
            {/* Selector de idioma — solo para clientes */}
            {cliente && <LanguageSwitcher />}
            {(esVendedor || cliente) && (
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-dark)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <LogOut size={14} />
                {t('layout.signOut')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="py-8 text-center text-sm" style={{ background: 'var(--gold-dark)', color: 'var(--beige)' }}>
        {t('layout.footer', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}