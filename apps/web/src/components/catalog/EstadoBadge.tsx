import type { EstadoLote } from '@petravia/shared';
import { useT } from '@/i18n/I18nContext';

const CONFIG: Record<EstadoLote, { key: string; bg: string; color: string; dot: string }> = {
  disponible: {
    key: 'estado.disponible',
    bg: 'rgba(61,122,95,0.12)',
    color: 'var(--available)',
    dot: 'var(--available)',
  },
  apartado: {
    key: 'estado.apartado',
    bg: 'rgba(154,109,46,0.12)',
    color: 'var(--apartado)',
    dot: 'var(--apartado)',
  },
  vendido: {
    key: 'estado.vendido',
    bg: 'rgba(122,111,101,0.12)',
    color: 'var(--muted)',
    dot: 'var(--muted)',
  },
};

export default function EstadoBadge({ estado, compact }: { estado: EstadoLote; compact?: boolean }) {
  const t = useT();
  const { key, bg, color, dot } = CONFIG[estado];
  return (
    <span
      className="inline-flex items-center rounded-full font-medium"
      style={{
        background: bg,
        color,
        gap: compact ? 4 : 6,
        fontSize: compact ? '0.6rem' : '0.75rem',
        padding: compact ? '3px 8px' : '4px 10px',
      }}
    >
      <span
        className="rounded-full shrink-0"
        style={{ width: compact ? 4 : 6, height: compact ? 4 : 6, background: dot }}
      />
      {t(key)}
    </span>
  );
}
