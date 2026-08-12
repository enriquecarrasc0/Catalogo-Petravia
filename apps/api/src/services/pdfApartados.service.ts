/**
 * apps/api/src/services/pdfApartados.service.ts
 * ────────────────────────────────────────────────
 * Genera, en el servidor, el PDF de "Resumen de Apartados" de un cliente
 * con el mismo formato que el catálogo interno ("Lámina Almacen"):
 * portada, fotos grandes por lote agrupadas por material, y una tabla
 * de medidas disponibles al final de cada lote más un resumen general.
 */
import PDFDocument from 'pdfkit';
import type { ApartadoConLote } from './apartados.service.js';
import { obtenerImagenBuffer, parsearUrlImagen } from './imagenes.service.js';

const COLOR_GOLD    = '#b08d57';
const COLOR_GOLD_BG = '#f6efe4';
const COLOR_INK     = '#1a1714';
const COLOR_MUTED   = '#6b6258';
const COLOR_BORDER  = '#e5e0d8';
const COLOR_SAND    = '#f4f1ea';
const COLOR_OK      = '#2e7d4f';

const MARGIN = 50;
const PAGE_WIDTH  = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 34;
const MAX_Y = PAGE_HEIGHT - MARGIN - 24; // límite antes de forzar salto de página

const MAX_FOTOS_POR_LOTE = 12;

/**
 * Quita acentos/caracteres especiales y deja el string listo para usarse
 * en un nombre de archivo (sin espacios, sin diacríticos, ASCII-safe).
 */
function slugify(texto: string): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-zA-Z0-9\s-]/g, '')                    // quitar símbolos
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Construye el nombre del archivo PDF a partir del cliente y lo que
 * apartó, por ejemplo: "Petravia-Apartados-Juan-Perez-Marmol-Carrara-2026-07-17.pdf"
 * Si el cliente apartó varios materiales distintos, se listan hasta 3;
 * si son más, se resume como "N-materiales".
 */
export function construirNombreArchivoPDF(
  clienteNombre: string | undefined,
  apartados: ApartadoConLote[]
): string {
  const materiales = [...new Set(
    apartados.map(a => a.lote?.material).filter((m): m is string => Boolean(m))
  )];

  let parteMaterial: string;
  if (materiales.length === 0) parteMaterial = '';
  else if (materiales.length <= 3) parteMaterial = materiales.join('-');
  else parteMaterial = `${materiales.length}-materiales`;

  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const nombreSlug    = slugify(clienteNombre || 'Cliente') || 'Cliente';
  const materialSlug  = parteMaterial ? `-${slugify(parteMaterial)}` : '';

  return `Petravia-Apartados-${nombreSlug}${materialSlug}-${fecha}.pdf`;
}

// Columnas de la tabla de medidas (ancho disponible ≈ 495.28pt)
const TABLE_COLS = [
  { key: 'lote',     label: 'Lote',      width: 55 },
  { key: 'material', label: 'Material',  width: 110 },
  { key: 'acabado',  label: 'Acabado',   width: 80 },
  { key: 'largo',    label: 'Largo (m)', width: 60,  align: 'right' as const },
  { key: 'alto',     label: 'Alto (m)',  width: 55,  align: 'right' as const },
  { key: 'piezas',   label: 'Piezas',    width: 55,  align: 'right' as const },
  { key: 'm2',       label: 'Medida',    width: 80.28, align: 'right' as const },
];

function colX(index: number): number {
  let x = MARGIN;
  for (let i = 0; i < index; i++) x += TABLE_COLS[i].width;
  return x;
}

function cm2m(cm: number): string {
  return (cm / 100).toFixed(2);
}

