/**
 * apps/api/src/routes/admin.ts
 * ──────────────────────────────
 * Rutas exclusivas del rol ADMIN (vendedores.es_admin = 1), protegidas
 * por el middleware authAdmin. Un vendedor normal recibe 403 aquí.
 *
 * El admin:
 *  - Da de alta, lista y activa/desactiva cuentas de vendedor.
 *  - Ve TODOS los clientes (client_tokens) y a qué vendedor pertenece cada uno.
 *  - Ve TODOS los apartados de todos los vendedores.
 *  - Ve el catálogo igual que cualquier vendedor (rutas de /lotes, sin cambios).
 */
import { Router } from 'express';
import { authAdmin, type VendedorRequest } from '../middleware/authClient.js';
import { crearVendedor, listarVendedores, actualizarVendedor } from '../services/vendedorAuth.service.js';
import { listarTodosLosTokens, cambiarEstadoTokenAdmin } from '../services/tokens.service.js';
import { obtenerTodosApartados, obtenerEstadisticas, obtenerResumenClientes } from '../services/admin.service.js';
import { confirmarVenta, liberarApartado, prorrogarApartado } from '../services/apartados.service.js';

const adminRouter = Router();

const USUARIO_RE = /^[a-zA-Z0-9._-]{3,40}$/;

/**
 * GET /api/admin/vendedores (SOLO ADMIN)
 * Lista todas las cuentas de vendedor (activas e inactivas).
 */
adminRouter.get('/vendedores', authAdmin, (_req: VendedorRequest, res) => {
  try {
    const vendedores = listarVendedores();
    res.json({ ok: true, data: vendedores });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error listando vendedores' });
  }
});

/**
 * POST /api/admin/vendedores (SOLO ADMIN)
 * Da de alta una nueva cuenta de vendedor.
 * Body: { usuario, password, nombre, email? }
 */
adminRouter.post('/vendedores', authAdmin, (req: VendedorRequest, res) => {
  const { usuario, password, nombre, email } = req.body ?? {};

  if (!usuario || !password || !nombre) {
    res.status(400).json({ ok: false, error: 'Usuario, contraseña y nombre son requeridos' }); return;
  }
  if (!USUARIO_RE.test(usuario)) {
    res.status(400).json({ ok: false, error: 'Usuario inválido: usa 3-40 caracteres (letras, números, punto, guion o guion bajo)' }); return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }); return;
  }

  try {
    const vendedor = crearVendedor({ usuario, password, nombre, email: email || undefined });
    res.status(201).json({ ok: true, data: vendedor });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      res.status(409).json({ ok: false, error: `Ya existe un vendedor con el usuario "${usuario}"` }); return;
    }
    res.status(500).json({ ok: false, error: 'Error creando vendedor' });
  }
});

/**
 * PATCH /api/admin/vendedores/:id (SOLO ADMIN)
 * Edita los datos de una cuenta de vendedor: usuario, nombre, email,
 * contraseña, si es admin y si está activo. Todos los campos son
 * opcionales — solo se actualiza lo que venga en el body.
 * Body: { usuario?, nombre?, email?, password?, esAdmin?, esActivo? }
 */
