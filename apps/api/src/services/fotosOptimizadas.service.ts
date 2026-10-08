/**
 * apps/api/src/services/fotosOptimizadas.service.ts
 * ───────────────────────────────────────────────────
 * Fotos de lotes optimizadas para el navegador + detección de la imagen
 * genérica "Foto pendiente de subir".
 *
 * POR QUÉ EXISTE
 * El modelo custom stock.lot.image solo tiene image_1920. Antes, cada
 * miniatura del catálogo pedía image_256 (que no existe → error), luego
 * image_1920 (la foto completa, en base64 por XML-RPC) y la mandaba tal
 * cual: cientos de KB por tarjeta, dos viajes a Odoo, y un cache en RAM
 * que se perdía en cada redeploy.
 *
 * QUÉ HACE AHORA
 *  1. Convierte cada foto UNA sola vez a WebP con sharp:
 *       thumb → 800px de ancho máx., calidad 72  (tarjetas del catálogo)
 *       hd    → 1920px máx., calidad 82          (detalle / lightbox)
 *     y la guarda en disco junto a la base de datos (volumen de Railway),
 *     así sobrevive a redeploys.
 *  2. La URL lleva la versión (write_date de Odoo): el navegador la puede
 *     cachear "para siempre" (immutable) y, si alguien cambia la foto en
 *     Odoo, cambia la URL sola.
 *  3. En segundo plano "precalienta" las miniaturas de todos los lotes
 *     después de cada lectura de Odoo, para que el primer cliente que abre
 *     el catálogo no tenga que esperar la conversión.
 *  4. Al generar cada miniatura calcula una firma visual (32×32 en grises)
 *     y la compara contra la de la imagen "Foto pendiente de subir". Las
 *     fotos que coinciden se ocultan; si un lote se queda sin ninguna foto
 *     real, deja de aparecer en el catálogo (regla que ya existía).
 *
 * CONFIGURACIÓN (variables de entorno, todas opcionales)
 *  (Sin configurar nada, la detección es AUTOMÁTICA: una misma imagen
 *   repetida en 4 o más lotes distintos se considera la genérica — las
 *   fotos reales de láminas son únicas por lote.)
 *  FOTO_PENDIENTE_AUTO       "0" desactiva la detección automática.
 *  FOTO_PENDIENTE_MIN_LOTES  En cuántos lotes distintos debe repetirse una
 *                            imagen para la detección automática (default 4).
 *  FOTO_PENDIENTE_LOTES      (Opcional, refuerzo) Lote(s) que tienen subida
 *                            la imagen genérica,
 *                            separados por coma. Ej: "GL-765-6".
 *                            Solo se usa para "aprender" cómo se ve la
 *                            imagen: la firma se guarda la primera vez y ya
 *                            no depende de ese lote (si después le suben su
 *                            foto real, no pasa nada).
 *  FOTO_PENDIENTE_SIMILITUD  0–1, qué tan parecida debe ser (default 0.92).
 *  IMG_CACHE_DIR             Carpeta del cache en disco
 *                            (default: <carpeta de DB_PATH>/img-cache).
 *  IMG_PRECALENTAR_PARALELO  Descargas simultáneas a Odoo al precalentar
 *                            (default 3 — para no saturar Odoo).
 */
import sharp from 'sharp';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import db from '../db/index.js';
import { obtenerImagenBuffer } from './imagenes.service.js';

// ─── Configuración ────────────────────────────────────────────

export type Variante = 'thumb' | 'hd';

const VARIANTES: Record<Variante, { lado: number; calidad: number }> = {
  thumb: { lado: 800,  calidad: 72 },
  hd:    { lado: 1920, calidad: 82 },
};

const CACHE_DIR = process.env.IMG_CACHE_DIR ?? path.join(path.dirname(db.name), 'img-cache');
fsSync.mkdirSync(CACHE_DIR, { recursive: true });

const PARALELO = Math.max(1, Number(process.env.IMG_PRECALENTAR_PARALELO ?? 3) || 3);
const LADO_FIRMA = 32;
const BYTES_FIRMA = LADO_FIRMA * LADO_FIRMA;

