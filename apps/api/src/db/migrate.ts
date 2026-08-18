/**
 * apps/api/src/db/migrate.ts
 * ───────────────────────────
 * Esquema de la base de datos LOCAL (SQLite).
 *
 * Los datos del catálogo (lotes, materiales, fotos, dimensiones)
 * viven en Odoo y se consultan vía XML-RPC — NO se duplican aquí.
 *
 * SQLite solo guarda estado que Odoo no maneja:
 *  - vendedores        → cuentas de vendedores (antes "admin"), cada uno
 *                        con sus propias sesiones, clientes y apartados
 *  - apartados         → reservas temporales de 48h hechas por clientes,
 *                        siempre asociadas al vendedor que dio de alta al cliente
 *  - ventas_locales    → overlay de "vendido" cuando se confirma una venta
 *                        desde el panel (hasta que Odoo se actualice)
 *  - client_tokens     → tokens de acceso de clientes al catálogo, dados de
 *                        alta por un vendedor específico (relación 1 cliente : 1 vendedor)
 *  - historial_compras → registro permanente de lotes comprados por cliente
 */
import { randomUUID } from 'crypto';
import db from './index.js';
import { hashPassword } from '../services/vendedorAuth.service.js';

const SCHEMA = `
  -- ─── Vendedores (antes "admin") ────────────────────────────
  -- es_admin = 1 → ve todo (todos los vendedores/clientes/apartados) y
  --                puede dar de alta vendedores.
  -- es_admin = 0 → vendedor normal, solo ve/administra sus propios
  --                clientes y apartados.
  CREATE TABLE IF NOT EXISTS vendedores (
    id              TEXT PRIMARY KEY,     -- UUID
    usuario         TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    email           TEXT,
    es_activo       INTEGER NOT NULL DEFAULT 1,
    es_admin        INTEGER NOT NULL DEFAULT 0,
    creado_en       TEXT DEFAULT (datetime('now'))
  );

  -- ─── Apartados (reservas temporales, 48h) ─────────────────
  CREATE TABLE IF NOT EXISTS apartados (
    id              TEXT PRIMARY KEY,     -- UUID
    lote_id         TEXT NOT NULL,        -- name del stock.lot en Odoo (ej "0000009")
    vendedor_id     TEXT,                 -- FK → vendedores.id (dueño del cliente)
    cliente_email   TEXT NOT NULL,
    cliente_nombre  TEXT NOT NULL,
    creado_en       TEXT DEFAULT (datetime('now')),
    expira_en       TEXT NOT NULL
  );

  -- ─── Overlay de ventas confirmadas localmente ─────────────
  -- (global: un lote vendido lo está para todo el inventario, sin importar
  --  qué vendedor cerró la venta)
  CREATE TABLE IF NOT EXISTS ventas_locales (
    lote_id    TEXT PRIMARY KEY,
    vendido_en TEXT DEFAULT (datetime('now'))
  );

  -- ─── Tokens de cliente ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS client_tokens (
    id          TEXT PRIMARY KEY,
    token       TEXT NOT NULL UNIQUE,
    vendedor_id TEXT,                     -- FK → vendedores.id (dueño del cliente)
    email       TEXT NOT NULL,
    nombre      TEXT,
    es_activo   INTEGER NOT NULL DEFAULT 1,
    creado_en   TEXT DEFAULT (datetime('now')),
    ultimo_uso  TEXT,
    expira_en   TEXT
  );

  -- ─── Renombrado manual de material/acabado (overlay local) ─
  -- Permite a admin/vendedor corregir la clasificación de un lote
  -- (grupo de material y/o acabado) sin tocar el dato crudo en Odoo,
  -- para cuando el nombre importado viene mal capturado o incompleto.
  CREATE TABLE IF NOT EXISTS lote_overrides (
    lote_id         TEXT PRIMARY KEY,     -- name del stock.lot en Odoo
    grupo           TEXT,                 -- GrupoMaterial elegido, o NULL si no se sobreescribe
    acabado         TEXT,                 -- Acabado elegido, o NULL si no se sobreescribe
    actualizado_por TEXT,                 -- FK → vendedores.id (quién hizo el cambio)
    actualizado_en  TEXT DEFAULT (datetime('now'))
  );

  -- ─── Historial de compras confirmadas ─────────────────────
  CREATE TABLE IF NOT EXISTS historial_compras (
    id              TEXT PRIMARY KEY,     -- UUID
    lote_id         TEXT NOT NULL,        -- name del lote en Odoo
    vendedor_id     TEXT,                 -- FK → vendedores.id (quién confirmó la venta)
    cliente_email   TEXT NOT NULL,
    cliente_nombre  TEXT NOT NULL,
    comprado_en     TEXT DEFAULT (datetime('now')),
    material        TEXT,                 -- snapshot del material al momento de compra
    acabado         TEXT,                 -- snapshot del acabado
    saldo_m2        REAL                  -- snapshot de m² al momento de compra
  );

  -- ─── Favoritos ──────────────────────────────────────────────
  -- A diferencia de "apartados", esto NO reserva el lote ni notifica
  -- al vendedor: es una lista puramente personal del cliente ("me gusta
  -- esto"), para que después decida cuáles apartar de verdad.
  CREATE TABLE IF NOT EXISTS favoritos (
    id              TEXT PRIMARY KEY,     -- UUID
    lote_id         TEXT NOT NULL,        -- name del stock.lot en Odoo
    cliente_email   TEXT NOT NULL,
    creado_en       TEXT DEFAULT (datetime('now')),
    -- Instantánea del lote al momento de agregarlo a favoritos — el
    -- navegador ya tiene estos datos enfrente (viene de la tarjeta del
    -- catálogo) cuando se le da corazón, así que se guardan aquí de una
    -- vez. Con esto, favoritos NUNCA vuelve a consultar Odoo — ni al
    -- guardar ni al leer — es 100% independiente y local.
    material        TEXT,
    grupo           TEXT,
    acabado         TEXT,
    tipo            TEXT,
    saldo_m2        REAL,
    saldo_m3        REAL,
    saldo_piezas    REAL,
    foto_url        TEXT,
    UNIQUE(lote_id, cliente_email)
  );

  -- ─── Índices (solo los que NO dependen de vendedor_id) ────
  -- Los índices sobre vendedor_id se crean más abajo, después de
  -- agregarColumnaSiFalta(), porque en instalaciones existentes
  -- (pre-vendedores) esa columna todavía no existe en este punto.
  CREATE INDEX IF NOT EXISTS idx_apartados_lote     ON apartados(lote_id);
  CREATE INDEX IF NOT EXISTS idx_apartados_expira   ON apartados(expira_en);
  CREATE INDEX IF NOT EXISTS idx_client_tokens      ON client_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_client_email       ON client_tokens(email);
  CREATE INDEX IF NOT EXISTS idx_historial_email    ON historial_compras(cliente_email);
  CREATE INDEX IF NOT EXISTS idx_historial_lote     ON historial_compras(lote_id);
  CREATE INDEX IF NOT EXISTS idx_vendedores_usuario ON vendedores(usuario);
  CREATE INDEX IF NOT EXISTS idx_favoritos_cliente  ON favoritos(cliente_email);
  CREATE INDEX IF NOT EXISTS idx_favoritos_lote     ON favoritos(lote_id);
`;

