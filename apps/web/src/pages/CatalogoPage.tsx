import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Search, LayoutGrid, Gem, ChevronLeft, Package, X, PackageCheck, Loader2 } from 'lucide-react';
import { useLotes } from '@/hooks/useLotes';
import { useCatalogoStore } from '@/store/catalogoStore';
import LoteCardShowcase from '@/components/catalog/LoteCardShowcase';
import FiltrosPanel from '@/components/catalog/FiltrosPanel';
import MaterialesGaleria from '@/components/catalog/MaterialesGaleria';
import { useCurrentClient } from '@/hooks/useClientAuth';
import { useMisApartados, useApartar } from '@/hooks/useApartar';
import { getVendedorSession } from '@/lib/vendedorSession';
import { useI18n } from '@/i18n/I18nContext';
import { formatM2, formatM3, type GrupoMaterial } from '@petravia/shared';
import { useQueryClient } from '@tanstack/react-query';

export type PanelCliente = 'apartados' | null;

// Orden fijo de materiales para las secciones agrupadas del catálogo.
const ORDEN_GRUPOS: GrupoMaterial[] = [
  'Puebla', 'Veracruz', 'Terracota', 'Caramel Ivory', 'Santo Tomas', 'Aqua Blue', 'Vintage', 'Otros',
];

interface Props {
  /**
   * Si se provee (ej. desde VendedorPanel), al hacer clic en un lote se
   * llama este callback en lugar de navegar a /catalogo/:id.
   */
  onLoteClick?: (loteId: string) => void;
}