const lotesReferencia = (process.env.FOTO_PENDIENTE_LOTES ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const deteccionAuto = process.env.FOTO_PENDIENTE_AUTO !== '0';
const minLotesAuto = Math.max(2, Number(process.env.FOTO_PENDIENTE_MIN_LOTES ?? 4) || 4);
/** Dos copias de la misma imagen (recomprimida, redimensionada) dan ~0.99. */
const UMBRAL_DUPLICADO = 0.97;
const umbralSimilitud = (() => {
  const n = Number(process.env.FOTO_PENDIENTE_SIMILITUD);
  return n > 0 && n <= 1 ? n : 0.92;
})();

// sharp: sin cache interno (procesamos cada imagen una vez) y pocos hilos —
// el contenedor de Railway es chico y también atiende la API.
sharp.cache(false);
sharp.concurrency(2);

// ─── Versiones conocidas (las registra lotes.service) ─────────

/** image_id → versión vigente (write_date en base36). */
let versiones = new Map<number, string>();

/** write_date de Odoo ("2026-10-07 18:22:01", UTC) → string corto. */
export function versionDe(writeDate: string | false | null | undefined): string {
  if (!writeDate) return '0';
  const t = Date.parse(writeDate.replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? '0' : t.toString(36);
}

export const urlFotoLote = (imageId: number, version: string, variante: Variante) =>
  `/api/imagenes/lote/${imageId}/${variante}?v=${version}`;

export const conoceFoto = (imageId: number) => versiones.has(imageId);
export const versionActual = (imageId: number) => versiones.get(imageId);

// ─── Archivos en disco ────────────────────────────────────────

const rutaArchivo = (id: number, version: string, variante: Variante) =>
  path.join(CACHE_DIR, `${id}-${version}-${variante}.webp`);

async function escribirAtomico(ruta: string, datos: Buffer) {
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, datos);
  await fs.rename(tmp, ruta);
}

async function borrarVersionAnterior(id: number, versionVieja: string) {
  await Promise.all((['thumb', 'hd'] as const).map(v =>
    fs.unlink(rutaArchivo(id, versionVieja, v)).catch(() => { /* no existía */ })
  ));
}

// ─── Generación ───────────────────────────────────────────────

const stmtMeta = db.prepare('SELECT version FROM fotos_meta WHERE image_id = ?');
const stmtUpsertMeta = db.prepare(`
  INSERT INTO fotos_meta (image_id, version, firma, procesada_en)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(image_id) DO UPDATE SET
    version = excluded.version, firma = excluded.firma, procesada_en = excluded.procesada_en
`);

/** Firma visual: 32×32 en escala de grises, sin importar proporción ni formato. */
async function calcularFirma(imagen: Buffer): Promise<Buffer> {
  return sharp(imagen, { failOn: 'none' })
    .resize(LADO_FIRMA, LADO_FIRMA, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
}

const _enCurso = new Map<string, Promise<Buffer | null>>();

/**
 * Descarga el original de Odoo, lo convierte a WebP y lo guarda en disco.
 * Si es la miniatura, además registra la firma visual en fotos_meta.
 * Peticiones simultáneas de la misma foto comparten la misma promesa.
 */
function generar(id: number, version: string, variante: Variante): Promise<Buffer | null> {
  const clave = `${id}-${version}-${variante}`;
  const existente = _enCurso.get(clave);
  if (existente) return existente;

  const p = (async () => {
    const original = await obtenerImagenBuffer('stock.lot.image', id, 'image_1920', { sinCache: true });

    if (!original) {
      // Sin imagen en Odoo: se registra (firma vacía) para no reintentarlo
      // en cada precalentado; si suben la foto, cambia el write_date y se
      // vuelve a procesar.
      if (variante === 'thumb') stmtUpsertMeta.run(id, version, Buffer.alloc(0));
      return null;
    }

    const { lado, calidad } = VARIANTES[variante];
    const webp = await sharp(original.buffer, { failOn: 'none' })
      .rotate() // respeta la orientación EXIF de fotos tomadas con celular
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: calidad, effort: 4 })
      .toBuffer();

    await escribirAtomico(rutaArchivo(id, version, variante), webp);

    if (variante === 'thumb') {
      const previa = stmtMeta.get(id) as { version: string } | undefined;
      stmtUpsertMeta.run(id, version, await calcularFirma(webp));
      if (previa && previa.version !== version) await borrarVersionAnterior(id, previa.version);
    }
    return webp;
  })().finally(() => _enCurso.delete(clave));

  _enCurso.set(clave, p);
  return p;
}

