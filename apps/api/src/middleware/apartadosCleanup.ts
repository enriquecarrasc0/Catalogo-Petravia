/**
 * apps/api/src/middleware/apartadosCleanup.ts
 * ────────────────────────────────────────────
 * Limpia apartados expirados periódicamente.
 * El estado "vendido"/"apartado" se calcula on-the-fly en
 * lotes.service (overlay), así que aquí solo hay que purgar filas.
 */
import { limpiarApartadosExpirados } from '../services/apartados.service.js';

export function iniciarLimpiezaApartados(intervaloMs: number = 60 * 60 * 1000) {
  function limpiar() {
    try {
      const eliminados = limpiarApartadosExpirados();
      if (eliminados > 0) console.log(`⏰ ${eliminados} apartado(s) expirado(s) eliminados`);
    } catch (err) {
      console.error('❌ Error durante limpieza de apartados:', err);
    }
  }

  limpiar();
  const intervalId = setInterval(limpiar, intervaloMs);
  console.log(`✅ Limpieza de apartados configurada cada ${intervaloMs / 1000 / 60} minutos`);
  return intervalId;
}
