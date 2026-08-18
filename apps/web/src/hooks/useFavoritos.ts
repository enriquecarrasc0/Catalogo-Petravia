import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Favorito, Lote, SnapshotLote } from '@petravia/shared';

export type { SnapshotLote };

/**
 * Toma la instantánea de un lote (material, foto, m²) tal como se ve en
 * pantalla en este momento, para mandarla al agregarlo a favoritos.
 * Se usa tanto en las tarjetas del catálogo como en la página de detalle
 * del lote — los dos lugares donde se puede dar corazón.
 */
export function snapshotDeLote(lote: Lote): SnapshotLote {
  return {
    material: lote.material,
    grupo: lote.grupo,
    acabado: lote.acabado,
    tipo: lote.tipo,
    saldoM2: lote.saldoM2,
    saldoM3: lote.saldoM3,
    saldoPiezas: lote.saldoPiezas,
    fotoUrl: lote.fotos?.[0]?.urlHd ?? null,
  };
}

/**
 * Hook reactivo (useQuery) para "Mis Favoritos". Se usa tanto en el panel
 * de resumen como en el catálogo (para pintar el corazón lleno/vacío en
 * cada tarjeta) — ambos comparten la misma queryKey, así que solo se pide
 * al backend una vez. Pura lectura local (SQLite) — nunca toca Odoo.
 *
 * A propósito usa `api.favoritos.list()` (el mismo cliente HTTP central
 * que ya usan lotes y apartados) en vez de armar su propio fetch() con su
 * propia URL — así se garantiza que resuelve exactamente igual que el
 * resto de la app, sin depender de una lógica de URL duplicada.
 */
export function useMisFavoritos(clienteToken: string | null) {
  return useQuery({
    queryKey: ['mis-favoritos', clienteToken],
    queryFn: async (): Promise<Favorito[]> => {
      if (!clienteToken) return [];
      return api.favoritos.list(clienteToken);
    },
    enabled: !!clienteToken,
    // Esta lista solo cambia por acciones explícitas del usuario (agregar
    // o quitar un corazón), y esas mutaciones YA actualizan el caché
    // directamente (ver onMutate/onSuccess abajo). No hace falta que React
    // Query la vuelva a pedir sola por antigüedad ni al recuperar el foco
    // de la ventana.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Agrega o quita un lote de favoritos, con actualización optimista.
 *
 * Usa el patrón estándar de React Query (onMutate guarda una foto de la
 * lista y la actualiza al instante; onError la restaura SOLO si la
 * petición de verdad falló; onSuccess reemplaza el registro optimista por
 * el real del servidor).
 */
export function useToggleFavorito(clienteToken: string | null) {
  const qc = useQueryClient();
  const queryKey = ['mis-favoritos', clienteToken];

  const agregar = useMutation({
    mutationFn: async ({ loteId, snapshot }: { loteId: string; snapshot?: SnapshotLote }) => {
      if (!clienteToken) throw new Error('No hay sesión activa');
      return api.favoritos.add(clienteToken, loteId, snapshot);
    },
    onMutate: async ({ loteId, snapshot }) => {
      await qc.cancelQueries({ queryKey });
      const anterior = qc.getQueryData<Favorito[]>(queryKey);
      qc.setQueryData<Favorito[]>(queryKey, (prev = []) => [
        { id: `optimista-${loteId}`, loteId, clienteEmail: '', creadoEn: new Date().toISOString(), ...snapshot },
        ...prev,
      ]);
      return { anterior };
    },
    onError: (_err, _vars, context) => {
      // Solo aquí se deshace — es decir, solo si de verdad falló.
      if (context?.anterior) qc.setQueryData(queryKey, context.anterior);
    },
    onSuccess: (favoritoReal) => {
      // Reemplaza la entrada optimista por la real del servidor (mismo id
      // ya persistido), sin volver a pedir toda la lista.
      qc.setQueryData<Favorito[]>(queryKey, (prev = []) =>
        prev.map(f => f.loteId === favoritoReal.loteId ? favoritoReal : f)
      );
    },
  });

  const quitar = useMutation({
    mutationFn: async (loteId: string) => {
      if (!clienteToken) throw new Error('No hay sesión activa');
      await api.favoritos.remove(clienteToken, loteId);
    },
    onMutate: async (loteId: string) => {
      await qc.cancelQueries({ queryKey });
      const anterior = qc.getQueryData<Favorito[]>(queryKey);
      qc.setQueryData<Favorito[]>(queryKey, (prev = []) => prev.filter(f => f.loteId !== loteId));
      return { anterior };
    },
    onError: (_err, _loteId, context) => {
      if (context?.anterior) qc.setQueryData(queryKey, context.anterior);
    },
  });

  /** Alterna el estado de favorito de un lote (con optimismo, ver arriba).
   *  `snapshot` son los datos del lote tal como se ven en el catálogo en
   *  ese momento — solo hace falta al AGREGAR (al quitar no se usa). */
  function toggle(loteId: string, esFavoritoActual: boolean, snapshot?: SnapshotLote) {
    if (!clienteToken) return;
    if (esFavoritoActual) quitar.mutate(loteId);
    else agregar.mutate({ loteId, snapshot });
  }

  return { toggle, agregar, quitar };
}
