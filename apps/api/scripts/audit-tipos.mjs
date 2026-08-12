#!/usr/bin/env node
/**
 * scripts/audit-materiales.mjs
 * ─────────────────────────────
 * Audita cómo se están clasificando los materiales reales de Odoo con las
 * reglas actuales de lotes.service.ts (grupoMaterial + extraerAcabado),
 * SIN modificar nada.
 *
 * Uso:
 *   cd apps/api
 *   node scripts/audit-materiales.mjs
 *
 * Lee las credenciales de Odoo desde el .env de apps/api.
 *
 * Qué hace:
 *   1. Se conecta a Odoo y trae TODOS los lotes (stock.lot).
 *   2. Aplica las MISMAS reglas que usa la API para:
 *        - grupo (GRUPO_REGLAS)
 *        - acabado (ACABADOS_RE + MAP)
 *   3. Imprime:
 *        - Lista de materiales únicos que cayeron en grupo "Otros"
 *          (no matchearon ninguna regla de GRUPO_REGLAS)
 *        - Lista de materiales únicos SIN acabado detectado
 *          (no matchearon ACABADOS_RE)
 *        - Resumen completo: cada material único con su grupo y acabado
 *          asignados actualmente, para revisar de un vistazo
 *
 * Copia la salida completa y pégamela: con eso afino las reglas
 * (GRUPO_REGLAS, ACABADOS_RE, MAP) con tus datos reales en vez de adivinar.
 */

import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ODOO_URL  = process.env.ODOO_URL  ?? 'https://petravia-test.odoo.com';
const ODOO_DB   = process.env.ODOO_DB   ?? '';
const ODOO_USER = process.env.ODOO_USER ?? 'enrique@petravia.mx';
const ODOO_KEY  = process.env.ODOO_KEY  ?? '';

// ─── Mismas reglas que apps/api/src/services/lotes.service.ts ──────

const GRUPO_REGLAS = [
  [/PUEBLA/i,                        'Puebla'],
  [/CC\s*VERACRUZ|^VER|^CC/i,       'Veracruz'],
  [/TERRACOTA/i,                     'Terracota'],
  [/CARAMEL|IVORY/i,                 'Caramel Ivory'],
  [/SANTO\s*TOMAS|STO\s*TOM/i,      'Santo Tomas'],
  [/AQUA\s*BL(UE|U)/i,              'Aqua Blue'],
  [/VINTAGE/i,                       'Vintage'],
];

function grupoMaterial(material) {
  const upper = material.toUpperCase();
  for (const [regex, grupo] of GRUPO_REGLAS) {
    if (regex.test(upper)) return grupo;
  }
  return 'Otros';
}

const ACABADOS_RE = /\b(MATE\s*S[-\s]R|MATE|BRILL[A-Z]*|CEPILL[A-Z]*\s*S[-\s]R|CEPILL[A-Z]*|SANDBLAST|SPAZZOLATO|VETEADO|BOOK\s*MATCH|MICROSANDBLAST)\b/i;

function extraerAcabado(nombre) {
  const m = nombre.match(ACABADOS_RE);
  if (!m) return '';
  const raw = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
  const MAP = {
    'MATE S-R':'Mate S-R','MATE S R':'Mate S-R','MATE':'Mate',
    'CEPILLADO S-R':'Cepillado S-R','CEPILLADO S R':'Cepillado S-R','CEPILLADO':'Cepillado',
    'SANDBLAST':'Sandblast','SPAZZOLATO':'Spazzolato','VETEADO':'Veteado',
    'BOOK MATCH':'Book Match','MICROSANDBLAST':'Microsandblast',
  };
  for (const [k,v] of Object.entries(MAP)) if (raw.startsWith(k)) return v;
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}

// ─── Cliente XML-RPC mínimo ──────────────────────────────────────
function makeClient(p) {
  const url = new URL(p, ODOO_URL);
  return url.protocol === 'https:'
    ? xmlrpc.createSecureClient({ url: url.toString() })
    : xmlrpc.createClient({ url: url.toString() });
}
function call(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, value) => err ? reject(err) : resolve(value));
  });
}

async function main() {
  if (!ODOO_KEY) {
    console.error('✗ Falta ODOO_KEY en apps/api/.env — no se puede conectar.');
    process.exit(1);
  }

  console.log(`Conectando a ${ODOO_URL} (db: ${ODOO_DB})...`);
  const common = makeClient('/xmlrpc/2/common');
  const uid = await call(common, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_KEY, {}]);
  if (!uid) { console.error('✗ Autenticación fallida.'); process.exit(1); }
  console.log(`✓ Autenticado (uid ${uid})\n`);

  const models = makeClient('/xmlrpc/2/object');
  const fields = ['name', 'product_id'];
  const rawLotes = await call(models, 'execute_kw', [
    ODOO_DB, uid, ODOO_KEY,
    'stock.lot', 'search_read', [[]],
    { fields, limit: 5000 },
  ]);

  console.log(`✓ ${rawLotes.length} lotes traídos de Odoo\n`);

  // Materiales únicos -> { count, grupo, acabado }
  const materiales = new Map();
  for (const raw of rawLotes) {
    const nombre = raw.product_id ? raw.product_id[1] : 'Sin material';
    const grupo = grupoMaterial(nombre);
    const acabado = extraerAcabado(nombre);
    const entry = materiales.get(nombre) ?? { count: 0, grupo, acabado };
    entry.count++;
    materiales.set(nombre, entry);
  }

  const sinGrupo = [...materiales.entries()].filter(([, v]) => v.grupo === 'Otros');
  const sinAcabado = [...materiales.entries()].filter(([, v]) => v.acabado === '');

  console.log('═══════════════════════════════════════════');
  console.log(`  ⚠ MATERIALES SIN GRUPO (cayeron en "Otros") — ${sinGrupo.length} nombres únicos`);
  console.log('  Estos no coinciden con ninguna regla de GRUPO_REGLAS.');
  console.log('═══════════════════════════════════════════');
  for (const [nombre, info] of sinGrupo.sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  x${String(info.count).padEnd(4)} ${nombre}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  ⚠ MATERIALES SIN ACABADO DETECTADO — ${sinAcabado.length} nombres únicos`);
  console.log('  Estos no coinciden con ACABADOS_RE.');
  console.log('═══════════════════════════════════════════');
  for (const [nombre, info] of sinAcabado.sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  x${String(info.count).padEnd(4)} [grupo: ${info.grupo}] ${nombre}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  ✓ TODOS LOS MATERIALES ÚNICOS (${materiales.size}) — grupo / acabado asignados hoy`);
  console.log('═══════════════════════════════════════════');
  for (const [nombre, info] of [...materiales.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  x${String(info.count).padEnd(4)} [${info.grupo.padEnd(14)}] [${(info.acabado || '—').padEnd(14)}] ${nombre}`);
  }

  console.log('\nListo. Copia toda esta salida y pégala en el chat.');
}

main().catch(err => {
  console.error('✗ Error:', err.message || err);
  process.exit(1);
});
