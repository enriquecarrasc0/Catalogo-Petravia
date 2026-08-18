import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ImageOff, Package, Expand, X, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useLote } from '@/hooks/useLotes';
import EstadoBadge from '@/components/catalog/EstadoBadge';
import ApartarModal from '@/components/catalog/ApartarModal';
import { useCurrentClient } from '@/hooks/useClientAuth';
import { useMisFavoritos, useToggleFavorito, snapshotDeLote } from '@/hooks/useFavoritos';
import { useT } from '@/i18n/I18nContext';
import { formatM2, formatM3, formatSaldoLote, formatDimension, parseTituloLote } from '@petravia/shared';

// ─── Lightbox ─────────────────────────────────────────────────

interface LightboxProps {
  fotos: { id: string; urlHd: string }[];
  inicial: number;
  onClose: () => void;
}

function Lightbox({ fotos, inicial, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(inicial);

  const prev = useCallback(() => setIdx(i => (i - 1 + fotos.length) % fotos.length), [fotos.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % fotos.length), [fotos.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: 'rgba(10,8,6,0.93)' }}
      onClick={onClose}
    >
      {/* Imagen */}
      <img
        src={fotos[idx].urlHd}
        alt=""
        className="max-h-[90vh] max-w-[90vw]"
        style={{ objectFit: 'contain', borderRadius: '2px', boxShadow: '0 8px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      />

      {/* Cerrar */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
      >
        <X size={16} />
      </button>

      {/* Navegación */}
      {fotos.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-5 flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-5 flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <ChevronRight size={20} />
          </button>

          {/* Contador */}
          <div
            className="absolute bottom-5 text-xs tracking-widest"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {idx + 1} / {fotos.length}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

// ─── Página principal ─────────────────────────────────────────

export default function LoteDetallePage() {
  const { loteId } = useParams<{ loteId: string }>();
  const { data: lote, isLoading } = useLote(loteId ?? '');
  const [fotoActual, setFotoActual] = useState(0);
  const [isApartarOpen, setIsApartarOpen] = useState(false);
  const [lightboxAbierto, setLightboxAbierto] = useState(false);
  const client = useCurrentClient();
  const t = useT();
  const { data: favoritos = [] } = useMisFavoritos(client?.token ?? null);
  const { toggle: toggleFavorito } = useToggleFavorito(client?.token ?? null);
  const esFavorito = lote ? favoritos.some(f => f.loteId === lote.id) : false;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="h-96 animate-pulse rounded" style={{ background: 'var(--sand)' }} />
      </div>
    );
  }

  if (!lote) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center" style={{ color: 'var(--muted)' }}>
        <p className="font-display text-2xl font-light mb-4" style={{ color: 'var(--ink)' }}>
          {t('loteDetalle.loteNoEncontrado')}
        </p>
        <Link
          to="/catalogo"
          className="text-sm"
          style={{ color: 'var(--gold-dark)', textDecoration: 'none', borderBottom: '1px solid var(--gold-dark)' }}
        >
          {t('loteDetalle.volverCatalogo')}
        </Link>
      </div>
    );
  }

  const foto = lote.fotos[fotoActual];
  // Para bloques ya no se muestra material alguno en el detalle (petición
  // de negocio) — título genérico y sin subtítulo de presentación.
  const { titulo, presentacion } = lote.tipo === 'bloque'
    ? { titulo: t('loteDetalle.bloqueTitulo'), presentacion: '' }
    : parseTituloLote(lote.material, lote.grupo, lote.acabado);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">

      {/* Breadcrumb */}
      <Link
        to="/catalogo"
        className="inline-flex items-center gap-2 text-xs tracking-widest uppercase mb-8 transition-colors"
        style={{ color: 'var(--muted)', textDecoration: 'none', letterSpacing: '0.12em' }}
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        {t('loteDetalle.catalogo')}
      </Link>

      {/* La galería ocupa más proporción que la info (3:2) para que la foto
          tenga más presencia — se aplica a bloque, lámina y formato por igual. */}
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-12">

        {/* Galería */}
        <div>
          <div
            className="relative overflow-hidden group flex items-center justify-center"
            style={{ aspectRatio: '4/3', background: 'var(--sand)', borderRadius: '2px' }}
          >
            {foto ? (
              <>
                <img
                  src={foto.urlHd}
                  alt={`Lote ${lote.id}`}
                  className="w-full h-full cursor-zoom-in"
                  style={{ objectFit: 'contain' }}
                  onClick={() => setLightboxAbierto(true)}
                />
                {/* Botón expandir */}
                <button
                  onClick={() => setLightboxAbierto(true)}
                  className="absolute bottom-3 right-3 flex items-center justify-center w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(10,8,6,0.6)', color: 'white', backdropFilter: 'blur(4px)' }}
                  title={t('loteDetalle.verPantallaCompleta')}
                >
                  <Expand size={14} />
                </button>
              </>
            ) : (
              <div
                className="w-full h-full flex flex-col items-center justify-center gap-3"
                style={{ color: 'var(--border)' }}
              >
                <ImageOff size={40} strokeWidth={1} />
                <span className="text-xs tracking-widest uppercase">{t('loteDetalle.sinFotografia')}</span>
              </div>
            )}
          </div>

          {/* Miniaturas */}
          {lote.fotos.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {lote.fotos.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setFotoActual(i)}
                  className="shrink-0 overflow-hidden transition-all"
                  style={{
                    width: '64px', height: '64px', borderRadius: '2px',
                    border: `2px solid ${i === fotoActual ? 'var(--gold)' : 'var(--border)'}`,
                    padding: 0, cursor: 'pointer', background: 'none',
                  }}
                >
                  <img src={f.urlThumb} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Datos */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h1
              className="font-display font-light"
              style={{ fontSize: '2rem', color: 'var(--ink)', lineHeight: 1.2 }}
            >
              {titulo}
            </h1>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <EstadoBadge estado={lote.estado} />
              {client && (
                <button
                  type="button"
                  onClick={() => toggleFavorito(lote.id, esFavorito, snapshotDeLote(lote))}
                  title={esFavorito ? t('loteCard.quitarFavorito') : t('loteCard.agregarFavorito')}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: esFavorito ? '#e0435a' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Heart size={15} fill={esFavorito ? '#e0435a' : 'none'} strokeWidth={2} />
                  {t(esFavorito ? 'loteCard.quitarFavorito' : 'loteCard.agregarFavorito')}
                </button>
              )}
            </div>
          </div>

          {presentacion && (
            <p
              className="text-sm mb-1"
              style={{ color: 'var(--muted)' }}
            >
              {presentacion}
            </p>
          )}

          <p className="text-xs tracking-wider mb-8" style={{ color: 'var(--muted)', letterSpacing: '0.1em' }}>
            {t('loteDetalle.lote', { id: lote.id })}
          </p>

          <div className="mb-8" style={{ height: '1px', background: 'var(--gold)', width: '48px' }} />

          {/* Dimensiones — para bloques van primero y con más peso visual:
              es el dato que más le importa a un cliente que compra bloque
              (un bloque es una sola pieza, así que aquí no hay "variantes"
              que listar más abajo). Para láminas/formato se mantiene el
              detalle abajo, donde sí puede haber varias medidas distintas. */}
          {lote.tipo === 'bloque' && lote.piezas[0] && (
            <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs tracking-[0.15em] uppercase mb-3" style={{ color: 'var(--muted)' }}>
                {t('loteDetalle.dimensiones')}
              </p>
              <div className="flex" style={{ background: 'var(--sand)', borderRadius: '3px' }}>
                {[
                  { label: t('loteDetalle.largo'), value: lote.piezas[0].largo },
                  { label: t('loteDetalle.ancho'), value: lote.piezas[0].ancho },
                  ...(lote.piezas[0].grosor ? [{ label: t('loteDetalle.alto'), value: lote.piezas[0].grosor }] : []),
                ].map((d, i) => (
                  <div
                    key={d.label}
                    className="flex-1 text-center py-5"
                    style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}
                  >
                    <p className="font-display font-light" style={{ fontSize: '2rem', color: 'var(--ink)', lineHeight: 1 }}>
                      {d.value}
                      <span style={{ fontSize: '0.95rem', color: 'var(--muted)', marginLeft: 3 }}>cm</span>
                    </p>
                    <p className="text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--gold-dark)' }}>
                      {d.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <dl className="space-y-4">
            {lote.acabado && <Row label={t('loteDetalle.acabado')} value={t(`acabado.${lote.acabado}`)} />}
            {lote.grupo && lote.tipo !== 'bloque' && <Row label={t('loteDetalle.material')} value={lote.grupo} />}
            {(lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0) : lote.saldoM2) > 0 && (
              <Row label={t('loteDetalle.saldoDisponible')} value={formatSaldoLote(lote)} accent />
            )}
            {/* Piezas se omite en bloques: siempre es 1, no aporta información. */}
            {lote.saldoPiezas > 0 && lote.tipo !== 'bloque' && <Row label={t('loteDetalle.piezas')} value={String(lote.saldoPiezas)} />}
          </dl>

          {client && lote.estado === 'disponible' && (
            <button
              onClick={() => setIsApartarOpen(true)}
              className="w-full mt-8 py-3 transition-all text-sm tracking-[0.1em] uppercase font-medium"
              style={{ background: 'var(--gold)', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--gold-dark)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--gold)')}
            >
              <Package size={16} className="inline mr-2" />
              {t('loteDetalle.apartarLote')}
            </button>
          )}

          {!client && lote.estado === 'disponible' && (
            <div
              className="w-full mt-8 py-3 text-center text-xs tracking-[0.1em] uppercase"
              style={{ background: 'var(--sand)', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--muted)' }}
            >
              {t('loteDetalle.iniciaSesion')}
            </div>
          )}

          {/* Para bloques la dimensión ya se mostró arriba, con prioridad —
              esta lista solo aporta valor en láminas/formato, donde puede
              haber varias medidas distintas dentro del mismo lote. */}
          {lote.tipo !== 'bloque' && lote.piezas.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--muted)' }}>
                {t('loteDetalle.dimensionesDisponibles')}
              </h3>
              <div className="space-y-0">
                {lote.piezas.map((p, i) => (
                  <div key={i} style={{ borderBottom: '1px solid var(--border)' }} className="py-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: 'var(--ink)' }}>{formatDimension(p.largo, p.ancho, p.grosor)}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {p.piezas} pzs · {p.m3 != null ? formatM3(p.m3) : formatM2(p.m2)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>{t('loteDetalle.largo')}: <strong style={{ color: 'var(--ink)' }}>{p.largo} cm</strong></span>
                      <span>{t('loteDetalle.ancho')}: <strong style={{ color: 'var(--ink)' }}>{p.ancho} cm</strong></span>
                      {p.grosor !== undefined && p.grosor > 0 && (
                        <span>{t('loteDetalle.grosor')}: <strong style={{ color: 'var(--ink)' }}>{p.grosor} cm</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ApartarModal lote={lote} isOpen={isApartarOpen} onClose={() => setIsApartarOpen(false)} />

      {lightboxAbierto && (
        <Lightbox
          fotos={lote.fotos}
          inicial={fotoActual}
          onClose={() => setLightboxAbierto(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-baseline text-sm pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <dt style={{ color: 'var(--muted)' }}>{label}</dt>
      <dd style={{ color: accent ? 'var(--gold-dark)' : 'var(--ink)', fontWeight: accent ? 500 : 300 }}>{value}</dd>
    </div>
  );
}