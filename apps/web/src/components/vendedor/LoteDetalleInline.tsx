/**
 * LoteDetalleInline.tsx
 * ──────────────────────
 * Vista de detalle de un lote para usarse DENTRO del panel de vendedor
 * (tab Catálogo), sin navegar fuera de /vendedor. Así las pestañas de
 * arriba (Apartados / Tokens / Catálogo) nunca desaparecen.
 */
import { useState } from 'react';
import { ArrowLeft, ImageOff, Expand, X, ChevronLeft, ChevronRight, Clock, Loader2, CheckCircle2, Pencil, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import EstadoBadge from '@/components/catalog/EstadoBadge';
import { formatM2, formatM3, formatSaldoLote, formatDimension, parseTituloLote, GRUPOS_MATERIALES, ACABADOS_CONOCIDOS, type Lote } from '@petravia/shared';
import { getVendedorSession } from '@/lib/vendedorSession';

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const HORAS_DEFAULT = 48;

interface Props {
  loteId: string;
  onVolver: () => void;
}

// ─── Fetch autenticado (vendedor/admin) ───────────────────────
// A diferencia de useLote()/api.lotes.get (usado por el catálogo público),
// aquí SÍ debemos enviar el Authorization: Bearer <token de sesión> para
// que el backend nos reconozca como vendedor/admin y nos deje ver lotes
// que no estén en estado "disponible" (apartados, vendidos, etc.).
// Si no se envía este header, el backend responde 404 "Lote no encontrado"
// aunque el lote exista, porque lo trata como una petición de cliente público.
async function fetchLoteAutenticado(loteId: string): Promise<Lote> {
  const res = await fetch(`${BASE}/lotes/${encodeURIComponent(loteId)}`, {
    headers: vendedorHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo cargar el lote');
  return json.data as Lote;
}

function useLoteAutenticado(loteId: string) {
  return useQuery({
    queryKey: ['lote-admin', loteId, getVendedorSession()?.vendedorId],
    queryFn: () => fetchLoteAutenticado(loteId),
    enabled: Boolean(loteId),
  });
}

export default function LoteDetalleInline({ loteId, onVolver }: Props) {
  const { data: lote, isLoading } = useLoteAutenticado(loteId);
  const [fotoActual, setFotoActual] = useState(0);
  const [lightboxAbierto, setLightboxAbierto] = useState(false);

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
          Lote no encontrado
        </p>
        <button
          onClick={onVolver}
          className="text-sm"
          style={{ color: 'var(--gold-dark)', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--gold-dark)' }}
        >
          Volver al catálogo
        </button>
      </div>
    );
  }

  const foto = lote.fotos[fotoActual];
  const { titulo, presentacion } = parseTituloLote(lote.material, lote.grupo, lote.acabado);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Breadcrumb / volver */}
      <button
        onClick={onVolver}
        className="inline-flex items-center gap-2 text-xs tracking-widest uppercase mb-8 transition-colors"
        style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.12em' }}
      >
        <ArrowLeft size={13} strokeWidth={1.5} />
        Catálogo
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Galería */}
        <div>
          <div
            className="relative overflow-hidden group"
            style={{ aspectRatio: '4/3', background: 'var(--sand)', borderRadius: '2px' }}
          >
            {foto ? (
              <>
                <img
                  src={foto.urlHd}
                  alt={`Lote ${lote.id}`}
                  className="w-full h-full cursor-zoom-in"
                  style={{ objectFit: 'cover' }}
                  onClick={() => setLightboxAbierto(true)}
                />
                <button
                  onClick={() => setLightboxAbierto(true)}
                  className="absolute bottom-3 right-3 flex items-center justify-center w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(10,8,6,0.6)', color: 'white', backdropFilter: 'blur(4px)' }}
                  title="Ver en pantalla completa"
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
                <span className="text-xs tracking-widest uppercase">Sin fotografía</span>
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
            <EstadoBadge estado={lote.estado} />
          </div>

          {presentacion && (
            <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
              {presentacion}
            </p>
          )}

          <div className="flex items-center gap-3 mb-8">
            <p className="text-xs tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.1em' }}>
              Lote {lote.id}
            </p>
            {lote.renombrado && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--gold-dark)' }}>
                <Pencil size={11} /> Renombrado manualmente
              </span>
            )}
          </div>

          <div className="mb-8" style={{ height: '1px', background: 'var(--gold)', width: '48px' }} />

          <dl className="space-y-4">
            {lote.acabado && <Row label="Acabado" value={lote.acabado} />}
            {lote.grupo && <Row label="Material" value={lote.grupo} />}
            {lote.ubicacion && <Row label="Ubicación" value={lote.ubicacion} />}
            {(lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0) : lote.saldoM2) > 0 && (
              <Row label="Saldo disponible" value={formatSaldoLote(lote)} accent />
            )}
            {lote.saldoPiezas > 0 && <Row label="Piezas" value={String(lote.saldoPiezas)} />}
          </dl>

          <RenombrarMaterial lote={lote} />

          {lote.piezas.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--muted)' }}>
                Dimensiones disponibles
              </h3>
              <div className="space-y-0">
                {lote.piezas.map((p, i) => (
                  <div key={i} style={{ borderBottom: '1px solid var(--border)' }} className="py-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: 'var(--ink)' }}>{formatDimension(p.largo, p.ancho, p.grosor)}</span>
                      <span style={{ color: 'var(--muted)' }}>{p.piezas} pzs · {p.m3 != null ? formatM3(p.m3) : formatM2(p.m2)}</span>
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>Largo: <strong style={{ color: 'var(--ink)' }}>{p.largo} cm</strong></span>
                      <span>Ancho: <strong style={{ color: 'var(--ink)' }}>{p.ancho} cm</strong></span>
                      {p.grosor !== undefined && p.grosor > 0 && (
                        <span>Grosor: <strong style={{ color: 'var(--ink)' }}>{p.grosor} cm</strong></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lote.estado === 'disponible' && (
            <ApartarVendedor loteId={lote.id} />
          )}
        </div>
      </div>

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

// ─── Apartar (vendedor) ──────────────────────────────────────
// Permite al vendedor apartar el lote a nombre de uno de sus clientes,
// eligiendo cuántas horas durará la reserva (48h por defecto).

interface ClienteOpcion { email: string; nombre?: string }

function vendedorHeaders(): Record<string, string> {
  const sesion = getVendedorSession();
  return {
    'Content-Type': 'application/json',
    ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
  };
}

function ApartarVendedor({ loteId }: { loteId: string }) {
  const qc = useQueryClient();
  const [clienteEmail, setClienteEmail] = useState('');
  const [horas, setHoras] = useState(HORAS_DEFAULT);
  const [hecho, setHecho] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ['vendedor-tokens-mini', getVendedorSession()?.vendedorId],
    queryFn: async (): Promise<ClienteOpcion[]> => {
      const res = await fetch(`${BASE}/auth/tokens`, { headers: vendedorHeaders() });
      const json = await res.json();
      if (!res.ok) return [];
      return (json.data as any[])
        .filter(r => r.es_activo ?? r.esActivo)
        .map(r => ({ email: r.email, nombre: r.nombre }));
    },
    enabled: !!getVendedorSession(),
  });

  const apartar = useMutation({
    mutationFn: async () => {
      const cliente = clientes.find(c => c.email === clienteEmail);
      const res = await fetch(`${BASE}/lotes/${encodeURIComponent(loteId)}/apartar-vendedor`, {
        method: 'POST',
        headers: vendedorHeaders(),
        body: JSON.stringify({ clienteEmail, clienteNombre: cliente?.nombre, horas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo apartar el lote');
      return json.data;
    },
    onSuccess: () => {
      setHecho(true);
      qc.invalidateQueries({ queryKey: ['lote-admin', loteId] });
      qc.invalidateQueries({ queryKey: ['vendedor-apartados'] });
    },
  });

  if (hecho) {
    return (
      <div className="mt-8 flex items-center gap-2 text-sm py-3" style={{ color: 'var(--gold-dark)' }}>
        <CheckCircle2 size={16} />
        Lote apartado por {horas}h a nombre de {clienteEmail}.
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
      <h3 className="text-xs tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--muted)' }}>
        Apartar este lote
      </h3>

      <div className="space-y-3">
        <select
          value={clienteEmail}
          onChange={e => setClienteEmail(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded"
          style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--ink)' }}
        >
          <option value="">Selecciona un cliente…</option>
          {clientes.map(c => (
            <option key={c.email} value={c.email}>
              {c.nombre ? `${c.nombre} — ${c.email}` : c.email}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Clock size={14} style={{ color: 'var(--muted)' }} />
          <label className="text-sm" style={{ color: 'var(--muted)' }}>Duración de la reserva:</label>
          <input
            type="number"
            min={1}
            max={720}
            value={horas}
            onChange={e => setHoras(Math.max(1, Math.min(720, Number(e.target.value) || HORAS_DEFAULT)))}
            className="w-20 text-sm px-2 py-1 rounded text-right"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--ink)' }}
          />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>horas</span>
        </div>

        {apartar.isError && (
          <p className="text-xs" style={{ color: '#b91c1c' }}>{(apartar.error as Error).message}</p>
        )}

        <button
          onClick={() => apartar.mutate()}
          disabled={!clienteEmail || apartar.isPending}
          className="w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded transition-opacity disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'white', border: 'none', cursor: clienteEmail ? 'pointer' : 'not-allowed' }}
        >
          {apartar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
          Apartar por {horas}h
        </button>
      </div>
    </div>
  );
}

// ─── Renombrar material / acabado ────────────────────────────
// Permite corregir la clasificación de un lote (grupo de material y/o
// acabado) eligiendo de las listas ya conocidas, sin tocar Odoo. Se
// guarda como overlay local (tabla lote_overrides) y se puede restablecer.

function RenombrarMaterial({ lote }: { lote: Lote }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [grupo, setGrupo] = useState(lote.grupo);
  const [acabado, setAcabado] = useState(lote.acabado);

  const guardar = useMutation({
    mutationFn: async (datos: { grupo?: string; acabado?: string }) => {
      const res = await fetch(`${BASE}/lotes/${encodeURIComponent(lote.id)}/renombrar`, {
        method: 'PUT',
        headers: vendedorHeaders(),
        body: JSON.stringify(datos),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo renombrar el lote');
      return json.data;
    },
    onSuccess: () => {
      setEditando(false);
      qc.invalidateQueries({ queryKey: ['lotes'] });
      qc.invalidateQueries({ queryKey: ['lote-admin', lote.id] });
    },
  });

  if (!editando) {
    return (
      <button
        onClick={() => { setGrupo(lote.grupo); setAcabado(lote.acabado); setEditando(true); }}
        className="mt-8 flex items-center gap-2 text-xs tracking-widest uppercase transition-colors"
        style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}
      >
        <Pencil size={12} />
        Renombrar material / acabado
      </button>
    );
  }

  return (
    <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
      <h3 className="text-xs tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--muted)' }}>
        Renombrar material y acabado
      </h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>Material (grupo)</label>
          <select
            value={grupo}
            onChange={e => setGrupo(e.target.value as Lote['grupo'])}
            className="w-full text-sm px-3 py-2 rounded"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            {GRUPOS_MATERIALES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>Acabado</label>
          <select
            value={acabado}
            onChange={e => setAcabado(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            <option value="">Sin acabado</option>
            {ACABADOS_CONOCIDOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {guardar.isError && (
          <p className="text-xs" style={{ color: '#b91c1c' }}>{(guardar.error as Error).message}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => guardar.mutate({ grupo, acabado })}
            disabled={guardar.isPending}
            className="flex-1 flex items-center justify-center gap-2 text-sm py-2.5 rounded transition-opacity disabled:opacity-50"
            style={{ background: 'var(--ink)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>

          {lote.renombrado && (
            <button
              onClick={() => guardar.mutate({})}
              disabled={guardar.isPending}
              title="Restablecer al material original de Odoo"
              className="flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded transition-opacity disabled:opacity-50"
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}
            >
              <RotateCcw size={14} />
            </button>
          )}

          <button
            onClick={() => setEditando(false)}
            className="text-sm px-3 py-2.5 rounded"
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox (mismo comportamiento que en LoteDetallePage) ─────

function Lightbox({ fotos, inicial, onClose }: { fotos: { id: string; urlHd: string }[]; inicial: number; onClose: () => void }) {
  const [idx, setIdx] = useState(inicial);
  const prev = () => setIdx(i => (i - 1 + fotos.length) % fotos.length);
  const next = () => setIdx(i => (i + 1) % fotos.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10,8,6,0.93)' }}
      onClick={onClose}
    >
      <img
        src={fotos[idx].urlHd}
        alt=""
        className="max-h-[90vh] max-w-[90vw]"
        style={{ objectFit: 'contain', borderRadius: '2px', boxShadow: '0 8px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
      >
        <X size={16} />
      </button>
      {fotos.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-5 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </div>
  );
}