db.exec(SCHEMA);

// ─── Migración de bases de datos existentes (pre-vendedores) ──
// Si la instalación ya tenía las tablas sin `vendedor_id` (versión
// anterior de un solo "admin"), les agregamos la columna aquí.
function agregarColumnaSiFalta(tabla: string, columna: string, definicion: string) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all() as Array<{ name: string }>;
  const existe = columnas.some(c => c.name === columna);
  if (!existe) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    console.log(`🔧 Columna ${columna} agregada a ${tabla}`);
  }
}

agregarColumnaSiFalta('apartados', 'vendedor_id', 'TEXT');
agregarColumnaSiFalta('client_tokens', 'vendedor_id', 'TEXT');
agregarColumnaSiFalta('historial_compras', 'vendedor_id', 'TEXT');
agregarColumnaSiFalta('vendedores', 'es_admin', 'INTEGER NOT NULL DEFAULT 0');

// Ahora que vendedor_id existe garantizado en las 3 tablas (ya sea porque
// se creó en el CREATE TABLE de una instalación nueva, o porque se acaba
// de agregar arriba en una instalación existente), es seguro indexarla.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_apartados_vendedor ON apartados(vendedor_id);
  CREATE INDEX IF NOT EXISTS idx_client_vendedor    ON client_tokens(vendedor_id);
  CREATE INDEX IF NOT EXISTS idx_historial_vendedor ON historial_compras(vendedor_id);