/**
 * Devuelve la foto optimizada (del disco si ya existe; si no, la genera).
 * null → la foto no existe en Odoo o no es de ningún lote conocido.
 */
export async function obtenerFotoOptimizada(
  id: number, variante: Variante,
): Promise<{ buffer: Buffer; version: string } | null> {
  const version = versiones.get(id);
  if (version === undefined) return null;

  try {
    return { buffer: await fs.readFile(rutaArchivo(id, version, variante)), version };
  } catch { /* no está en disco todavía */ }

  const buffer = await generar(id, version, variante);
  return buffer ? { buffer, version } : null;
}

// ─── Detección de "Foto pendiente de subir" ───────────────────

let pendientes = new Set<number>();
let escuchas: Array<() => void> = [];

export const esFotoPendiente = (imageId: number) => pendientes.has(imageId);
export const totalFotosPendientes = () => pendientes.size;
export const deteccionConfigurada = () => deteccionAuto || lotesReferencia.length > 0;

/** lotes.service se suscribe para loguear qué lotes quedaron ocultos. */
export function alCambiarPendientes(fn: () => void) { escuchas.push(fn); }

/** Normaliza la firma (media 0, desviación 1) → la comparación ignora
 * diferencias de brillo/contraste por recompresión. null = imagen casi
 * plana (sin estructura suficiente para comparar de forma confiable). */
function normalizar(firma: Buffer): Float32Array | null {
  if (firma.length !== BYTES_FIRMA) return null;
  let suma = 0;
  for (let i = 0; i < BYTES_FIRMA; i++) suma += firma[i];
  const media = suma / BYTES_FIRMA;
  let varianza = 0;
  for (let i = 0; i < BYTES_FIRMA; i++) varianza += (firma[i] - media) ** 2;
  const desv = Math.sqrt(varianza / BYTES_FIRMA);
  if (desv < 2) return null;
  const v = new Float32Array(BYTES_FIRMA);
  for (let i = 0; i < BYTES_FIRMA; i++) v[i] = (firma[i] - media) / desv;
  return v;
}

/** Correlación de Pearson entre dos firmas normalizadas (1 = idénticas). */
function similitud(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < BYTES_FIRMA; i++) s += a[i] * b[i];
  return s / BYTES_FIRMA;
}

/**
 * "Aprende" la firma de la imagen genérica a partir de los lotes de
 * FOTO_PENDIENTE_LOTES. Solo guarda la PRIMERA vez que ve cada foto de
 * esos lotes: si luego le suben su foto real al lote de referencia, esa
 * foto real no se toma como "pendiente".
 */
const stmtCapturarRef = db.prepare(`
  INSERT OR IGNORE INTO fotos_pendiente_ref (lote_id, image_id, firma)
  SELECT ?, image_id, firma FROM fotos_meta
  WHERE image_id = ? AND length(firma) = ${BYTES_FIRMA}
`);
const stmtRefYaCapturada = db.prepare('SELECT 1 FROM fotos_pendiente_ref WHERE lote_id = ? LIMIT 1');

let fotosDeLotesReferencia = new Map<string, number[]>();
/** image_id → nombre del lote al que pertenece (lo registra lotes.service). */
let loteDeFoto = new Map<number, string>();

function capturarReferencias() {
  for (const lote of lotesReferencia) {
    if (stmtRefYaCapturada.get(lote)) continue;
    for (const imageId of fotosDeLotesReferencia.get(lote) ?? []) stmtCapturarRef.run(lote, imageId);
  }
}

/** Versión reducida 4×4 de una firma normalizada — filtro rápido antes de
 * comparar las 1024 posiciones (hace viable comparar miles de fotos). */
