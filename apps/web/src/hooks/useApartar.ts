import { useMutation, useQuery } from '@tanstack/react-query';
import type { Apartado, TipoLote } from '@petravia/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface ApartarParams {
  loteId: string;
  clienteToken: string;
}

export interface ApartadoConLote extends Apartado {
  lote: {
    material: string;
    grupo: string;
    acabado: string;
    tipo: TipoLote;
    saldoM2: number;
    saldoM3?: number;
    saldoPiezas: number;
    fotoUrl: string | null;
  } | null;
}

export function useApartar() {
  return useMutation({
    mutationFn: async (params: ApartarParams) => {
      const response = await fetch(`${BASE_URL}/lotes/${encodeURIComponent(params.loteId)}/apartar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.clienteToken}`,
        },
        body: JSON.stringify({}),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Error al apartar');
      return json.data as Apartado;
    },
  });
}

export function useObtenerApartados(clienteToken: string | null) {
  return useMutation({
    mutationFn: async (): Promise<Apartado[]> => {
      if (!clienteToken) return [];
      const response = await fetch(`${BASE_URL}/apartados`, {
        headers: { 'Authorization': `Bearer ${clienteToken}` },
      });
      if (!response.ok) return [];
      const json = await response.json();
      return json.data ?? [];
    },
  });
}

/**
 * Hook reactivo (useQuery) para "Mis Apartados" — incluye datos del lote.
 */
export function useMisApartados(clienteToken: string | null) {
  return useQuery({
    queryKey: ['mis-apartados', clienteToken],
    queryFn: async (): Promise<ApartadoConLote[]> => {
      if (!clienteToken) return [];
      const response = await fetch(`${BASE_URL}/apartados`, {
        headers: { 'Authorization': `Bearer ${clienteToken}` },
      });
      if (!response.ok) return [];
      const json = await response.json();
      return json.data ?? [];
    },
    enabled: !!clienteToken,
    refetchInterval: 60_000, // refrescar cada minuto (expiraciones)
  });
}

export function useLiberarApartado(clienteToken: string | null) {
  return useMutation({
    mutationFn: async (apartadoId: string) => {
      if (!clienteToken) return;
      await fetch(`${BASE_URL}/apartados/${apartadoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${clienteToken}` },
      });
    },
  });
}

/**
 * Genera el PDF final de apartados en el servidor: lo descarga en el
 * navegador y, del lado del backend, envía una copia por correo al
 * cliente y notifica al administrador de la página quién y qué apartó.
 */
export function useDescargarPDFApartados(clienteToken: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!clienteToken) throw new Error('No hay sesión activa');

      const response = await fetch(`${BASE_URL}/apartados/pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clienteToken}` },
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error ?? 'No se pudo generar el PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = extraerNombreArchivo(response.headers.get('Content-Disposition')) ?? 'apartados-petravia.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  });
}

/**
 * Descarga un .zip con las fotos de los lotes indicados (usado desde el
 * buscador avanzado, para lotes que aún no se han apartado). Requiere
 * sesión de cliente igual que apartar, para no exponer el endpoint a
 * scraping anónimo del inventario de fotos.
 */
export function useDescargarFotosZip(clienteToken: string | null) {
  return useMutation({
    mutationFn: async (loteIds: string[]) => {
      if (!clienteToken) throw new Error('No hay sesión activa');
      if (loteIds.length === 0) throw new Error('Selecciona al menos un lote');

      const response = await fetch(`${BASE_URL}/lotes/fotos-zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clienteToken}`,
        },
        body: JSON.stringify({ loteIds }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error ?? 'No se pudieron descargar las fotos');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = extraerNombreArchivo(response.headers.get('Content-Disposition')) ?? 'fotos-petravia.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  });
}

/** Extrae el filename="..." del header Content-Disposition, si viene. */
function extraerNombreArchivo(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? null;
}
