/**
 * HistorialCompras.tsx
 * ─────────────────────
 * Muestra el historial de lotes comprados y confirmados para el cliente.
 * Los datos provienen de GET /api/apartados/historial (autenticado con token).
 */
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShoppingBag, RefreshCw, PackageCheck } from 'lucide-react';
import { api, type HistorialCompra } from '@/lib/api';
import { formatM2 } from '@petravia/shared';
import { useI18n } from '@/i18n/I18nContext';
import type { ClientData } from '@/hooks/useClientAuth';

interface Props { client: ClientData; }

export default function HistorialCompras({ client }: Props) {
  const { t, tCount, locale } = useI18n();

  function fechaLabel(iso: string): string {
    const localeMap: Record<string, string> = { es: 'es-MX', en: 'en-US', pt: 'pt-BR', ja: 'ja-JP', zh: 'zh-CN', it: 'it-IT' };
    return new Date(iso).toLocaleDateString(localeMap[locale] ?? 'es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  const {
    data: historial = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<HistorialCompra[]>({
    queryKey: ['historial-compras', client.email],
    queryFn: () => api.apartados.historial(client.token),
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--muted)' }}>
        <Loader2 size={14} className="animate-spin" /> {t('historial.cargando')}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {historial.length === 0
            ? t('historial.sinCompras')
            : tCount('historial.compradas', historial.length)}
        </p>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title={t('historial.actualizar')}
          className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40"
          style={{ color: 'var(--muted)' }}
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? t('historial.actualizando') : t('historial.actualizar')}
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: '#b3392f' }}>
          {t('historial.errorCargar')}
        </p>
      )}

      {!error && historial.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 py-8"
          style={{ color: 'var(--muted)' }}
        >
          <ShoppingBag size={28} strokeWidth={1.2} />
          <p className="text-xs text-center">
            {t('historial.vacioLinea1')}<br />
            {t('historial.vacioLinea2')}
          </p>
        </div>
      )}

      {historial.length > 0 && (
        <div className="space-y-2">
          {historial.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3"
              style={{
                background: 'var(--sand)',
                borderRadius: '2px',
              }}
            >
              {/* Ícono */}
              <div
                className="flex-shrink-0 mt-0.5 flex items-center justify-center"
                style={{
                  width: 28, height: 28,
                  background: '#eef7f0',
                  borderRadius: '2px',
                  color: '#2f6b3f',
                }}
              >
                <PackageCheck size={14} />
              </div>

              {/* Datos */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code
                    className="text-xs font-mono font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {item.loteId}
                  </code>
                  {item.material && (
                    <span
                      className="text-xs truncate max-w-[240px]"
                      style={{ color: 'var(--ink)' }}
                    >
                      {item.material}
                    </span>
                  )}
                  {item.acabado && (
                    <span
                      className="text-xs px-1.5 py-0.5"
                      style={{
                        background: 'rgba(0,0,0,0.06)',
                        borderRadius: '2px',
                        color: 'var(--muted)',
                      }}
                    >
                      {item.acabado}
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-3 mt-1 text-xs flex-wrap"
                  style={{ color: 'var(--muted)' }}
                >
                  {item.saldoM2 != null && (
                    <span
                      className="font-medium"
                      style={{ color: 'var(--gold-dark)' }}
                    >
                      {formatM2(item.saldoM2)}
                    </span>
                  )}
                  <span>{t('historial.compradoEl', { fecha: fechaLabel(item.compradoEn) })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
