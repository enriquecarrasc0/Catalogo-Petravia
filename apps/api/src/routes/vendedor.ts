import { Router } from 'express';
import { authVendedor, type VendedorRequest } from '../middleware/authClient.js';
import { obtenerApartadosDeVendedor, obtenerEstadisticasDeVendedor } from '../services/vendedor.service.js';
import { confirmarVenta, liberarApartado, prorrogarApartado } from '../services/apartados.service.js';
import { obtenerVendedor } from '../services/vendedorAuth.service.js';

const vendedorRouter = Router();

// GET /api/vendedor/me — datos de la sesión actual
vendedorRouter.get('/me', authVendedor, (req: VendedorRequest, res, next) => {
  try {
    const vendedor = obtenerVendedor(req.vendedorId!);
    if (!vendedor) { res.status(404).json({ ok: false, error: 'Vendedor no encontrado' }); return; }
    res.json({ ok: true, data: { id: vendedor.id, usuario: vendedor.usuario, nombre: vendedor.nombre, email: vendedor.email, esAdmin: vendedor.esAdmin } });
  } catch (err) { next(err); }
});

// GET /api/vendedor/apartados?filtro=pendiente|expirado
vendedorRouter.get('/apartados', authVendedor, async (req: VendedorRequest, res, next) => {
  try {
    const filtro = req.query.filtro as string | undefined;
    const data = await obtenerApartadosDeVendedor(req.vendedorId!, filtro);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// GET /api/vendedor/estadisticas
vendedorRouter.get('/estadisticas', authVendedor, (req: VendedorRequest, res, next) => {
  try { res.json({ ok: true, data: obtenerEstadisticasDeVendedor(req.vendedorId!) }); }
  catch (err) { next(err); }
});

// POST /api/vendedor/apartados/:id/confirmar
vendedorRouter.post('/apartados/:id/confirmar', authVendedor, (req: VendedorRequest, res, next) => {
  try {
    const ok = confirmarVenta(req.params.id, req.vendedorId!);
    if (!ok) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/vendedor/apartados/:id/prorrogar  { horas?: number }  (default 24h)
vendedorRouter.post('/apartados/:id/prorrogar', authVendedor, (req: VendedorRequest, res, next) => {
  try {
    const horasRaw = req.body?.horas;
    const horas = Number.isFinite(Number(horasRaw)) ? Number(horasRaw) : 24;
    if (horas === 0 || horas < -168 || horas > 168) {
      res.status(400).json({ ok: false, error: 'Horas inválidas (rango permitido: -168 a 168)' });
      return;
    }
    const apartado = prorrogarApartado(req.params.id, horas, req.vendedorId!);
    if (!apartado) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true, data: apartado });
  } catch (err) { next(err); }
});

// DELETE /api/vendedor/apartados/:id
vendedorRouter.delete('/apartados/:id', authVendedor, (req: VendedorRequest, res, next) => {
  try {
    const ok = liberarApartado(req.params.id, req.vendedorId!);
    if (!ok) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export { vendedorRouter };