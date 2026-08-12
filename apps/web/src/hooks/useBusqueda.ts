/**
 * apps/web/src/hooks/useBusqueda.ts
 * ─────────────────────────────────
 * Hook para búsqueda avanzada de lotes.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Lote, ComboLotes } from '@petravia/shared';

export interface BusquedaParams {
  material?: string;
  grupo?: string;
  metraje?: number;
  tipo?: 'bloque' | 'lamina' | 'formato';
  /** Medidas mínimas en cm — largo/ancho para láminas y formato; altoMin
   *  (junto con largo/ancho) para bloques. */
  largoMin?: number;
  anchoMin?: number;
  altoMin?: number;
}

export interface ResultadoBusqueda {
  individual: Lote[];
  combos: Array<{
    lotes: Lote[];
    metrajeTotal: number;
    diferencia: number;
  }>;
}

/**
 * Hook para búsqueda avanzada.
 */
export function useBusquedaLotes() {
  return useMutation({
    mutationFn: async (params: BusquedaParams): Promise<ResultadoBusqueda> => {
      const query = new URLSearchParams();
      if (params.material) query.append('material', params.material);
      if (params.grupo) query.append('grupo', params.grupo);
      if (params.metraje) query.append('metraje', params.metraje.toString());
      if (params.tipo) query.append('tipo', params.tipo);
      if (params.largoMin) query.append('largoMin', params.largoMin.toString());
      if (params.anchoMin) query.append('anchoMin', params.anchoMin.toString());
      if (params.altoMin) query.append('altoMin', params.altoMin.toString());

      const response = await fetch(`/api/lotes/buscar?${query.toString()}`);
      if (!response.ok) throw new Error('Búsqueda fallida');

      const data = await response.json();
      return data.data;
    },
  });
}

/**
 * Hook para obtener materiales disponibles. Filtrados por tipo (bloque/
 * lámina/formato) para no mezclar materiales de un tipo con el selector
 * de otro — ej. buscar en "Bloques" no debe listar materiales de Formato.
 */
export function useMateriales(tipo?: 'bloque' | 'lamina' | 'formato') {
  return useQuery({
    queryKey: ['materiales', tipo],
    queryFn: async () => {
      const qs = tipo ? `?tipo=${encodeURIComponent(tipo)}` : '';
      const response = await fetch(`/api/lotes/filtros/materiales${qs}`);
      if (!response.ok) throw new Error('Error obteniendo materiales');
      const data = await response.json();
      return data.data as string[];
    },
  });
}

/**
 * Hook para obtener grupos disponibles.
 */
export function useGrupos() {
  return useQuery({
    queryKey: ['grupos'],
    queryFn: async () => {
      const response = await fetch('/api/lotes/filtros/grupos');
      if (!response.ok) throw new Error('Error obteniendo grupos');
      const data = await response.json();
      return data.data as string[];
    },
  });
}