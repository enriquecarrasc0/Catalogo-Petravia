import { SlidersHorizontal, X, Check, Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useCatalogoStore } from '@/store/catalogoStore';
import { getVendedorSession } from '@/lib/vendedorSession';
import { useT } from '@/i18n/I18nContext';
import MisApartados from './MisApartados';
import MisFavoritos from './MisFavoritos';
import BuscadorAvanzado from './BuscadorAvanzado';
import type { Acabado, FiltrosCatalogo } from '@petravia/shared';
import type { ClientData } from '@/hooks/useClientAuth';
import type { PanelCliente } from '@/pages/CatalogoPage';

const ACABADOS: Acabado[] = [
  'Mate', 'Brillado', 'Cepillado', 'Sandblast', 'Spazzolato', 'Veteado', 'Book Match',
];
const TIPOS = [
  { value: 'todos',   key: 'filtros.todos' },
  { value: 'bloque',  key: 'catalogo.tipoBloque' },
  { value: 'lamina',  key: 'catalogo.tipoLamina' },
  { value: 'formato', key: 'catalogo.tipoFormato' },
] as const;
const ESTADOS_CLIENTE = [
  { value: 'todos', key: 'filtros.todos' },
  { value: 'disponible', key: 'estado.disponible' },
] as const;
const ESTADOS_ADMIN = [
  { value: 'todos', key: 'filtros.todos' },
  { value: 'disponible', key: 'estado.disponible' },
  { value: 'apartado', key: 'estado.apartado' },
  { value: 'vendido', key: 'estado.vendido' },
] as const;

// ─── Pill de opción única (dentro del panel de filtros) ────────

function OpcionPill({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full transition-colors"
      style={{
        border: `1px solid ${activo ? 'var(--gold-dark)' : 'var(--border)'}`,
        background: activo ? 'var(--gold-dark)' : 'transparent',
        color: activo ? 'white' : 'var(--muted)',
        fontWeight: activo ? 500 : 400,
      }}
    >
      {label}
    </button>
  );
}

// ─── Chip (filtro activo, en la fila debajo de la barra) ───────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1"
      style={{ background: 'var(--white)', color: 'var(--gold-dark)', border: '1px solid var(--gold)', borderRadius: '2px', fontWeight: 500 }}>
      {label}
      <button onClick={onRemove} style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center' }}><X size={9} /></button>
    </span>
  );
}

// ─── Botón "Filtros" con panel desplegable (consolida Estado,
//      Tipo y Acabado en un solo lugar, en vez de tres dropdowns
//      siempre visibles) ──────────────────────────────────────