`);

// ─── Sembrar el primer vendedor a partir de ADMIN_USER/ADMIN_PASS ─
// Mantiene compatible una instalación previa: el antiguo admin único
// se convierte automáticamente en el primer vendedor, y todo el
// historial/clientes/apartados huérfanos (vendedor_id NULL) se le asignan.
function sembrarVendedorInicial() {
  const totalVendedores = (db.prepare('SELECT COUNT(*) as c FROM vendedores').get() as any).c;
  if (totalVendedores > 0) return;

  const usuario  = process.env.ADMIN_USER ?? 'admin';
  const password = process.env.ADMIN_PASS ?? 'petravia123';
  const email    = process.env.ADMIN_EMAIL;

  const id = randomUUID();
  db.prepare(`
    INSERT INTO vendedores (id, usuario, password_hash, nombre, email, es_activo, es_admin, creado_en)
    VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))
  `).run(id, usuario, hashPassword(password), usuario, email ?? null);

  // Asignar cualquier dato huérfano (de la época de admin único) a este vendedor
  db.prepare(`UPDATE apartados SET vendedor_id = ? WHERE vendedor_id IS NULL`).run(id);
  db.prepare(`UPDATE client_tokens SET vendedor_id = ? WHERE vendedor_id IS NULL`).run(id);
  db.prepare(`UPDATE historial_compras SET vendedor_id = ? WHERE vendedor_id IS NULL`).run(id);

  console.log(`✅ Vendedor inicial creado (ADMIN) a partir de ADMIN_USER: "${usuario}"`);
  console.log(`   (usa esas mismas credenciales para iniciar sesión como administrador)`);
}

sembrarVendedorInicial();

// ─── Garantizar que exista al menos un admin ───────────────────
// Si ya había vendedores (instalación previa a la separación de roles)
// y ninguno tiene es_admin = 1, se promueve la cuenta que coincide con
// ADMIN_USER (si existe) o, en su defecto, la más antigua — así la
// cuenta que "ya existía" sigue siendo la que tiene acceso total.
function asegurarAdminInicial() {
  const hayAdmin = (db.prepare('SELECT COUNT(*) as c FROM vendedores WHERE es_admin = 1').get() as any).c > 0;
  if (hayAdmin) return;

  const usuarioPreferido = process.env.ADMIN_USER;
  let candidato = usuarioPreferido
    ? (db.prepare('SELECT id, usuario FROM vendedores WHERE usuario = ?').get(usuarioPreferido) as any)
    : null;

  if (!candidato) {
    candidato = db.prepare('SELECT id, usuario FROM vendedores ORDER BY creado_en ASC LIMIT 1').get() as any;
  }

  if (candidato) {
    db.prepare('UPDATE vendedores SET es_admin = 1 WHERE id = ?').run(candidato.id);
    console.log(` Cuenta "${candidato.usuario}" promovida a administrador`);
  }
}

asegurarAdminInicial();

// ─── Limpieza de apartados expirados al iniciar ───────────────
function limpiarApartadosExpirados() {
  const result = db.prepare(`DELETE FROM apartados WHERE expira_en <= datetime('now')`).run();
  if (result.changes > 0) {
    console.log(` ${result.changes} apartado(s) expirado(s) eliminados`);
  }
}

limpiarApartadosExpirados();
console.log(' Schema creado / actualizado');
