/**
 * apps/api/src/index.ts
 */
// ── Cargar y validar variables de entorno ANTES que cualquier otro módulo ──
// (tiene que ser el primer import: ver el porqué en env.ts)
import './env.js';

import express from 'express';
import cors from 'cors';

// ── Migración automática al arrancar ─────────────────────────
// Crea las tablas si no existen. Idempotente (IF NOT EXISTS).
import './db/migrate.js';

import { lotesRouter }     from './routes/lotes.js';
import { authRouter }      from './routes/auth.js';
import { vendedorRouter }  from './routes/vendedor.js';
import { apartadosRouter } from './routes/apartados.js';
import { favoritosRouter } from './routes/favoritos.js';
import { imagenesRouter }  from './routes/imagenes.js';
import { adminRouter }     from './routes/admin.js';
import { errorHandler }    from './middleware/errorHandler.js';
import { getUid }          from './db/odoo.js';
import { iniciarLimpiezaApartados } from './middleware/apartadosCleanup.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json());

app.use('/api/apartados', apartadosRouter);
app.use('/api/favoritos', favoritosRouter);
app.use('/api/lotes',     lotesRouter);
app.use('/api/auth',      authRouter);
app.use('/api/vendedor',  vendedorRouter);
app.use('/api/imagenes',  imagenesRouter);
app.use('/api/admin',     adminRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`🪨  Petravia API en http://localhost:${PORT}`);
  iniciarLimpiezaApartados();
  try {
    await getUid();
  } catch (e) {
    console.error('❌ No se pudo conectar a Odoo:', (e as Error).message);
  }
});
