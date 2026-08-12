/**
 * admin.service.ts — apartados enriquecidos con datos de Odoo
 */
import db from '../db/index.js';
import { getAllLotes } from './lotes.service.js';
import type { Apartado, Lote } from '@petravia/shared';

export interface ApartadoAdmin extends Apartado {
  lote?: Pick<Lote, 'id' | 'material' | 'grupo' | 'acabado' | 'tipo' | 'saldoM2' | 'saldoM3' | 'saldoPiezas' | 'fotos'>;
  expirado: boolean;
  minutosRestantes: number;
  vendedorId: string | null;
  vendedorNombre: string | null;
  vendedorUsuario: string | null;
}

function mapRow(r: any, lotesMap: Map<string, Lote>): ApartadoAdmin {
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
    vendedorId:      r.vendedor_id ?? null,
    vendedorNombre:  r.vendedor_nombre ?? null,
    vendedorUsuario: r.vendedor_usuario ?? null,
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

/**
 * Todos los apartados de TODOS los vendedores, con el nombre/usuario del
 * vendedor dueño de cada uno. Solo para el admin.
 */
export async function obtenerTodosApartados(filtro?: string): Promise<ApartadoAdmin[]> {
  let query = `
    SELECT a.*, v.nombre AS vendedor_nombre, v.usuario AS vendedor_usuario
    FROM apartados a
    LEFT JOIN vendedores v ON v.id = a.vendedor_id
    WHERE 1=1`;
  if (filtro === 'pendiente') query += ` AND a.expira_en > datetime('now')`;
  if (filtro === 'expirado')  query += ` AND a.expira_en < datetime('now')`;
  query += ' ORDER BY a.creado_en DESC';

  const rows = db.prepare(query).all() as any[];
  const lotes = await getAllLotes();
  const lotesMap = new Map(lotes.map(l => [l.id, l]));
  return rows.map(r => mapRow(r, lotesMap));
}

export async function obtenerApartadosPorCliente(email: string): Promise<ApartadoAdmin[]> {
  const rows = db.prepare(
    'SELECT * FROM apartados WHERE cliente_email = ? ORDER BY creado_en DESC'
  ).all(email) as any[];
  const lotes = await getAllLotes();
  const lotesMap = new Map(lotes.map(l => [l.id, l]));
  return rows.map(r => mapRow(r, lotesMap));
}

export function obtenerEstadisticas() {
  const ahora = new Date().toISOString();
  return {
    total:      (db.prepare('SELECT COUNT(*) as c FROM apartados').get() as any).c,
    pendientes: (db.prepare(`SELECT COUNT(*) as c FROM apartados WHERE expira_en > ?`).get(ahora) as any).c,
    expirados:  (db.prepare(`SELECT COUNT(*) as c FROM apartados WHERE expira_en < ?`).get(ahora) as any).c,
  };
}

export function obtenerResumenClientes() {
  return db.prepare(`
    SELECT a.cliente_email, a.cliente_nombre,
           COUNT(*) as apartados_activos,
           MAX(a.creado_en) as ultimo_apartado,
           v.nombre AS vendedor_nombre, v.usuario AS vendedor_usuario
    FROM apartados a
    LEFT JOIN vendedores v ON v.id = a.vendedor_id
    WHERE a.expira_en > datetime('now')
    GROUP BY a.cliente_email ORDER BY ultimo_apartado DESC
  `).all();
}
