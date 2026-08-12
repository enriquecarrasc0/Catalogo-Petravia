/**
 * MaterialesGaleria.tsx
 * ───────────────────────
 * Vista de exploración "por material": una tarjeta por cada grupo de
 * material (Terracota, Puebla, Veracruz…) con una foto representativa
 * curada a mano. Al hacer clic, filtra el catálogo por ese material.
 * Reemplaza el antiguo filtro "Material" como dropdown.
 */
import { useQueries } from '@tanstack/react-query';
import { ImageOff, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/I18nContext';
import { useCatalogoStore } from '@/store/catalogoStore';
import type { GrupoMaterial } from '@petravia/shared';

export const GRUPOS_MATERIAL: GrupoMaterial[] = [
  'Puebla', 'Veracruz', 'Terracota', 'Caramel Ivory', 'Santo Tomas', 'Aqua Blue', 'Vintage', 'Otros',
];

// Fotos representativas curadas a mano (una por material, /public/materiales).
// Se eligieron por mostrar bien la veta y el acabado típico de cada grupo.
// "Otros" no tiene foto fija: usa la del primer lote disponible en inventario.
const FOTO_MATERIAL: Partial<Record<GrupoMaterial, string>> = {
  'Puebla': '/materiales/puebla.webp',
  'Veracruz': '/materiales/veracruz.webp',
  'Terracota': '/materiales/terracota.webp',
  'Caramel Ivory': '/materiales/caramel-ivory.webp',
  'Santo Tomas': '/materiales/santo-tomas.webp',
  'Aqua Blue': '/materiales/aqua-blue.webp',
  'Vintage': '/materiales/vintage.webp',
};

interface Props {
  onSelect: (grupo: GrupoMaterial) => void;
}

export default function MaterialesGaleria({ onSelect }: Props) {
  const { t, tCount } = useI18n();
  // Respeta el filtro "Estado" activo (antes estaba fijo en 'disponible',
  // por eso cambiar el filtro no afectaba los conteos de esta galería).
  const estadoFiltro = useCatalogoStore(s => s.filtros.estado);
  // Una consulta liviana por material (solo para el conteo de "X lotes
  // disponibles"); si no hay foto curada, se usa la del primer lote como
  // respaldo para que ninguna tarjeta quede vacía.
  const resultados = useQueries({
    queries: GRUPOS_MATERIAL.map((g) => ({
      queryKey: ['materiales-preview', g, estadoFiltro],
      queryFn: () => api.lotes.list({ grupos: [g], estado: estadoFiltro, page: 1, pageSize: 1 }),
      staleTime: 5 * 60 * 1000,
    })),
  });

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: 'var(--gold-dark)' }}>
          {t('materialesGaleria.eyebrow')}
        </p>
        <h2 className="font-display font-light" style={{ fontSize: '1.7rem', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          {t('materialesGaleria.titulo')}
        </h2>
        <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
          {t('materialesGaleria.subtitulo')}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {GRUPOS_MATERIAL.map((g, i) => {
          const q = resultados[i];
          const total = q.data?.total ?? 0;
          const fotoRespaldo = q.data?.items?.[0]?.fotos?.[0]?.urlThumb;
          const foto = FOTO_MATERIAL[g] ?? fotoRespaldo;

          return (
            <button
              key={g}
              onClick={() => onSelect(g)}
              className="group relative overflow-hidden text-left"
              style={{
                borderRadius: '6px',
                aspectRatio: '4/3',
                background: 'var(--sand)',
                boxShadow: '0 1px 3px rgba(20,17,14,0.08)',
              }}
            >
              {foto ? (
                <img
                  src={foto}
                  alt={g}
                  className="absolute inset-0 w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                  style={{ objectFit: 'cover', objectPosition: 'center' }}
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ color: 'var(--border)' }}>
                  <ImageOff size={26} strokeWidth={1} />
                </div>
              )}

              {/* Degradado inferior para legibilidad del texto */}
              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{
                  height: '70%',
                  background: 'linear-gradient(to top, rgba(20,17,14,0.85) 0%, rgba(20,17,14,0.32) 60%, rgba(20,17,14,0) 100%)',
                }}
              />

              {/* Halo de acento al hover */}
              <div
                className="absolute inset-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 0 2px var(--gold)', borderRadius: '6px' }}
              />

              <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-2">
                <div>
                  <p className="font-display leading-tight" style={{ fontSize: '1.1rem', color: '#fff', fontWeight: 400 }}>
                    {g}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                    {q.isLoading ? t('materialesGaleria.cargando') : total > 0 ? tCount('materialesGaleria.lotesDisponibles', total) : t('materialesGaleria.consultarDisponibilidad')}
                  </p>
                </div>

                <div
                  className="flex items-center justify-center shrink-0 transition-all duration-300 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0"
                  style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gold)' }}
                >
                  <ArrowRight size={13} color="#fff" strokeWidth={2} />
                </div>
              </div>

              {/* Línea de acento al hover */}
              <div
                className="absolute bottom-0 left-0 right-0 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                style={{ height: 3, background: 'var(--gold)' }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
