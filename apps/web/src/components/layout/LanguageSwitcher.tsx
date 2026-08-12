/**
 * LanguageSwitcher.tsx — botón + menú desplegable para elegir el idioma
 * del catálogo. Se coloca en el header, junto al botón "Salir".
 */
import { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { LOCALES } from '@/i18n/dictionary';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  const actual = LOCALES.find(l => l.code === locale) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={t('layout.language')}
        className="flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-dark)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
      >
        <Globe size={14} />
        {actual.code.toUpperCase()}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 py-1"
          style={{
            minWidth: '160px',
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          {LOCALES.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => { setLocale(code); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 text-left text-sm px-3.5 py-2 transition-colors"
              style={{
                color: code === locale ? 'var(--ink)' : 'var(--muted)',
                background: code === locale ? 'var(--sand)' : 'transparent',
                fontWeight: code === locale ? 500 : 400,
              }}
            >
              {label}
              {code === locale && <Check size={13} style={{ color: 'var(--gold-dark)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
