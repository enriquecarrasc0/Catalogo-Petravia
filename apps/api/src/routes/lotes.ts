import { Router } from 'express';
import { listLotes, getLote, esUbicacionVisibleParaCliente, setLoteOverride } from '../services/lotes.service.js';
import { apartarLote } from '../services/apartados.service.js';
import { buscarLotes, obtenerMateriales, obtenerGrupos } from '../services/busqueda.service.js';
import { generarZipFotosLotes, construirNombreArchivoZip } from '../services/fotosZip.service.js';
import { authClient, authVendedor, isVendedorRequest, type AuthenticatedRequest, type VendedorRequest } from '../middleware/authClient.js';
import type { GrupoMaterial, Acabado, EstadoLote, TipoLote } from '@petravia/shared';

export const lotesRouter = Router();

// GET /api/lotes — lista con filtros
// Clientes (sin Basic Auth de admin): solo ven lotes "disponible"
lotesRouter.get('/', async (req, res, next) => {
  try {
    const esAdmin = Boolean(isVendedorRequest(req));
    const { grupos, acabados, estado, tipo, busqueda, soloConFoto, page, pageSize } = req.query;

    let estadoFinal: EstadoLote | 'todos' = (estado as EstadoLote | 'todos') ?? 'todos';
    if (!esAdmin) {
      // Clientes no pueden ver apartados/vendidos bajo ninguna circunstancia
      estadoFinal = 'disponible';
    }

    const result = await listLotes({
      grupos:      Array.isArray(grupos)   ? (grupos as GrupoMaterial[])  : grupos   ? [grupos as GrupoMaterial]  : [],
      acabados:    Array.isArray(acabados) ? (acabados as Acabado[])      : acabados ? [acabados as Acabado]      : [],
      estado:      estadoFinal,
      tipo:        (tipo as TipoLote | 'todos') ?? 'todos',
      busqueda:    (busqueda as string) ?? '',
      soloConFoto: soloConFoto === 'true',
      // Clientes solo ven lotes de las ubicaciones/rutas permitidas.
      // Vendedor/admin ven el inventario completo, sin este filtro.
      soloRutasPermitidas: !esAdmin,
      page:        page     ? parseInt(page as string)     : 1,
      pageSize:    pageSize ? parseInt(pageSize as string) : 24,
    });
    res.json({ ok: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/lotes/buscar?material=...&grupo=...&metraje=100&tipo=bloque&largoMin=120&anchoMin=60
lotesRouter.get('/buscar', async (req, res, next) => {
  try {
    const { material, grupo, metraje, tipo, largoMin, anchoMin, altoMin } = req.query;
    const resultado = await buscarLotes({
      material:         material as string | undefined,
      grupo:            grupo    as string | undefined,
      metraje:          metraje  ? parseFloat(metraje as string) : undefined,
      tipo:             tipo     as 'bloque' | 'lamina' | 'formato' | undefined,
      largoMin:         largoMin ? parseFloat(largoMin as string) : undefined,
      anchoMin:         anchoMin ? parseFloat(anchoMin as string) : undefined,
      altoMin:          altoMin  ? parseFloat(altoMin  as string) : undefined,
      solo_disponibles: true,
    });
    res.json({ ok: true, data: resultado });
  } catch (err) { next(err); }
});

// POST /api/lotes/fotos-zip — descarga un .zip con las fotos de varios lotes
// (buscador avanzado). Requiere sesión de cliente, igual que apartar.
lotesRouter.post('/fotos-zip', authClient, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { loteIds } = req.body as { loteIds?: unknown };
    if (!Array.isArray(loteIds) || loteIds.length === 0) {
      res.status(400).json({ ok: false, error: 'Debes indicar al menos un lote' });
      return;
    }
    const ids = loteIds.map(String);

    const archive = await generarZipFotosLotes(ids);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${construirNombreArchivoZip(ids)}"`);
    archive.on('error', (err) => next(err));
    archive.pipe(res);
    await archive.finalize();
  } catch (err) { next(err); }
});

// GET /api/lotes/filtros/materiales?tipo=bloque
lotesRouter.get('/filtros/materiales', async (req, res, next) => {
  try {
    const { tipo } = req.query;
    res.json({ ok: true, data: await obtenerMateriales(tipo as TipoLote | undefined) });
  }
  catch (err) { next(err); }
});

// GET /api/lotes/filtros/grupos
lotesRouter.get('/filtros/grupos', async (_req, res, next) => {
  try { res.json({ ok: true, data: await obtenerGrupos() }); }
  catch (err) { next(err); }
});

// GET /api/lotes/:id
lotesRouter.get('/:id', async (req, res, next) => {
  try {
    const esAdmin = Boolean(isVendedorRequest(req));
    const lote = await getLote(decodeURIComponent(req.params.id));
    if (!lote) { res.status(404).json({ ok: false, error: 'Lote no encontrado' }); return; }
    if (!esAdmin && (lote.estado !== 'disponible' || !esUbicacionVisibleParaCliente(lote.ubicacion, lote.tipo))) {
      res.status(404).json({ ok: false, error: 'Lote no encontrado' }); return;
    }
    res.json({ ok: true, data: lote });
  } catch (err) { next(err); }
});

// PUT /api/lotes/:id/renombrar — admin/vendedor corrige el material (grupo)
// y/o el acabado mostrados, sin tocar el dato crudo en Odoo. Enviar {} o
// campos vacíos limpia el renombrado y vuelve a lo inferido automáticamente.
lotesRouter.put('/:id/renombrar', authVendedor, async (req: VendedorRequest, res, next) => {
  try {
    const { grupo, acabado } = req.body as { grupo?: string; acabado?: string };
    const loteId = decodeURIComponent(req.params.id);
    const existe = await getLote(loteId);
    if (!existe) { res.status(404).json({ ok: false, error: 'Lote no encontrado' }); return; }

    setLoteOverride(loteId, { grupo, acabado }, req.vendedorId);
    const lote = await getLote(loteId);
    res.json({ ok: true, data: lote });
  } catch (err) { next(err); }
});

// POST /api/lotes/:id/apartar — requiere token de cliente
lotesRouter.post('/:id/apartar', authClient, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteEmail  = req.clientEmail!;
    const clienteNombre = req.body.nombre || clienteEmail.split('@')[0];
    const result = await apartarLote({
      loteId:         decodeURIComponent(req.params.id),
      vendedorId:     req.clientVendedorId!,
      clienteEmail,
      clienteNombre,
    });
    if (!result.ok) { res.status(400).json({ ok: false, error: result.error }); return; }
    res.json({ ok: true, data: result.apartado });
  } catch (err) { next(err); }
});

// POST /api/lotes/:id/apartar-vendedor — el vendedor/admin aparta un lote
// a nombre de uno de sus clientes, con duración configurable (horas).
lotesRouter.post('/:id/apartar-vendedor', authVendedor, async (req: VendedorRequest, res, next) => {
  try {
    const { clienteEmail, clienteNombre, horas } = req.body as {
      clienteEmail?: string; clienteNombre?: string; horas?: number;
    };
    if (!clienteEmail || !String(clienteEmail).trim()) {
      res.status(400).json({ ok: false, error: 'Debes seleccionar un cliente' }); return;
    }
    const result = await apartarLote({
      loteId:         decodeURIComponent(req.params.id),
      vendedorId:     req.vendedorId!,
      clienteEmail:   String(clienteEmail).trim(),
      clienteNombre:  clienteNombre?.trim() || String(clienteEmail).split('@')[0],
      horas:          horas ? Number(horas) : 48,
      esVendedor:     true,
    });
    if (!result.ok) { res.status(400).json({ ok: false, error: result.error }); return; }
    res.json({ ok: true, data: result.apartado });
  } catch (err) { next(err); }
});
