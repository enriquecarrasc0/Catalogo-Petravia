/**
 * apps/api/src/services/imagenes.service.ts
 * ────────────────────────────────────────────
 * Lógica compartida para obtener imágenes binarias desde Odoo (vía XML-RPC).
 * La usa tanto la ruta HTTP /api/imagenes/* (para el navegador) como el
 * generador de PDF (que necesita el buffer directamente, sin pasar por
 * una llamada HTTP a sí mismo — las URLs de las fotos son rutas relativas
 * de esta misma API, no URLs públicas absolutas).
 */
import { executeKw } from '../db/odoo.js';

export const MODELOS_PERMITIDOS = new Set(['stock.lot.image', 'stock.lot', 'product.product', 'product.template']);
export const CAMPOS_PERMITIDOS = /^image_(128|256|512|1024|1920)$/;

interface CacheEntry { buffer: Buffer; mime: string; ts: number; }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _cache = new Map<string, CacheEntry>();

function detectarMime(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buffer.slice(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Obtiene el buffer de una imagen desde Odoo (con cache en memoria de 24h).
 * Devuelve null si el registro no existe o no tiene imagen — nunca lanza.
 */
export async function obtenerImagenBuffer(
  modelo: string, recordId: number, campo: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!MODELOS_PERMITIDOS.has(modelo) || !CAMPOS_PERMITIDOS.test(campo) || isNaN(recordId)) {
    return null;
  }

  const cacheKey = `${modelo}/${recordId}/${campo}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { buffer: cached.buffer, mime: cached.mime };
  }

  let base64: string | undefined;
  try {
    const result = await executeKw<Array<Record<string, any>>>(
      modelo, 'read', [[recordId]], { fields: [campo] }
    );
    base64 = result?.[0]?.[campo];
  } catch {
    // El campo puede no existir en este modelo — seguir al fallback
  }

  // Fallback: si el campo solicitado viene vacío o falla, intentar image_1920
  if ((!base64 || typeof base64 !== 'string') && campo !== 'image_1920') {
    try {
      const result = await executeKw<Array<Record<string, any>>>(
        modelo, 'read', [[recordId]], { fields: ['image_1920'] }
      );
      base64 = result?.[0]?.['image_1920'];
    } catch { /* ignorar */ }
  }

  if (!base64 || typeof base64 !== 'string') return null;

  const buffer = Buffer.from(base64, 'base64');
  const mime = detectarMime(buffer);

  // Solo cachear cuando hay imagen real
  _cache.set(cacheKey, { buffer, mime, ts: Date.now() });

  return { buffer, mime };
}

/** Extrae {modelo, id, campo} de una ruta relativa tipo /api/imagenes/stock.lot.image/123/image_1920 */
export function parsearUrlImagen(url: string): { modelo: string; id: number; campo: string } | null {
  const m = url.match(/\/api\/imagenes\/([^/]+)\/(\d+)\/([^/?]+)/);
  if (!m) return null;
  return { modelo: m[1], id: parseInt(m[2], 10), campo: m[3] };
}
