/**
 * apps/web/src/hooks/useLotes.ts
 * ──────────────────────────────
 * Hooks de datos para el catálogo usando React Query.
 * Separa la capa de datos de los componentes.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCatalogoStore } from '@/store/catalogoStore';

// ─── Lista de lotes con filtros ───────────────────────────────

export function useLotes(page = 1, pageSize = 24) {
  const filtros = useCatalogoStore((s) => s.filtros);

  return useQuery({
    queryKey: ['lotes', filtros, page, pageSize],
    queryFn: () => api.lotes.list({ ...filtros, page, pageSize }),
    placeholderData: (prev) => prev, // mantiene datos anteriores durante refetch
  });
}

// ─── Detalle de un lote ───────────────────────────────────────

export function useLote(id: string) {
  return useQuery({
    queryKey: ['lotes', id],
    queryFn: () => api.lotes.get(id),
    enabled: Boolean(id),
  });
}
