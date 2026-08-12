/**
 * BuscadorAvanzado — búsqueda por metraje en pestaña emergente (modal).
 * Muestra los resultados como tarjetas con foto + info básica (no solo el
 * folio del lote), permite seleccionar varios y desde ahí:
 *   · "Apartar"        → reserva los lotes seleccionados, genera el PDF
 *                         de resumen y lo envía por correo (cliente + admin).
 *   · "Descargar fotos" → descarga un .zip con las fotos de los lotes
 *                         seleccionados.
 */
import { useState } from 'react';
import {
  Search, Package, Layers, AlertCircle, Loader2, PackageCheck,
  X, ImageDown, MailCheck,
} from 'lucide-react';
import { useBusquedaLotes, useMateriales, useGrupos } from '@/hooks/useBusqueda';
import { useApartar, useDescargarPDFApartados, useDescargarFotosZip } from '@/hooks/useApartar';
import { useCurrentClient } from '@/hooks/useClientAuth';
import { useCatalogoStore } from '@/store/catalogoStore';
import { useI18n } from '@/i18n/I18nContext';
import { useQueryClient } from '@tanstack/react-query';
import LoteCardShowcase from '@/components/catalog/LoteCardShowcase';
import type { Lote, TipoLote } from '@petravia/shared';

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function BuscadorAvanzado({ isOpen = false, onClose = () => {} }: Props) {
  const { t, tCount } = useI18n();
  const TIPOS_BUSQUEDA: Array<{ value: TipoLote; label: string; unidad: 'm²' | 'm³' }> = [
    { value: 'bloque',  label: t('catalogo.tipoBloque'),  unidad: 'm³' },
    { value: 'lamina',  label: t('catalogo.tipoLamina'),  unidad: 'm²' },
    { value: 'formato', label: t('catalogo.tipoFormato'), unidad: 'm²' },
  ];
  // El tipo determina la unidad de búsqueda: m³ en bloques, m² en
  // láminas/formato (mezclarlos no tiene sentido físico — ver
  // busqueda.service.ts). Por default usamos el tipo que el cliente ya
  // tenía elegido en el catálogo (Bloques/Láminas/Formato), y si por algún
  // motivo no hay uno definido (ej. vista "todos" del admin), caemos en
  // "lamina" — mismo comportamiento histórico que tenía el backend.
  const filtrosTipo = useCatalogoStore(s => s.filtros.tipo);
  const tipoInicial: TipoLote = filtrosTipo === 'bloque' || filtrosTipo === 'lamina' || filtrosTipo === 'formato'
    ? filtrosTipo
    : 'lamina';

  const [tipo,       setTipo]       = useState<TipoLote>(tipoInicial);
  const [material,   setMaterial]   = useState('');
  const [grupo,      setGrupo]      = useState('');
  const [metraje,    setMetraje]    = useState('');
  const [largoMin,   setLargoMin]   = useState('');
  const [anchoMin,   setAnchoMin]   = useState('');
  const [altoMin,    setAltoMin]    = useState('');
  const [seleccion,  setSeleccion]  = useState<Set<string>>(new Set());
  const [exito,      setExito]      = useState<{ n: number } | null>(null);

  // Los materiales dependen del tipo — un material de Formato no debe
  // aparecer como opción al buscar Bloques, y viceversa.
  const { data: materiales = [] } = useMateriales(tipo);
  const { data: grupos     = [] } = useGrupos();
  const { mutate: buscar, isPending: buscando, error, data: resultado } = useBusquedaLotes();
  const { mutateAsync: apartar, isPending: apartando } = useApartar();
  const client = useCurrentClient();
  const pdf  = useDescargarPDFApartados(client?.token ?? null);
  const fotosZip = useDescargarFotosZip(client?.token ?? null);
  const qc = useQueryClient();

  if (!isOpen) return null;

  const unidad = TIPOS_BUSQUEDA.find(t => t.value === tipo)?.unidad ?? 'm²';

  // Al cambiar de tipo, el material elegido (si lo hay) pertenece al tipo
  // anterior y ya no es válido — se limpia para no dejar un filtro fantasma.
  function handleTipoChange(nuevoTipo: TipoLote) {
    setTipo(nuevoTipo);
    setMaterial('');
  }

  function handleClose() {
    setExito(null);
    onClose();
  }

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setSeleccion(new Set());
    setExito(null);
    buscar({
      tipo,
      material: material || undefined,
      grupo:    grupo    || undefined,
      metraje:  metraje  ? parseFloat(metraje) : undefined,
      largoMin: largoMin ? parseFloat(largoMin) : undefined,
      anchoMin: anchoMin ? parseFloat(anchoMin) : undefined,
      altoMin:  tipo === 'bloque' && altoMin ? parseFloat(altoMin) : undefined,
    });
  }

  function toggleSeleccion(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function agregarCombo(lotes: Lote[]) {
    setSeleccion(prev => {
      const next = new Set(prev);
      lotes.forEach(l => next.add(l.id));
      return next;
    });
  }

  // Todos los lotes visibles en resultados (individuales + los de combos), sin duplicados
  const todosLosLotes: Lote[] = resultado
    ? [...resultado.individual, ...resultado.combos.flatMap(c => c.lotes)]
        .filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i)
    : [];

  const seleccionados = todosLosLotes.filter(l => seleccion.has(l.id));
  // Con búsqueda por tipo, todos los resultados comparten la misma unidad
  // física — sumamos m³ si se buscó por bloques, m² en cualquier otro caso.
  const totalMetraje = seleccionados.reduce(
    (sum, l) => sum + (tipo === 'bloque' ? (l.saldoM3 ?? 0) : l.saldoM2), 0
  );

  async function handleApartar() {
    if (!client || seleccion.size === 0) return;
    setExito(null);
    const ids = Array.from(seleccion);
    let ok = 0;
    for (const loteId of ids) {
      try {
        await apartar({ loteId, clienteToken: client.token });
        ok++;
      } catch {
        // se cuenta abajo por diferencia; seguimos con el resto
      }
    }
    qc.invalidateQueries({ queryKey: ['lotes'] });
    qc.invalidateQueries({ queryKey: ['mis-apartados'] });
    setSeleccion(new Set());
    if (ok > 0) {
      // Genera el PDF de TODOS los apartados vigentes del cliente y lo
      // envía por correo (cliente + admin) — misma lógica que "Mis Apartados".
      try { await pdf.mutateAsync(); } catch { /* el error se muestra abajo */ }
      setExito({ n: ok });
    }
  }

  async function handleDescargarFotos() {
    if (seleccion.size === 0) return;
    try { await fotosZip.mutateAsync(Array.from(seleccion)); } catch { /* error visible abajo */ }
  }

  const hayResultados = resultado && (resultado.individual.length > 0 || resultado.combos.length > 0);
  const sinResultados = resultado && resultado.individual.length === 0 && resultado.combos.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,17,14,0.5)', backdropFilter: 'blur(2px)' }}>
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{ maxWidth: '760px', maxHeight: '85vh', background: 'var(--white)', borderRadius: '6px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sand)' }}>
              <Search size={14} style={{ color: 'var(--gold-dark)' }} />
            </div>
            <div>
              <h2 className="font-display font-light" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>{t('buscador.title')}</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('buscador.subtitle')}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Formulario compacto */}
          <form onSubmit={handleBuscar} className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 mb-2.5">
              <select value={tipo} onChange={e => handleTipoChange(e.target.value as TipoLote)}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', background: 'var(--white)', color: 'var(--ink)' }}>
                {TIPOS_BUSQUEDA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={material} onChange={e => setMaterial(e.target.value)}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', background: 'var(--white)', color: 'var(--ink)' }}>
                <option value="">{t('buscador.todosMateriales')}</option>
                {materiales.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={grupo} onChange={e => setGrupo(e.target.value)}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', background: 'var(--white)', color: 'var(--ink)' }}>
                <option value="">{t('buscador.todosGrupos')}</option>
                {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input type="number" value={metraje} onChange={e => setMetraje(e.target.value)}
                step="0.1" min="0" placeholder={t('buscador.metrajePlaceholder', { unidad })}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--ink)' }} />
              <button type="submit" disabled={buscando}
                className="flex items-center justify-center gap-2 px-4 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                style={{ background: 'var(--ink)', color: 'white', borderRadius: '2px' }}>
                {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {t('buscador.buscar')}
              </button>
            </div>

            {/* Medidas mínimas — largo/ancho para láminas y formato; para
                bloques se agrega alto. Se comparan contra la pieza del lote. */}
            <div className={`grid grid-cols-1 ${tipo === 'bloque' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5`}>
              <input type="number" value={largoMin} onChange={e => setLargoMin(e.target.value)}
                step="1" min="0" placeholder={t('buscador.largoMinPlaceholder')}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--ink)' }} />
              <input type="number" value={anchoMin} onChange={e => setAnchoMin(e.target.value)}
                step="1" min="0" placeholder={t('buscador.anchoMinPlaceholder')}
                className="px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--ink)' }} />
              {tipo === 'bloque' && (
                <input type="number" value={altoMin} onChange={e => setAltoMin(e.target.value)}
                  step="1" min="0" placeholder={t('buscador.altoMinPlaceholder')}
                  className="px-3 py-2 text-sm outline-none"
                  style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--ink)' }} />
              )}
            </div>
          </form>

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3" style={{ background: '#fbeceb', borderRadius: '2px' }}>
              <AlertCircle size={14} style={{ color: '#b3392f' }} />
              <p className="text-xs" style={{ color: '#b3392f' }}>{(error as Error).message}</p>
            </div>
          )}

          {sinResultados && (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('buscador.sinResultados')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--border)' }}>{t('buscador.sinResultadosHint')}</p>
            </div>
          )}

          {exito && (
            <div className="mb-4 flex items-start gap-2 p-3" style={{ background: '#eef7f0', borderRadius: '2px' }}>
              <MailCheck size={15} style={{ color: '#2f6b3f' }} className="shrink-0 mt-0.5" />
              <p className="text-xs" style={{ color: '#2f6b3f' }}>
                {tCount('buscador.exito', exito.n)}
                {client ? t('buscador.exitoEmailSuffix', { email: ` (${client.email})` }) : t('buscador.exitoEmailSuffix', { email: '' })}
              </p>
            </div>
          )}

          {(pdf.error || fotosZip.error) && (
            <div className="mb-4 flex items-center gap-2 p-3" style={{ background: '#fbeceb', borderRadius: '2px' }}>
              <AlertCircle size={14} style={{ color: '#b3392f' }} />
              <p className="text-xs" style={{ color: '#b3392f' }}>
                {((pdf.error ?? fotosZip.error) as Error).message}
              </p>
            </div>
          )}

          {hayResultados && (
            <div className="space-y-5">
              {/* Lotes que cubren solos */}
              {resultado.individual.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Package size={13} style={{ color: 'var(--gold-dark)' }} />
                    <h3 className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      {t('buscador.cubrenSolos', { n: resultado.individual.length })}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {resultado.individual.map(lote => (
                      <LoteCardShowcase
                        key={lote.id}
                        lote={lote}
                        onClick={() => toggleSeleccion(lote.id)}
                        seleccionado={seleccion.has(lote.id)}
                        destacado
                        size="compact"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Combinaciones */}
              {resultado.combos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Layers size={13} style={{ color: '#4b7bb0' }} />
                    <h3 className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      {t('buscador.combinaciones', { n: resultado.combos.length })}
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {resultado.combos.map((combo, i) => (
                      <div key={i} className="p-2.5" style={{ background: 'var(--sand)', borderRadius: '3px' }}>
                        <div className="flex items-center justify-between mb-2 px-0.5">
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>
                            <strong style={{ color: 'var(--ink)' }}>{combo.metrajeTotal} {unidad}</strong> {t('buscador.combinados')}
                            {combo.diferencia > 0 && <span style={{ color: '#b0842f' }}> (+{combo.diferencia})</span>}
                          </span>
                          <button
                            onClick={() => agregarCombo(combo.lotes)}
                            className="text-xs px-2.5 py-1 transition-colors"
                            style={{ border: '1px solid var(--gold)', color: 'var(--gold-dark)', borderRadius: '2px', background: 'var(--white)' }}
                          >
                            {t('buscador.seleccionarCombo')}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {combo.lotes.map(lote => (
                            <div key={lote.id} style={{ width: 108 }}>
                              <LoteCardShowcase
                                lote={lote}
                                onClick={() => toggleSeleccion(lote.id)}
                                seleccionado={seleccion.has(lote.id)}
                                size="compact"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barra de selección/acciones — siempre visible cuando hay algo seleccionado */}
        {seleccion.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 shrink-0 flex-wrap"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--sand)' }}>
            <div className="text-sm" style={{ color: 'var(--ink)' }}>
              {tCount('buscador.seleccionados', seleccion.size)}
              <span style={{ color: 'var(--muted)' }}> · {totalMetraje.toFixed(2)} {unidad}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSeleccion(new Set())}
                className="text-xs px-2 py-2 transition-colors" style={{ color: 'var(--muted)' }}>
                {t('buscador.limpiar')}
              </button>
              <button
                onClick={handleDescargarFotos}
                disabled={fotosZip.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                style={{ border: '1px solid var(--border)', color: 'var(--ink)', borderRadius: '2px', background: 'var(--white)' }}
              >
                {fotosZip.isPending ? <Loader2 size={13} className="animate-spin" /> : <ImageDown size={13} />}
                {fotosZip.isPending ? t('buscador.preparando') : t('buscador.descargarFotos')}
              </button>
              <button
                onClick={handleApartar}
                disabled={apartando || pdf.isPending || !client}
                className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                style={{ background: 'var(--gold)', color: 'white', borderRadius: '2px' }}
              >
                {(apartando || pdf.isPending) ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />}
                {apartando ? t('buscador.apartando') : pdf.isPending ? t('buscador.generandoPdf') : t('buscador.apartar')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
