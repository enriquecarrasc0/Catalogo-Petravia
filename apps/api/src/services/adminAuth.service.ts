import { randomUUID } from 'crypto';

const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 8; // 8 horas
const adminSessions = new Map<string, { expiresAt: string }>();

function getAdminCredentials() {
  const username = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASS;

  if (!username || !password) {
    throw new Error('Credenciales de admin no configuradas');
  }

  return { username, password };
}

export function validarCredencialesAdmin(username: string, password: string) {
  const creds = getAdminCredentials();
  return username === creds.username && password === creds.password;
}

export function generarTokenAdmin() {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS).toISOString();
  adminSessions.set(token, { expiresAt });
  return { token, expiresAt };
}

export function validarTokenAdmin(token: string) {
  const session = adminSessions.get(token);
  if (!session) {
    return false;
  }

  if (new Date(session.expiresAt) < new Date()) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}
