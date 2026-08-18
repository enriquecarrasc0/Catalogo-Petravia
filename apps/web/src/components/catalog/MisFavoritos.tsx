/**
 * apps/web/src/components/catalog/MisFavoritos.tsx
 * ──────────────────────────────────────────────────
 * "Mis Favoritos" en pestaña emergente (modal, igual que MisApartados):
 * resumen de los lotes que el cliente marcó con el corazón en el catálogo.
 *
 * A diferencia de "Mis Apartados": esto no reserva nada, no tiene fecha de
 * expiración, y NUNCA toca Odoo — los datos de cada lote (material, foto,
 * m²) son la instantánea que se guardó al momento de darle corazón. Solo
 * dos acciones por lote —
 *   · "Quitar"   → lo saca de favoritos.
 *   · "Apartar"  → ahora sí lo reserva de verdad (48h) y avisa al vendedor,
 *                  usando el mismo flujo que el catálogo. Si el lote ya no
 *                  está disponible, el propio apartar lo rechaza y se
 *                  muestra el error aquí — no hace falta consultarlo antes.
 */
import { useState } from 'react';
import { Heart, Trash2, Loader2, RefreshCw, Package, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMisFavoritos, useToggleFavorito } from '@/hooks/useFavoritos';
import { useApartar } from '@/hooks/useApartar';
import { formatSaldoLote, parseTituloLote } from '@petravia/shared';
import { useI18n } from '@/i18n/I18nContext';
import type { ClientData } from '@/hooks/useClientAuth';

interface Props {
  client: ClientData;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function MisFavoritos({ client, isOpen = false, onClose = () => {} }: Props) {
  const { t, tCount } = useI18n();
  const { data: favoritos = [], isLoading, isFetching, error, refetch } = useMisFavoritos(client.token);
  const { toggle: toggleFavorito } = useToggleFavorito(client.token);
  const apartarMutation = useApartar();
  const qc = useQueryClient();

  const [apartandoId, setApartandoId] = useState<string | null>(null);
  const [apartadoOkId, setApartadoOkId] = useState<string | null>(null);
  const [errorApartarId, setErrorApartarId] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleQuitar(loteId: string) {
    toggleFavorito(loteId, true);
  }

  async function handleApartar(loteId: string) {
    setApartandoId(loteId);
    setErrorApartarId(null);
    try {
      await apartarMutation.mutateAsync({ loteId, clienteToken: client.token });
      setApartadoOkId(loteId);
      qc.invalidateQueries({ queryKey: ['mis-apartados'] });
      qc.invalidateQueries({ queryKey: ['lotes'] });
    } catch {
      setErrorApartarId(loteId);
    } finally {
      setApartandoId(null);
    }
  }

  function handleRefresh() {
    refetch();
  }

  function handleClose() {
    setApartadoOkId(null);
    setErrorApartarId(null);
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
              <Heart size={14} style={{ color: '#c0435a' }} fill="#c0435a" />
            </div>
            <div>
              <h2 className="font-display font-light" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>{t('favoritos.title')}</h2>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {isLoading
                  ? t('favoritos.cargando')
                  : favoritos.length === 0
                    ? t('favoritos.sinLotes')
                    : tCount('favoritos.guardados', favoritos.length)}
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
              title={t('favoritos.actualizar')}
              className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
              style={{ color: 'var(--muted)' }}
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              {isFetching ? t('favoritos.actualizando') : t('favoritos.actualizar')}
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--muted)' }}>
              <Loader2 size={14} className="animate-spin" /> {t('favoritos.cargando')}
            </div>
          )}

          {error && !isLoading && (
            <p className="text-sm" style={{ color: '#b3392f' }}>{t('favoritos.errorCargar')}</p>
          )}

          {!error && !isLoading && favoritos.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8" style={{ color: 'var(--muted)' }}>
              <Heart size={28} strokeWidth={1.2} />
              <p className="text-xs text-center max-w-[280px]">{t('favoritos.vacioHint')}</p>
            </div>
          )}

          {!isLoading && favoritos.length > 0 && (
            <div className="space-y-2">
              {favoritos.map(fav => {
                // Mismo título que se ve en la página del lote: "Bloque"
                // para bloques, o material/calidad/acabado para el resto —
                // en vez del nombre crudo de Odoo (ej. "Block Veracruz
                // STD (LAMINA)"), que no es lo que el cliente reconoce.
                const titulo = fav.tipo === 'bloque'
                  ? t('loteDetalle.bloqueTitulo')
                  : parseTituloLote(fav.material ?? '', fav.grupo ?? '', fav.acabado ?? '').titulo;

                return (
                <div
                  key={fav.id}
                  className="flex items-center justify-between gap-3 p-3 flex-wrap"
                  style={{ background: 'var(--sand)', borderRadius: '2px' }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="shrink-0 overflow-hidden"
                      style={{ width: 44, height: 44, borderRadius: '2px', background: 'var(--border)' }}
                    >
                      {fav.fotoUrl && (
                        <img src={fav.fotoUrl} alt={fav.loteId} className="w-full h-full" style={{ objectFit: 'cover' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {titulo && (
                          <span className="text-sm font-medium truncate max-w-[220px]" style={{ color: 'var(--ink)' }}>{titulo}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
                        <span>{t('loteDetalle.lote', { id: fav.loteId })}</span>
                        <span className="font-medium" style={{ color: 'var(--gold-dark)' }}>
                          {formatSaldoLote({ tipo: fav.tipo ?? 'lamina', saldoM2: fav.saldoM2 ?? 0, saldoM3: fav.saldoM3 ?? 0 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleQuitar(fav.loteId)}
                      title={t('favoritos.quitar')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs transition-colors"
                      style={{ border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--muted)', background: 'transparent' }}
                    >
                      <Trash2 size={12} />
                      {t('favoritos.quitar')}
                    </button>

                    <button
                      onClick={() => handleApartar(fav.loteId)}
                      disabled={apartandoId === fav.loteId || apartadoOkId === fav.loteId}
                      title={t('favoritos.apartar')}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors disabled:opacity-60"
                      style={{
                        background: apartadoOkId === fav.loteId ? 'var(--available)' : 'var(--gold)',
                        color: 'white', borderRadius: '2px',
                      }}
                    >
                      {apartandoId === fav.loteId ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
                      {apartandoId === fav.loteId
                        ? t('favoritos.apartando')
                        : apartadoOkId === fav.loteId
                          ? t('estado.apartado')
                          : t('favoritos.apartar')}
                    </button>
                  </div>

                  {errorApartarId === fav.loteId && (
                    <p className="w-full text-xs" style={{ color: '#b3392f' }}>
                      {apartarMutation.error instanceof Error ? apartarMutation.error.message : t('favoritos.errorCargar')}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
