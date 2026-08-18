import { Link } from 'react-router-dom';
import { ImageOff, Images, Check, ArrowUpRight, MapPin, Heart } from 'lucide-react';
import type { Lote } from '@petravia/shared';
import { formatSaldoLote, formatDimension } from '@petravia/shared';
import EstadoBadge from './EstadoBadge';
import { getVendedorSession } from '@/lib/vendedorSession';
import { useT } from '@/i18n/I18nContext';

interface Props {
  lote: Lote;
  /** Si se provee, se usa este callback en lugar de navegar a /catalogo/:id */
  onClick?: () => void;
  /**
   * Estado de selección (usado en contextos de selección múltiple, ej.
   * BuscadorAvanzado). Cuando está definido, la tarjeta muestra un
   * indicador de check y un enlace aparte para ver el detalle, ya que
   * el clic principal pasa a controlar la selección en vez de navegar.
   */
  seleccionado?: boolean;
  /** Resalta la tarjeta (ej. "cubre solo", sin necesitar combinarse). */
  destacado?: boolean;
  /**
   * Tamaño de la tarjeta. 'default' es la del catálogo principal (3 por
   * fila, texto más grande). 'compact' reduce texto/badges/paddings para
   * contextos con más columnas y menos espacio, como el buscador por
   * metraje — misma imagen protagonista, pero la tarjeta en sí es más chica.
   */
  size?: 'default' | 'compact';
  /**
   * Checkbox circular independiente en la esquina (selección múltiple para
   * apartar varios lotes de un jalón). A diferencia de `seleccionado`, no
   * reemplaza el click principal de la tarjeta: es un control aparte, igual
   * que el círculo blanco de las tarjetas del panel de inventario.
   */
  checkable?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  /**
   * Corazón de favoritos — a diferencia de `checkable` (selección múltiple
   * para apartar), esto NUNCA reserva el lote ni notifica al vendedor: es
   * solo la lista personal del cliente ("me gustó esto"). Va del lado
   * contrario al círculo de selección — esquina superior IZQUIERDA, justo
   * debajo del badge de estado.
   */
  favorito?: boolean;
  onToggleFavorito?: () => void;
}

/**
 * Vista "Showcase" — tarjeta con la foto como protagonista (formato 3/4) y
 * el texto reducido a lo esencial, superpuesto sobre la imagen con un
 * degradado. Es la única vista del catálogo principal, y también se
 * reutiliza (con `size="compact"`) en el buscador avanzado.
 */
