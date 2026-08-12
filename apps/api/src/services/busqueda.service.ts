/**
 * apps/api/src/services/busqueda.service.ts
 */
import { getAllLotes, esUbicacionVisibleParaCliente } from './lotes.service.js';
import type { Lote, TipoLote } from '@petravia/shared';

export interface BusquedaParams {
  material?: string;
  grupo?: string;
  metraje?: number;
  /** Medidas mínimas en cm — largo/ancho para láminas y formato; altoMin
   *  (largo/ancho/alto) aplica a bloques. Se filtra sobre la única pieza
   *  de cada lote (ver Pieza en lotes.service.ts — un lote siempre trae
   *  como máximo una). */
  largoMin?: number;
  anchoMin?: number;
  altoMin?: number;
  /**
   * Tipo de producto a buscar. Es obligatorio para que el metraje se
   * interprete correctamente: en láminas el metraje son m² (`saldoM2`),
   * en bloques son m³ (`saldoM3`) — mezclar ambos en una misma búsqueda
   * no tiene sentido físico, así que se filtra siempre por un solo tipo.
   * Si no se especifica, se asume 'lamina' (comportamiento histórico).
   */
  tipo?: 'bloque' | 'lamina' | 'formato';
  solo_disponibles?: boolean;
  /** Este endpoint no distingue vendedor/admin — solo lo usa el buscador
   *  del cliente en el catálogo público — por eso se filtra por rutas
   *  permitidas siempre que no se indique lo contrario explícitamente. */
  soloRutasPermitidas?: boolean;
}

export interface ComboLotes {
  lotes: Lote[];
  metrajeTotal: number;
  diferencia: number;
}

export interface ResultadoBusqueda {
  individual: Lote[];
  combos: ComboLotes[];
}

export async function buscarLotes(params: BusquedaParams): Promise<ResultadoBusqueda> {
  const todos = await getAllLotes();
  const tipoBusqueda: 'bloque' | 'lamina' | 'formato' = params.tipo ?? 'lamina';

  // El "metraje" de un lote depende de su tipo: m³ (volumen) en bloques,
  // m² (área) en láminas. Los bloques siempre traen saldoM2 = 0, así que
  // buscar por m² en ellos nunca encontraba nada.
  const metrica = (l: Lote): number => (tipoBusqueda === 'bloque' ? (l.saldoM3 ?? 0) : l.saldoM2);

  const candidatos = todos.filter(l => {
    if (params.solo_disponibles !== false && l.estado !== 'disponible') return false;
    if (params.soloRutasPermitidas !== false && !esUbicacionVisibleParaCliente(l.ubicacion, l.tipo)) return false;
    // No se combinan bloques y láminas en un mismo resultado — unidades distintas.
    if (l.tipo !== tipoBusqueda) return false;
    if (params.material && !l.material.toLowerCase().includes(params.material.toLowerCase())) return false;
    if (params.grupo    && l.grupo !== params.grupo) return false;
    // Medidas mínimas — se comparan contra la (única) pieza del lote.
    // Sin desglose de piezas, un lote no puede cumplir un mínimo de medida.
    if (params.largoMin || params.anchoMin || params.altoMin) {
      const pieza = l.piezas[0];
      if (!pieza) return false;
      if (params.largoMin && pieza.largo < params.largoMin) return false;
      if (params.anchoMin && pieza.ancho < params.anchoMin) return false;
      if (params.altoMin  && (pieza.grosor ?? 0) < params.altoMin) return false;
    }
    return true;
  });

  if (!params.metraje || params.metraje <= 0) {
    return { individual: candidatos, combos: [] };
  }

  const meta = params.metraje;
  const TOLERANCE = 0.20; // hasta 20% de exceso es aceptable (preferido)

  // Lotes que solos cubren el metraje
  const individual = candidatos
    .filter(l => metrica(l) >= meta)
    .sort((a, b) => metrica(a) - metrica(b));

  // Si no hay ningún lote individual que cubra la meta, los combos son
  // la ÚNICA forma de cumplir el pedido — no se descartan por exceso,
  // solo se prioriza el menor exceso posible.
  const maxTotal = individual.length > 0 ? meta * (1 + TOLERANCE) : Infinity;

  // Combos: buscar en TODOS los candidatos con metrica > 0
  // (incluyendo los que cubren solos — pueden combinarse entre ellos)
  const pool = candidatos.filter(l => metrica(l) > 0);
  const combos: ComboLotes[] = [];

  // Combos de 2
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const total = metrica(pool[i]) + metrica(pool[j]);
      if (total >= meta && total <= maxTotal) {
        combos.push({
          lotes: [pool[i], pool[j]],
          metrajeTotal: parseFloat(total.toFixed(2)),
          diferencia:   parseFloat((total - meta).toFixed(2)),
        });
      }
    }
  }

  // Combos de 3 (si hay pocos de 2 o ninguno individual)
  if (combos.length < 8 || individual.length === 0) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const parcial = metrica(pool[i]) + metrica(pool[j]);
        if (parcial >= maxTotal) continue; // ya se pasó del límite
        for (let k = j + 1; k < pool.length; k++) {
          const total = parcial + metrica(pool[k]);
          if (total >= meta && total <= maxTotal) {
            combos.push({
              lotes: [pool[i], pool[j], pool[k]],
              metrajeTotal: parseFloat(total.toFixed(2)),
              diferencia:   parseFloat((total - meta).toFixed(2)),
            });
          }
        }
      }
    }
  }

  combos.sort((a, b) => a.diferencia - b.diferencia);

  return { individual, combos: combos.slice(0, 10) };
}

export async function obtenerMateriales(tipo?: TipoLote): Promise<string[]> {
  const lotes = await getAllLotes();
  const set = new Set(
    lotes
      .filter(l => l.estado === 'disponible' && (!tipo || l.tipo === tipo))
      .map(l => l.material)
  );
  return Array.from(set).sort();
}

export async function obtenerGrupos(): Promise<string[]> {
  const lotes = await getAllLotes();
  const set = new Set(lotes.filter(l => l.estado === 'disponible').map(l => l.grupo));
  return Array.from(set).sort();
}