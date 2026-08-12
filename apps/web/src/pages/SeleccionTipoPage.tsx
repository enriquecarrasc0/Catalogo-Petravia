/**
 * SeleccionTipoPage.tsx
 * ───────────────────────
 * Primera pantalla que ve el cliente al ingresar: elige si quiere
 * ver Bloques o Láminas. Esa elección se guarda en el store global
 * (catalogoStore.filtros.tipo) y de ahí navega a /catalogo, donde
 * el listado ya viene filtrado por ese tipo.
 */
import { useNavigate } from 'react-router-dom';
import { useCatalogoStore } from '@/store/catalogoStore';
import { useT } from '@/i18n/I18nContext';
import type { TipoLote } from '@petravia/shared';

interface OpcionProps {
  tipo: TipoLote;
  titulo: string;
  descripcion: string;
  onClick: () => void;
}

function Opcion({ tipo, titulo, descripcion, onClick }: OpcionProps) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className="group relative flex-1 flex flex-col items-center justify-center text-center px-8 py-20 transition-all duration-300"
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        minHeight: '320px',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--gold)';
        e.currentTarget.style.background = 'var(--sand)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--white)';
      }}
    >
      {/* Ícono representativo, dibujado en SVG para mantener la estética minimal */}
      <div className="mb-8 transition-transform duration-300 group-hover:-translate-y-1">
        {tipo === 'bloque' ? (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path d="M14 22 L32 12 L50 22 L50 44 L32 54 L14 44 Z" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <path d="M14 22 L32 32 L50 22" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <path d="M32 32 L32 54" stroke="var(--gold-dark)" strokeWidth="1.2" />
          </svg>
        ) : tipo === 'lamina' ? (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="9" y="14" width="40" height="26" rx="1" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <rect x="15" y="24" width="40" height="26" rx="1" stroke="var(--gold-dark)" strokeWidth="1.2" fill="var(--white)" />
          </svg>
        ) : (
          // Formato: cuadrícula de piezas ya cortadas a medida (a diferencia
          // de la lámina bruta, sin cortar), para distinguirlo visualmente.
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8"  y="10" width="17" height="17" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <rect x="28" y="10" width="17" height="17" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <rect x="8"  y="30" width="17" height="17" stroke="var(--gold-dark)" strokeWidth="1.2" />
            <rect x="28" y="30" width="17" height="17" stroke="var(--gold-dark)" strokeWidth="1.2" />
          </svg>
        )}
      </div>

      <p
        className="text-xs tracking-[0.25em] uppercase mb-3"
        style={{ color: 'var(--gold-dark)' }}
      >
        Petravia
      </p>

      <h2
        className="font-display font-light mb-3"
        style={{ fontSize: '2rem', color: 'var(--ink)', letterSpacing: '-0.01em' }}
      >
        {titulo}
      </h2>

      <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>
        {descripcion}
      </p>

      <span
        className="mt-8 text-xs tracking-[0.15em] uppercase pb-1 transition-colors"
        style={{ color: 'var(--gold-dark)', borderBottom: '1px solid var(--gold)' }}
      >
        {t('seleccion.viewCatalog')}
      </span>
    </button>
  );
}

export default function SeleccionTipoPage() {
  const navigate = useNavigate();
  const t = useT();
  const setTipo = useCatalogoStore((s) => s.setTipo);
  const setEstado = useCatalogoStore((s) => s.setEstado);

  function elegir(tipo: TipoLote) {
    setTipo(tipo);
    setEstado('disponible');
    navigate('/catalogo');
  }

  return (
    <div className="min-h-[calc(100vh-64px-89px)] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <p
            className="text-xs tracking-[0.25em] uppercase mb-3"
            style={{ color: 'var(--gold-dark)' }}
          >
            {t('seleccion.eyebrow')}
          </p>
          <h1
            className="font-display font-light"
            style={{ fontSize: '2.4rem', color: 'var(--ink)', lineHeight: 1.2 }}
          >
            {t('seleccion.title')}
          </h1>
          <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>
            {t('seleccion.subtitle')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Opcion
            tipo="bloque"
            titulo={t('seleccion.bloqueTitle')}
            descripcion={t('seleccion.bloqueDesc')}
            onClick={() => elegir('bloque')}
          />
          <Opcion
            tipo="lamina"
            titulo={t('seleccion.laminaTitle')}
            descripcion={t('seleccion.laminaDesc')}
            onClick={() => elegir('lamina')}
          />
          <Opcion
            tipo="formato"
            titulo={t('seleccion.formatoTitle')}
            descripcion={t('seleccion.formatoDesc')}
            onClick={() => elegir('formato')}
          />
        </div>
      </div>
    </div>
  );
}