function FiltrosBoton({
  esAdmin, filtros, totalActivos, setEstado, setTipo, toggleAcabado, resetFiltros, t,
}: {
  esAdmin: boolean;
  filtros: FiltrosCatalogo;
  totalActivos: number;
  setEstado: (v: any) => void;
  setTipo: (v: any) => void;
  toggleAcabado: (a: Acabado) => void;
  resetFiltros: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ESTADOS = esAdmin ? ESTADOS_ADMIN : ESTADOS_CLIENTE;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs px-4 py-2 transition-colors"
        style={{
          borderRadius: '6px',
          border: `1px solid ${totalActivos > 0 ? 'var(--gold-dark)' : 'var(--border)'}`,
          background: totalActivos > 0 ? 'var(--gold-dark)' : 'var(--white)',
          color: totalActivos > 0 ? 'white' : 'var(--muted)',
          whiteSpace: 'nowrap',
        }}
      >
        <SlidersHorizontal size={13} strokeWidth={1.75} />
        {t('filtros.filtrar')}
        {totalActivos > 0 && (
          <span className="flex items-center justify-center rounded-full font-medium"
            style={{ width: '17px', height: '17px', fontSize: '10px', background: 'var(--beige)', color: 'var(--gold-dark)' }}>
            {totalActivos}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 w-[280px] max-w-[calc(100vw-2rem)] p-4"
          style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>

          {/* Estado — solo admin/vendedor. Los clientes SIEMPRE ven solo
              lotes disponibles (reforzado también del lado del servidor),
              así que mostrarles este control sería confuso/redundante. */}
          {esAdmin && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>{t('filtros.estado')}</p>
              <div className="flex flex-wrap gap-1.5">
                {ESTADOS.map(({ value, key }) => (
                  <OpcionPill key={value} label={t(key)} activo={filtros.estado === value} onClick={() => setEstado(value)} />
                ))}
              </div>
            </div>
          )}

          {esAdmin && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Tipo</p>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map(({ value, key }) => (
                  <OpcionPill key={value} label={t(key)} activo={filtros.tipo === value} onClick={() => setTipo(value)} />
                ))}
              </div>
            </div>
          )}

          {/* Acabado — no aplica a Bloques (son material en bruto, sin
              acabado superficial todavía). Solo tiene sentido para
              Láminas y Formato. */}
          {filtros.tipo !== 'bloque' && (
            <div className="mb-1">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>{t('filtros.acabado')}</p>
              <div className="flex flex-wrap gap-1.5">
                {ACABADOS.map(a => {
                  const activo = filtros.acabados.includes(a);
                  return (
                    <button key={a} onClick={() => toggleAcabado(a)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors"
                      style={{
                        border: `1px solid ${activo ? 'var(--gold-dark)' : 'var(--border)'}`,
                        background: activo ? 'var(--gold-dark)' : 'transparent',
                        color: activo ? 'white' : 'var(--muted)',
                      }}>
                      {activo && <Check size={11} />}
                      {t(`acabado.${a}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {totalActivos > 0 && (
            <button onClick={() => { resetFiltros(); setOpen(false); }}
              className="text-xs mt-4 pt-3 w-full text-left transition-colors"
              style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
              {t('filtros.limpiar')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Principal ───────────────────────────────────────────────

interface Props {
  client: ClientData | null;
  panelCliente: PanelCliente;
  setPanelCliente: (p: PanelCliente) => void;
}

export default function FiltrosPanel({ client, panelCliente, setPanelCliente }: Props) {
  const { filtros, toggleGrupo, toggleAcabado, setEstado, setTipo, resetFiltros } = useCatalogoStore();
  const esAdmin = Boolean(getVendedorSession());
  const t = useT();
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const ESTADOS = esAdmin ? ESTADOS_ADMIN : ESTADOS_CLIENTE;
  const hayFiltros = filtros.grupos.length > 0
    || (filtros.tipo !== 'bloque' && filtros.acabados.length > 0)
    || (esAdmin && filtros.estado !== 'todos')
    || (esAdmin && filtros.tipo !== 'todos');
  const totalActivos = filtros.grupos.length
    + (filtros.tipo !== 'bloque' ? filtros.acabados.length : 0)
    + (esAdmin && filtros.estado !== 'todos' ? 1 : 0)
    + (esAdmin && filtros.tipo !== 'todos' ? 1 : 0);

  // El admin siempre tiene al menos "Estado" para filtrar. El cliente,
  // en cambio, solo tiene Acabado — y ese no aplica a Bloques — así que
  // si está viendo Bloques no hay nada que filtrar: mejor ocultar el
  // botón por completo que abrir un panel vacío.
  const hayControlesDeFiltro = esAdmin || filtros.tipo !== 'bloque';

  return (
    <div className="mb-6">
      {/* Fila de filtros — un solo botón "Filtros" consolida Estado,
          Tipo (admin) y Acabado en un panel, en vez de tres dropdowns
          siempre visibles ocupando espacio. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {hayControlesDeFiltro && (
          <FiltrosBoton
            esAdmin={esAdmin}
            filtros={filtros}
            totalActivos={totalActivos}
            setEstado={setEstado}
            setTipo={setTipo}
            toggleAcabado={toggleAcabado}
            resetFiltros={resetFiltros}
            t={t}
          />
        )}

        {/* Búsqueda avanzada por metraje — solo clientes, abre en pestaña emergente */}
        {client && (
          <button
            onClick={() => setBusquedaAbierta(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 uppercase tracking-wider transition-colors"
            style={{ border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', background: 'transparent', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Search size={11} strokeWidth={1.75} />
            {t('filtros.busquedaAvanzada')}
          </button>
        )}
      </div>

      {/* Chips activos — siguen visibles debajo, para ver/quitar de un
          vistazo sin tener que reabrir el panel. */}
      {hayFiltros && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {esAdmin && filtros.estado !== 'todos' && (
            <Chip label={t(ESTADOS.find(e => e.value === filtros.estado)?.key ?? 'filtros.estado')} onRemove={() => setEstado('todos')} />
          )}
          {esAdmin && filtros.tipo !== 'todos' && (
            <Chip label={t(TIPOS.find(x => x.value === filtros.tipo)?.key ?? 'filtros.todos')} onRemove={() => setTipo('todos')} />
          )}
          {filtros.grupos.map(g => <Chip key={g} label={g} onRemove={() => toggleGrupo(g)} />)}
          {filtros.tipo !== 'bloque' && filtros.acabados.map(a => <Chip key={a} label={t(`acabado.${a}`)} onRemove={() => toggleAcabado(a)} />)}
        </div>
      )}

      {/* Mis Apartados, Favoritos y Búsqueda avanzada — pestañas emergentes, no ocupan espacio en el flujo */}
      {client && (
        <>
          <MisApartados client={client} isOpen={panelCliente === 'apartados'} onClose={() => setPanelCliente(null)} />
          <MisFavoritos client={client} isOpen={panelCliente === 'favoritos'} onClose={() => setPanelCliente(null)} />
          <BuscadorAvanzado isOpen={busquedaAbierta} onClose={() => setBusquedaAbierta(false)} />
        </>
      )}
    </div>
  );
}
