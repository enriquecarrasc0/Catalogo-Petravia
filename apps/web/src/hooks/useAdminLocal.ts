export interface AdminToken {
  id: string;
  token: string;
  email: string;
  nombre?: string;
  esActivo: boolean;
  creadoEn: string;
}

const STORAGE_KEY = 'petravia_admin_tokens';

function readTokens(): AdminToken[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as AdminToken[];
  } catch {
    return [];
  }
}

function writeTokens(tokens: AdminToken[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function getAdminTokens(): AdminToken[] {
  return readTokens();
}

export function createAdminToken(email: string, nombre?: string): AdminToken {
  const tokens = readTokens();
  const newToken: AdminToken = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    email,
    nombre,
    esActivo: true,
    creadoEn: new Date().toISOString(),
  };
  tokens.unshift(newToken);
  writeTokens(tokens);
  return newToken;
}

export function deactivateAdminToken(id: string): boolean {
  const tokens = readTokens();
  const index = tokens.findIndex((token) => token.id === id);
  if (index === -1) {
    return false;
  }

  tokens[index].esActivo = false;
  writeTokens(tokens);
  return true;
}

export function validateClientToken(token: string) {
  const tokens = readTokens();
  return tokens.find((item) => item.token === token && item.esActivo) ?? null;
}
