import { SlidersHorizontal, X, ChevronDown, Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useCatalogoStore } from '@/store/catalogoStore';
import { getVendedorSession } from '@/lib/vendedorSession';
import { useT } from '@/i18n/I18nContext';
import MisApartados from './MisApartados';
import BuscadorAvanzado from './BuscadorAvanzado';
import type { Acabado } from '@petravia/shared';
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

// ─── Dropdown ────────────────────────────────────────────────

function Dropdown({ label, activo, children }: { label: string; activo: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 transition-colors"
        style={{
          border: `1px solid ${activo ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: '2px',
          background: activo ? 'var(--gold)' : 'transparent',
          color: activo ? 'white' : 'var(--muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] py-1"
          style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '2px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Chip ────────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1"
      style={{ background: 'var(--white)', color: 'var(--gold-dark)', border: '1px solid var(--gold)', borderRadius: '2px', fontWeight: 500 }}>
      {label}
      <button onClick={onRemove} style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center' }}><X size={9} /></button>
    </span>
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
  const hayFiltros = filtros.grupos.length > 0 || filtros.acabados.length > 0 || filtros.estado !== 'todos'
    || (esAdmin && filtros.tipo !== 'todos');

  const estadoLabel = filtros.estado !== 'todos'
    ? t(ESTADOS.find(e => e.value === filtros.estado)?.key ?? 'filtros.estado')
    : t('filtros.estado');

  return (
    <div className="mb-6">
      {/* Fila de filtros */}
      <div className="flex items-center justify-between gap-2 flex-wrap">

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs tracking-[0.12em] uppercase mr-1" style={{ color: 'var(--muted)' }}>
            <SlidersHorizontal size={11} strokeWidth={1.5} /> {t('filtros.filtrar')}
          </span>

          <Dropdown label={estadoLabel} activo={filtros.estado !== 'todos'}>
            {ESTADOS.map(({ value, key }) => (
              <button key={value} onClick={() => setEstado(value)}
                className="w-full text-left text-xs px-3 py-2 transition-colors"
                style={{ color: filtros.estado === value ? 'var(--ink)' : 'var(--muted)', background: filtros.estado === value ? 'var(--sand)' : 'transparent', fontWeight: filtros.estado === value ? 500 : 400 }}>
                {t(key)}
              </button>
            ))}
          </Dropdown>

          {esAdmin && (
            <Dropdown
              label={filtros.tipo !== 'todos' ? t(TIPOS.find(x => x.value === filtros.tipo)?.key ?? 'filtros.todos') : 'Tipo'}
              activo={filtros.tipo !== 'todos'}
            >
              {TIPOS.map(({ value, key }) => (
                <button key={value} onClick={() => setTipo(value)}
                  className="w-full text-left text-xs px-3 py-2 transition-colors"
                  style={{ color: filtros.tipo === value ? 'var(--ink)' : 'var(--muted)', background: filtros.tipo === value ? 'var(--sand)' : 'transparent', fontWeight: filtros.tipo === value ? 500 : 400 }}>
                  {t(key)}
                </button>
              ))}
            </Dropdown>
          )}

          <Dropdown label={filtros.acabados.length > 0 ? t('filtros.acabadoConteo', { n: filtros.acabados.length }) : t('filtros.acabado')} activo={filtros.acabados.length > 0}>
            {ACABADOS.map(a => (
              <button key={a} onClick={() => toggleAcabado(a)}
                className="w-full text-left text-xs px-3 py-2 flex items-center gap-2 transition-colors"
                style={{ color: filtros.acabados.includes(a) ? 'var(--ink)' : 'var(--muted)', background: filtros.acabados.includes(a) ? 'var(--sand)' : 'transparent' }}>
                <span className="w-3 h-3 shrink-0 flex items-center justify-center"
                  style={{ border: `1px solid ${filtros.acabados.includes(a) ? 'var(--gold)' : 'var(--border)'}`, background: filtros.acabados.includes(a) ? 'var(--gold)' : 'transparent', borderRadius: '1px' }}>
                  {filtros.acabados.includes(a) && <X size={8} style={{ color: 'white' }} />}
                </span>
                {t(`acabado.${a}`)}
              </button>
            ))}
          </Dropdown>

          {hayFiltros && (
            <button onClick={resetFiltros} className="text-xs px-2 py-1.5 transition-colors" style={{ color: 'var(--muted)' }}>
              {t('filtros.limpiar')}
            </button>
          )}
        </div>

        {/* Búsqueda avanzada por metraje — solo clientes, abre en pestaña emergente */}
        {client && (
          <button
            onClick={() => setBusquedaAbierta(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 uppercase tracking-wider transition-colors"
            style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--muted)', background: 'transparent', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Search size={11} strokeWidth={1.75} />
            {t('filtros.busquedaAvanzada')}
          </button>
        )}
      </div>

      {/* Chips activos */}
      {hayFiltros && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {filtros.estado !== 'todos' && (
            <Chip label={t(ESTADOS.find(e => e.value === filtros.estado)?.key ?? 'filtros.estado')} onRemove={() => setEstado('todos')} />
          )}
          {esAdmin && filtros.tipo !== 'todos' && (
            <Chip label={t(TIPOS.find(x => x.value === filtros.tipo)?.key ?? 'filtros.todos')} onRemove={() => setTipo('todos')} />
          )}
          {filtros.grupos.map(g => <Chip key={g} label={g} onRemove={() => toggleGrupo(g)} />)}
          {filtros.acabados.map(a => <Chip key={a} label={t(`acabado.${a}`)} onRemove={() => toggleAcabado(a)} />)}
        </div>
      )}

      {/* Mis Apartados y Búsqueda avanzada — pestañas emergentes, no ocupan espacio en el flujo */}
      {client && (
        <>
          <MisApartados client={client} isOpen={panelCliente === 'apartados'} onClose={() => setPanelCliente(null)} />
          <BuscadorAvanzado isOpen={busquedaAbierta} onClose={() => setBusquedaAbierta(false)} />
        </>
      )}
    </div>
  );
}