export default function LoteCardShowcase({ lote, onClick, seleccionado, destacado, size = 'default', checkable, checked, onToggleCheck, favorito, onToggleFavorito }: Props) {
  const t = useT();
  const foto = lote.fotos[0];
  const esVendido = lote.estado === 'vendido';
  const enModoSeleccion = onClick !== undefined && seleccionado !== undefined;
  const compact = size === 'compact';
  const esVendedorOAdmin = Boolean(getVendedorSession());
  // Medidas de la pieza para mostrar en la preview, justo arriba del metraje
  // total: largo × ancho para láminas/formato, largo × ancho × alto para
  // bloques (formatDimension ya arma ese tercer valor solo si se le pasa).
  const primeraPieza = lote.piezas[0];

  const inner = (
    <div
      className="relative overflow-hidden group/card"
      style={{
        borderRadius: '3px',
        aspectRatio: '4/3',
        background: 'var(--sand)',
        opacity: esVendido ? 0.6 : 1,
        boxShadow: seleccionado || checked
          ? `0 0 0 ${compact ? 2 : 3}px var(--gold)`
          : destacado
          ? '0 0 0 1.5px var(--gold)'
          : 'none',
        transition: 'box-shadow 150ms',
      }}
    >
      {/* Imagen — ocupa toda la tarjeta */}
      {foto ? (
        <img
          src={foto.urlThumb}
          alt={`${lote.material} – Lote ${lote.id}`}
          className="absolute inset-0 w-full h-full transition-transform duration-700 ease-out"
          style={{
            objectFit: 'cover',
            filter: esVendido ? 'grayscale(65%)' : 'none',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          loading="lazy"
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-1.5"
          style={{ color: 'var(--border)' }}
        >
          <ImageOff size={compact ? 22 : 36} strokeWidth={1} />
          <span
            className="uppercase"
            style={{ fontSize: compact ? '0.6rem' : '0.75rem', letterSpacing: '0.15em' }}
          >
            {t('loteCard.sinFoto')}
          </span>
        </div>
      )}

      {/* Degradado inferior para legibilidad del texto sobre la foto */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: compact ? '40%' : '46%',
          background: 'linear-gradient(to top, rgba(20,17,14,0.88) 0%, rgba(20,17,14,0.45) 45%, rgba(20,17,14,0) 100%)',
        }}
      />

      {/* Badge de estado — se oculta cuando hay corazón (vista de cliente):
          el cliente solo ve lotes disponibles, así que decir "Disponible"
          ahí es redundante; el corazón toma ese mismo lugar. Para
          vendedor/admin (sin corazón) el badge sigue mostrando el estado
          real (apartado/vendido), que sí es información útil para ellos. */}
      {!onToggleFavorito && (
        <div className="absolute" style={{ top: compact ? 8 : 12, left: compact ? 8 : 12 }}>
          <EstadoBadge estado={lote.estado} compact={compact} />
        </div>
      )}

      {/* Corazón de favoritos — lado izquierdo (contrario al círculo de
          selección, que va a la derecha), en el lugar del badge de estado.
          A propósito solo el ícono, sin círculo de fondo (mismo tamaño que
          el círculo de selección, pero sin la "pastilla" blanca). */}
      {onToggleFavorito && (
        <button
          type="button"
          title={favorito ? t('loteCard.quitarFavorito') : t('loteCard.agregarFavorito')}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorito(); }}
          className="absolute flex items-center justify-center transition-transform active:scale-90"
          style={{
            top: compact ? 8 : 12, left: compact ? 8 : 12,
            width: compact ? 20 : 26, height: compact ? 20 : 26,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Heart
            size={compact ? 20 : 26}
            color={favorito ? '#e0435a' : 'white'}
            fill={favorito ? '#e0435a' : 'none'}
            strokeWidth={2}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
          />
        </button>
      )}

      {/* Contador de fotos */}
      {lote.fotos.length > 1 && (
        <div
          className="absolute flex items-center gap-1 rounded"
          style={{
            top: compact ? 8 : 12,
            right: checkable ? (compact ? 32 : 46) : enModoSeleccion ? (compact ? 32 : 46) : (compact ? 8 : 12),
            fontSize: compact ? '0.65rem' : '0.75rem',
            padding: compact ? '3px 6px' : '4px 8px',
            background: 'rgba(26,23,20,0.55)', color: 'white', backdropFilter: 'blur(4px)',
          }}
        >
          <Images size={compact ? 9 : 11} />
          +{lote.fotos.length - 1}
        </div>
      )}

      {/* Checkbox de selección múltiple — control independiente del click principal */}
      {checkable && (
        <button
          type="button"
          title={checked ? t('loteCard.quitarSeleccion') : t('loteCard.seleccionarLote')}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleCheck?.(); }}
          className="absolute flex items-center justify-center transition-all"
          style={{
            top: compact ? 8 : 12, right: compact ? 8 : 12,
            width: compact ? 20 : 26, height: compact ? 20 : 26, borderRadius: '50%',
            background: checked ? 'var(--gold)' : 'rgba(255,255,255,0.85)',
            border: checked ? 'none' : '1.5px solid rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            cursor: 'pointer',
          }}
        >
          {checked && <Check size={compact ? 11 : 14} color="white" strokeWidth={2.5} />}
        </button>
      )}

      {/* Indicador de selección (buscador avanzado) */}
      {enModoSeleccion && (
        <div
          className="absolute flex items-center justify-center transition-all"
          style={{
            top: compact ? 8 : 12, right: compact ? 8 : 12,
            width: compact ? 20 : 26, height: compact ? 20 : 26, borderRadius: '50%',
            background: seleccionado ? 'var(--gold)' : 'rgba(26,23,20,0.45)',
            border: seleccionado ? 'none' : '1.5px solid rgba(255,255,255,0.7)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {seleccionado && <Check size={compact ? 11 : 14} color="white" strokeWidth={2.5} />}
        </div>
      )}

      {/* Enlace a detalle — solo en modo selección, ya que el clic principal selecciona */}
      {enModoSeleccion && (
        <Link
          to={`/catalogo/${encodeURIComponent(lote.id)}`}
          onClick={e => e.stopPropagation()}
          title={t('loteCard.verDetalle')}
          className="absolute flex items-center justify-center transition-opacity opacity-0 group-hover/card:opacity-100"
          style={{
            bottom: compact ? 8 : 12, right: compact ? 8 : 12,
            width: compact ? 20 : 26, height: compact ? 20 : 26, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
          }}
        >
          <ArrowUpRight size={compact ? 11 : 14} color="white" strokeWidth={2} />
        </Link>
      )}

      {/* Texto — mínimo, superpuesto sobre el degradado */}
      <div className="absolute inset-x-0 bottom-0" style={{ padding: compact ? '10px' : '20px' }}>
        {esVendedorOAdmin && lote.ubicacion && (
          <p
            className="flex items-center gap-1 truncate"
            style={{ fontSize: compact ? '0.6rem' : '0.68rem', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}
          >
            <MapPin size={compact ? 9 : 10} strokeWidth={2} />
            {lote.ubicacion}
          </p>
        )}
        {primeraPieza && (
          <p
            style={{ fontSize: compact ? '0.65rem' : '0.75rem', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.03em', marginTop: compact ? 3 : 6 }}
          >
            {formatDimension(primeraPieza.largo, primeraPieza.ancho, lote.tipo === 'bloque' ? primeraPieza.grosor : undefined)}
          </p>
        )}
        <div className="flex items-center justify-between" style={{ marginTop: compact ? 3 : 6 }}>
          <p
            className="truncate"
            style={{ fontSize: compact ? '0.65rem' : '0.75rem', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.03em' }}
          >
            {t('loteCard.lote', { id: lote.id })}
          </p>
          {(lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0) : lote.saldoM2) > 0 && (
            <p
              className="font-medium tracking-wide shrink-0"
              style={{ fontSize: compact ? '0.65rem' : '0.75rem', color: '#fff', marginLeft: 6 }}
            >
              {formatSaldoLote(lote)}
            </p>
          )}
        </div>
      </div>

      {/* Línea de acento al hover (se omite en modo selección: el aro dorado ya indica estado) */}
      {!enModoSeleccion && (
        <div
          className="absolute bottom-0 left-0 right-0 transition-transform duration-300 origin-left"
          style={{ height: compact ? 2 : 3, background: 'var(--gold)', transform: 'scaleX(0)' }}
          ref={el => {
            if (!el) return;
            const card = el.closest('a, button, [role="button"]');
            if (!card) return;
            card.addEventListener('mouseenter', () => (el.style.transform = 'scaleX(1)'));
            card.addEventListener('mouseleave', () => (el.style.transform = 'scaleX(0)'));
          }}
        />
      )}
    </div>
  );

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