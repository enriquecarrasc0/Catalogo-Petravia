/**
 * apps/api/src/routes/imagenes.ts
 * ─────────────────────────────────
 * Proxy de imágenes de Odoo.
 *
 * El frontend nunca llama a Odoo directamente (bloquea CORS/sesión).
 *
 * GET /api/imagenes/lote/:id/:variante?v=<version>     ← lo que usa el catálogo
 *   id       → id del stock.lot.image
 *   variante → thumb (~800px) | hd (~1920px), ambas WebP
 *   Se sirven desde el cache en disco (fotosOptimizadas.service.ts). Si
 *   ?v coincide con la versión vigente, el navegador la cachea 1 año.
 *
 * GET /api/imagenes/:modelo/:id/:campo                  ← formato anterior
 *   Se mantiene por compatibilidad (favoritos guardados antes del cambio).
 *   Si es una foto de lote conocida, también se sirve la versión optimizada.
 */
import { Router, type Request, type Response } from 'express';
import { obtenerImagenBuffer } from '../services/imagenes.service.js';
import { conoceFoto, obtenerFotoOptimizada, type Variante } from '../services/fotosOptimizadas.service.js';
import { getAllLotes } from '../services/lotes.service.js';

export const imagenesRouter = Router();

// Imagen placeholder 1x1 transparente (PNG) para cuando no hay imagen
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function enviarPlaceholder(res: Response) {
  // No cachear el placeholder — así la próxima petición reintenta
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(PLACEHOLDER_PNG);
}

async function servirOptimizada(req: Request, res: Response, id: number, variante: Variante): Promise<boolean> {
  // Tras un reinicio, la primera foto puede pedirse antes de que se haya
  // leído Odoo (no conocemos su versión): forzamos esa lectura una vez.
  if (!conoceFoto(id)) await getAllLotes().catch(() => { /* Odoo caído */ });
  if (!conoceFoto(id)) return false;

  const foto = await obtenerFotoOptimizada(id, variante);
  if (!foto) { enviarPlaceholder(res); return true; }

  const etag = `"${id}-${foto.version}-${variante}"`;
  const versionVigente = req.query.v === foto.version;
  res.set('Content-Type', 'image/webp');
  res.set('ETag', etag);
  res.set('Cache-Control', versionVigente
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600');

  if (req.headers['if-none-match'] === etag) { res.status(304).end(); return true; }
  res.send(foto.buffer);
  return true;
}

imagenesRouter.get('/lote/:id/:variante', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { variante } = req.params;
    if (Number.isNaN(id) || (variante !== 'thumb' && variante !== 'hd')) {
      res.status(404).end();
      return;
    }
    if (!(await servirOptimizada(req, res, id, variante))) res.status(404).end();
  } catch (err) {
    next(err);
  }
});

imagenesRouter.get('/:modelo/:id/:campo', async (req, res, next) => {
  try {
    const { modelo, id, campo } = req.params;
    const recordId = parseInt(id, 10);

    // Fotos de lote con el formato viejo de URL → versión optimizada.
    if (modelo === 'stock.lot.image' && !Number.isNaN(recordId)) {
      const variante: Variante = campo === 'image_1920' || campo === 'image_1024' ? 'hd' : 'thumb';
      if (await servirOptimizada(req, res, recordId, variante)) return;
    }

    const resultado = await obtenerImagenBuffer(modelo, recordId, campo);

    if (!resultado) {
      enviarPlaceholder(res);
      return;
    }

    res.set('Content-Type', resultado.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(resultado.buffer);
  } catch (err) {
    next(err);
  }
});
