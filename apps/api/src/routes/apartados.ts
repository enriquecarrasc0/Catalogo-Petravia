/**
 * apps/api/src/routes/apartados.ts
 * ─────────────────────────────────
 * Rutas de apartados del cliente autenticado.
 * Separadas para evitar conflicto de orden con /api/lotes/:id
 */
import { Router } from 'express';
import {
  obtenerApartadosEnriquecidos,
  liberarApartado,
  obtenerHistorialPorCliente,
} from '../services/apartados.service.js';
import { generarPDFApartados, construirNombreArchivoPDF } from '../services/pdfApartados.service.js';
import { enviarCorreoCliente, enviarCorreoVendedor } from '../services/email.service.js';
import { authClient, type AuthenticatedRequest } from '../middleware/authClient.js';
import { obtenerVendedor } from '../services/vendedorAuth.service.js';
import db from '../db/index.js';

export const apartadosRouter = Router();

// GET /api/apartados/historial — historial de compras confirmadas del cliente
apartadosRouter.get(
  '/historial',
  authClient,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const historial = obtenerHistorialPorCliente(req.clientEmail!);
      res.json({ ok: true, data: historial });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/apartados — obtiene apartados del cliente autenticado (con datos del lote)
apartadosRouter.get(
  '/',
  authClient,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const enriquecidos = await obtenerApartadosEnriquecidos(req.clientEmail!);
      res.json({ ok: true, data: enriquecidos });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/apartados/pdf — genera el PDF final de los apartados del cliente,
// se lo envía por correo al cliente y notifica por correo al administrador
// de quién y qué apartó. Devuelve el PDF en la respuesta para descarga inmediata.
apartadosRouter.post(
  '/pdf',
  authClient,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const clienteEmail  = req.clientEmail!;
      const clienteNombre = req.clientNombre;

      const apartados = await obtenerApartadosEnriquecidos(clienteEmail);
      if (apartados.length === 0) {
        res.status(400).json({ ok: false, error: 'No tienes apartados activos' });
        return;
      }

      const cliente = { email: clienteEmail, nombre: clienteNombre };
      const pdfBuffer = await generarPDFApartados(cliente, apartados);
      const vendedor = req.clientVendedorId ? obtenerVendedor(req.clientVendedorId) : null;

      // El envío de correos no debe tumbar la descarga del PDF si falla
      // (por ejemplo, SMTP mal configurado): se intenta y se registra el error.
      try {
        await Promise.all([
          enviarCorreoCliente(cliente, apartados, pdfBuffer),
          enviarCorreoVendedor(vendedor?.email, cliente, apartados, pdfBuffer),
        ]);
      } catch (mailErr) {
        console.error('[apartados/pdf] Error enviando correos:', (mailErr as Error).message);
      }

      res.set('Content-Type', 'application/pdf');
      const nombreArchivo = construirNombreArchivoPDF(clienteNombre, apartados);
      res.set('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/apartados/:id — cancela un apartado del cliente
apartadosRouter.delete(
  '/:id',
  authClient,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const apartadoId = req.params.id;
      const clienteEmail = req.clientEmail!;

      const apartado = db.prepare(
        'SELECT cliente_email FROM apartados WHERE id = ?'
      ).get(apartadoId) as any;

      if (!apartado) {
        res.status(404).json({ ok: false, error: 'Apartado no encontrado' });
        return;
      }

      if (apartado.cliente_email !== clienteEmail) {
        res.status(403).json({ ok: false, error: 'No tienes permisos' });
        return;
      }

      const success = liberarApartado(apartadoId);

      if (!success) {
        res.status(400).json({ ok: false, error: 'Error cancelando apartado' });
        return;
      }

      res.json({ ok: true, message: 'Apartado cancelado' });
    } catch (err) {
      next(err);
    }
  }
);

