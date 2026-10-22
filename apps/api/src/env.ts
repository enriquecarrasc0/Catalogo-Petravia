/**
 * apps/api/src/env.ts
 * ────────────────────
 * Carga apps/api/.env y expone helpers para leer variables de entorno.
 *
 * Debe importarse ANTES que cualquier otro módulo (ver index.ts). En ESM los
 * `import` se evalúan antes que el cuerpo del archivo, así que un
 * `dotenv.config()` escrito en index.ts corría DESPUÉS de que odoo.ts,
 * migrate.ts, etc. ya habían leído process.env.
 *
 * En Railway no existe el archivo .env: las variables vienen del panel
 * (Service → Variables) y dotenv simplemente no hace nada. dotenv tampoco
 * sobrescribe variables que ya existen en el entorno.
 *
 * Regla: NUNCA poner credenciales como valor por defecto en el código.
 * Si falta una variable obligatoria, el servidor no arranca y lo dice claro.
 */
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });

/** Devuelve la variable o lanza un error claro si no está definida. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
      `Configúrala en apps/api/.env (local) o en Railway → servicio API → Variables.`
    );
  }
  return value;
}

/** Variables sin las que la API no puede funcionar. */
const REQUERIDAS = ['ODOO_URL', 'ODOO_DB', 'ODOO_USER', 'ODOO_KEY'] as const;

const faltantes = REQUERIDAS.filter(n => !process.env[n]?.trim());
if (faltantes.length > 0) {
  console.error(
    `❌ Faltan variables de entorno obligatorias: ${faltantes.join(', ')}\n` +
    `   Local: agrégalas a apps/api/.env (usa apps/api/.env.example como guía).\n` +
    `   Railway: servicio API → Variables.`
  );
  process.exit(1);
}

// Resumen sin exponer secretos (nunca imprimir llaves ni contraseñas, ni
// siquiera parcialmente: los logs de Railway los puede ver cualquiera con
// acceso al proyecto).
console.log(
  `[ENV] Odoo: ${process.env.ODOO_URL} · ` +
  `SMTP: ${process.env.SMTP_HOST && process.env.SMTP_PASS ? 'configurado' : 'no configurado'}`
);
