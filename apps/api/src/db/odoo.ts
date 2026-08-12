/**
 * apps/api/src/db/odoo.ts
 * ────────────────────────
 * Cliente XML-RPC para Odoo.
 * Toda comunicación con Odoo pasa por aquí.
 */
import xmlrpc from 'xmlrpc';

const ODOO_URL  = process.env.ODOO_URL  ?? 'https://petraviash.odoo.com';
const ODOO_DB   = process.env.ODOO_DB   ?? 'rvargasnovu-petravia-prod-24989563';
const ODOO_USER = process.env.ODOO_USER ?? 'enrique@petravia.mx';
const ODOO_KEY  = process.env.ODOO_KEY  ?? '8418f4516fdde2de5b672c57ca16a38d37e28d4a';


// ─── Helpers XML-RPC ─────────────────────────────────────────
// Los clientes se crean una sola vez y se reutilizan: evita repetir el
// handshake TLS completo en cada llamada a Odoo (antes se creaba un
// cliente nuevo por cada executeKw, incluida cada imagen individual).

function makeClient(path: string) {
  const url = new URL(path, ODOO_URL);
  return url.protocol === 'https:'
    ? xmlrpc.createSecureClient({ url: url.toString() })
    : xmlrpc.createClient({ url: url.toString() });
}

let _commonClient: xmlrpc.Client | null = null;
let _objectClient: xmlrpc.Client | null = null;

function getCommonClient(): xmlrpc.Client {
  if (!_commonClient) _commonClient = makeClient('/xmlrpc/2/common');
  return _commonClient;
}

function getObjectClient(): xmlrpc.Client {
  if (!_objectClient) _objectClient = makeClient('/xmlrpc/2/object');
  return _objectClient;
}

function call<T>(client: xmlrpc.Client, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err: unknown, value: T) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

/**
 * Detecta el caso típico de instancias de Odoo Online (staging/trial) que se
 * "duermen" tras un rato sin tráfico: la primera petición recibe una página
 * HTML (login, "cargando base de datos", error 502 del proxy, etc.) en vez de
 * XML-RPC, y la librería `xmlrpc` revienta con "Unknown XML-RPC tag 'TITLE'"
 * (por el <title> del HTML) o errores de parseo equivalentes.
 */
function esErrorDeWakeUp(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Unknown XML-RPC tag/i.test(msg) || /Invalid XML-RPC message/i.test(msg) || /Non-whitespace/i.test(msg);
}

const WAKEUP_RETRY_DELAY_MS = 4000;

/**
 * Envuelve `call` con un reintento automático cuando la respuesta indica que
 * Odoo está "despertando". Se hace una sola vez con una pequeña espera —
 * si vuelve a fallar, el error real sube tal cual.
 */
async function callConReintento<T>(client: xmlrpc.Client, method: string, params: unknown[]): Promise<T> {
  try {
    return await call<T>(client, method, params);
  } catch (err) {
    if (!esErrorDeWakeUp(err)) throw err;
    console.warn(`⏳ Odoo parece estar "despertando" (respuesta no-XML) — reintentando en ${WAKEUP_RETRY_DELAY_MS}ms...`);
    await new Promise(r => setTimeout(r, WAKEUP_RETRY_DELAY_MS));
    return call<T>(client, method, params);
  }
}

// ─── Autenticación (con caché de UID + deduplicación de llamadas concurrentes) ─

let _uid: number | null = null;
// Si ya hay una autenticación en curso, las llamadas concurrentes esperan
// esta misma promesa en vez de disparar cada una su propio `authenticate`.
let _uidPromise: Promise<number> | null = null;

export async function getUid(): Promise<number> {
  if (_uid) return _uid;
  if (_uidPromise) return _uidPromise;

  const common = getCommonClient();
  _uidPromise = (async () => {
    try {
      const uid = await callConReintento<number>(common, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_KEY, {}]);
      if (!uid) throw new Error('Odoo: autenticación fallida — verifica ODOO_USER y ODOO_KEY');
      _uid = uid;
      console.log(`✅ Odoo conectado como UID ${uid}`);
      return uid;
    } finally {
      _uidPromise = null;
    }
  })();

  return _uidPromise;
}

// ─── execute_kw genérico ──────────────────────────────────────

export async function executeKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const uid = await getUid();
  const object = getObjectClient();
  return callConReintento<T>(object, 'execute_kw', [ODOO_DB, uid, ODOO_KEY, model, method, args, kwargs]);
}