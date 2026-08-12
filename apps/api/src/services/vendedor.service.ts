/**
 * vendedor.service.ts — apartados enriquecidos con datos de Odoo,
 * siempre acotados a los clientes/apartados de un vendedor específico.
 */
import db from '../db/index.js';
import { getAllLotes } from './lotes.service.js';
import type { Apartado, Lote } from '@petravia/shared';

export interface ApartadoVendedor extends Apartado {
  lote?: Pick<Lote, 'id' | 'material' | 'grupo' | 'acabado' | 'tipo' | 'saldoM2' | 'saldoM3' | 'saldoPiezas' | 'fotos'>;
  expirado: boolean;
  minutosRestantes: number;
}

function mapRow(r: any, lotesMap: Map<string, Lote>): ApartadoVendedor {
  const ahora  = Date.now();
  const expira = new Date(r.expira_en).getTime();
  return {
    id:            r.id,
    loteId:        r.lote_id,
    clienteEmail:  r.cliente_email,
    clienteNombre: r.cliente_nombre,
    creadoEn:      r.creado_en,
    expiraEn:      r.expira_en,
    expirado:      expira < ahora,
    minutosRestantes: Math.max(0, Math.round((expira - ahora) / 60000)),
    lote: lotesMap.get(r.lote_id) ? {
      id:          lotesMap.get(r.lote_id)!.id,
      material:    lotesMap.get(r.lote_id)!.material,
      grupo:       lotesMap.get(r.lote_id)!.grupo,
      acabado:     lotesMap.get(r.lote_id)!.acabado,
      tipo:        lotesMap.get(r.lote_id)!.tipo,
      saldoM2:     lotesMap.get(r.lote_id)!.saldoM2,
      saldoM3:     lotesMap.get(r.lote_id)!.saldoM3,
      saldoPiezas: lotesMap.get(r.lote_id)!.saldoPiezas,
      fotos:       lotesMap.get(r.lote_id)!.fotos.slice(0, 1), // solo primera foto
    } : undefined,
  };
}

export async function obtenerApartadosDeVendedor(vendedorId: string, filtro?: string): Promise<ApartadoVendedor[]> {
  let query = 'SELECT * FROM apartados WHERE vendedor_id = ?';
  if (filtro === 'pendiente') query += ` AND expira_en > datetime('now')`;
  if (filtro === 'expirado')  query += ` AND expira_en < datetime('now')`;
  query += ' ORDER BY creado_en DESC';

  const rows = db.prepare(query).all(vendedorId) as any[];
  const lotes = await getAllLotes();
  const lotesMap = new Map(lotes.map(l => [l.id, l]));
  return rows.map(r => mapRow(r, lotesMap));
}

export function obtenerEstadisticasDeVendedor(vendedorId: string) {
  const ahora = new Date().toISOString();
  return {
    total:      (db.prepare('SELECT COUNT(*) as c FROM apartados WHERE vendedor_id = ?').get(vendedorId) as any).c,
    pendientes: (db.prepare(`SELECT COUNT(*) as c FROM apartados WHERE vendedor_id = ? AND expira_en > ?`).get(vendedorId, ahora) as any).c,
    expirados:  (db.prepare(`SELECT COUNT(*) as c FROM apartados WHERE vendedor_id = ? AND expira_en < ?`).get(vendedorId, ahora) as any).c,
  };
}

export function obtenerResumenClientesDeVendedor(vendedorId: string) {
  return db.prepare(`
    SELECT cliente_email, cliente_nombre,
           COUNT(*) as apartados_activos,
           MAX(creado_en) as ultimo_apartado
    FROM apartados WHERE vendedor_id = ? AND expira_en > datetime('now')
    GROUP BY cliente_email ORDER BY ultimo_apartado DESC
  `).all(vendedorId);
}