function resumen(v: Float32Array): Float32Array {
  const r = new Float32Array(16);
  const celda = LADO_FIRMA / 4;
  for (let y = 0; y < LADO_FIRMA; y++)
    for (let x = 0; x < LADO_FIRMA; x++)
      r[Math.floor(y / celda) * 4 + Math.floor(x / celda)] += v[y * LADO_FIRMA + x];
  let n = 0;
  for (const x of r) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < 16; i++) r[i] /= n;
  return r;
}

/**
 * Detección automática: agrupa las fotos casi idénticas y marca como
 * "pendiente" cualquier grupo que aparezca en `minLotesAuto` o más lotes
 * DISTINTOS. Una foto real de lámina no se repite en tantos lotes; la
 * imagen genérica sí. Agrupado voraz con pre-filtro 4×4.
 */
function detectarRepetidas(filas: Array<{ image_id: number; v: Float32Array }>): Set<number> {
  const grupos: Array<{ rep: Float32Array; res: Float32Array; ids: number[]; lotes: Set<string> }> = [];
  for (const f of filas) {
    const lote = loteDeFoto.get(f.image_id);
    if (!lote) continue;
    const res = resumen(f.v);
    let destino = null as (typeof grupos)[number] | null;
    for (const g of grupos) {
      let pre = 0;
      for (let i = 0; i < 16; i++) pre += g.res[i] * res[i];
      if (pre < 0.9) continue;
      if (similitud(g.rep, f.v) >= UMBRAL_DUPLICADO) { destino = g; break; }
    }
    if (destino) { destino.ids.push(f.image_id); destino.lotes.add(lote); }
    else grupos.push({ rep: f.v, res, ids: [f.image_id], lotes: new Set([lote]) });
  }

  const marcadas = new Set<number>();
  const resumenLog: string[] = [];
  for (const g of grupos) {
    if (g.lotes.size < minLotesAuto) continue;
    g.ids.forEach(id => marcadas.add(id));
    const muestra = [...g.lotes].slice(0, 8).join(', ');
    resumenLog.push(`  [fotos] Imagen repetida en ${g.lotes.size} lotes → se trata como "foto pendiente" (${muestra}${g.lotes.size > 8 ? ', ...' : ''})`);
  }
  // Solo se loguea cuando cambia (esto corre cada 5 min con el refresh de Odoo).
  const texto = resumenLog.join('\n');
  if (texto && texto !== ultimoLogAuto) console.log(texto);
  ultimoLogAuto = texto;
  return marcadas;
}

function recalcularPendientes(conAuto = true) {
  capturarReferencias();

  // Solo fotos vigentes (de lotes que existen hoy en Odoo) y con firma válida.
  const filas = (db.prepare('SELECT image_id, firma FROM fotos_meta').all() as Array<{ image_id: number; firma: Buffer }>)
    .filter(f => versiones.has(f.image_id))
    .map(f => ({ image_id: f.image_id, v: normalizar(f.firma) }))
    .filter((f): f is { image_id: number; v: Float32Array } => f.v !== null);

  const nuevo = new Set<number>();

  // 1) Contra la(s) imagen(es) de referencia de FOTO_PENDIENTE_LOTES.
  if (lotesReferencia.length > 0) {
    const marcadores = lotesReferencia.map(() => '?').join(',');
    const refs = (db.prepare(`SELECT firma FROM fotos_pendiente_ref WHERE lote_id IN (${marcadores})`)
      .all(...lotesReferencia) as Array<{ firma: Buffer }>)
      .map(r => normalizar(r.firma))
      .filter((v): v is Float32Array => v !== null);
    for (const f of filas) {
      if (refs.some(r => similitud(r, f.v) >= umbralSimilitud)) nuevo.add(f.image_id);
    }
  }

  // 2) Automática: misma imagen repetida en muchos lotes. Si no toca
  // recalcularla en esta vuelta, se conserva lo que ya se había detectado.
  if (deteccionAuto) {
    const auto = conAuto ? detectarRepetidas(filas) : autoAnterior;
    autoAnterior = auto;
    auto.forEach(id => nuevo.add(id));
  }

  const cambio = nuevo.size !== pendientes.size || [...nuevo].some(id => !pendientes.has(id));
  pendientes = nuevo;
  if (cambio) escuchas.forEach(fn => { try { fn(); } catch { /* solo logs */ } });
}
let autoAnterior = new Set<number>();
let ultimoLogAuto = '';

