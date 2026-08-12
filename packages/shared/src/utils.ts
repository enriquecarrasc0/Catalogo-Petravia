/**
 * packages/shared/src/utils.ts
 * ────────────────────────────
 * Lógica de normalización extraída de los scripts originales.
 * Reutilizable en frontend (filtros, display) y backend (ingesta).
 */

import type { GrupoMaterial, EstadoLote, Lote } from './types';

// ─── NORMALIZACIÓN DE LOTES ──────────────────────────────────

/**
 * Estandariza cualquier formato de lote a "X 000".
 * "F590", "F.590", "F-590" → "F 590"
 */
export function estandarizarLote(s: string): string {
  const limpio = s.replace(/\s+/g, '').toUpperCase();
  const m = limpio.match(/^([A-Z])[-.]?(\d+)$/);
  return m ? `${m[1]} ${m[2]}` : limpio;
}

// ─── CLASIFICACIÓN DE MATERIALES ─────────────────────────────

const GRUPO_REGLAS: Array<[RegExp, GrupoMaterial]> = [
  [/PUEBLA/i,                              'Puebla'],
  [/VERACRUZ|^VER|^CC/i,                  'Veracruz'],
  [/TERRACOTA/i,                           'Terracota'],
  [/CARAMEL|IVORY/i,                      'Caramel Ivory'],
  [/SANTO\s*TOMAS|STO\s*TOM/i,            'Santo Tomas'],
  [/AQUA\s*BL(UE|U)/i,                    'Aqua Blue'],
  [/VINTAGE/i,                            'Vintage'],
];

export function grupoMaterial(material: string): GrupoMaterial {
  const upper = material.toUpperCase();
  for (const [regex, grupo] of GRUPO_REGLAS) {
    if (regex.test(upper)) return grupo;
  }
  return 'Otros';
}

// ─── ESTADO DEL LOTE ─────────────────────────────────────────

export function estadoLote(lote: Pick<Lote, 'saldoPiezas' | 'pedido'>): EstadoLote {
  if (lote.saldoPiezas === 0) return 'vendido';
  if (lote.pedido) return 'apartado';
  return 'disponible';
}

// ─── FORMATEO PARA DISPLAY ───────────────────────────────────

export function formatM2(m2: number): string {
  return `${m2.toFixed(2)} m²`;
}

export function formatM3(m3: number): string {
  return `${m3.toFixed(2)} m³`;
}

/** Saldo disponible con la unidad correcta según el tipo de lote (bloque → m³, lámina → m²). */
export function formatSaldoLote(lote: Pick<Lote, 'tipo' | 'saldoM2' | 'saldoM3'>): string {
  return lote.tipo === 'bloque' ? formatM3(lote.saldoM3 ?? 0) : formatM2(lote.saldoM2);
}

/**
 * Palabra corta para el rótulo de una lámina en las tarjetas del catálogo
 * (donde no hay espacio para el nombre completo del material). Usa la
 * misma presentación que separa `parseTituloLote` — lo que viene antes
 * del paréntesis en el nombre crudo, ej. "Formato" o "Lamina Bruta" — pero
 * se queda solo con la primera palabra ("Formato" / "Lamina"), y cae en
 * "Lámina" como genérico si el nombre no trae esa estructura.
 */
export function etiquetaLamina(material: string): string {
  const idxParen = material.indexOf('(');
  const prefijo = (idxParen > -1 ? material.slice(0, idxParen) : '').trim();
  const primeraPalabra = prefijo.split(/\s+/)[0];
  return primeraPalabra || 'Lámina';
}

export function formatDimension(largo: number, ancho: number, grosor?: number): string {
  return grosor && grosor > 0
    ? `${largo} × ${ancho} × ${grosor} cm`
    : `${largo} × ${ancho} cm`;
}

/**
 * El nombre crudo de Odoo trae la forma "{Presentación} ({Material} {Calidad}, ..., {Acabado})",
 * ej. "Formato (Veracruz VC STD, Retape, Spazzolato)". Esto arma un título corto y
 * legible ("Veracruz STD, Spazzolato") separado de la presentación ("Formato"),
 * en vez de mostrar el nombre crudo completo tal cual viene de Odoo.
 */
const CALIDAD_RE = /\b(STD|PRIMERA)\b/i;

export function parseTituloLote(material: string, grupo: string, acabado: string): { titulo: string; presentacion: string } {
  const idxParen = material.indexOf('(');
  const presentacion = (idxParen > -1 ? material.slice(0, idxParen) : material).trim();
  const dentro = idxParen > -1 ? material.slice(idxParen + 1).replace(/\)\s*$/, '') : '';

  const calidadMatch = dentro.match(CALIDAD_RE);
  const calidad = calidadMatch ? (calidadMatch[1].toUpperCase() === 'STD' ? 'STD' : 'Primera') : '';

  const encabezado = [grupo, calidad].filter(Boolean).join(' ');
  const titulo = [encabezado, acabado].filter(Boolean).join(', ');

  return { titulo: titulo || material, presentacion };
}

// ─── ORDENACIÓN DEL CATÁLOGO ─────────────────────────────────

const ORDEN_GRUPOS: GrupoMaterial[] = [
  'Puebla', 'Veracruz', 'Terracota', 'Caramel Ivory', 'Santo Tomas', 'Aqua Blue', 'Vintage', 'Otros',
];

export function ordenLote(a: Lote, b: Lote): number {
  const gi = ORDEN_GRUPOS.indexOf(a.grupo);
  const gj = ORDEN_GRUPOS.indexOf(b.grupo);
  if (gi !== gj) return gi - gj;
  // vendidos al final
  if (a.estado === 'vendido' && b.estado !== 'vendido') return 1;
  if (b.estado === 'vendido' && a.estado !== 'vendido') return -1;
  // mayor saldo primero — volumen para bloques, área para láminas
  const saldoA = a.tipo === 'bloque' ? (a.saldoM3 ?? 0) : a.saldoM2;
  const saldoB = b.tipo === 'bloque' ? (b.saldoM3 ?? 0) : b.saldoM2;
  return saldoB - saldoA;
}