adminRouter.patch('/vendedores/:id', authAdmin, (req: VendedorRequest, res) => {
  const { usuario, nombre, email, password, esAdmin, esActivo } = req.body ?? {};
  const esUnoMismo = req.params.id === req.vendedorId;

  if (usuario !== undefined && !USUARIO_RE.test(usuario)) {
    res.status(400).json({ ok: false, error: 'Usuario inválido: usa 3-40 caracteres (letras, números, punto, guion o guion bajo)' }); return;
  }
  if (nombre !== undefined && !String(nombre).trim()) {
    res.status(400).json({ ok: false, error: 'El nombre no puede estar vacío' }); return;
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' }); return;
  }
  // Salvaguardas: nadie puede desactivarse ni quitarse el rol de admin a
  // sí mismo — evita que un admin se bloquee por accidente y se quede
  // sin nadie que pueda revertirlo.
  if (esActivo === false && esUnoMismo) {
    res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta' }); return;
  }
  if (esAdmin === false && esUnoMismo) {
    res.status(400).json({ ok: false, error: 'No puedes quitarte a ti mismo el rol de administrador' }); return;
  }

  try {
    const ok = actualizarVendedor(req.params.id, { usuario, nombre, email, password, esAdmin, esActivo });
    if (!ok) { res.status(404).json({ ok: false, error: 'Vendedor no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      res.status(409).json({ ok: false, error: `Ya existe un vendedor con el usuario "${usuario}"` }); return;
    }
    res.status(500).json({ ok: false, error: 'Error actualizando vendedor' });
  }
});

/**
 * GET /api/admin/clientes (SOLO ADMIN)
 * Lista TODOS los clientes (tokens) de TODOS los vendedores, indicando
 * a qué vendedor pertenece cada uno.
 */
adminRouter.get('/clientes', authAdmin, (_req: VendedorRequest, res) => {
  try {
    const clientes = listarTodosLosTokens();
    res.json({ ok: true, data: clientes });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error listando clientes' });
  }
});

/**
 * PATCH /api/admin/clientes/:id (SOLO ADMIN)
 * Activa o desactiva el token de un cliente, sea de cualquier vendedor.
 * Body: { esActivo: boolean }
 */
adminRouter.patch('/clientes/:id', authAdmin, (req: VendedorRequest, res) => {
  const { esActivo } = req.body ?? {};
  if (typeof esActivo !== 'boolean') {
    res.status(400).json({ ok: false, error: 'esActivo (boolean) es requerido' }); return;
  }
  try {
    const ok = cambiarEstadoTokenAdmin(req.params.id, esActivo);
    if (!ok) { res.status(404).json({ ok: false, error: 'Cliente no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error actualizando cliente' });
  }
});

/**
 * GET /api/admin/apartados?filtro=pendiente|expirado (SOLO ADMIN)
 * Todos los apartados de todos los vendedores, con datos del lote (Odoo)
 * y del vendedor dueño de cada apartado.
 */
adminRouter.get('/apartados', authAdmin, async (req: VendedorRequest, res, next) => {
  try {
    const filtro = req.query.filtro as string | undefined;
    const data = await obtenerTodosApartados(filtro);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/estadisticas (SOLO ADMIN)
 * Totales globales de apartados (todos los vendedores).
 */
adminRouter.get('/estadisticas', authAdmin, (_req: VendedorRequest, res) => {
  try {
    res.json({ ok: true, data: obtenerEstadisticas() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo estadísticas' });
  }
});

/**
 * GET /api/admin/resumen-clientes (SOLO ADMIN)
 * Clientes con apartados activos, agrupados, con su vendedor.
 */
adminRouter.get('/resumen-clientes', authAdmin, (_req: VendedorRequest, res) => {
  try {
    res.json({ ok: true, data: obtenerResumenClientes() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo resumen de clientes' });
  }
});

/**
 * POST /api/admin/apartados/:id/confirmar (SOLO ADMIN)
 * Confirma la venta de un apartado, sea de cualquier vendedor.
 */
adminRouter.post('/apartados/:id/confirmar', authAdmin, (req: VendedorRequest, res, next) => {
  try {
    const ok = confirmarVenta(req.params.id);
    if (!ok) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/admin/apartados/:id (SOLO ADMIN)
 * Libera un apartado, sea de cualquier vendedor.
 */
adminRouter.delete('/apartados/:id', authAdmin, (req: VendedorRequest, res, next) => {
  try {
    const ok = liberarApartado(req.params.id);
    if (!ok) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/apartados/:id/prorrogar  { horas?: number }  (SOLO ADMIN)
 * Da más tiempo a un apartado (de cualquier vendedor), sumando horas a
 * partir de ahora. Por defecto 24h; acepta un rango de -168 a 168
 * (una semana) por si algún día hace falta acortar el plazo en vez de
 * extenderlo.
 */
adminRouter.post('/apartados/:id/prorrogar', authAdmin, (req: VendedorRequest, res, next) => {
  try {
    const horasRaw = req.body?.horas;
    const horas = Number.isFinite(Number(horasRaw)) ? Number(horasRaw) : 24;
    if (horas === 0 || horas < -168 || horas > 168) {
      res.status(400).json({ ok: false, error: 'Horas inválidas (rango permitido: -168 a 168)' });
      return;
    }
    const apartado = prorrogarApartado(req.params.id, horas);
    if (!apartado) { res.status(404).json({ ok: false, error: 'Apartado no encontrado' }); return; }
    res.json({ ok: true, data: apartado });
  } catch (err) { next(err); }
});

export { adminRouter };
