/**
 * apps/web/src/lib/api.ts
 * ────────────────────────
 * Cliente HTTP centralizado.
 * Toda llamada al backend pasa por aquí → un solo lugar para
 * agregar auth headers, interceptores, manejo de errores, etc.
 */
import type { ApiResult, Lote, PaginatedResponse, FiltrosCatalogo, Favorito, SnapshotLote } from '@petravia/shared';
import { getVendedorSession } from '@/lib/vendedorSession';

export interface HistorialCompra {
  id: string;
  loteId: string;
  clienteEmail: string;
  clienteNombre: string;
  compradoEn: string;
  material: string | null;
  acabado: string | null;
  saldoM2: number | null;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// Este cliente HTTP lo usan tanto la vista pública de cliente (catálogo,
// galería de materiales, historial de compras) como el catálogo embebido
// del panel de vendedor/admin (CatalogoPage vía onLoteClick). Por eso
// `request()` adjunta el token de sesión de vendedor SOLO si existe en
// sessionStorage de esta misma pestaña — nunca lo inventa ni lo comparte
// entre pestañas (sessionStorage es aislado por pestaña), así que un
// cliente real jamás termina con permisos de admin por accidente. Sin
// esto, el backend no reconocía al vendedor/admin como tal (isVendedorRequest
// devolvía null) y forzaba estado='disponible' + soloRutasPermitidas=true
// sin importar qué filtro eligiera en pantalla — por eso "Todos" no hacía nada.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sesionVendedor = getVendedorSession();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // OJO: "headers" va DESPUÉS de "...init" a propósito. Si fuera al
    // revés, "...init" (que también trae su propio "headers", ej. el
    // Authorization de un cliente) pisaría por completo este objeto
    // combinado y se perdería "Content-Type" — eso es justo lo que pasaba:
    // cualquier POST con body + headers propios (como favoritos) le
    // llegaba al servidor SIN Content-Type, así que express.json() nunca
    // interpretaba el cuerpo como JSON y req.body quedaba vacío.
    headers: {
      'Content-Type': 'application/json',
      ...(sesionVendedor ? { Authorization: `Bearer ${sesionVendedor.token}` } : {}),
      ...init?.headers,
    },
  });

  const json: ApiResult<T> = await res.json();

  if (!res.ok || !json.ok) {
    const msg = (json as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (json as { data: T }).data;
}

// ─── LOTES ───────────────────────────────────────────────────

export type LotesQuery = Partial<FiltrosCatalogo> & {
  page?: number;
  pageSize?: number;
};

export const api = {
  lotes: {
    /**
     * Lista de lotes con filtros y paginación.
     * Los filtros se serializan como query params.
     */
    list(params?: LotesQuery): Promise<PaginatedResponse<Lote>> {
      const qs = params ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '' && (Array.isArray(v) ? v.length > 0 : true))
          .flatMap(([k, v]) => Array.isArray(v) ? v.map((i) => [k, i]) : [[k, String(v)]])
      ).toString() : '';
      return request(`/lotes${qs}`);
    },

    /** Detalle de un lote con todas sus fotos y piezas. */
    get(id: string): Promise<Lote> {
      return request(`/lotes/${encodeURIComponent(id)}`);
    },
  },

  apartados: {
    /** Historial de compras confirmadas del cliente. */
    historial(token: string): Promise<HistorialCompra[]> {
      return request('/apartados/historial', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  },

  // "Favoritos" — a propósito usa el MISMO helper request() que todo lo
  // demás (lotes, apartados), en vez de construir su propia URL por
  // separado. Nunca toca Odoo: guarda/lee una instantánea del lote.
  favoritos: {
    list(token: string): Promise<Favorito[]> {
      return request('/favoritos', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    add(token: string, loteId: string, snapshot: SnapshotLote = {}): Promise<Favorito> {
      return request('/favoritos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ loteId, ...snapshot }),
      });
    },
    remove(token: string, loteId: string): Promise<{ quitado: boolean }> {
      return request(`/favoritos/${encodeURIComponent(loteId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  },
};
