/**
 * apps/api/src/services/imagenes.service.ts
 * ────────────────────────────────────────────
 * Lógica compartida para obtener imágenes binarias ORIGINALES desde Odoo
 * (vía XML-RPC). La usan:
 *  - el generador de PDF y el ZIP de fotos (necesitan el JPG/PNG original,
 *    PDFKit no lee WebP), y
 *  - fotosOptimizadas.service.ts, que a partir del original genera las
 *    miniaturas WebP que ve el navegador.
 *
 * Las URLs de las fotos son rutas relativas de esta misma API, no URLs
 * públicas absolutas — por eso PDF/ZIP las parsean con parsearUrlImagen()
 * en vez de hacer fetch().
 */
import { executeKw } from '../db/odoo.js';

export const MODELOS_PERMITIDOS = new Set(['stock.lot.image', 'stock.lot', 'product.product', 'product.template']);
export const CAMPOS_PERMITIDOS = /^image_(128|256|512|1024|1920)$/;

// ─── Cache en memoria (acotado) ───────────────────────────────
// Antes era un Map sin límite que guardaba cada imagen de 1920px por 24h:
// con cientos de lotes eso son cientos de MB de RAM en el contenedor.
// Ahora es un LRU pequeño — el cache "de verdad" de lo que ve el navegador
// son los WebP en disco (fotosOptimizadas.service.ts); este solo evita
// repetir la descarga cuando el PDF/ZIP piden la misma foto seguido.
interface CacheEntry { buffer: Buffer; mime: string; ts: number; }
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRADAS = 40;
const _cache = new Map<string, CacheEntry>();

function guardarEnCache(key: string, entry: CacheEntry) {
  _cache.delete(key);
  _cache.set(key, entry);
  while (_cache.size > CACHE_MAX_ENTRADAS) {
    const masVieja = _cache.keys().next().value;
    if (masVieja === undefined) break;
    _cache.delete(masVieja);
  }
}

// Campos que ya sabemos que NO existen en un modelo (ej. image_256 en el
// modelo custom stock.lot.image, que solo tiene image_1920). Sin esto, cada
// miniatura hacía DOS llamadas a Odoo: una que fallaba y el fallback.
const _camposInexistentes = new Set<string>();

function detectarMime(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buffer.slice(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
  return 'image/jpeg';
}

async function leerCampo(modelo: string, recordId: number, campo: string): Promise<string | undefined> {
  const clave = `${modelo}/${campo}`;
  if (_camposInexistentes.has(clave)) return undefined;
  try {
    const result = await executeKw<Array<Record<string, any>>>(
      modelo, 'read', [[recordId]], { fields: [campo] }
    );
    const valor = result?.[0]?.[campo];
    return typeof valor === 'string' && valor ? valor : undefined;
  } catch (err) {
    // Odoo responde "Invalid field" cuando el campo no existe en el modelo:
    // eso no va a cambiar, así que no lo volvemos a intentar.
    const e = err as { message?: string; faultString?: string } | undefined;
    const texto = `${e?.faultString ?? ''} ${e?.message ?? ''}`;
    if (/invalid field|does not exist|unknown field/i.test(texto)) {
      _camposInexistentes.add(clave);
    }
    return undefined;
  }
}

/**
 * Obtiene el buffer ORIGINAL de una imagen desde Odoo.
 * Devuelve null si el registro no existe o no tiene imagen — nunca lanza.
 * `opciones.sinCache` → no guardarla en el LRU (la usa el precalentado de
 * miniaturas, que recorre cientos de fotos una sola vez).
 */
export async function obtenerImagenBuffer(
  modelo: string, recordId: number, campo: string,
  opciones: { sinCache?: boolean } = {},
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!MODELOS_PERMITIDOS.has(modelo) || !CAMPOS_PERMITIDOS.test(campo) || isNaN(recordId)) {
    return null;
  }

  const cacheKey = `${modelo}/${recordId}/${campo}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { buffer: cached.buffer, mime: cached.mime };
  }

  let base64 = await leerCampo(modelo, recordId, campo);

  // Fallback: si el campo solicitado viene vacío o no existe, usar image_1920
  if (!base64 && campo !== 'image_1920') {
    base64 = await leerCampo(modelo, recordId, 'image_1920');
  }

  if (!base64) return null;

  const buffer = Buffer.from(base64, 'base64');
  const mime = detectarMime(buffer);

  if (!opciones.sinCache) guardarEnCache(cacheKey, { buffer, mime, ts: Date.now() });

  return { buffer, mime };
}

/**
 * Extrae {modelo, id, campo} de una URL de foto de esta API. Acepta:
 *  - el formato optimizado actual:  /api/imagenes/lote/123/hd?v=abc
 *    (siempre se resuelve al ORIGINAL image_1920 — PDF/ZIP quieren calidad
 *    completa y en un formato que PDFKit sepa leer)
 *  - el formato anterior:           /api/imagenes/stock.lot.image/123/image_1920
 *    (sigue llegando desde favoritos guardados antes del cambio)
 */
export function parsearUrlImagen(url: string): { modelo: string; id: number; campo: string } | null {
  const opt = url.match(/\/api\/imagenes\/lote\/(\d+)\//);
  if (opt) return { modelo: 'stock.lot.image', id: parseInt(opt[1], 10), campo: 'image_1920' };

  const m = url.match(/\/api\/imagenes\/([^/]+)\/(\d+)\/([^/?]+)/);
  if (!m) return null;
  return { modelo: m[1], id: parseInt(m[2], 10), campo: m[3] };
}
