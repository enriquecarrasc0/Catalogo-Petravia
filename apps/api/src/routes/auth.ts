/**
 * apps/api/src/routes/auth.ts
 * ──────────────────────────
 * Autenticación de clientes (con tokens) y de vendedores (usuario/contraseña).
 */
import { Router } from 'express';
import { generarToken, validarToken, listarTokens, desactivarToken, cambiarEstadoToken } from '../services/tokens.service.js';
import {
  validarCredencialesVendedor,
  generarSesionVendedor,
  cerrarSesionVendedor,
} from '../services/vendedorAuth.service.js';
import { authVendedor, type VendedorRequest } from '../middleware/authClient.js';

const authRouter = Router();

/**
 * POST /api/auth/login
 * Cliente se loguea con su token.
 * Retorna: { ok: true, token, email, nombre }
 */
authRouter.post('/login', (req, res) => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ ok: false, error: 'Token requerido' }); return;
  }

  const clientData = validarToken(token);
  if (!clientData) {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' }); return;
  }

  res.json({
    ok: true,
    token: clientData.token,
    email: clientData.email,
    nombre: clientData.nombre,
  });
});

/**
 * POST /api/auth/vendedor/login
 * Vendedor se loguea con usuario y contraseña.
 * Retorna: { ok: true, token, vendedorId, usuario, nombre, expiresAt }
 */
authRouter.post('/vendedor/login', (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    res.status(400).json({ ok: false, error: 'Usuario y contraseña requeridos' }); return;
  }

  const vendedor = validarCredencialesVendedor(usuario, password);
  if (!vendedor) {
    res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' }); return;
  }

  const sesion = generarSesionVendedor(vendedor.id);
  res.json({
    ok: true,
    token: sesion.token,
    expiresAt: sesion.expiresAt,
    vendedorId: vendedor.id,
    usuario: vendedor.usuario,
    nombre: vendedor.nombre,
    esAdmin: vendedor.esAdmin,
  });
});

/**
 * POST /api/auth/vendedor/logout (requiere sesión de vendedor)
 * Invalida la sesión actual.
 */
authRouter.post('/vendedor/logout', authVendedor, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader!.slice(7);
  cerrarSesionVendedor(token);
  res.json({ ok: true });
});

/**
 * POST /api/auth/generar-token (SOLO VENDEDOR)
 * El vendedor genera un nuevo token para un cliente propio.
 * Body: { email, nombre? }
 * Retorna: { ok: true, token, email, nombre }
 */
authRouter.post('/generar-token', authVendedor, (req: VendedorRequest, res) => {
  const { email, nombre } = req.body;

  if (!email) {
    res.status(400).json({ ok: false, error: 'Email requerido' }); return;
  }

  try {
    const newToken = generarToken(req.vendedorId!, email, nombre);
    res.json({
      ok: true,
      token: newToken.token,
      email: newToken.email,
      nombre: newToken.nombre,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error generando token' });
  }
});

/**
 * GET /api/auth/tokens (SOLO VENDEDOR)
 * Lista los tokens (clientes) generados por el vendedor autenticado.
 */
authRouter.get('/tokens', authVendedor, (req: VendedorRequest, res) => {
  try {
    const tokens = listarTokens(req.vendedorId!);
    res.json({ ok: true, data: tokens });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error listando tokens' });
  }
});

/**
 * DELETE /api/auth/tokens/:tokenId (SOLO VENDEDOR)
 * Desactiva un token, solo si pertenece al vendedor autenticado.
 */
authRouter.delete('/tokens/:tokenId', authVendedor, (req: VendedorRequest, res) => {
  try {
    const { tokenId } = req.params;
    const success = desactivarToken(req.vendedorId!, tokenId);

    if (!success) {
      res.status(404).json({ ok: false, error: 'Token no encontrado' }); return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error desactivando token' });
  }
});

/**
 * PATCH /api/auth/tokens/:tokenId (SOLO VENDEDOR)
 * Activa o desactiva un token propio. Body: { esActivo: boolean }
 */
authRouter.patch('/tokens/:tokenId', authVendedor, (req: VendedorRequest, res) => {
  const { esActivo } = req.body ?? {};
  if (typeof esActivo !== 'boolean') {
    res.status(400).json({ ok: false, error: 'esActivo (boolean) es requerido' }); return;
  }
  try {
    const success = cambiarEstadoToken(req.vendedorId!, req.params.tokenId, esActivo);
    if (!success) { res.status(404).json({ ok: false, error: 'Token no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error actualizando token' });
  }
});

export { authRouter };
