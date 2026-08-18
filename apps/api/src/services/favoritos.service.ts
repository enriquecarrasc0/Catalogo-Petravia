/**
 * favoritos.service.ts
 * ─────────────────────
 * "Favoritos" del cliente — a diferencia de apartados.service.ts, esto NO
 * reserva el lote ni notifica al vendedor. Es una lista puramente personal
 * ("me gustó esto"), para que el cliente decida después cuáles apartar de
 * verdad desde su resumen de favoritos.
 *
 * A propósito, NUNCA se conecta con Odoo — a diferencia de apartados
 * (que sí necesita enriquecer con getLote()), favoritos guarda una
 * instantánea de los datos del lote (material, foto, m²) en el momento en
 * que el cliente le da corazón — el navegador ya tiene esos datos
 * enfrente en ese instante (viene de la tarjeta del catálogo), así que se
 * mandan una sola vez y quedan en esta misma tabla. Ni guardar ni leer
 * favoritos vuelve a tocar Odoo jamás.
 */
import { randomUUID } from 'crypto';
import db from '../db/index.js';
import type { Favorito } from '@petravia/shared';

/** Instantánea del lote que manda el navegador al agregar un favorito. */
export interface SnapshotLote {
  material?: string | null;
  grupo?: string | null;
  acabado?: string | null;
  tipo?: string | null;
  saldoM2?: number | null;
  saldoM3?: number | null;
  saldoPiezas?: number | null;
  fotoUrl?: string | null;
}

function mapRow(row: any): Favorito {
  return {
    id: row.id,
    loteId: row.lote_id,
    clienteEmail: row.cliente_email,
    creadoEn: row.creado_en,
    material: row.material,
    grupo: row.grupo,
    acabado: row.acabado,
    tipo: row.tipo,
    saldoM2: row.saldo_m2,
    saldoM3: row.saldo_m3,
    saldoPiezas: row.saldo_piezas,
    fotoUrl: row.foto_url,
  };
}

/**
 * Agrega un lote a favoritos con la instantánea de sus datos. Idempotente:
 * si ya estaba, actualiza la instantánea (por si el lote cambió desde
 * entonces) en vez de duplicar o fallar.
 */
export function agregarFavorito(loteId: string, clienteEmail: string, snapshot: SnapshotLote = {}): Favorito {
  const existente = db.prepare(
    'SELECT id FROM favoritos WHERE lote_id = ? AND cliente_email = ?'
  ).get(loteId, clienteEmail) as { id: string } | undefined;

  if (existente) {
    db.prepare(`
      UPDATE favoritos SET material = ?, grupo = ?, acabado = ?, tipo = ?,
        saldo_m2 = ?, saldo_m3 = ?, saldo_piezas = ?, foto_url = ?
      WHERE id = ?
    `).run(
      snapshot.material ?? null, snapshot.grupo ?? null, snapshot.acabado ?? null, snapshot.tipo ?? null,
      snapshot.saldoM2 ?? null, snapshot.saldoM3 ?? null, snapshot.saldoPiezas ?? null, snapshot.fotoUrl ?? null,
      existente.id
    );
    const row = db.prepare('SELECT * FROM favoritos WHERE id = ?').get(existente.id);
    return mapRow(row);
  }

  const id = randomUUID();
  const creadoEn = new Date().toISOString();
  db.prepare(`
    INSERT INTO favoritos (
      id, lote_id, cliente_email, creado_en,
      material, grupo, acabado, tipo, saldo_m2, saldo_m3, saldo_piezas, foto_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, loteId, clienteEmail, creadoEn,
    snapshot.material ?? null, snapshot.grupo ?? null, snapshot.acabado ?? null, snapshot.tipo ?? null,
    snapshot.saldoM2 ?? null, snapshot.saldoM3 ?? null, snapshot.saldoPiezas ?? null, snapshot.fotoUrl ?? null
  );

  return mapRow(db.prepare('SELECT * FROM favoritos WHERE id = ?').get(id));
}

/** Quita un lote de favoritos. Devuelve true si de verdad quitó algo. */
export function quitarFavorito(loteId: string, clienteEmail: string): boolean {
  const result = db.prepare(
    'DELETE FROM favoritos WHERE lote_id = ? AND cliente_email = ?'
  ).run(loteId, clienteEmail);
  return result.changes > 0;
}

/**
 * Lista los favoritos del cliente — pura lectura local, sin tocar Odoo
 * para nada. Los datos de material/foto/m² ya vienen guardados de la
 * instantánea tomada al momento de favoritar.
 */
export function obtenerFavoritosPorCliente(email: string): Favorito[] {
  const rows = db.prepare(`
    SELECT * FROM favoritos WHERE cliente_email = ?
    ORDER BY creado_en DESC
  `).all(email);
  return rows.map(mapRow);
}

export function esFavorito(loteId: string, clienteEmail: string): boolean {
  const r = db.prepare(
    'SELECT COUNT(*) as c FROM favoritos WHERE lote_id = ? AND cliente_email = ?'
  ).get(loteId, clienteEmail) as any;
  return r.c > 0;
}
