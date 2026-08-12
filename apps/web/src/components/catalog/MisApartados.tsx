/**
 * apps/web/src/components/catalog/MisApartados.tsx
 * ────────────────────────────────────────────────
 * "Mis Apartados" en pestaña emergente (modal): resumen de los lotes
 * apartados vigentes del cliente y dos acciones —
 *   · "Descargar PDF"   → genera el resumen y lo envía por correo.
 *   · "Descargar fotos" → .zip con las fotos de todos los apartados.
 */
import { useState, useEffect } from 'react';
import { FileDown, Trash2, Loader2, Clock, RefreshCw, MailCheck, AlertCircle, X, Package, ImageDown } from 'lucide-react';
import { useMisApartados, useLiberarApartado, useDescargarPDFApartados, useDescargarFotosZip } from '@/hooks/useApartar';
import { useQueryClient } from '@tanstack/react-query';
import { formatSaldoLote, formatM2, formatM3 } from '@petravia/shared';
import { useI18n } from '@/i18n/I18nContext';
import type { ClientData } from '@/hooks/useClientAuth';

interface Props {
  client: ClientData;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function MisApartados({ client, isOpen = false, onClose = () => {} }: Props) {
  const { t, tCount } = useI18n();

  function expiraLabel(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return t('misApartados.expirado');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? t('misApartados.expira', { h, m }) : t('misApartados.expiraSoloMin', { m });
  }

  const { data: apartados = [], isLoading, isFetching, error, refetch } =
    useMisApartados(client.token);
  const liberar = useLiberarApartado(client.token);
  const descargarPdf = useDescargarPDFApartados(client.token);
  const descargarFotos = useDescargarFotosZip(client.token);
  const qc = useQueryClient();
  const [liberandoId, setLiberandoId] = useState<string | null>(null);
  const [pdfEnviado, setPdfEnviado] = useState(false);
  // Ticker para actualizar los contadores de tiempo sin hacer refetch
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!isOpen) return null;

  // m² (láminas/formato) y m³ (bloques) sumados por separado — no se pueden
  // mezclar en un solo total porque son unidades físicas distintas.
  const totalM2 = apartados.reduce((sum, a) => sum + (a.lote && a.lote.tipo !== 'bloque' ? a.lote.saldoM2 : 0), 0);
  const totalM3 = apartados.reduce((sum, a) => sum + (a.lote && a.lote.tipo === 'bloque' ? (a.lote.saldoM3 ?? 0) : 0), 0);

  async function handleLiberar(id: string) {
    setLiberandoId(id);
    try {
      await liberar.mutateAsync(id);
      qc.invalidateQueries({ queryKey: ['mis-apartados'] });
      qc.invalidateQueries({ queryKey: ['lotes'] });
    } finally {
      setLiberandoId(null);
    }
  }

  async function handleDescargarPdf() {
    setPdfEnviado(false);
    try {
      await descargarPdf.mutateAsync();
      setPdfEnviado(true);
    } catch {
      // el error se muestra abajo vía descargarPdf.error
    }
  }

  async function handleDescargarFotos() {
    try {
      await descargarFotos.mutateAsync(apartados.map(a => a.loteId));
    } catch {
      // el error se muestra abajo vía descargarFotos.error
    }
  }

  function handleRefresh() {
    refetch();
    qc.invalidateQueries({ queryKey: ['lotes'] });
  }

  function handleClose() {
    setPdfEnviado(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,17,14,0.5)', backdropFilter: 'blur(2px)' }}>
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{ maxWidth: '640px', maxHeight: '85vh', background: 'var(--white)', borderRadius: '6px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--sand)' }}>
              <Package size={14} style={{ color: 'var(--gold-dark)' }} />
            </div>
            <div>
              <h2 className="font-display font-light" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>{t('misApartados.title')}</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {isLoading
                  ? t('misApartados.cargando')
                  : apartados.length === 0
                    ? t('misApartados.sinLotes')
                    : tCount('misApartados.vigentes', apartados.length)}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-end mb-3">
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              title={t('misApartados.actualizar')}
              className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
              style={{ color: 'var(--muted)' }}
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              {isFetching ? t('misApartados.actualizando') : t('misApartados.actualizar')}
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> {t('misApartados.cargandoTusApartados')}
            </div>
          )}

          {pdfEnviado && !descargarPdf.isPending && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 text-xs" style={{ background: '#eef7f0', color: '#2f6b3f', borderRadius: '2px' }}>
              <MailCheck size={13} />
              {t('misApartados.copiaEnviada', { email: client.email })}
            </div>
          )}

          {(descargarPdf.error || descargarFotos.error) && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 text-xs" style={{ background: '#fbeceb', color: '#b3392f', borderRadius: '2px' }}>
              <AlertCircle size={13} />
              {((descargarPdf.error ?? descargarFotos.error) as Error).message}
            </div>
          )}

          {error && !isLoading && (
            <p className="text-sm text-red-600">{t('misApartados.errorCargar')}</p>
          )}

          {!error && !isLoading && apartados.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
              {t('misApartados.vacioHint')}
            </p>
          )}

          {!isLoading && apartados.length > 0 && (
            <div className="space-y-2">
              {apartados.map(ap => (
                <div
                  key={ap.id}
                  className="flex items-center justify-between gap-3 p-3 flex-wrap"
                  style={{ background: 'var(--sand)', borderRadius: '2px' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono font-medium" style={{ color: 'var(--ink)' }}>{ap.loteId}</code>
                      {ap.lote?.material && (
                        <span className="text-sm truncate max-w-[260px]" style={{ color: 'var(--ink)' }}>{ap.lote.material}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
                      {ap.lote && <span className="font-medium" style={{ color: 'var(--gold-dark)' }}>{formatSaldoLote(ap.lote)}</span>}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {expiraLabel(ap.expiraEn)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLiberar(ap.id)}
                    disabled={liberandoId === ap.id}
                    title={t('misApartados.cancelarApartado')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                    style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--muted)', background: 'transparent' }}
                  >
                    {liberandoId === ap.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    {t('misApartados.cancelar')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Barra de acciones — resumen + descargas */}
        {!isLoading && apartados.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 shrink-0 flex-wrap"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--sand)' }}>
            <div className="text-sm" style={{ color: 'var(--ink)' }}>
              <strong>{tCount('misApartados.total', apartados.length)}</strong>
              <span style={{ color: 'var(--muted)' }}>
                {' '}· {[
                  totalM2 > 0 ? formatM2(totalM2) : null,
                  totalM3 > 0 ? formatM3(totalM3) : null,
                ].filter(Boolean).join(' · ')} total
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDescargarFotos}
                disabled={descargarFotos.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                style={{ border: '1px solid var(--border)', color: 'var(--ink)', borderRadius: '2px', background: 'var(--white)' }}
              >
                {descargarFotos.isPending ? <Loader2 size={13} className="animate-spin" /> : <ImageDown size={13} />}
                {descargarFotos.isPending ? t('misApartados.preparando') : t('misApartados.descargarFotos')}
              </button>
              <button
                onClick={handleDescargarPdf}
                disabled={descargarPdf.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                style={{ background: 'var(--gold)', color: 'white', borderRadius: '2px' }}
              >
                {descargarPdf.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                {descargarPdf.isPending ? t('misApartados.generando') : t('misApartados.descargarPdf')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}