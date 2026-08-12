import { Request, Response, NextFunction } from 'express';
import { validarToken } from '../services/tokens.service.js';
import { validarSesionVendedor, esVendedorAdmin } from '../services/vendedorAuth.service.js';

export interface AuthenticatedRequest extends Request {
  clientEmail?: string;
  clientNombre?: string;
  clientToken?: string;
  /** Vendedor dueño del cliente autenticado (quien dio de alta su token). */
  clientVendedorId?: string;
}

export interface VendedorRequest extends Request {
  vendedorId?: string;
}

/** Valida token de cliente — Authorization: Bearer <token> */
export function authClient(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Token requerido' }); return;
  }
  const token = authHeader.slice(7);
  const clientData = validarToken(token);
  if (!clientData) {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' }); return;
  }
  req.clientEmail = clientData.email;
  req.clientNombre = clientData.nombre;
  req.clientToken = token;
  req.clientVendedorId = clientData.vendedorId;
  next();
}

/**
 * Verifica si la request trae una sesión de vendedor válida
 * (Authorization: Bearer <sessionToken>), sin bloquear si no la trae.
 * Útil para endpoints públicos que devuelven más/menos datos
 * según si el solicitante es vendedor.
 */
export function isVendedorRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return validarSesionVendedor(token);
}

/**
 * Middleware — exige una sesión de vendedor válida.
 * Bloquea con 401 si no es válida. Adjunta req.vendedorId.
 */
export function authVendedor(req: VendedorRequest, res: Response, next: NextFunction) {
  const vendedorId = isVendedorRequest(req);
  if (vendedorId) {
    req.vendedorId = vendedorId;
    next();
    return;
  }
  res.status(401).json({ ok: false, error: 'Sesión de vendedor inválida o expirada' });
}

/**
 * Middleware — exige una sesión de vendedor válida CUYA cuenta tenga el
 * rol admin (vendedores.es_admin = 1). Bloquea con 401 si no hay sesión
 * válida, y con 403 si la sesión es válida pero pertenece a un vendedor
 * normal (sin rol admin).
 *
 * El admin ve todo (todos los vendedores, todos los clientes y todos los
 * apartados) y es el único que puede dar de alta cuentas de vendedor. Un
 * vendedor normal solo ve y administra lo que él mismo dio de alta.
 */
export function authAdmin(req: VendedorRequest, res: Response, next: NextFunction) {
  const vendedorId = isVendedorRequest(req);
  if (!vendedorId) {
    res.status(401).json({ ok: false, error: 'Sesión de vendedor inválida o expirada' }); return;
  }
  if (!esVendedorAdmin(vendedorId)) {
    res.status(403).json({ ok: false, error: 'Solo un administrador puede acceder a este recurso' }); return;
  }
  req.vendedorId = vendedorId;
  next();
}
