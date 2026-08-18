/**
 * PanelCliente.tsx — Mis Apartados + Historial + Búsqueda por Metraje
 * como botones compactos que despliegan un panel inline.
 */
import { useState } from 'react';
import { Package, Search, X, History } from 'lucide-react';
import MisApartados from './MisApartados';
import BuscadorAvanzado from './BuscadorAvanzado';
import HistorialCompras from './HistorialCompras';
import { useMisApartados } from '@/hooks/useApartar';
import { useT } from '@/i18n/I18nContext';
import type { ClientData } from '@/hooks/useClientAuth';

interface Props { client: ClientData; }

type Panel = 'apartados' | 'historial' | 'busqueda' | null;

export default function PanelCliente({ client }: Props) {
  const [abierto, setAbierto] = useState<Panel>(null);
  const { data: apartados = [] } = useMisApartados(client.token);
  const t = useT();

  function toggle(panel: Panel) {
    setAbierto(prev => prev === panel ? null : panel);
  }

  const btnStyle = (activo: boolean) => ({
    border: `1px solid ${activo ? 'var(--ink)' : 'var(--border)'}`,
    borderRadius: '2px',
    background: activo ? 'var(--ink)' : 'transparent',
    color: activo ? 'white' : 'var(--muted)',
  });

  const panelLabel: Record<NonNullable<Panel>, string> = {
    apartados: t('panelCliente.misApartados'),
    historial: t('panelCliente.historialCompleto'),
    busqueda:  t('panelCliente.busquedaMetraje'),
  };

  return (
    <div className="mb-6">
      {/* Fila de botones */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => toggle('apartados')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 transition-colors"
          style={btnStyle(abierto === 'apartados')}
        >
          <Package size={11} />
          {t('panelCliente.misApartados')}
          {apartados.length > 0 && (
            <span
              className="ml-0.5 px-1.5 rounded-full text-xs"
              style={{
                background: abierto === 'apartados' ? 'rgba(255,255,255,0.25)' : 'var(--ink)',
                color: 'white',
                fontSize: '10px',
                lineHeight: '1.4',
              }}
            >
              {apartados.length}
            </span>
          )}
        </button>

        <button
          onClick={() => toggle('historial')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 transition-colors"
          style={btnStyle(abierto === 'historial')}
        >
          <History size={11} />
          {t('panelCliente.historial')}
        </button>

        <button
          onClick={() => toggle('busqueda')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 transition-colors"
          style={btnStyle(abierto === 'busqueda')}
        >
          <Search size={11} />
          {t('panelCliente.busquedaMetraje')}
        </button>
      </div>

      {/* Panel desplegable */}
      {abierto && (
        <div
          className="mt-2"
          style={{
            border: '1px solid var(--border)',
            borderRadius: '2px',
            background: 'var(--white)',
          }}
        >
          {/* Header del panel */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-xs tracking-[0.12em] uppercase" style={{ color: 'var(--muted)' }}>
              {panelLabel[abierto]}
            </span>
            <button onClick={() => setAbierto(null)} style={{ color: 'var(--muted)', display: 'flex' }}>
              <X size={13} />
            </button>
          </div>

          {/* Contenido */}
          <div className="px-5 py-5">
            {abierto === 'apartados' && <MisApartados client={client} />}
            {abierto === 'historial'  && <HistorialCompras client={client} />}
            {abierto === 'busqueda'   && <BuscadorAvanzado />}
          </div>
        </div>
      )}
    </div>
  );
}
