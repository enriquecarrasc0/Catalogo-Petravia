/**
 * apps/api/src/config/ubicacionesCliente.ts
 * ──────────────────────────────────────────
 * Ubicaciones de inventario ("rutas") de Odoo cuyos lotes SÍ pueden
 * mostrarse como disponibles en el catálogo público (clientes).
 *
 * Vendedores y admin no se filtran por esta lista: siempre ven el
 * inventario completo, sin importar la ubicación.
 *
 * Odoo renombró las ubicaciones y ahora el criterio de visibilidad
 * depende del TIPO de producto, no solo del nombre de la ubicación
 * (antes bastaba con una lista fija de nombres exactos):
 *
 *   · Bloques          → solo ubicaciones cuyo nombre final (tras la
 *                         última "/") sea exactamente "Existencias",
 *                         sin importar el almacén — TMM1/Existencias,
 *                         XTM1/Existencias, XTM2/Existencias. Ubicaciones
 *                         como "TMM1/Blocks" o "TMM2/Blocks" quedan
 *                         fuera: ahí el bloque todavía no está listo
 *                         para catálogo.
 *
 *   · Lámina / Formato → solo ubicaciones cuyo nombre final contenga
 *                         "alm" (de "almacén" = ya en bodega, listo para
 *                         vender), ej. "TMM1/Formato alm",
 *                         "TMM1/Lamina alm", "TMM2/Lamina alm". Quedan
 *                         fuera "Recuperacion" y "Posproducción" — ahí el
 *                         material todavía está en proceso.
 *
 * Si Odoo vuelve a renombrar ubicaciones, solo hay que ajustar las dos
 * reglas de abajo (`esExistencias` / `contieneAlmacen`), no una lista.
 */
import type { TipoLote } from '@petravia/shared';

/** Último segmento del path de ubicación, normalizado (ej. "TMM1/Formato alm" → "formato alm"). */
function nombreFinal(ubicacion: string): string {
  const partes = ubicacion.split('/');
  return partes[partes.length - 1].trim().toLowerCase();
}

/**
 * Determina si una ubicación (nombre completo devuelto por Odoo, ej.
 * "TMM1/Existencias" o, si Odoo antepone el almacén/ruta padre,
 * "WH/Stock/TMM1/Existencias") corresponde a una ruta visible para
 * clientes — la regla depende del tipo de lote (bloque vs. lámina/formato).
 *
 * Si no se indica `tipo` (compatibilidad con llamadas antiguas), se aplica
 * la regla más restrictiva de las dos ("alm") para no exponer de más.
 */
export function esUbicacionVisibleParaCliente(ubicacion?: string | null, tipo?: TipoLote): boolean {
  if (!ubicacion) return false;
  const nombre = nombreFinal(ubicacion);

  if (tipo === 'bloque') {
    return nombre === 'existencias';
  }
  // Lámina, Formato, o tipo desconocido.
  return nombre.includes('alm');
}
