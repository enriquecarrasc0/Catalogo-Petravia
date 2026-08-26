/**
 * apps/web/src/store/catalogoStore.ts
 * ─────────────────────────────────────
 * Estado global del catálogo: filtros activos.
 * Zustand → sin boilerplate, fácil de escalar.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FiltrosCatalogo, GrupoMaterial, Acabado, EstadoLote, TipoLote } from '@petravia/shared';
import { FILTROS_DEFAULT } from '@petravia/shared';

interface CatalogoState {
  filtros: FiltrosCatalogo;

  setFiltro<K extends keyof FiltrosCatalogo>(key: K, value: FiltrosCatalogo[K]): void;
  toggleGrupo(grupo: GrupoMaterial): void;
  toggleAcabado(acabado: Acabado): void;
  setEstado(estado: EstadoLote | 'todos'): void;
  setTipo(tipo: TipoLote | 'todos'): void;
  setBusqueda(q: string): void;
  resetFiltros(): void;
}

export const useCatalogoStore = create<CatalogoState>()(
  persist(
    (set, get) => ({
      filtros: { ...FILTROS_DEFAULT },

      setFiltro(key, value) {
        set((s) => ({ filtros: { ...s.filtros, [key]: value } }));
      },

      toggleGrupo(grupo) {
        const current = get().filtros.grupos;
        const next = current.includes(grupo)
          ? current.filter((g: GrupoMaterial) => g !== grupo)
          : [...current, grupo];
        set((s) => ({ filtros: { ...s.filtros, grupos: next } }));
      },

      toggleAcabado(acabado) {
        const current = get().filtros.acabados;
        const next = current.includes(acabado)
          ? current.filter((a: Acabado) => a !== acabado)
          : [...current, acabado];
        set((s) => ({ filtros: { ...s.filtros, acabados: next } }));
      },

      setEstado(estado) {
        set((s) => ({ filtros: { ...s.filtros, estado } }));
      },

      setTipo(tipo) {
        set((s) => ({
          filtros: {
            ...s.filtros,
            tipo,
            // Bloques no tiene filtro de Acabado (es material en bruto,
            // sin acabado superficial) — si venías de Láminas/Formato con
            // uno o más acabados marcados, se quedaban "pegados" en el
            // fondo aunque la interfaz ya no los mostrara, y la búsqueda
            // no encontraba nada porque ningún bloque calza con un
            // acabado que no aplica. Se limpian solo al entrar a Bloques;
            // si vas de Láminas a Formato (o viceversa) se conservan,
            // porque ahí sí tiene sentido mantenerlos.
            acabados: tipo === 'bloque' ? [] : s.filtros.acabados,
          },
        }));
      },

      setBusqueda(q) {
        set((s) => ({ filtros: { ...s.filtros, busqueda: q } }));
      },

      resetFiltros() {
        set((s) => ({ filtros: { ...FILTROS_DEFAULT, tipo: s.filtros.tipo } }));
      },
    }),
    {
      name: 'petravia-catalogo-filters',
      // Persiste solo el tipo elegido (bloque/lámina); el resto de
      // filtros se resetea al recargar.
      partialize: (s) => ({ filtros: { tipo: s.filtros.tipo } }),
      merge: (persisted: any, current: CatalogoState) => ({
        ...current,
        filtros: { ...current.filtros, ...(persisted?.filtros ?? {}) },
      }),
    }
  )
);
