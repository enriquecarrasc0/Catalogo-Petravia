/**
 * apps/api/src/services/vendedorAuth.service.ts
 * ───────────────────────────────────────────────
 * Autenticación y gestión de cuentas de vendedor.
 *
 * Cada vendedor tiene su propio usuario/contraseña y, al iniciar sesión,
 * obtiene una sesión (token) independiente de las de otros vendedores.
 * Un vendedor solo puede ver y administrar los clientes (tokens),
 * apartados e historial que él mismo dio de alta.
 */
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import db from '../db/index.js';

export interface Vendedor {
  id: string;
  usuario: string;
  nombre: string;
  email?: string | null;
  esActivo: boolean;
  esAdmin: boolean;
  creadoEn: string;
}

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8; // 8 horas
const sesiones = new Map<string, { vendedorId: string; expiresAt: string }>();

// ─── Password hashing (scrypt, sin dependencias externas) ─────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashIntento = scryptSync(password, salt, 64);
  const hashGuardado = Buffer.from(hash, 'hex');
  if (hashIntento.length !== hashGuardado.length) return false;
  return timingSafeEqual(hashIntento, hashGuardado);
}

// ─── Mapeo de filas ─────────────────────────────────────────────

function mapRow(r: any): Vendedor {
  return {
    id: r.id,
    usuario: r.usuario,
    nombre: r.nombre,
    email: r.email,
    esActivo: Boolean(r.es_activo),
    esAdmin: Boolean(r.es_admin),
    creadoEn: r.creado_en,
  };
}

// ─── Login ──────────────────────────────────────────────────────

export function validarCredencialesVendedor(usuario: string, password: string): Vendedor | null {
  const row = db.prepare(`
    SELECT id, usuario, password_hash, nombre, email, es_activo, es_admin, creado_en
    FROM vendedores WHERE usuario = ? AND es_activo = 1
  `).get(usuario) as any;

  if (!row) return null;
  if (!verificarPassword(password, row.password_hash)) return null;

  return mapRow(row);
}

export function generarSesionVendedor(vendedorId: string) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  sesiones.set(token, { vendedorId, expiresAt });
  return { token, expiresAt };
}

export function validarSesionVendedor(token: string): string | null {
  const sesion = sesiones.get(token);
  if (!sesion) return null;

  if (new Date(sesion.expiresAt) < new Date()) {
    sesiones.delete(token);
    return null;
  }

  return sesion.vendedorId;
}

export function cerrarSesionVendedor(token: string) {
  sesiones.delete(token);
}

// ─── Gestión de cuentas ─────────────────────────────────────────

/** true si el vendedor existe, está activo y tiene el rol admin. */
export function esVendedorAdmin(id: string): boolean {
  const row = db.prepare(`SELECT es_admin FROM vendedores WHERE id = ? AND es_activo = 1`).get(id) as any;
  return Boolean(row?.es_admin);
}

export function obtenerVendedor(id: string): Vendedor | null {
  const row = db.prepare(`
    SELECT id, usuario, nombre, email, es_activo, es_admin, creado_en
    FROM vendedores WHERE id = ?
  `).get(id) as any;
  return row ? mapRow(row) : null;
}

export function crearVendedor(params: { usuario: string; password: string; nombre: string; email?: string }): Vendedor {
  const id = randomUUID();
  // Las cuentas dadas de alta desde el panel siempre son vendedores
  // normales (es_admin = 0) — solo ven y administran sus propios
  // clientes/apartados. No hay forma de crear otro admin desde aquí.
  db.prepare(`
    INSERT INTO vendedores (id, usuario, password_hash, nombre, email, es_activo, es_admin, creado_en)
    VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'))
  `).run(id, params.usuario, hashPassword(params.password), params.nombre, params.email ?? null);

  return { id, usuario: params.usuario, nombre: params.nombre, email: params.email, esActivo: true, esAdmin: false, creadoEn: new Date().toISOString() };
}

/**
 * Lista todos los vendedores (activos e inactivos), para el panel de
 * administración. No incluye password_hash.
 */
export function listarVendedores(): Vendedor[] {
  const rows = db.prepare(`
    SELECT id, usuario, nombre, email, es_activo, es_admin, creado_en
    FROM vendedores ORDER BY creado_en DESC
  `).all() as any[];
  return rows.map(mapRow);
}

/**
 * Activa/desactiva una cuenta de vendedor. Un vendedor desactivado no
 * puede iniciar sesión, pero sus clientes/apartados/historial se conservan.
 */
export function cambiarEstadoVendedor(id: string, esActivo: boolean): boolean {
  const result = db.prepare(`UPDATE vendedores SET es_activo = ? WHERE id = ?`).run(esActivo ? 1 : 0, id);
  return result.changes > 0;
}

/**
 * Edita los datos de una cuenta de vendedor ya dada de alta: usuario,
 * nombre, email, contraseña, si es admin y si está activo. Todos los
 * campos son opcionales — solo se actualiza lo que venga definido, así
 * que se puede llamar tanto para un edit completo desde el formulario
 * como para un cambio puntual (ej. solo esActivo o solo esAdmin).
 */
export function actualizarVendedor(id: string, params: {
  usuario?: string;
  nombre?: string;
  email?: string | null;
  esAdmin?: boolean;
  esActivo?: boolean;
  password?: string;
}): boolean {
  const campos: string[] = [];
  const valores: any[] = [];

  if (params.usuario !== undefined)  { campos.push('usuario = ?');       valores.push(params.usuario); }
  if (params.nombre !== undefined)   { campos.push('nombre = ?');        valores.push(params.nombre); }
  if (params.email !== undefined)    { campos.push('email = ?');         valores.push(params.email || null); }
  if (params.esAdmin !== undefined)  { campos.push('es_admin = ?');      valores.push(params.esAdmin ? 1 : 0); }
  if (params.esActivo !== undefined) { campos.push('es_activo = ?');     valores.push(params.esActivo ? 1 : 0); }
  if (params.password !== undefined) { campos.push('password_hash = ?'); valores.push(hashPassword(params.password)); }

  if (campos.length === 0) return true; // nada que actualizar

  valores.push(id);
  const result = db.prepare(`UPDATE vendedores SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
  return result.changes > 0;
}
