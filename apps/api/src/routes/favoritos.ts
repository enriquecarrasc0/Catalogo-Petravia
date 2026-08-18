/**
 * apps/api/src/routes/favoritos.ts
 * ─────────────────────────────────
 * Rutas de favoritos del cliente autenticado.
 *
 * A diferencia de /api/apartados, esto NUNCA reserva un lote ni notifica
 * al vendedor — es solo la lista personal del cliente. Tampoco toca Odoo
 * jamás: el POST manda una instantánea de los datos del lote (material,
 * foto, m²) tal como los ve el navegador en ese momento, y esa misma
 * instantánea es lo único que se lee después. Separada del router de
 * lotes por el mismo motivo que apartados: evitar conflicto de orden con
 * /api/lotes/:id.
 */
import { Router } from 'express';
import {
  agregarFavorito,
  quitarFavorito,
  obtenerFavoritosPorCliente,
  type SnapshotLote,
} from '../services/favoritos.service.js';
import { authClient, type AuthenticatedRequest } from '../middleware/authClient.js';

export const favoritosRouter = Router();

// GET /api/favoritos — favoritos del cliente autenticado. Pura lectura
// local (SQLite) — nunca llama a Odoo.
favoritosRouter.get(
  '/',
  authClient,
  (req: AuthenticatedRequest, res, next) => {
    try {
      const favoritos = obtenerFavoritosPorCliente(req.clientEmail!);
      res.json({ ok: true, data: favoritos });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/favoritos — agrega un lote a favoritos. Body: { loteId, ...snapshot }
// El "snapshot" (material, grupo, acabado, tipo, saldoM2/M3/Piezas, fotoUrl)
// es la instantánea del lote que ya tiene el navegador en ese momento —
// nunca se vuelve a pedir a Odoo.
favoritosRouter.post(
  '/',
  authClient,
  (req: AuthenticatedRequest, res, next) => {
    try {
      const { loteId, material, grupo, acabado, tipo, saldoM2, saldoM3, saldoPiezas, fotoUrl } = req.body as
        { loteId?: string } & SnapshotLote;
      if (!loteId) {
        res.status(400).json({ ok: false, error: 'Falta loteId' });
        return;
      }
      const favorito = agregarFavorito(loteId, req.clientEmail!, {
        material, grupo, acabado, tipo, saldoM2, saldoM3, saldoPiezas, fotoUrl,
      });
      res.json({ ok: true, data: favorito });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/favoritos/:loteId — quita un lote de favoritos
favoritosRouter.delete(
  '/:loteId',
  authClient,
  (req: AuthenticatedRequest, res, next) => {
    try {
      const quitado = quitarFavorito(req.params.loteId, req.clientEmail!);
      res.json({ ok: true, data: { quitado } });
    } catch (err) {
      next(err);
    }
  }
);
