/**
 * apps/api/src/routes/imagenes.ts
 * ─────────────────────────────────
 * Proxy de imágenes de Odoo.
 *
 * El frontend nunca llama a Odoo directamente (bloquea CORS/sesión).
 * Esta ruta descarga la imagen server-to-server vía XML-RPC (campo
 * binario en base64), la decodifica y la sirve como image/* con cache.
 *
 * GET /api/imagenes/:modelo/:id/:campo
 *   modelo → ej. stock.lot.image
 *   id     → id numérico del registro
 *   campo  → ej. image_128, image_1920
 *
 * La lógica real vive en services/imagenes.service.ts — también la usa
 * el generador de PDF directamente (sin pasar por HTTP).
 */
import { Router } from 'express';
import { obtenerImagenBuffer } from '../services/imagenes.service.js';

export const imagenesRouter = Router();

// Imagen placeholder 1x1 transparente (PNG) para cuando no hay imagen
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

imagenesRouter.get('/:modelo/:id/:campo', async (req, res, next) => {
  try {
    const { modelo, id, campo } = req.params;
    const recordId = parseInt(id, 10);

    const resultado = await obtenerImagenBuffer(modelo, recordId, campo);

    if (!resultado) {
      // No cachear el placeholder — así la próxima petición reintenta
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      res.send(PLACEHOLDER_PNG);
      return;
    }

    res.set('Content-Type', resultado.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(resultado.buffer);
  } catch (err) {
    next(err);
  }
});
