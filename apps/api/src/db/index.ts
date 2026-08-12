/**
 * apps/api/src/db/index.ts
 * ─────────────────────────
 * Capa de base de datos con SQLite (better-sqlite3).
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.resolve(__dirname, '../../../petravia.db');

const db = new Database(DB_PATH);

// Optimizaciones WAL para mejor concurrencia
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
