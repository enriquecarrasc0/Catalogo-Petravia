/**
 * apps/api/src/services/fotosZip.service.ts
 * ────────────────────────────────────────────
 * Arma un .zip con las fotos de un conjunto de lotes (usado por el
 * botón "Descargar fotos" del buscador avanzado). Reutiliza el mismo
 * mecanismo que el generador de PDF: las fotos se piden directo a Odoo
 * vía XML-RPC (imagenes.service), nunca por fetch HTTP a sí mismo.
 */
import archiver from 'archiver';
import { getLote } from './lotes.service.js';
import { obtenerImagenBuffer, parsearUrlImagen } from './imagenes.service.js';

const MAX_LOTES_POR_DESCARGA = 50;

function slugify(texto: string): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-zA-Z0-9\s-]/g, '')                    // quitar símbolos
    .trim()
    .replace(/\s+/g, '-') || 'lote';
}

function extensionParaMime(mime: string): string {
  if (mime === 'image/png')  return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif')  return 'gif';
  return 'jpg';
}

/** Construye el nombre del archivo .zip descargado. */
export function construirNombreArchivoZip(loteIds: string[]): string {
  const fecha = new Date().toISOString().slice(0, 10);
  if (loteIds.length === 1) return `Petravia-Fotos-${slugify(loteIds[0])}-${fecha}.zip`;
  return `Petravia-Fotos-${loteIds.length}-lotes-${fecha}.zip`;
}

/**
 * Crea el archiver ya listo para hacer .pipe() a una respuesta HTTP.
 * No lanza si un lote no existe o no tiene fotos — simplemente lo omite;
 * si ninguno tuvo fotos, el .zip trae un LEEME.txt explicándolo.
 */
export async function generarZipFotosLotes(loteIds: string[]): Promise<archiver.Archiver> {
  const ids = [...new Set(loteIds)].slice(0, MAX_LOTES_POR_DESCARGA);
  const archive = archiver('zip', { zlib: { level: 9 } });

  let totalFotos = 0;

  for (const loteId of ids) {
    let lote;
    try {
      lote = await getLote(loteId);
    } catch {
      continue;
    }
    if (!lote || !lote.fotos?.length) continue;

    const carpeta = slugify(`${lote.id}-${lote.material}`);

    for (let i = 0; i < lote.fotos.length; i++) {
      const foto = lote.fotos[i];
      const parsed = parsearUrlImagen(foto.urlHd || foto.urlThumb);
      if (!parsed) continue;

      const resultado = await obtenerImagenBuffer(parsed.modelo, parsed.id, parsed.campo);
      if (!resultado) continue;

      const ext = extensionParaMime(resultado.mime);
      archive.append(resultado.buffer, { name: `${carpeta}/foto-${i + 1}.${ext}` });
      totalFotos++;
    }
  }

  if (totalFotos === 0) {
    archive.append(
      'No se encontraron fotos para los lotes seleccionados.',
      { name: 'LEEME.txt' }
    );
  }

  return archive;
}
