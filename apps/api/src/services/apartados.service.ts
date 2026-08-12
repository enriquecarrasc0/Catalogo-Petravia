/**
 * apartados.service.ts
 * ─────────────────────
 * Reservas temporales de lotes (48h). NO depende de la tabla `lotes`
 * (los datos de lotes viven en Odoo). La disponibilidad se verifica
 * contra Odoo a través de getAllLotes().
 */
import { randomUUID } from 'crypto';
import db from '../db/index.js';
import { getAllLotes, getLote, esUbicacionVisibleParaCliente } from './lotes.service.js';
import type { Apartado, Foto, Pieza, TipoLote } from '@petravia/shared';

export interface HistorialCompra {
  id: string;
  loteId: string;
  vendedorId: string | null;
  clienteEmail: string;
  clienteNombre: string;
  compradoEn: string;
  material: string | null;
  acabado: string | null;
  saldoM2: number | null;
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
    /** Todas las fotos del lote (no solo la primera) — usadas en el PDF tipo catálogo. */
    fotos: Foto[];
    /** Desglose de medidas disponibles (largo/ancho/piezas/m²) — usado en la tabla del PDF. */
    piezas: Pieza[];
  } | null;
}

export interface ApartarParams {
  loteId: string;
  vendedorId: string;
  clienteEmail: string;
  clienteNombre: string;
  /** Duración de la reserva en horas (por defecto 48). Solo se usa desde apartarLoteVendedor. */
  horas?: number;
  /** true cuando lo aparta un vendedor/admin desde su panel: se salta la
   *  restricción de "ubicación visible para cliente" (esa regla solo
   *  aplica al flujo de autoservicio del cliente). */
  esVendedor?: boolean;
}

export interface ApartarResult {
  ok: boolean;
  apartado?: Apartado;
  error?: string;
}

