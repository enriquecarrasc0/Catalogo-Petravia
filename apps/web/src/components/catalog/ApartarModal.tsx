/**
 * ApartarModal — aparta el lote completo (sin campo de metraje)
 */
import { X, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { useApartar } from '@/hooks/useApartar';
import { useCurrentClient } from '@/hooks/useClientAuth';
import { useT } from '@/i18n/I18nContext';
import type { Lote } from '@petravia/shared';
import { formatSaldoLote } from '@petravia/shared';

interface Props {
  lote: Lote;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApartarModal({ lote, isOpen, onClose }: Props) {
  const client = useCurrentClient();
  const { mutate: apartar, isPending, isSuccess, error, reset } = useApartar();
  const t = useT();

  if (!isOpen) return null;

  function handleClose() {
    reset();
    onClose();
  }

  // ── Éxito ────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <Overlay>
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-light text-stone-800 mb-2">{t('apartarModal.successTitle')}</h2>
          <p className="text-sm text-stone-500 mb-1">
            {t('apartarModal.successBody', { id: lote.id })}
          </p>
          <p className="text-xs text-stone-400 mb-8">{t('apartarModal.successHint')}</p>
          <button onClick={handleClose}
            className="w-full py-2.5 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 transition">
            {t('apartarModal.cerrar')}
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
              <Package size={16} className="text-stone-600" />
            </div>
            <h2 className="font-display text-xl font-light text-stone-800">{t('apartarModal.title')}</h2>
          </div>
          <button onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition">
            <X size={16} />
          </button>
        </div>

        {/* Info del lote */}
        <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 mb-5 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-stone-400">{t('apartarModal.lote')}</span>
            <span className="font-mono font-medium text-stone-800">{lote.id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-stone-400">{t('apartarModal.material')}</span>
            <span className="text-stone-700 text-right max-w-[60%]">{lote.material}</span>
          </div>
          {(lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0) : lote.saldoM2) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-400">{t('apartarModal.disponible')}</span>
              <span className="text-stone-700">{formatSaldoLote(lote)}</span>
            </div>
          )}
          {lote.saldoPiezas > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-400">{t('apartarModal.piezas')}</span>
              <span className="text-stone-700">{lote.saldoPiezas}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-stone-500 mb-5">
          {t('apartarModal.infoText')}
        </p>

        {/* Cliente */}
        {client && (
          <div className="text-xs text-stone-400 mb-5">
            {t('apartarModal.reservandoComo', { nombre: client.nombre || client.email })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md mb-4">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{error.message}</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3">
          <button onClick={handleClose} disabled={isPending}
            className="flex-1 py-2.5 border border-stone-200 text-stone-700 text-sm rounded-md
                       hover:bg-stone-50 transition disabled:opacity-50">
            {t('apartarModal.cancelar')}
          </button>
          <button
            onClick={() => apartar({ loteId: lote.id, clienteToken: client?.token ?? '' })}
            disabled={isPending || !client}
            className="flex-1 py-2.5 bg-stone-900 text-white text-sm rounded-md
                       hover:bg-stone-800 transition disabled:opacity-50">
            {isPending ? t('apartarModal.apartando') : t('apartarModal.confirmar')}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {children}
    </div>
  );
}
