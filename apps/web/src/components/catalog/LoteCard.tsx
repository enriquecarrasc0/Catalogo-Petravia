import { Link } from 'react-router-dom';
import { ImageOff, Images } from 'lucide-react';
import type { Lote } from '@petravia/shared';
import { formatSaldoLote, formatDimension } from '@petravia/shared';
import EstadoBadge from './EstadoBadge';

interface Props {
  lote: Lote;
  /** Si se provee, se usa este callback en lugar de navegar a /catalogo/:id */
  onClick?: () => void;
}

export default function LoteCard({ lote, onClick }: Props) {
  const foto = lote.fotos[0];
  const esVendido = lote.estado === 'vendido';
  const primeraPieza = lote.piezas[0];

  const inner = (
    <div
      className="overflow-hidden transition-all duration-300"
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        opacity: esVendido ? 0.55 : 1,
      }}
    >
      {/* Imagen */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: '4/3', background: 'var(--sand)' }}
      >
        {foto ? (
          <img
            src={foto.urlThumb}
            alt={`${lote.material} – Lote ${lote.id}`}
            className="w-full h-full transition-transform duration-500"
            style={{
              objectFit: 'cover',
              filter: esVendido ? 'grayscale(60%)' : 'none',
              transform: 'scale(1)',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ color: 'var(--border)' }}
          >
            <ImageOff size={28} strokeWidth={1} />
            <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--border)', letterSpacing: '0.15em' }}>Sin foto</span>
          </div>
        )}

        {/* Estado badge */}
        <div className="absolute top-2.5 left-2.5">
          <EstadoBadge estado={lote.estado} />
        </div>

        {/* Contador de fotos */}
        {lote.fotos.length > 1 && (
          <div
            className="absolute bottom-2.5 right-2.5 flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(26,23,20,0.65)', color: 'white', backdropFilter: 'blur(4px)' }}
          >
            <Images size={11} />
            +{lote.fotos.length - 1}
          </div>
        )}

        {/* Línea de acento al hover */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 transition-transform duration-300 origin-left"
          style={{
            background: 'var(--gold)',
            transform: 'scaleX(0)',
          }}
          ref={el => {
            if (!el) return;
            const card = el.closest('a, button, [role="button"]');
            if (!card) return;
            card.addEventListener('mouseenter', () => (el.style.transform = 'scaleX(1)'));
            card.addEventListener('mouseleave', () => (el.style.transform = 'scaleX(0)'));
          }}
        />
      </div>

      {/* Información */}
      <div className="p-3.5">
        <p className="text-xs" style={{ color: 'var(--muted)', letterSpacing: '0.03em' }}>
          Lote {lote.id}
          {lote.acabado && (
            <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
          )}
          {lote.acabado && <span>{lote.acabado}</span>}
        </p>

        {primeraPieza && (
          <p className="text-xs mt-1" style={{ color: 'var(--muted)', letterSpacing: '0.03em' }}>
            {formatDimension(primeraPieza.largo, primeraPieza.ancho, lote.tipo === 'bloque' ? primeraPieza.grosor : undefined)}
          </p>
        )}

        {(lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0) : lote.saldoM2) > 0 && (
          <p
            className="mt-2 text-xs font-medium tracking-wide"
            style={{ color: 'var(--gold-dark)' }}
          >
            {formatSaldoLote(lote)}
          </p>
        )}
      </div>
    </div>
  );

  // Modo admin: div clicable en lugar de Link (no navega fuera de /admin)
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
        className="group block cursor-pointer"
        style={{ textDecoration: 'none' }}
      >
        {inner}
      </div>
    );
  }

  // Modo normal: Link de React Router
  return (
    <Link
      to={`/catalogo/${encodeURIComponent(lote.id)}`}
      className="group block"
      style={{ textDecoration: 'none' }}
    >
      {inner}
    </Link>
  );
}