export async function apartarLote(params: ApartarParams): Promise<ApartarResult> {
  try {
    // 1. Verificar que el lote existe en Odoo y está disponible
    const lotes = await getAllLotes();
    const lote  = lotes.find(l => l.id === params.loteId);

    if (!lote) return { ok: false, error: 'Lote no encontrado' };
    // Este endpoint solo lo usan clientes (requiere token de cliente) — no
    // deben poder apartar lotes fuera de las rutas de ubicación permitidas,
    // aunque conozcan el ID directamente. Un vendedor/admin sí puede
    // apartar cualquier lote del inventario completo.
    if (!params.esVendedor && !esUbicacionVisibleParaCliente(lote.ubicacion, lote.tipo)) return { ok: false, error: 'Lote no encontrado' };
    if (lote.estado === 'vendido')  return { ok: false, error: 'Este lote ya fue vendido' };
    if (lote.estado === 'apartado') return { ok: false, error: 'Este lote ya está apartado' };

    // 2. Crear el apartado
    const apartadoId = randomUUID();
    const ahora    = new Date();
    const horas    = params.horas && params.horas > 0 ? params.horas : 48;
    const expiraEn = new Date(ahora.getTime() + horas * 60 * 60 * 1000);

    db.prepare(`
      INSERT INTO apartados (id, lote_id, vendedor_id, cliente_email, cliente_nombre, creado_en, expira_en)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(apartadoId, params.loteId, params.vendedorId, params.clienteEmail, params.clienteNombre,
           ahora.toISOString(), expiraEn.toISOString());

    return {
      ok: true,
      apartado: {
        id: apartadoId, loteId: params.loteId,
        clienteEmail: params.clienteEmail, clienteNombre: params.clienteNombre,
        creadoEn: ahora.toISOString(), expiraEn: expiraEn.toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function obtenerApartadosPorCliente(email: string): Apartado[] {
  return db.prepare(`
    SELECT id, lote_id as loteId, cliente_email as clienteEmail,
           cliente_nombre as clienteNombre,
           creado_en as creadoEn, expira_en as expiraEn
    FROM apartados WHERE cliente_email = ? AND expira_en > datetime('now')
    ORDER BY creado_en DESC
  `).all(email) as Apartado[];
}

/**
 * Igual que obtenerApartadosPorCliente pero enriquecido con los datos
 * del lote (material, acabado, m², foto). Se usa tanto en GET /api/apartados
 * como en la generación del PDF / envío de correos.
 */
export async function obtenerApartadosEnriquecidos(email: string): Promise<ApartadoConLote[]> {
  const apartados = obtenerApartadosPorCliente(email);
  return Promise.all(
    apartados.map(async (ap) => {
      const lote = await getLote(ap.loteId);
      return {
        ...ap,
        lote: lote ? {
          material: lote.material,
          grupo: lote.grupo,
          acabado: lote.acabado,
          tipo: lote.tipo,
          saldoM2: lote.saldoM2,
          saldoM3: lote.saldoM3,
          saldoPiezas: lote.saldoPiezas,
          fotoUrl: lote.fotos?.[0]?.urlHd ?? null,
          fotos: lote.fotos ?? [],
          piezas: lote.piezas ?? [],
        } : null,
      };
    })
  );
}

export function loteEstaApartado(loteId: string): boolean {
  const r = db.prepare(`
    SELECT COUNT(*) as c FROM apartados WHERE lote_id = ? AND expira_en > datetime('now')
  `).get(loteId) as any;
  return r.c > 0;
}

export function obtenerApartadoPorId(apartadoId: string): { id: string; loteId: string; vendedorId: string | null; clienteEmail: string } | null {
  const row = db.prepare(
    'SELECT id, lote_id, vendedor_id, cliente_email FROM apartados WHERE id = ?'
  ).get(apartadoId) as any;
  if (!row) return null;
  return { id: row.id, loteId: row.lote_id, vendedorId: row.vendedor_id, clienteEmail: row.cliente_email };
}

/** Libera un apartado. Si se pasa vendedorId, solo libera si le pertenece. */
export function liberarApartado(apartadoId: string, vendedorId?: string): boolean {
  const result = vendedorId
    ? db.prepare('DELETE FROM apartados WHERE id = ? AND vendedor_id = ?').run(apartadoId, vendedorId)
    : db.prepare('DELETE FROM apartados WHERE id = ?').run(apartadoId);
  return result.changes > 0;
}

/** Confirma la venta de un apartado. Si se pasa vendedorId, solo confirma si le pertenece. */
export function confirmarVenta(apartadoId: string, vendedorId?: string): boolean {
  const query = vendedorId
    ? 'SELECT id, lote_id, vendedor_id, cliente_email, cliente_nombre FROM apartados WHERE id = ? AND vendedor_id = ?'
    : 'SELECT id, lote_id, vendedor_id, cliente_email, cliente_nombre FROM apartados WHERE id = ?';
  const apartado = vendedorId
    ? db.prepare(query).get(apartadoId, vendedorId) as any
    : db.prepare(query).get(apartadoId) as any;
  if (!apartado) return false;

  // Marcar como vendido localmente (overlay) y eliminar apartados de ese lote
  db.prepare(`
    INSERT INTO ventas_locales (lote_id, vendido_en) VALUES (?, datetime('now'))
    ON CONFLICT(lote_id) DO UPDATE SET vendido_en = datetime('now')
  `).run(apartado.lote_id);

  // Guardar en historial permanente de compras
  db.prepare(`
    INSERT INTO historial_compras (id, lote_id, vendedor_id, cliente_email, cliente_nombre, comprado_en)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(randomUUID(), apartado.lote_id, apartado.vendedor_id, apartado.cliente_email, apartado.cliente_nombre);

  db.prepare('DELETE FROM apartados WHERE lote_id = ?').run(apartado.lote_id);
  return true;
}

export function obtenerHistorialPorCliente(email: string): HistorialCompra[] {
  return db.prepare(`
    SELECT id, lote_id as loteId, vendedor_id as vendedorId, cliente_email as clienteEmail,
           cliente_nombre as clienteNombre, comprado_en as compradoEn,
           material, acabado, saldo_m2 as saldoM2
    FROM historial_compras
    WHERE cliente_email = ?
    ORDER BY comprado_en DESC
  `).all(email) as HistorialCompra[];
}

/**
 * Prorroga un apartado sumando horas a su expiración actual.
 * Si se pasa vendedorId, solo prorroga si el apartado le pertenece.
 * `horas` puede ser negativo para acortar el plazo si algún día se necesita.
 */
export function prorrogarApartado(apartadoId: string, horas: number, vendedorId?: string): Apartado | null {
  const query = vendedorId
    ? 'SELECT id, lote_id as loteId, cliente_email as clienteEmail, cliente_nombre as clienteNombre, creado_en as creadoEn, expira_en as expiraEn FROM apartados WHERE id = ? AND vendedor_id = ?'
    : 'SELECT id, lote_id as loteId, cliente_email as clienteEmail, cliente_nombre as clienteNombre, creado_en as creadoEn, expira_en as expiraEn FROM apartados WHERE id = ?';
  const apartado = vendedorId
    ? db.prepare(query).get(apartadoId, vendedorId) as Apartado | undefined
    : db.prepare(query).get(apartadoId) as Apartado | undefined;
  if (!apartado) return null;

  // Se suma a partir de "ahora" (no de la expiración previa) para que la
  // prórroga tenga efecto real incluso si el apartado ya había expirado.
  const base = new Date(Math.max(Date.now(), new Date(apartado.expiraEn).getTime()));
  const nuevaExpira = new Date(base.getTime() + horas * 60 * 60 * 1000);

  db.prepare('UPDATE apartados SET expira_en = ? WHERE id = ?').run(nuevaExpira.toISOString(), apartadoId);

  return { ...apartado, expiraEn: nuevaExpira.toISOString() };
}

/** Limpia apartados expirados (llamado periódicamente) */
export function limpiarApartadosExpirados(): number {
  const result = db.prepare(`DELETE FROM apartados WHERE expira_en <= datetime('now')`).run();
  return result.changes;
}