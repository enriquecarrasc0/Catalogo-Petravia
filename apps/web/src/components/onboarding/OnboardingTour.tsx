/**
 * apps/web/src/components/onboarding/OnboardingTour.tsx
 * ────────────────────────────────────────────────────────
 * Recorrido breve (5 pasos) que se muestra la primera vez que un
 * cliente entra al catálogo, explicando qué puede hacer: buscar, ver
 * el detalle de un lote, guardar favoritos, apartar y dar seguimiento
 * a sus apartados/historial. Se puede omitir en cualquier momento.
 *
 * Quién decide CUÁNDO mostrarlo (y recordar que ya se vio) es
 * Layout.tsx — este componente solo dibuja el carrusel en sí.
 */
import { useState } from 'react';
import { Sparkles, Search, Heart, PackageCheck, ClipboardList, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useT } from '@/i18n/I18nContext';

interface Paso {
  Icon: typeof Sparkles;
  tituloKey: string;
  descKey: string;
}

const PASOS: Paso[] = [
  { Icon: Sparkles,      tituloKey: 'onboarding.step1.title', descKey: 'onboarding.step1.desc' },
  { Icon: Search,        tituloKey: 'onboarding.step2.title', descKey: 'onboarding.step2.desc' },
  { Icon: Heart,         tituloKey: 'onboarding.step3.title', descKey: 'onboarding.step3.desc' },
  { Icon: PackageCheck,  tituloKey: 'onboarding.step4.title', descKey: 'onboarding.step4.desc' },
  { Icon: ClipboardList, tituloKey: 'onboarding.step5.title', descKey: 'onboarding.step5.desc' },
];

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [paso, setPaso] = useState(0);
  const esUltimo = paso === PASOS.length - 1;
  const { Icon, tituloKey, descKey } = PASOS[paso];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title={t('onboarding.skip')}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X size={18} />
        </button>

        <div
          className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ background: 'var(--sand)' }}
        >
          <Icon size={26} style={{ color: 'var(--gold-dark)' }} />
        </div>

        <h2 className="font-display text-xl font-light text-stone-800 mb-2">{t(tituloKey)}</h2>
        <p className="text-sm text-stone-500 leading-relaxed mb-8">{t(descKey)}</p>

        {/* Indicador de pasos */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {PASOS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === paso ? 'w-5' : 'w-1.5'}`}
              style={{ background: i === paso ? 'var(--gold-dark)' : 'var(--border)' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors mr-auto"
          >
            {t('onboarding.skip')}
          </button>

          {paso > 0 && (
            <button
              onClick={() => setPaso(p => p - 1)}
              title={t('onboarding.back')}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200
                         hover:border-stone-400 transition-colors shrink-0"
            >
              <ArrowLeft size={15} className="text-stone-600" />
            </button>
          )}

          {esUltimo ? (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-stone-900 text-white text-sm rounded-full hover:bg-stone-800 transition-colors shrink-0"
            >
              {t('onboarding.start')}
            </button>
          ) : (
            <button
              onClick={() => setPaso(p => p + 1)}
              title={t('onboarding.next')}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-stone-900 text-white
                         hover:bg-stone-800 transition-colors shrink-0"
            >
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
