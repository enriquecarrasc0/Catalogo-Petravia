/**
 * apps/web/src/lib/api.ts
 * ────────────────────────
 * Cliente HTTP centralizado.
 * Toda llamada al backend pasa por aquí → un solo lugar para
 * agregar auth headers, interceptores, manejo de errores, etc.
 */
import type { ApiResult, Lote, PaginatedResponse, FiltrosCatalogo } from '@petravia/shared';
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
    headers: {
      'Content-Type': 'application/json',
      ...(sesionVendedor ? { Authorization: `Bearer ${sesionVendedor.token}` } : {}),
      ...init?.headers,
    },
    ...init,
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
};