function formatFechaLarga(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Descarga una imagen para incrustarla en el PDF.
 * IMPORTANTE: `urlHd`/`urlThumb` son rutas relativas de esta misma API
 * (ej. "/api/imagenes/stock.lot.image/123/image_1920"), NO URLs públicas
 * absolutas — por eso no se puede usar fetch(url) directamente (fallaría
 * siempre, silenciosamente, dejando el PDF sin fotos). En su lugar se
 * parsea la ruta y se pide el binario directo a Odoo vía XML-RPC.
 */
async function descargarImagen(url: string | undefined | null): Promise<Buffer | null> {
  if (!url) return null;
  const parsed = parsearUrlImagen(url);
  if (!parsed) return null;
  try {
    const resultado = await obtenerImagenBuffer(parsed.modelo, parsed.id, parsed.campo);
    return resultado?.buffer ?? null;
  } catch {
    return null;
  }
}

interface FilaMedida {
  loteId: string;
  material: string;
  acabado: string;
  largoCm: number;
  altoCm: number;
  piezas: number;
  m2: number;
  /** m³ en bloques, m² en el resto — cada fila trae su propia unidad porque
   *  un lote es siempre 100% bloque o 100% lámina/formato, nunca mixto. */
  unidad: 'm²' | 'm³';
}

export async function generarPDFApartados(
  cliente: { email: string; nombre?: string },
  apartados: ApartadoConLote[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const nombreMostrar = cliente.nombre || cliente.email;
  const ahora = new Date();
  const fechaCorta = formatFechaLarga(ahora);

  // ── Agrupar apartados por grupo de material (Puebla, Veracruz, etc.) ──
  const conLote = apartados.filter(a => a.lote);
  const grupos = new Map<string, ApartadoConLote[]>();
  for (const ap of conLote) {
    const g = ap.lote!.grupo || 'Otros';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(ap);
  }

  const totalFotos = conLote.reduce(
    (acc, ap) => acc + Math.min(ap.lote!.fotos?.length ?? 0, MAX_FOTOS_POR_LOTE), 0,
  );

  // ── Pre-descarga de todas las fotos (en paralelo) ──────────────
  const cacheFotos = new Map<string, Buffer | null>();
  await Promise.all(
    conLote.flatMap(ap =>
      (ap.lote!.fotos ?? []).slice(0, MAX_FOTOS_POR_LOTE).map(async (foto) => {
        if (cacheFotos.has(foto.urlHd)) return;
        const buf = await descargarImagen(foto.urlHd);
        cacheFotos.set(foto.urlHd, buf);
      }),
    ),
  );

  // ── Helpers de layout ───────────────────────────────────────────
  function ensureSpace(height: number) {
    if (doc.y + height > MAX_Y) doc.addPage();
  }

  function tituloSeccion(texto: string) {
    ensureSpace(34);
    doc.fillColor(COLOR_INK).font('Helvetica').fontSize(18)
       .text(texto, MARGIN, doc.y, { width: CONTENT_WIDTH });
    const lineY = doc.y + 4;
    doc.moveTo(MARGIN, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY)
       .lineWidth(1.5).strokeColor(COLOR_GOLD).stroke();
    doc.y = lineY + 14;
  }

  function badgeLote(id: string, x: number, y: number): number {
    doc.font('Helvetica-Bold').fontSize(9);
    const texto = `Lote ${id}`;
    const w = doc.widthOfString(texto) + 16;
    doc.roundedRect(x, y, w, 18, 3).fill(COLOR_GOLD_BG);
    doc.fillColor(COLOR_GOLD).text(texto, x + 8, y + 4.5);
    return w;
  }

  function dibujarEncabezadoTabla() {
    ensureSpace(22);
    const y = doc.y;
    doc.fillColor(COLOR_GOLD).fontSize(8).font('Helvetica-Bold');
    TABLE_COLS.forEach((col, i) => {
      doc.text(col.label.toUpperCase(), colX(i), y, {
        width: col.width,
        align: col.align ?? 'left',
        characterSpacing: 0.5,
      });
    });
    doc.y = y + 13;
    const lineY = doc.y;
    doc.moveTo(MARGIN, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY)
       .lineWidth(1).strokeColor(COLOR_INK).stroke();
    doc.y = lineY + 5;
  }

  function dibujarFilaTabla(fila: FilaMedida) {
    ensureSpace(18);
    const y = doc.y;
    doc.font('Courier').fontSize(8.5).fillColor(COLOR_INK)
       .text(fila.loteId, colX(0), y, { width: TABLE_COLS[0].width });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_INK)
       .text(fila.material, colX(1), y, { width: TABLE_COLS[1].width })
       .text(fila.acabado, colX(2), y, { width: TABLE_COLS[2].width })
       .text(cm2m(fila.largoCm), colX(3), y, { width: TABLE_COLS[3].width, align: 'right' })
       .text(cm2m(fila.altoCm), colX(4), y, { width: TABLE_COLS[4].width, align: 'right' })
       .text(String(fila.piezas), colX(5), y, { width: TABLE_COLS[5].width, align: 'right' })
       .text(`${fila.m2.toFixed(2)} ${fila.unidad}`, colX(6), y, { width: TABLE_COLS[6].width, align: 'right' });
    doc.y = y + 15;
  }

  function dibujarFilaSubtotal(label: string, piezas: number, m2: number, unidad: 'm²' | 'm³' = 'm²') {
    ensureSpace(18);
    const y = doc.y;
    const labelWidth = TABLE_COLS[0].width + TABLE_COLS[1].width + TABLE_COLS[2].width
      + TABLE_COLS[3].width + TABLE_COLS[4].width;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_INK)
       .text(label, colX(0), y, { width: labelWidth })
       .text(String(piezas), colX(5), y, { width: TABLE_COLS[5].width, align: 'right' })
       .text(`${m2.toFixed(2)} ${unidad}`, colX(6), y, { width: TABLE_COLS[6].width, align: 'right' });
    doc.moveDown(0.6);
    const lineY = doc.y;
    doc.moveTo(MARGIN, lineY).lineTo(PAGE_WIDTH - MARGIN, lineY)
       .lineWidth(0.5).strokeColor(COLOR_BORDER).stroke();
    doc.y = lineY + 8;
  }

  function filasDeLote(ap: ApartadoConLote): FilaMedida[] {
    const lote = ap.lote!;
    const esBloque = lote.tipo === 'bloque';
    if (lote.piezas && lote.piezas.length > 0) {
      return lote.piezas.map(p => ({
        loteId: ap.loteId,
        material: lote.material,
        acabado: lote.acabado,
        largoCm: p.largo,
        altoCm: p.ancho,
        piezas: p.piezas,
        m2: p.m3 != null ? p.m3 : p.m2,
        unidad: p.m3 != null ? 'm³' : 'm²',
      }));
    }
    // Sin desglose de piezas: usar los totales del lote como única fila
    // (m³ en bloques — saldoM2 siempre es 0 para ese tipo, no aplica).
    return [{
      loteId: ap.loteId, material: lote.material, acabado: lote.acabado,
      largoCm: 0, altoCm: 0, piezas: lote.saldoPiezas,
      m2: esBloque ? (lote.saldoM3 ?? 0) : lote.saldoM2,
      unidad: esBloque ? 'm³' : 'm²',
    }];
  }

  // ════════════════════════════════════════════════════════════════
  // PORTADA
  // ════════════════════════════════════════════════════════════════
  doc.y = 230;
  doc.fillColor(COLOR_GOLD).fontSize(10).font('Helvetica')
     .text('PETRAVIA · INVENTARIO EXCLUSIVO', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH, characterSpacing: 1.5 });
  doc.moveDown(0.8);
  doc.fillColor(COLOR_INK).fontSize(30).font('Helvetica')
     .text('Resumen de Apartados', MARGIN, doc.y, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.9);
  doc.fillColor(COLOR_MUTED).fontSize(12)
     .text(`Preparado para: ${nombreMostrar}`, { align: 'center', width: CONTENT_WIDTH });
  doc.font('Helvetica').fontSize(11)
     .text(`${conLote.length} lote${conLote.length !== 1 ? 's' : ''} · ${totalFotos} fotografía${totalFotos !== 1 ? 's' : ''}`,
       { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.6);
  doc.fontSize(10).text(fechaCorta, { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(1.2);
  doc.fillColor(COLOR_MUTED).fontSize(9)
     .text('Resumen general de medidas en última hoja', { align: 'center', width: CONTENT_WIDTH });

  // ════════════════════════════════════════════════════════════════
  // PÁGINAS POR GRUPO / LOTE — fotos grandes + medidas
  // ════════════════════════════════════════════════════════════════
  for (const [grupo, lista] of grupos) {
    doc.addPage();
    tituloSeccion(grupo);

    for (const ap of lista) {
      const lote = ap.lote!;
      ensureSpace(40);

      // ── Encabezado de la ficha del lote ──
      const yHead = doc.y;
      const wBadge = badgeLote(ap.loteId, MARGIN, yHead);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_INK)
         .text(lote.material, MARGIN + wBadge + 10, yHead + 3, { width: CONTENT_WIDTH - wBadge - 140 });
      doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
         .text(lote.acabado || '—', MARGIN, yHead + 3, { width: CONTENT_WIDTH, align: 'right' });
      doc.y = yHead + 24;

      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_OK)
         .text(`✓ ${lote.saldoPiezas} pzas`, MARGIN, doc.y, { continued: true, width: 200 })
         .fillColor(COLOR_MUTED)
         .text(`    ⟋ ${lote.tipo === 'bloque' ? (lote.saldoM3 ?? 0).toFixed(2) + ' m³' : lote.saldoM2.toFixed(2) + ' m²'}`);
      doc.moveDown(0.6);

      // ── Grid de fotos (2 columnas) ──
      const fotos = (lote.fotos ?? []).slice(0, MAX_FOTOS_POR_LOTE).filter(f => cacheFotos.get(f.urlHd));
      const total = fotos.length;
      const GAP = 12;
      const imgW = (CONTENT_WIDTH - GAP) / 2;
      const imgH = 130;
      const captionH = 16;
      const cellH = imgH + captionH;

      for (let i = 0; i < total; i += 2) {
        ensureSpace(cellH + 10);
        const rowY = doc.y;
        const pair = [fotos[i], fotos[i + 1]].filter(Boolean);

        pair.forEach((foto, idx) => {
          const x = MARGIN + idx * (imgW + GAP);
          const buf = cacheFotos.get(foto.urlHd);
          doc.rect(x, rowY, imgW, imgH).fill(COLOR_SAND);
          if (buf) {
            try {
              doc.image(buf, x, rowY, { fit: [imgW, imgH], align: 'center', valign: 'center' });
            } catch {
              // imagen corrupta o formato no soportado: se deja el fondo
            }
          }
          doc.rect(x, rowY + imgH - captionH, imgW, captionH).fill(COLOR_INK);
          doc.fillColor('#ffffff').font('Helvetica').fontSize(7.5)
             .text(`${i + idx + 1}/${total} · ${ap.loteId} · ${lote.acabado}`, x + 6, rowY + imgH - captionH + 4, {
               width: imgW - 12,
             });
        });

        doc.y = rowY + cellH + 8;
      }

      if (total === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
           .text('Sin fotografías disponibles para este lote.', MARGIN, doc.y);
        doc.moveDown(0.6);
      }

      // ── Tabla de medidas disponibles ──
      ensureSpace(26);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_INK)
         .text('Medidas disponibles', MARGIN, doc.y);
      doc.moveDown(0.4);
      dibujarEncabezadoTabla();
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_INK);

      const filas = filasDeLote(ap);
      let subPiezas = 0, subM2 = 0;
      for (const fila of filas) {
        dibujarFilaTabla(fila);
        subPiezas += fila.piezas;
        subM2 += fila.m2;
      }
      dibujarFilaSubtotal('Total', subPiezas, subM2, filas[0]?.unidad ?? 'm²');
      doc.moveDown(1);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // RESUMEN GENERAL DE MEDIDAS (última página)
  // ════════════════════════════════════════════════════════════════
  doc.addPage();
  tituloSeccion(`Resumen de medidas disponibles — ${conLote.length} lote${conLote.length !== 1 ? 's' : ''} · ${fechaCorta}`);

  dibujarEncabezadoTabla();
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_INK);

  let totalPiezasGeneral = 0;
  let totalM2General = 0;
  let totalM3General = 0;

  for (const ap of conLote) {
    const filas = filasDeLote(ap);
    let subPiezas = 0, subM2 = 0;
    for (const fila of filas) {
      dibujarFilaTabla(fila);
      subPiezas += fila.piezas;
      subM2 += fila.m2;
    }
    const unidadLote = filas[0]?.unidad ?? 'm²';
    dibujarFilaSubtotal(`Subtotal Lote ${ap.loteId}`, subPiezas, subM2, unidadLote);
    totalPiezasGeneral += subPiezas;
    if (unidadLote === 'm³') totalM3General += subM2; else totalM2General += subM2;
  }

  ensureSpace(24);
  {
    const labelWidth = TABLE_COLS[0].width + TABLE_COLS[1].width + TABLE_COLS[2].width
      + TABLE_COLS[3].width + TABLE_COLS[4].width;
    // m² y m³ se muestran por separado — no se pueden sumar en una sola
    // cifra (unidades físicas distintas), por ejemplo cuando el cliente
    // apartó bloques y láminas/formato en el mismo pedido.
    const totalTexto = [
      totalM2General > 0 ? `${totalM2General.toFixed(2)} m²` : null,
      totalM3General > 0 ? `${totalM3General.toFixed(2)} m³` : null,
    ].filter(Boolean).join(' · ') || '0.00 m²';
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_INK)
       .text('Total', colX(0), y, { width: labelWidth })
       .text(String(totalPiezasGeneral), colX(5), y, { width: TABLE_COLS[5].width, align: 'right' })
       .text(totalTexto, colX(6), y, { width: TABLE_COLS[6].width, align: 'right' });
  }
  doc.moveDown(1.6);

  ensureSpace(60);
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
  const notas = [
    'Los precios y disponibilidad están sujetos a cambio sin previo aviso.',
    'Los lotes apartados se reservan durante 48 horas; si no se confirma la compra en ese plazo, vuelven a estar disponibles.',
    'Las medidas indicadas son aproximadas y pueden presentar variaciones al momento de la carga.',
  ];
  for (const nota of notas) {
    doc.text(`•  ${nota}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }

  // ════════════════════════════════════════════════════════════════
  // PIE DE PÁGINA (todas las páginas, incluida la portada)
  // ════════════════════════════════════════════════════════════════
  const totalPaginas = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPaginas; i++) {
    doc.switchToPage(i);
    // El pie va por debajo del margen inferior por defecto (50pt). Si se
    // escribe ahí sin más, pdfkit detecta "desbordamiento" y agrega
    // automáticamente una página en blanco nueva para el texto. Se baja
    // el margen inferior a 0 solo para estas líneas, ya en la página final.
    doc.page.margins.bottom = 0;
    doc.moveTo(MARGIN, FOOTER_Y - 8).lineTo(PAGE_WIDTH - MARGIN, FOOTER_Y - 8)
       .lineWidth(0.5).strokeColor(COLOR_BORDER).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
       .text(`Petravia · Para: ${nombreMostrar}`, MARGIN, FOOTER_Y, { width: 300, lineBreak: false });
    doc.text(fechaCorta, MARGIN, FOOTER_Y, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
  }

  doc.end();
  return finished;
}
