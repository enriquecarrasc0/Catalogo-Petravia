/**
 * OcultarLote.tsx
 * ────────────────
 * Control SOLO PARA ADMIN para sacar un lote del catálogo por un tiempo
 * (clientes y vendedores dejan de verlo; el admin lo sigue viendo, marcado
 * como "Oculto", para poder regresarlo). No toca Odoo: es un overlay local
 * (tabla lotes_ocultos) que vence solo al cumplirse el plazo.
 *
 * Dos presentaciones:
 *  - "tarjeta": botón redondo sobre la foto, con menú de plazos.
 *  - "detalle": fila de texto en el detalle del lote, igual que "Renombrar".
 *
 * Quien lo use debe mostrarlo solo si getVendedorSession()?.esAdmin — el
 * backend de todos modos rechaza (403) a cualquiera que no sea admin.
 */
import { useEffect, useRef, useState } from 'react';
import { EyeOff, Eye, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Lote } from '@petravia/shared';
import { api } from '@/lib/api';

const PLAZOS: Array<{ dias: number | null; etiqueta: string }> = [
  { dias: 1,    etiqueta: '1 día' },
  { dias: 7,    etiqueta: '7 días' },
  { dias: 30,   etiqueta: '30 días' },
  { dias: null, etiqueta: 'Hasta que lo vuelva a mostrar' },
];

export function textoOcultoHasta(hasta: string | null | undefined): string {
  if (!hasta) return 'Oculto';
  const fecha = new Date(hasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `Oculto hasta ${fecha}`;
}

/** Evita que el clic/tecla llegue a la tarjeta (que es un Link o un botón). */
const aislar = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

function useOcultarLote(loteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accion: { dias: number | null } | 'mostrar') =>
      accion === 'mostrar' ? api.lotes.mostrar(loteId) : api.lotes.ocultar(loteId, accion.dias),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lotes'] }),
  });
}

interface Props {
  lote: Pick<Lote, 'id' | 'oculto' | 'ocultoHasta'>;
  variante: 'tarjeta' | 'detalle';
  compact?: boolean;
}

export default function OcultarLote({ lote, variante, compact }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const mutacion = useOcultarLote(lote.id);

  // Cerrar el menú al hacer clic fuera.
  useEffect(() => {
    if (!menuAbierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setMenuAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [menuAbierto]);

  const ejecutar = (accion: { dias: number | null } | 'mostrar') => {
    setMenuAbierto(false);
    mutacion.mutate(accion);
  };

  const menu = menuAbierto && (
    <div
      className="absolute z-30 rounded shadow-lg py-1"
      style={{
        top: '100%', right: variante === 'tarjeta' ? 0 : undefined, left: variante === 'detalle' ? 0 : undefined,
        marginTop: 6, minWidth: 210, background: 'white', border: '1px solid var(--border)',
      }}
    >
      <p className="px-3 pt-1.5 pb-1 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--muted)' }}>
        Ocultar del catálogo por
      </p>
      {PLAZOS.map(p => (
        <button
          key={p.etiqueta}
          type="button"
          onClick={e => { aislar(e); ejecutar({ dias: p.dias }); }}
          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-stone-100"
          style={{ color: 'var(--ink)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );

  // ─── Variante tarjeta ────────────────────────────────────────
  if (variante === 'tarjeta') {
    const lado = compact ? 20 : 26;
    return (
      <div
        ref={contenedor}
        className="relative"
        onClick={aislar}
        onKeyDown={e => e.stopPropagation()}
      >
        <button
          type="button"
          title={lote.oculto ? 'Volver a mostrar en el catálogo' : 'Ocultar temporalmente del catálogo'}
          disabled={mutacion.isPending}
          onClick={e => {
            aislar(e);
            if (lote.oculto) ejecutar('mostrar');
            else setMenuAbierto(v => !v);
          }}
          className="flex items-center justify-center transition-transform active:scale-90"
          style={{
            width: lado, height: lado, borderRadius: '50%',
            background: lote.oculto ? 'var(--gold)' : 'rgba(26,23,20,0.55)',
            border: 'none', backdropFilter: 'blur(4px)', cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        >
          {mutacion.isPending
            ? <Loader2 size={compact ? 10 : 13} color="white" className="animate-spin" />
            : lote.oculto
              ? <Eye size={compact ? 10 : 13} color="white" strokeWidth={2} />
              : <EyeOff size={compact ? 10 : 13} color="white" strokeWidth={2} />}
        </button>
        {menu}
      </div>
    );
  }

  // ─── Variante detalle ────────────────────────────────────────
  return (
    <div ref={contenedor} className="relative mt-4">
      {lote.oculto ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: 'rgba(26,23,20,0.08)', color: 'var(--ink)' }}
          >
            <EyeOff size={12} />
            {textoOcultoHasta(lote.ocultoHasta)} — clientes y vendedores no lo ven
          </span>
          <button
            type="button"
            onClick={() => ejecutar('mostrar')}
            disabled={mutacion.isPending}
            className="flex items-center gap-1.5 uppercase"
            style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}
          >
            {mutacion.isPending ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
            Volver a mostrar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMenuAbierto(v => !v)}
          disabled={mutacion.isPending}
          className="flex items-center gap-2 text-xs uppercase transition-colors"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}
        >
          {mutacion.isPending ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
          Ocultar temporalmente del catálogo
        </button>
      )}
      {mutacion.isError && (
        <p className="mt-2 text-xs" style={{ color: '#b42318' }}>{(mutacion.error as Error).message}</p>
      )}
      {menu}
    </div>
  );
}