// ─── Precalentado en segundo plano ────────────────────────────

let precalentando = false;
let otraVuelta = false;

async function enParalelo<T>(items: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(trabajadores);
}

async function precalentar() {
  if (precalentando) { otraVuelta = true; return; }
  precalentando = true;
  try {
    do {
      otraVuelta = false;
      const procesadas = new Map(
        (db.prepare('SELECT image_id, version FROM fotos_meta').all() as Array<{ image_id: number; version: string }>)
          .map(r => [r.image_id, r.version]),
      );

      // Las fotos de los lotes de referencia van primero: sin su firma no
      // se puede detectar la imagen "pendiente" en las demás.
      const prioritarias = new Set([...fotosDeLotesReferencia.values()].flat());
      const faltantes = [...versiones.entries()]
        .filter(([id, v]) => procesadas.get(id) !== v)
        .map(([id]) => id)
        .sort((a, b) => Number(prioritarias.has(b)) - Number(prioritarias.has(a)));

      if (faltantes.length === 0) break;

      const inicio = Date.now();
      console.log(`  [fotos] Optimizando ${faltantes.length} foto(s) en segundo plano...`);
      let hechas = 0, errores = 0;

      await enParalelo(faltantes, PARALELO, async id => {
        const version = versiones.get(id);
        if (version === undefined) return;
        try {
          await generar(id, version, 'thumb');
        } catch (err) {
          errores++;
          // Imagen corrupta o formato que sharp no lee: se marca como
          // procesada (sin firma) para no reintentarla en cada vuelta.
          stmtUpsertMeta.run(id, version, Buffer.alloc(0));
          console.warn(`  [fotos] No se pudo optimizar la foto ${id}:`, (err as Error).message);
        }
        hechas++;
        if (prioritarias.has(id)) recalcularPendientes(false);
        if (hechas % 100 === 0) console.log(`  [fotos] ${hechas}/${faltantes.length}...`);
      });

      recalcularPendientes();
      console.log(`  [fotos] Listo: ${hechas} foto(s) en ${Math.round((Date.now() - inicio) / 1000)}s` +
        (errores ? ` (${errores} con error)` : ''));
    } while (otraVuelta);
  } catch (err) {
    console.error('[ERROR] Precalentado de fotos falló:', (err as Error).message);
  } finally {
    precalentando = false;
  }
}

/**
 * La llama lotes.service cada vez que relee Odoo: registra las versiones
 * vigentes de todas las fotos y arranca el precalentado de las que falten.
 * `fotosPorLote` (nombre de lote → ids de sus fotos) se usa para ubicar
 * las fotos de los lotes de referencia de FOTO_PENDIENTE_LOTES.
 */
export function registrarFotos(
  fotos: Array<{ id: number; version: string }>,
  lotePorFoto: Map<number, string>,
) {
  versiones = new Map(fotos.map(f => [f.id, f.version]));
  loteDeFoto = lotePorFoto;

  // Puede haber varios stock.lot con el mismo nombre (distinto producto):
  // se juntan las fotos de todos.
  fotosDeLotesReferencia = new Map(lotesReferencia.map(l => [l, [] as number[]]));
  for (const [imageId, lote] of lotePorFoto) fotosDeLotesReferencia.get(lote)?.push(imageId);

  if (lotesReferencia.length > 0) {
    const sinFotos = lotesReferencia.filter(l => (fotosDeLotesReferencia.get(l) ?? []).length === 0
      && !stmtRefYaCapturada.get(l));
    if (sinFotos.length) {
      console.warn(`  [fotos] FOTO_PENDIENTE_LOTES: no encontré fotos en ${sinFotos.join(', ')} — revisa el nombre del lote.`);
    }
  }

  recalcularPendientes();
  void precalentar();
}