export default function CatalogoPage({ onLoteClick }: Props) {
  const { t, tCount } = useI18n();
  const TITULOS: Record<string, string> = {
    bloque:  t('catalogo.tituloBloque'),
    lamina:  t('catalogo.tituloLamina'),
    formato: t('catalogo.tituloFormato'),
    todos:   t('catalogo.tituloTodos'),
  };
  const LABEL_TIPO: Record<'bloque' | 'lamina' | 'formato', string> = {
    bloque: t('catalogo.tipoBloque'), lamina: t('catalogo.tipoLamina'), formato: t('catalogo.tipoFormato'),
  };
  const [page, setPage] = useState(1);
  const [vista, setVista] = useState<'catalogo' | 'material'>('catalogo');
  const [panelCliente, setPanelCliente] = useState<PanelCliente>(null);
  const { filtros, setBusqueda, setTipo, setFiltro } = useCatalogoStore();

  // Petición de negocio: para Bloques ya no se organiza por material — es
  // un catálogo general, plano, sin secciones ni galería "Por Material".
  // Se ignora el estado `vista` cuando el tipo es bloque (por si el
  // cliente lo dejó en "Por Material" al cambiar de Láminas a Bloques).
  const esBloque = filtros.tipo === 'bloque';
  const vistaEfectiva = esBloque ? 'catalogo' : vista;

  // En la vista "Catálogo" agrupamos por material sin importar los filtros
  // activos, así que traemos todo el resultado de una sola vez (el volumen
  // de lotes es manejable) en lugar de paginar de 24 en 24. Bloques nunca
  // agrupa por material (ver nota arriba), así que siempre pagina normal.
  const agruparPorMaterial = !esBloque && vistaEfectiva === 'catalogo';
  const { data, isLoading, isFetching } = useLotes(page, agruparPorMaterial ? 1000 : 24);

  const client = useCurrentClient();
  const { data: apartados = [] } = useMisApartados(client?.token ?? null);
  const esAdmin = Boolean(getVendedorSession());

  const togglePanel = (p: PanelCliente) => setPanelCliente(prev => prev === p ? null : p);

  // ─── Selección múltiple → apartar varios lotes de un jalón ───
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [apartando, setApartando] = useState(false);
  const apartarMutation = useApartar();
  const queryClient = useQueryClient();

  const puedeSeleccionar = Boolean(client) && !onLoteClick;

  const toggleSeleccion = (loteId: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(loteId) ? next.delete(loteId) : next.add(loteId);
      return next;
    });
  };

  const limpiarSeleccion = () => setSeleccionados(new Set());

  // m² (láminas) y m³ (bloques) sumados de los lotes seleccionados, para
  // mostrarlos junto al contador en la barra flotante. Se separan las
  // unidades igual que en los totales por grupo, para no mezclarlas.
  const { m2Seleccionados, m3Seleccionados } = useMemo(() => {
    if (seleccionados.size === 0 || !data?.items.length) {
      return { m2Seleccionados: 0, m3Seleccionados: 0 };
    }
    let m2 = 0;
    let m3 = 0;
    for (const lote of data.items) {
      if (!seleccionados.has(lote.id)) continue;
      if (lote.tipo === 'bloque') m3 += lote.saldoM3 || 0;
      else m2 += lote.saldoM2 || 0;
    }
    return { m2Seleccionados: m2, m3Seleccionados: m3 };
  }, [seleccionados, data]);

  const apartarSeleccionados = async () => {
    if (!client || seleccionados.size === 0) return;
    setApartando(true);
    const ids = Array.from(seleccionados);
    const resultados = await Promise.allSettled(
      ids.map(id => apartarMutation.mutateAsync({ loteId: id, clienteToken: client.token }))
    );
    const fallidos = resultados.filter(r => r.status === 'rejected').length;
    setApartando(false);
    limpiarSeleccion();
    queryClient.invalidateQueries({ queryKey: ['lotes'] });
    queryClient.invalidateQueries({ queryKey: ['mis-apartados'] });
    if (fallidos > 0) {
      alert(t('catalogo.alertApartados', { ok: ids.length - fallidos, total: ids.length, fallidos }));
    }
  };

  // ─── Agrupado por material (grupo → lotes, en el orden fijo del catálogo) ───
  const grupos = useMemo(() => {
    if (!agruparPorMaterial || !data?.items.length) return [];
    const mapa = new Map<string, typeof data.items>();
    for (const lote of data.items) {
      const lista = mapa.get(lote.grupo) ?? [];
      lista.push(lote);
      mapa.set(lote.grupo, lista);
    }
    const ordenados = [...mapa.keys()].sort((a, b) => {
      const ia = ORDEN_GRUPOS.indexOf(a as GrupoMaterial);
      const ib = ORDEN_GRUPOS.indexOf(b as GrupoMaterial);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return ordenados.map(grupo => {
      const items = mapa.get(grupo)!;
      // m² solo suma láminas, m³ solo suma bloques — evita mezclar unidades
      // distintas en un mismo total (importante en la vista admin "todos").
      const m2 = items.reduce((sum, l) => sum + (l.tipo !== 'bloque' ? (l.saldoM2 || 0) : 0), 0);
      const m3 = items.reduce((sum, l) => sum + (l.tipo === 'bloque' ? (l.saldoM3 || 0) : 0), 0);
      return { grupo, items, m2, m3 };
    });
  }, [agruparPorMaterial, data]);

  // El catálogo es usado tanto por el cliente (vía /catalogo, debe haber
  // elegido bloque/lámina antes en /seleccion) como por el admin embebido
  // en su panel (onLoteClick presente → no forzamos la división de tipo).
  if (!esAdmin && !onLoteClick && filtros.tipo === 'todos') {
    return <Navigate to="/seleccion" replace />;
  }

  return (
    <div className="max-w-[1680px] mx-auto px-6 lg:px-10 py-10">
      {/* Hero del catálogo */}
      <div className="mb-10 pb-8" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p
              className="text-xs tracking-[0.25em] uppercase mb-2"
              style={{ color: 'var(--gold-dark)' }}
            >
              {t('catalogo.eyebrow')}
            </p>
            <h1
              className="font-display font-light"
              style={{ fontSize: '2.6rem', color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.01em' }}
            >
              {TITULOS[filtros.tipo] ?? TITULOS.todos}
            </h1>
            {data && (
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                {t('catalogo.totalLotes', { n: data.total })}
              </p>
            )}
          </div>

          {/* Acciones del cliente — Mis Apartados */}
          {client && (
            <div
              className="flex items-center gap-1 p-1 shrink-0"
              style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '999px' }}
            >
              <button onClick={() => togglePanel('apartados')}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 uppercase tracking-wider transition-all duration-200"
                style={{
                  borderRadius: '999px',
                  background: panelCliente === 'apartados' ? 'var(--gold)' : 'transparent',
                  color: panelCliente === 'apartados' ? 'white' : 'var(--muted)',
                }}
              >
                <Package size={12} strokeWidth={1.75} />
                {t('catalogo.misApartados')}
                {apartados.length > 0 && (
                  <span className="ml-0.5 px-1.5 rounded-full"
                    style={{ background: panelCliente === 'apartados' ? 'rgba(255,255,255,0.3)' : 'var(--gold)', color: 'white', fontSize: '10px', lineHeight: '1.4' }}>
                    {apartados.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex items-center gap-3 mb-8">
        <div className="relative" style={{ maxWidth: '320px', flex: 1 }}>
          <Search
            size={13}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted)' }}
          />
          <input
            type="text"
            placeholder={t('catalogo.buscarPlaceholder')}
            value={filtros.busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm outline-none transition-all"
            style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: '2px',
              color: 'var(--ink)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--gold)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>
        {/* Switcher Catálogo / Por Material — Bloques no aplica: es un
            catálogo general, sin agrupar por material (petición de negocio). */}
        {!esBloque && (
          <div
            className="flex items-center gap-1 p-1 shrink-0"
            style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '2px' }}
          >
            {([
              { v: 'catalogo' as const, label: t('catalogo.vistaCatalogo'), Icon: LayoutGrid },
              { v: 'material'  as const, label: t('catalogo.vistaPorMaterial'), Icon: Gem },
            ]).map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs tracking-wider uppercase transition-colors"
                style={{
                  borderRadius: '2px',
                  background: vista === v ? 'var(--gold)' : 'transparent',
                  color: vista === v ? 'white' : 'var(--muted)',
                }}
              >
              <Icon size={12} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
        )}

        {/* Switcher Bloques / Láminas / Formato — solo para clientes (no admin embebido) */}
        {!onLoteClick && (filtros.tipo === 'bloque' || filtros.tipo === 'lamina' || filtros.tipo === 'formato') && (
          <div
            className="flex items-center gap-1 p-1 shrink-0"
            style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '2px' }}
          >
            {(['bloque', 'lamina', 'formato'] as const).map(tipoOpt => (
              <button
                key={tipoOpt}
                onClick={() => { setTipo(tipoOpt); setPage(1); }}
                className="px-4 py-1.5 text-xs tracking-wider uppercase transition-colors"
                style={{
                  borderRadius: '2px',
                  background: filtros.tipo === tipoOpt ? 'var(--gold)' : 'transparent',
                  color: filtros.tipo === tipoOpt ? 'white' : 'var(--muted)',
                }}
              >
                {LABEL_TIPO[tipoOpt]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Layout principal */}
      <div>
        <FiltrosPanel client={client} panelCliente={panelCliente} setPanelCliente={setPanelCliente} />

        <div className="flex-1 min-w-0">
          {vistaEfectiva === 'material' && filtros.grupos.length === 0 ? (
            <MaterialesGaleria
              onSelect={(g) => { setFiltro('grupos', [g]); setPage(1); }}
            />
          ) : isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded animate-pulse"
                  style={{ aspectRatio: '3/4', background: 'var(--sand)' }}
                />
              ))}
            </div>
          ) : (
            <>
              {vistaEfectiva === 'material' && filtros.grupos.length > 0 && (
                <button
                  onClick={() => setFiltro('grupos', [])}
                  className="flex items-center gap-1.5 text-xs tracking-wider uppercase mb-5 transition-colors"
                  style={{ color: 'var(--gold-dark)' }}
                >
                  <ChevronLeft size={13} strokeWidth={1.75} />
                  {t('catalogo.cambiarMaterial')}
                </button>
              )}
              {!data?.items.length ? (
                <div
                  className="flex flex-col items-center justify-center py-24 text-center"
                  style={{ color: 'var(--muted)' }}
                >
                  <p className="font-display text-2xl font-light mb-2" style={{ color: 'var(--ink)' }}>
                    {t('catalogo.sinResultados')}
                  </p>
                  <p className="text-sm">{t('catalogo.sinResultadosHint')}</p>
                </div>
              ) : agruparPorMaterial ? (
                <div style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 200ms' }}>
                  {grupos.map(({ grupo, items, m2, m3 }, i) => (
                    <div key={grupo} style={{ marginTop: i === 0 ? 0 : '2.75rem' }}>
                      {/* Encabezado de sección: material — línea — n lotes · m²
                          Se queda fijo (sticky) mientras se recorre ese material,
                          y es reemplazado por el del siguiente grupo al llegar a él. */}
                      <div
                        className={`sticky ${onLoteClick ? 'top-0' : 'top-24'} z-20 flex items-center gap-4 mb-5 py-3 -mx-1 px-1`}
                        style={{ background: 'rgba(250, 249, 246, 0.94)', backdropFilter: 'blur(4px)', borderBottom: '1px solid var(--border)' }}
                      >
                        <h2
                          className="font-display shrink-0"
                          style={{ fontSize: '1.55rem', fontWeight: 500, color: 'var(--ink)' }}
                        >
                          {grupo}
                        </h2>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span
                          className="shrink-0 text-sm"
                          style={{ color: 'var(--muted)' }}
                        >
                          {t('catalogo.lotesEnGrupo', { n: items.length })}
                          {m2 > 0 && <> · {formatM2(m2)}</>}
                          {m3 > 0 && <> · {formatM3(m3)}</>}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {items.map((lote) => (
                          <LoteCardShowcase
                            key={lote.id}
                            lote={lote}
                            onClick={onLoteClick ? () => onLoteClick(lote.id) : undefined}
                            checkable={puedeSeleccionar && lote.estado === 'disponible'}
                            checked={seleccionados.has(lote.id)}
                            onToggleCheck={() => toggleSeleccion(lote.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 200ms' }}
                  >
                    {data.items.map((lote) => (
                      <LoteCardShowcase
                        key={lote.id}
                        lote={lote}
                        onClick={onLoteClick ? () => onLoteClick(lote.id) : undefined}
                        checkable={puedeSeleccionar && lote.estado === 'disponible'}
                        checked={seleccionados.has(lote.id)}
                        onToggleCheck={() => toggleSeleccion(lote.id)}
                      />
                    ))}
                  </div>

                  {/* Paginación */}
                  {data.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-12">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-5 py-2 text-xs tracking-widest uppercase transition-all disabled:opacity-30"
                        style={{
                          border: '1px solid var(--border)',
                          color: 'var(--muted)',
                          background: 'transparent',
                          borderRadius: '2px',
                          cursor: page === 1 ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => { if (page > 1) (e.currentTarget.style.borderColor = 'var(--gold)'); (e.currentTarget.style.color = 'var(--gold-dark)'); }}
                        onMouseLeave={e => { (e.currentTarget.style.borderColor = 'var(--border)'); (e.currentTarget.style.color = 'var(--muted)'); }}
                      >
                        {t('catalogo.anterior')}
                      </button>

                      <span
                        className="font-display text-sm"
                        style={{ color: 'var(--muted)', minWidth: '60px', textAlign: 'center' }}
                      >
                        {page} / {data.totalPages}
                      </span>

                      <button
                        disabled={page >= data.totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-5 py-2 text-xs tracking-widest uppercase transition-all disabled:opacity-30"
                        style={{
                          border: '1px solid var(--border)',
                          color: 'var(--muted)',
                          background: 'transparent',
                          borderRadius: '2px',
                          cursor: page >= data.totalPages ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => { if (page < data.totalPages) (e.currentTarget.style.borderColor = 'var(--gold)'); (e.currentTarget.style.color = 'var(--gold-dark)'); }}
                        onMouseLeave={e => { (e.currentTarget.style.borderColor = 'var(--border)'); (e.currentTarget.style.color = 'var(--muted)'); }}
                      >
                        {t('catalogo.siguiente')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barra flotante de selección múltiple — apartar varios lotes de un jalón */}
      {seleccionados.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4"
          style={{
            background: 'var(--ink)',
            borderRadius: '999px',
            padding: '10px 14px 10px 22px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.28)',
          }}
        >
          <span className="text-sm" style={{ color: 'white' }}>
            {tCount('catalogo.seleccionados', seleccionados.size)}
            {(m2Seleccionados > 0 || m3Seleccionados > 0) && (
              <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                {' · '}
                {[
                  m2Seleccionados > 0 ? formatM2(m2Seleccionados) : null,
                  m3Seleccionados > 0 ? formatM3(m3Seleccionados) : null,
                ].filter(Boolean).join(' + ')}
              </span>
            )}
          </span>
          <button
            onClick={apartarSeleccionados}
            disabled={apartando}
            className="flex items-center gap-1.5 text-xs px-4 py-2 uppercase tracking-wider transition-colors disabled:opacity-60"
            style={{ background: 'var(--gold)', color: 'white', borderRadius: '999px' }}
          >
            {apartando ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} strokeWidth={1.75} />}
            {apartando ? t('catalogo.apartando') : t('catalogo.apartarSeleccionados')}
          </button>
          <button
            onClick={limpiarSeleccion}
            disabled={apartando}
            title={t('catalogo.cancelarSeleccion')}
            className="flex items-center justify-center transition-colors"
            style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', color: 'white' }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}