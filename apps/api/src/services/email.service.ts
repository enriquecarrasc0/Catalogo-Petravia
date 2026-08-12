/**
 * apps/api/src/services/email.service.ts
 * ────────────────────────────────────────
 * Envío de correos vía SMTP (pensado para Gmail / Google Workspace,
 * pero funciona con cualquier proveedor SMTP estándar).
 *
 * Variables de entorno requeridas (ver .env.example):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM, ADMIN_EMAIL
 *
 * Si no están configuradas, el transporter no se crea y las funciones de
 * envío simplemente registran un aviso en consola (no rompen el flujo de
 * descarga del PDF).
 */
import nodemailer from 'nodemailer';
import type { ApartadoConLote } from './apartados.service.js';
import { construirNombreArchivoPDF } from './pdfApartados.service.js';

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let _configWarningShown = false;

function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (!_configWarningShown) {
      console.warn(
        '[email] SMTP no configurado (faltan variables en .env). ' +
        'No se enviarán correos de apartados, solo se generará el PDF.'
      );
      _configWarningShown = true;
    }
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transporter;
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Saldo disponible con la unidad correcta: m³ en bloques, m² en el resto. */
function formatSaldoApartado(lote: { tipo: string; saldoM2: number; saldoM3?: number }): string {
  return lote.tipo === 'bloque'
    ? `${(lote.saldoM3 ?? 0).toFixed(2)} m³`
    : `${lote.saldoM2.toFixed(2)} m²`;
}

function listaLotesHtml(apartados: ApartadoConLote[]): string {
  return apartados.map(ap => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e0d8;font-family:monospace;">${ap.loteId}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e0d8;">${ap.lote?.material ?? '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e0d8;">${ap.lote?.acabado ?? '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e0d8;text-align:right;">${ap.lote ? formatSaldoApartado(ap.lote) : '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e0d8;font-size:12px;color:#6b6258;">${formatFechaCorta(ap.expiraEn)}</td>
    </tr>
  `).join('');
}

/**
 * Envía al cliente que apartó los lotes una copia de su PDF de apartados.
 */
export async function enviarCorreoCliente(
  cliente: { email: string; nombre?: string },
  apartados: ApartadoConLote[],
  pdfBuffer: Buffer,
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const nombreMostrar = cliente.nombre || cliente.email.split('@')[0];

  const html = `
    <div style="font-family:Georgia, 'Times New Roman', serif; color:#1a1714; max-width:600px; margin:0 auto;">
      <p style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#b08d57;margin:0 0 8px;">
        Petravia · Inventario Exclusivo
      </p>
      <h2 style="font-weight:400;margin:0 0 16px;">Confirmación de tus apartados</h2>
      <p style="font-size:14px;line-height:1.6;color:#3a352f;">
        Hola ${nombreMostrar}, este es el resumen de los lotes que apartaste.
        Cada lote queda reservado por <strong>48 horas</strong>; si la venta no se confirma
        antes de su vencimiento, vuelve a estar disponible para otros clientes.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
        <thead>
          <tr style="text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b08d57;border-bottom:2px solid #1a1714;">
            <th style="padding:8px;">Lote</th><th style="padding:8px;">Material</th>
            <th style="padding:8px;">Acabado</th><th style="padding:8px;text-align:right;">Medida</th>
            <th style="padding:8px;">Expira</th>
          </tr>
        </thead>
        <tbody>${listaLotesHtml(apartados)}</tbody>
      </table>
      <p style="font-size:13px;color:#6b6258;">
        Adjuntamos tu resumen en PDF. Contacta a Petravia para completar la compra antes de que venzan tus apartados.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: cliente.email,
    subject: `Tu resumen de apartados — Petravia (${apartados.length} lote${apartados.length !== 1 ? 's' : ''})`,
    html,
    attachments: [
      { filename: construirNombreArchivoPDF(cliente.nombre, apartados), content: pdfBuffer, contentType: 'application/pdf' },
    ],
  });
}

/**
 * Notifica al vendedor dueño del cliente quién y qué apartó.
 */
export async function enviarCorreoVendedor(
  vendedorEmail: string | null | undefined,
  cliente: { email: string; nombre?: string },
  apartados: ApartadoConLote[],
  pdfBuffer: Buffer,
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  // Si el vendedor no tiene email configurado, se usa ADMIN_EMAIL como respaldo
  // (compatibilidad con instalaciones existentes de un solo admin).
  const destinatario = vendedorEmail ?? process.env.ADMIN_EMAIL;
  if (!destinatario) {
    console.warn('[email] El vendedor no tiene email configurado: no se envió notificación.');
    return;
  }

  const nombreMostrar = cliente.nombre || cliente.email.split('@')[0];

  const html = `
    <div style="font-family:Georgia, 'Times New Roman', serif; color:#1a1714; max-width:600px; margin:0 auto;">
      <h2 style="font-weight:400;margin:0 0 8px;">Nuevo PDF de apartados generado</h2>
      <p style="font-size:14px;line-height:1.6;">
        <strong>${nombreMostrar}</strong> (${cliente.email}) generó/descargó su resumen de apartados
        con <strong>${apartados.length}</strong> lote${apartados.length !== 1 ? 's' : ''}.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
        <thead>
          <tr style="text-align:left;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b08d57;border-bottom:2px solid #1a1714;">
            <th style="padding:8px;">Lote</th><th style="padding:8px;">Material</th>
            <th style="padding:8px;">Acabado</th><th style="padding:8px;text-align:right;">Medida</th>
            <th style="padding:8px;">Expira</th>
          </tr>
        </thead>
        <tbody>${listaLotesHtml(apartados)}</tbody>
      </table>
      <p style="font-size:12px;color:#6b6258;">Se adjunta el mismo PDF que recibió el cliente.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: destinatario,
    subject: `Apartado: ${nombreMostrar} reservó ${apartados.length} lote${apartados.length !== 1 ? 's' : ''}`,
    html,
    attachments: [
      { filename: construirNombreArchivoPDF(cliente.nombre, apartados), content: pdfBuffer, contentType: 'application/pdf' },
    ],
  });
}
