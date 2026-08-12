/**
 * apps/api/src/services/tokens.service.ts
 * ──────────────────────────────────────
 * Gestión de tokens de autenticación de clientes.
 * Cada vendedor da de alta y administra únicamente los tokens
 * (clientes) que él mismo generó.
 */
import { randomUUID } from 'crypto';
import db from '../db/index.js';

export interface ClientToken {
  id: string;
  token: string;
  vendedorId: string;
  email: string;
  nombre?: string;
  esActivo: boolean;
  creadoEn: string;
  ultimoUso?: string;
  expiraEn?: string;
}

function mapRow(row: any): ClientToken {
  return {
    id: row.id,
    token: row.token,
    vendedorId: row.vendedor_id,
    email: row.email,
    nombre: row.nombre,
    esActivo: Boolean(row.es_activo),
    creadoEn: row.creado_en,
    ultimoUso: row.ultimo_uso,
    expiraEn: row.expira_en,
  };
}

/**
 * Genera un nuevo token para un cliente, asociado al vendedor que lo crea.
 */
export function generarToken(vendedorId: string, email: string, nombre?: string): ClientToken {
  const id = randomUUID();
  const token = randomUUID();
  const ahora = new Date().toISOString();

  db.prepare(`
    INSERT INTO client_tokens (id, token, vendedor_id, email, nombre, es_activo, creado_en)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(id, token, vendedorId, email, nombre ?? null, ahora);

  return { id, token, vendedorId, email, nombre, esActivo: true, creadoEn: ahora };
}

/**
 * Valida un token y retorna los datos del cliente (incluye a qué vendedor pertenece).
 */
export function validarToken(token: string): ClientToken | null {
  const row = db.prepare(`
    SELECT id, token, vendedor_id, email, nombre, es_activo, creado_en, ultimo_uso, expira_en
    FROM client_tokens
    WHERE token = ? AND es_activo = 1
  `).get(token) as any;

  if (!row) return null;

  db.prepare(`UPDATE client_tokens SET ultimo_uso = ? WHERE id = ?`).run(new Date().toISOString(), row.id);

  return mapRow(row);
}

/**
 * Lista los tokens (clientes) que pertenecen a un vendedor específico.
 */
export function listarTokens(vendedorId: string): ClientToken[] {
  const rows = db.prepare(`
    SELECT id, token, vendedor_id, email, nombre, es_activo, creado_en, ultimo_uso, expira_en
    FROM client_tokens
    WHERE vendedor_id = ?
    ORDER BY creado_en DESC
  `).all(vendedorId) as any[];

  return rows.map(mapRow);
}

/**
 * Lista TODOS los tokens (clientes) de TODOS los vendedores, con el
 * nombre/usuario del vendedor dueño de cada uno. Solo para el admin.
 */
export function listarTodosLosTokens(): Array<ClientToken & { vendedorNombre: string | null; vendedorUsuario: string | null }> {
  const rows = db.prepare(`
    SELECT ct.id, ct.token, ct.vendedor_id, ct.email, ct.nombre, ct.es_activo,
           ct.creado_en, ct.ultimo_uso, ct.expira_en,
           v.nombre AS vendedor_nombre, v.usuario AS vendedor_usuario
    FROM client_tokens ct
    LEFT JOIN vendedores v ON v.id = ct.vendedor_id
    ORDER BY ct.creado_en DESC
  `).all() as any[];

  return rows.map(r => ({
    ...mapRow(r),
    vendedorNombre: r.vendedor_nombre ?? null,
    vendedorUsuario: r.vendedor_usuario ?? null,
  }));
}

/**
 * Desactiva un token, solo si pertenece al vendedor que lo solicita.
 */
export function desactivarToken(vendedorId: string, tokenId: string): boolean {
  const result = db.prepare(`
    UPDATE client_tokens SET es_activo = 0 WHERE id = ? AND vendedor_id = ?
  `).run(tokenId, vendedorId);
  return result.changes > 0;
}

/**
 * Activa o desactiva un token, solo si pertenece al vendedor que lo solicita.
 */
export function cambiarEstadoToken(vendedorId: string, tokenId: string, esActivo: boolean): boolean {
  const result = db.prepare(`
    UPDATE client_tokens SET es_activo = ? WHERE id = ? AND vendedor_id = ?
  `).run(esActivo ? 1 : 0, tokenId, vendedorId);
  return result.changes > 0;
}

/**
 * Activa o desactiva un token de CUALQUIER vendedor (sin restricción de
 * propiedad). Solo debe usarse detrás del middleware authAdmin.
 */
export function cambiarEstadoTokenAdmin(tokenId: string, esActivo: boolean): boolean {
  const result = db.prepare(`
    UPDATE client_tokens SET es_activo = ? WHERE id = ?
  `).run(esActivo ? 1 : 0, tokenId);
  return result.changes > 0;
}

/**
 * Obtiene el token más reciente de un cliente dentro de los clientes
 * de un vendedor específico.
 */
export function obtenerTokenPorEmail(vendedorId: string, email: string): ClientToken | null {
  const row = db.prepare(`
    SELECT id, token, vendedor_id, email, nombre, es_activo, creado_en, ultimo_uso, expira_en
    FROM client_tokens
    WHERE email = ? AND vendedor_id = ? ORDER BY creado_en DESC LIMIT 1
  `).get(email, vendedorId) as any;

  return row ? mapRow(row) : null;
}
