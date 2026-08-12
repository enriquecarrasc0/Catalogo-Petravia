#!/usr/bin/env node
/**
 * scripts/crear-vendedor.mjs
 * ────────────────────────────
 * Da de alta una nueva cuenta de vendedor directamente en la base de
 * datos SQLite (no requiere que la API esté corriendo).
 *
 * Uso:
 *   cd apps/api
 *   node scripts/crear-vendedor.mjs --usuario=jperez --password="claveSegura123" --nombre="Juan Pérez" --email=jperez@petravia.mx
 *
 * Flags:
 *   --usuario   (requerido) usuario único para iniciar sesión
 *   --password  (requerido) contraseña en texto plano (se guarda hasheada)
 *   --nombre    (requerido) nombre para mostrar en el panel
 *   --email     (opcional)  a este correo llegan las notificaciones de
 *                           apartados generados por sus clientes
 *   --admin     (opcional)  true|1 para crear una cuenta ADMIN (ve todo,
 *                           puede dar de alta vendedores). Por defecto
 *                           se crea un vendedor normal.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, randomBytes, scryptSync } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const { usuario, password, nombre, email, admin } = parseArgs();

if (!usuario || !password || !nombre) {
  console.error('❌ Faltan argumentos requeridos.\n');
  console.error('Uso: node scripts/crear-vendedor.mjs --usuario=jperez --password="clave" --nombre="Juan Pérez" [--email=jperez@petravia.mx]');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, '../../../petravia.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Asegurar que la tabla exista (por si se corre antes de levantar la API)
db.exec(`
  CREATE TABLE IF NOT EXISTS vendedores (
    id              TEXT PRIMARY KEY,
    usuario         TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    email           TEXT,
    es_activo       INTEGER NOT NULL DEFAULT 1,
    es_admin        INTEGER NOT NULL DEFAULT 0,
    creado_en       TEXT DEFAULT (datetime('now'))
  );
`);

// Si la tabla ya existía de antes de la separación de roles, agregar la columna
const columnas = db.prepare(`PRAGMA table_info(vendedores)`).all();
if (!columnas.some(c => c.name === 'es_admin')) {
  db.exec(`ALTER TABLE vendedores ADD COLUMN es_admin INTEGER NOT NULL DEFAULT 0`);
}

const existente = db.prepare('SELECT id FROM vendedores WHERE usuario = ?').get(usuario);
if (existente) {
  console.error(`❌ Ya existe un vendedor con el usuario "${usuario}".`);
  process.exit(1);
}

const esAdmin = admin === 'true' || admin === '1';
const id = randomUUID();
db.prepare(`
  INSERT INTO vendedores (id, usuario, password_hash, nombre, email, es_activo, es_admin, creado_en)
  VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
`).run(id, usuario, hashPassword(password), nombre, email ?? null, esAdmin ? 1 : 0);

console.log(`✅ ${esAdmin ? 'Admin' : 'Vendedor'} creado: ${nombre} (usuario: ${usuario})`);
console.log(`   id: ${id}`);
if (!email) console.log('   ⚠️  Sin email configurado: no recibirá notificaciones de apartados por correo.');
