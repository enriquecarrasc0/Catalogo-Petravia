/**
 * lotes.service.ts — Odoo como fuente de datos + overlay de estados locales (SQLite)
 *
 * Los estados apartado/vendido se guardan en SQLite (apartados.service).
 * Al servir lotes, se mezclan los datos de Odoo con el estado local.
 */
import {
  urlFotoLote, versionDe, registrarFotos, esFotoPendiente, alCambiarPendientes,
  deteccionConfigurada, totalFotosPendientes,
} from './fotosOptimizadas.service.js';
import { executeKw } from '../db/odoo.js';
import db from '../db/index.js';
import type { Lote, Foto, Pieza, PaginatedResponse, FiltrosCatalogo } from '@petravia/shared';
import { esUbicacionVisibleParaCliente, etiquetaUbicacion } from '../config/ubicacionesCliente.js';

// ─── Re-exportar grupoMaterial y ordenLote inline (sin @petravia/shared en runtime) ─

const GRUPO_REGLAS: Array<[RegExp, string]> = [
  [/PUEBLA/i,                        'Puebla'],
  [/VERACRUZ|^VER|^CC/i,            'Veracruz'],
  [/TERRACOTA/i,                     'Terracota'],
  [/CARAMEL|IVORY/i,                 'Caramel Ivory'],
  [/SANTO\s*TOMAS|STO\s*TOM/i,      'Santo Tomas'],
  [/AQUA\s*BL(UE|U)/i,              'Aqua Blue'],
  [/VINTAGE/i,                       'Vintage'],
];

function grupoMaterial(material: string): Lote['grupo'] {
  const upper = material.toUpperCase();
  for (const [regex, grupo] of GRUPO_REGLAS) {
    if (regex.test(upper)) return grupo as Lote['grupo'];
  }
  return 'Otros';
}

const ORDEN_GRUPOS = ['Puebla','Veracruz','Terracota','Caramel Ivory','Santo Tomas','Aqua Blue','Vintage','Otros'];

// ─── Tipo de producto: Bloque vs Lámina vs Formato ─────────────
// Regla validada contra datos reales de Odoo (ver apps/api/scripts/audit-tipos.mjs):
// el 100% de los materiales que dicen "Block"/"Bloque" en el nombre son
// efectivamente bloques de cantera — incluso cuando llevan "(LAMINA, ...)"
// entre paréntesis, eso describe el formato de corte previsto, no el tipo
// de producto. No existe ningún caso real de lo contrario.
//
// El respaldo anterior por grosor se eliminó: tenía un bug (un grosor de
// 0cm en Odoo se interpretaba como "sin tope", inflando el cálculo) y
// generaba falsos positivos de "bloque" en materiales que en realidad son
// láminas (ej. "VERACRUZ CC STD (MASILLA, S/ACABADO)"). Sin palabra
// literal "block"/"bloque", se clasifica como lámina o formato.
//
// "Formato" se separa de "lámina" con la misma señal que ya usa
// parseTituloLote()/etiquetaLamina() en el frontend para el rótulo de
// presentación: la primera palabra del nombre crudo, antes del paréntesis,
// ej. "Formato (Puebla, Retape, Honed)" → primera palabra "Formato".
// Cualquier otra cosa que no sea "Block(s)/Bloque(s)" ni empiece con
// "Formato" se sigue clasificando como "lamina" (comportamiento histórico,
// incluye "Lamina Bruta (...)" y demás variantes sin prefijo "Formato").
const RE_BLOQUE  = /\bBLOCKS?\b|\bBLOQUES?\b/i;
const RE_FORMATO = /^\s*FORMATO\b/i;

function inferirTipo(material: string): Lote['tipo'] {
  if (RE_BLOQUE.test(material)) return 'bloque';
  return RE_FORMATO.test(material) ? 'formato' : 'lamina';
}

function ordenLote(a: Lote, b: Lote): number {
  const gi = ORDEN_GRUPOS.indexOf(a.grupo), gj = ORDEN_GRUPOS.indexOf(b.grupo);
  if (gi !== gj) return gi - gj;
  if (a.estado === 'vendido' && b.estado !== 'vendido') return 1;
  if (b.estado === 'vendido' && a.estado !== 'vendido') return -1;
  const saldoA = a.tipo === 'bloque' ? (a.saldoM3 ?? 0) : a.saldoM2;
  const saldoB = b.tipo === 'bloque' ? (b.saldoM3 ?? 0) : b.saldoM2;
  return saldoB - saldoA;
}

// ─── Tipos Odoo ───────────────────────────────────────────────

interface OdooLot {
  id: number; name: string;
  product_id: [number, string] | false;
  product_qty: number;
  length_m: number; width_m: number; height_m: number;
  area_m2: number; total_area_m2: number;
  image_ids: number[];
  write_date: string; create_date: string;
}

interface OdooLotImage {
  id: number;
  name: string | false;
  sequence: number;
  write_date: string | false;
}

/** stock.quant — usado solo para saber en qué ubicación física está cada lote. */
interface OdooQuant {
  lot_id: [number, string] | false;
  location_id: [number, string] | false;
  quantity: number;
}

const LOT_FIELDS = ['name','product_id','product_qty','length_m','width_m','height_m','area_m2','total_area_m2','image_ids','write_date','create_date'];

const ACABADOS_RE = /\b(MATE\s*S[-\s]R|MATE|BRILL[A-Z]*|CEPILL[A-Z]*\s*S[-\s]R|CEPILL[A-Z]*|SANDBLAST|SPAZZOLATO|VETEADO|BOOK\s*MATCH|MICROSANDBLAST)\b/i;

function extraerAcabado(nombre: string): string {
  const m = nombre.match(ACABADOS_RE);
  if (!m) return '';
  const raw = m[1].toUpperCase().replace(/\s+/g, ' ').trim();
  const MAP: Record<string,string> = {
    'MATE S-R':'Mate S-R','MATE S R':'Mate S-R','MATE':'Mate',
    'CEPILLADO S-R':'Cepillado S-R','CEPILLADO S R':'Cepillado S-R','CEPILLADO':'Cepillado',
    'SANDBLAST':'Sandblast','SPAZZOLATO':'Spazzolato','VETEADO':'Veteado',
    'BOOK MATCH':'Book Match','MICROSANDBLAST':'Microsandblast',
  };
  for (const [k,v] of Object.entries(MAP)) if (raw.startsWith(k)) return v;
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}

/**
 * URLs de imagen — apuntan al proxy local (/api/imagenes/lote/...) en lugar
 * de directo a Odoo, porque Odoo bloquea la carga de /web/image/...
 * cuando la request viene de un origen distinto (el navegador del cliente).
 *
 * El proxy sirve versiones WebP optimizadas (thumb ~800px / hd ~1920px)
 * cacheadas en disco — ver services/fotosOptimizadas.service.ts. La URL
 * lleva ?v=<write_date> para que el navegador la cachee indefinidamente y
 * se invalide sola si cambian la foto en Odoo.
 */

// ─── Estado local (apartados en SQLite) ──────────────────────

interface EstadoLocal { estado: 'apartado' | 'vendido'; clienteNombre?: string; vendedorId?: string; }

// ─── Renombrado manual (grupo/acabado) — overlay en SQLite ────

interface OverrideLocal { grupo?: string; acabado?: string; }

function getOverridesLocales(): Map<string, OverrideLocal> {
  const map = new Map<string, OverrideLocal>();
  try {
    const rows = db.prepare(`SELECT lote_id, grupo, acabado FROM lote_overrides`).all() as
      Array<{ lote_id: string; grupo: string | null; acabado: string | null }>;
    for (const r of rows) {
      map.set(r.lote_id, { grupo: r.grupo ?? undefined, acabado: r.acabado ?? undefined });
    }
  } catch {
    // Tabla aún no existe (primera ejecución) — se ignora.
  }
  return map;
}

/**
 * Guarda (o limpia, si ambos campos vienen vacíos) el renombrado manual
 * de un lote. `grupo` y `acabado` deben venir de las listas conocidas
 * (GRUPOS_MATERIALES / ACABADOS_CONOCIDOS en @petravia/shared), pero no
 * se valida aquí para no acoplar el backend a esas constantes de UI.
 */
export function setLoteOverride(loteId: string, datos: { grupo?: string; acabado?: string }, vendedorId?: string): void {
  const grupo   = datos.grupo?.trim()   || null;
  const acabado = datos.acabado?.trim() || null;

  if (!grupo && !acabado) {
    db.prepare(`DELETE FROM lote_overrides WHERE lote_id = ?`).run(loteId);
    return;
  }

  db.prepare(`
    INSERT INTO lote_overrides (lote_id, grupo, acabado, actualizado_por, actualizado_en)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(lote_id) DO UPDATE SET
      grupo = excluded.grupo,
      acabado = excluded.acabado,
      actualizado_por = excluded.actualizado_por,
      actualizado_en = excluded.actualizado_en
  `).run(loteId, grupo, acabado, vendedorId ?? null);
}

/** Quita el renombrado manual y vuelve a mostrar el grupo/acabado inferidos de Odoo. */
export function clearLoteOverride(loteId: string): void {
  db.prepare(`DELETE FROM lote_overrides WHERE lote_id = ?`).run(loteId);
}

// ─── Lotes ocultos temporalmente (solo admin) — overlay en SQLite ──

interface OcultoLocal { hasta: string | null; }

function getOcultosLocales(): Map<string, OcultoLocal> {
  const map = new Map<string, OcultoLocal>();
  try {
    // Los ocultamientos vencidos se borran aquí mismo: así "temporalmente"
    // se cumple sin depender de ningún cron.
    db.prepare(`DELETE FROM lotes_ocultos WHERE hasta IS NOT NULL AND hasta <= ?`).run(new Date().toISOString());
    const rows = db.prepare(`SELECT lote_id, hasta FROM lotes_ocultos`).all() as
      Array<{ lote_id: string; hasta: string | null }>;
    for (const r of rows) map.set(r.lote_id, { hasta: r.hasta });
  } catch {
    // Tabla aún no existe (primera ejecución) — se ignora.
  }
  return map;
}

/**
 * Oculta un lote del catálogo para clientes y vendedores. `dias` = null →
 * hasta que el admin lo vuelva a mostrar. Volver a ocultarlo reemplaza el
 * plazo anterior.
 */
export function ocultarLote(loteId: string, dias: number | null, vendedorId?: string): void {
  const hasta = dias ? new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString() : null;
  db.prepare(`
    INSERT INTO lotes_ocultos (lote_id, hasta, oculto_por, oculto_en)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lote_id) DO UPDATE SET
      hasta = excluded.hasta, oculto_por = excluded.oculto_por, oculto_en = excluded.oculto_en
  `).run(loteId, hasta, vendedorId ?? null);
}

/** Vuelve a mostrar un lote oculto. */
export function mostrarLote(loteId: string): void {
  db.prepare(`DELETE FROM lotes_ocultos WHERE lote_id = ?`).run(loteId);
}

function getEstadosLocales(): Map<string, EstadoLocal> {
  const map = new Map<string, EstadoLocal>();
  try {
    // Ventas confirmadas localmente (prioridad máxima)
    const ventas = db.prepare(`SELECT lote_id FROM ventas_locales`).all() as Array<{ lote_id: string }>;
    for (const v of ventas) {
      map.set(v.lote_id, { estado: 'vendido' });
    }

    // Apartados vigentes (no sobreescriben una venta ya confirmada)
    const apartados = db.prepare(`
      SELECT lote_id, cliente_nombre, vendedor_id FROM apartados
      WHERE expira_en > datetime('now')
    `).all() as Array<{ lote_id: string; cliente_nombre: string; vendedor_id: string | null }>;
    for (const a of apartados) {
      if (!map.has(a.lote_id)) {
        map.set(a.lote_id, { estado: 'apartado', clienteNombre: a.cliente_nombre, vendedorId: a.vendedor_id ?? undefined });
      }
    }
  } catch {
    // Si las tablas no existen aún, ignorar (primera ejecución)
  }
  return map;
}

// ─── Mapper ───────────────────────────────────────────────────

function mapLote(raw: OdooLot, fotos: Foto[], estadoLocal?: EstadoLocal, ubicacion?: string, override?: OverrideLocal): Lote {
  const materialNombre = raw.product_id ? raw.product_id[1] : 'Sin material';
  const saldoPiezas = Math.round(raw.product_qty ?? 0);
  const tipo = inferirTipo(materialNombre);

  // Estado: prioridad → estado local (apartado/vendido por SQLite) → Odoo (0 pzs = vendido)
  let estado: Lote['estado'] = saldoPiezas === 0 ? 'vendido' : 'disponible';
  if (estadoLocal) estado = estadoLocal.estado;

  const piezas: Pieza[] = [];
  const largo  = (raw.length_m ?? 0) * 100;
  const ancho  = (raw.width_m  ?? 0) * 100;
  const alto   = (raw.height_m ?? 0) * 100;
  const areaM2 = raw.area_m2 ?? 0; // área individual por lámina, ya calculada en Odoo

  let saldoM2 = raw.total_area_m2 ?? 0;
  let saldoM3: number | undefined;

  if (tipo === 'bloque') {
    // Los bloques se miden en volumen, no en área. length_m/width_m/height_m
    // ya vienen en metros desde Odoo, así que el producto es directamente m³.
    const volumenUnitarioM3 = (raw.length_m ?? 0) * (raw.width_m ?? 0) * (raw.height_m ?? 0);
    saldoM3 = Math.round(volumenUnitarioM3 * saldoPiezas * 1000) / 1000;
    saldoM2 = 0; // el área no aplica a un bloque — se muestra el volumen

    if (largo > 0 && ancho > 0 && alto > 0 && saldoPiezas > 0) {
      piezas.push({
        largo:  Math.round(largo),
        ancho:  Math.round(ancho),
        grosor: Math.round(alto * 10) / 10, // alto real del bloque
        piezas: saldoPiezas,
        m2:     areaM2,
        m3:     Math.round(volumenUnitarioM3 * 1000) / 1000,
      });
    }
  } else if (largo > 0 && saldoPiezas > 0) {
    // Patrón A: largo + ancho (ancho > 0, alto es grosor)
    // Patrón B: largo + alto como dimensiones planas (ancho = 0)
    const dim2   = ancho > 0 ? ancho  : alto;
    const grosor = ancho > 0 ? alto   : 0;

    if (dim2 > 0) {
      piezas.push({
        largo:  Math.round(largo),
        ancho:  Math.round(dim2),
        grosor: grosor > 0 ? Math.round(grosor * 10) / 10 : undefined,
        piezas: saldoPiezas,
        m2:     areaM2 > 0 ? areaM2 : saldoM2, // usar area_m2 individual si existe
      });
    }
  }

  return {
    id: raw.name, material: materialNombre,
    grupo: (override?.grupo as Lote['grupo']) || grupoMaterial(materialNombre),
    acabado: override?.acabado || extraerAcabado(materialNombre),
    tipo,
    saldoPiezas, saldoM2, saldoM3, estado,
    pedido: estado === 'apartado',
    cliente: estadoLocal?.clienteNombre,
    enExcel: true, fotos, piezas,
    creadoEn: raw.create_date, actualizadoEn: raw.write_date,
    ubicacion,
    renombrado: Boolean(override?.grupo || override?.acabado),
  };
}

// ─── Cache de Odoo (5 min) ────────────────────────────────────

interface CacheEntry { data: Array<Omit<Lote, 'estado'|'pedido'|'cliente'> & { _raw: OdooLot }>; ts: number; }
type OdooDataCache = { lotes: OdooLot[]; fotos: Map<number, Foto>; ubicaciones: Map<number, string>; ts: number };
let _cache: OdooDataCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Si el cache ya expiró y llegan varias peticiones a la vez (los 4-5
// endpoints del catálogo se piden casi juntos desde el front), sin esto
// cada una dispara su propia ronda completa de llamadas a Odoo (search_read
// de 2000 lotes + imágenes + ubicaciones) en paralelo — una "estampida" que
// multiplica la carga sobre Odoo justo cuando ya viene lento. Con esto,
// todas comparten la misma promesa en curso.
let _fetchEnCurso: Promise<OdooDataCache> | null = null;

// Log de control: cada vez que cambia el conjunto de fotos detectadas como
// "Foto pendiente de subir", avisa cuántos lotes quedaron ocultos por eso
// (para verificar en los logs de Railway que la detección va bien).
alCambiarPendientes(() => {
  if (!deteccionConfigurada() || !_cache) return;
  const ocultos = _cache.lotes
    .filter(l => (l.image_ids ?? []).length > 0 && l.image_ids.every(id => esFotoPendiente(id)))
    .map(l => l.name);
  const muestra = ocultos.slice(0, 15).join(', ') + (ocultos.length > 15 ? ', ...' : '');
  console.log(`  [fotos] "Foto pendiente": ${totalFotosPendientes()} foto(s) detectadas → ` +
    `${ocultos.length} lote(s) ocultos del catálogo${ocultos.length ? ` (${muestra})` : ''}`);
});

/**
 * Obtiene la ubicación física "principal" de cada lote a partir de
 * stock.quant (la ubicación con más cantidad, si el lote está repartido
 * en más de una). stock.lot no trae la ubicación directamente — hay que
 * cruzarla con los quants.
 */
async function getUbicacionesPorLote(lotIds: number[]): Promise<Map<number, string>> {
  const ubicaciones = new Map<number, string>();
  if (lotIds.length === 0) return ubicaciones;

  // Solo ubicaciones "internas" (almacén real, tipo 'Interno' en el Excel de
  // referencia) — así se excluyen ubicaciones virtuales de Odoo como
  // "Inventory adjustment", "Customers", "Vendors", etc. Sin este filtro, un
  // lote ya vendido (0 en todas las ubicaciones reales) podía "heredar" una
  // ubicación virtual como si fuera su ubicación física.
  const quants = await executeKw<OdooQuant[]>('stock.quant', 'search_read',
    [[['lot_id', 'in', lotIds], ['quantity', '>', 0], ['location_id.usage', '=', 'internal']]],
    { fields: ['lot_id', 'location_id', 'quantity'] });

  const mejorCantidad = new Map<number, number>();
  for (const q of quants) {
    if (!q.lot_id || !q.location_id) continue;
    const loteId = q.lot_id[0];
    const cantidadPrevia = mejorCantidad.get(loteId) ?? -Infinity;
    if (q.quantity > cantidadPrevia) {
      mejorCantidad.set(loteId, q.quantity);
      ubicaciones.set(loteId, q.location_id[1]);
    }
  }
  return ubicaciones;
}

/**
 * Trae TODOS los stock.lot de Odoo, paginando en bloques de `PAGE_SIZE`
 * en vez de un único `search_read` con `limit` fijo.
 *
 * Antes se pedía `limit: 2000` en una sola llamada. Mientras el total de
 * lotes en Odoo se mantuvo por debajo de eso, pasó desapercibido — pero
 * en cuanto el inventario creció más allá de 2000 registros (ej. tras una
 * importación masiva de bloques), Odoo simplemente cortaba la respuesta
 * ahí, sin avisar, y CUÁLES lotes sobrevivían al corte dependía del orden
 * por default de Odoo — nada garantizaba que fueran, por ejemplo, las
 * láminas en vez de los bloques. Resultado: el catálogo podía mostrar de
 * golpe muchísimo menos inventario del real, sin ningún error visible.
 *
 * `order: 'id asc'` es explícito a propósito: paginar con offset/limit
 * solo da resultados estables si el orden no cambia entre llamadas: sin
 * un order fijo, Odoo podría (en teoría) devolver páginas distintas si el
 * orden implícito varía, duplicando o saltándose registros.
 *
 * `MAX_PAGINAS` es un techo de seguridad — no un límite de negocio, sino
 * una salvaguarda para que un bug futuro (o un crecimiento de inventario
 * fuera de lo previsto) no deje a la API pidiendo páginas a Odoo sin fin.
 * Si algún día el inventario real supera ese techo, esto avisa por log en
 * vez de fallar en silencio otra vez.
 */
async function fetchAllStockLots(): Promise<OdooLot[]> {
  const PAGE_SIZE = 2000;
  const MAX_PAGINAS = 20; // techo de seguridad: hasta 40,000 lotes

  const todos: OdooLot[] = [];
  let offset = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const page = await executeKw<OdooLot[]>('stock.lot', 'search_read', [[]], {
      fields: LOT_FIELDS,
      limit: PAGE_SIZE,
      offset,
      order: 'id asc',
    });
    todos.push(...page);
    if (page.length < PAGE_SIZE) return todos; // última página (vino incompleta)
    offset += PAGE_SIZE;
  }

  console.warn(`[WARN] fetchAllStockLots: se alcanzó el techo de seguridad de ${MAX_PAGINAS} páginas (${MAX_PAGINAS * PAGE_SIZE} lotes) — puede haber más en Odoo sin traer. Revisar MAX_PAGINAS.`);
  return todos;
}

async function fetchOdooData(): Promise<OdooDataCache> {
  const rawLotes = await fetchAllStockLots();

  const allImageIds = rawLotes.flatMap(l => l.image_ids ?? []);
  const fotosMap = new Map<number, Foto>();

  if (allImageIds.length > 0) {
    const images = await executeKw<OdooLotImage[]>('stock.lot.image', 'search_read',
      [[['id', 'in', allImageIds]]], { fields: ['id', 'name', 'sequence', 'write_date'] });

    for (const img of images) {
      const version = versionDe(img.write_date);
      fotosMap.set(img.id, {
        id: String(img.id),
        nombre: img.name || `foto-${img.id}`,
        urlThumb: urlFotoLote(img.id, version, 'thumb'),
        urlHd: urlFotoLote(img.id, version, 'hd'),
        loteId: '',
      });
    }

    // Registra versiones y arranca en segundo plano la conversión a WebP
    // de las fotos que todavía no estén en el cache de disco.
    registrarFotos(
      images.map(img => ({ id: img.id, version: versionDe(img.write_date) })),
      new Map(rawLotes.flatMap(l => (l.image_ids ?? []).map(id => [id, l.name] as const))),
    );
  }

  const ubicaciones = await getUbicacionesPorLote(rawLotes.map(l => l.id));

  const data: OdooDataCache = { lotes: rawLotes, fotos: fotosMap, ubicaciones, ts: Date.now() };
  console.log(`  Odoo: ${data.lotes.length} lotes cargados`);
  return data;
}

async function getOdooData(): Promise<OdooDataCache> {
  const cacheVigente = _cache && Date.now() - _cache.ts < CACHE_TTL_MS;
  if (cacheVigente) return _cache!;

  // Ya hay un refresh en curso (disparado por otra petición concurrente):
  // esperamos ese mismo resultado en vez de lanzar otro fetch a Odoo.
  if (_fetchEnCurso) return _fetchEnCurso;

  const fetchPromise = fetchOdooData()
    .then(data => { _cache = data; return data; })
    .finally(() => { _fetchEnCurso = null; });
  _fetchEnCurso = fetchPromise;

  // Stale-while-revalidate: si ya teníamos datos (aunque estén vencidos),
  // los servimos de inmediato y dejamos el refresh corriendo en background.
  // Así el usuario nunca ve el bajón de ~1 min mientras Odoo responde/despierta.
  // Solo esperamos el fetch cuando no hay NADA en cache (primer arranque).
  if (_cache) {
    // Nadie más va a esperar esta promesa en esta rama — hay que "atraparla"
    // igual, si no un fallo de Odoo en el refresh de background queda como
    // unhandled rejection y puede tumbar el proceso.
    fetchPromise.catch(err => {
      console.error('[ERROR] Refresh de cache de Odoo en background falló:', (err as Error).message);
    });
    return _cache;
  }

  return _fetchEnCurso;
}

// ─── getAllLotes — mezcla Odoo + estados locales ──────────────

export async function getAllLotes(): Promise<Lote[]> {
  const { lotes } = await getAllLotesConEstados();
  return lotes;
}

/** Igual que getAllLotes(), pero también devuelve el mapa de estados
 * locales (apartado/vendido + quién lo apartó) — lo necesita `filtrar()`
 * para la excepción de "el vendedor puede ver su propio apartado aunque
 * esté en una ubicación no visible para él". */
async function getAllLotesConEstados(): Promise<{ lotes: Lote[]; estadosLocales: Map<string, EstadoLocal> }> {
  const { lotes: rawLotes, fotos: fotosMap, ubicaciones } = await getOdooData();
  const estadosLocales = getEstadosLocales();
  const overridesLocales = getOverridesLocales();
  const ocultosLocales = getOcultosLocales();

  const lotes = rawLotes.map(raw => {
    const fotos = (raw.image_ids ?? [])
      // Fuera la imagen genérica "Foto pendiente de subir": si el lote no
      // tiene ninguna otra, se queda sin fotos y filtrar() lo oculta.
      .filter(id => !esFotoPendiente(id))
      .map(id => fotosMap.get(id))
      .filter((f): f is Foto => !!f)
      .map(f => ({ ...f, loteId: raw.name }));
    const lote = mapLote(raw, fotos, estadosLocales.get(raw.name), ubicaciones.get(raw.id), overridesLocales.get(raw.name));
    const oculto = ocultosLocales.get(raw.name);
    return oculto ? { ...lote, oculto: true, ocultoHasta: oculto.hasta } : lote;
  });

  lotes.sort(ordenLote);
  return { lotes, estadosLocales };
}

// ─── Filtrado ─────────────────────────────────────────────────

export type ListParams = Partial<FiltrosCatalogo> & {
  page?: number;
  pageSize?: number;
  /**
   * true → solo lotes cuya ubicación esté en la lista de rutas visibles
   * (ver config/ubicacionesCliente.ts). Se manda en true para clientes
   * y para vendedores normales; solo el admin ve el inventario completo
   * sin este filtro.
   */
  soloRutasPermitidas?: boolean;
  /** Vendedor de la sesión actual (si la hay) — permite la excepción de
   * "puedo ver mi propio apartado aunque esté en una ubicación que de
   * otro modo no vería". No aplica a clientes. */
  vendedorIdSesion?: string | null;
  /** true → incluir los lotes que el admin ocultó temporalmente (solo el
   * admin los ve, marcados como ocultos, para poder volver a mostrarlos). */
  incluirOcultos?: boolean;
};

function filtrar(lotes: Lote[], params: ListParams, estadosLocales: Map<string, EstadoLocal>): Lote[] {
  const { grupos = [], acabados = [], estado = 'todos', tipo = 'todos', busqueda = '',
          soloRutasPermitidas = false, vendedorIdSesion = null, incluirOcultos = false } = params;
  return lotes.filter(l => {
    // El catálogo solo muestra lotes con al menos 1 foto — para TODOS
    // (admin, vendedor y cliente). Se exige aquí, en el servidor, y no
    // depende de lo que mande el navegador (antes era un parámetro
    // opcional "soloConFoto" que el frontend siempre mandaba en false).
    if (l.fotos.length === 0)                            return false;
    if (l.oculto && !incluirOcultos)                     return false;
    if (grupos.length   && !grupos.includes(l.grupo))   return false;
    if (acabados.length && !acabados.includes(l.acabado as any)) return false;
    if (estado !== 'todos' && l.estado !== estado)       return false;
    if (tipo !== 'todos' && l.tipo !== tipo)             return false;
    if (soloRutasPermitidas && !esUbicacionVisibleParaCliente(l.ubicacion, l.tipo)) {
      // Excepción: si el lote está apartado por el vendedor de esta
      // sesión, lo puede ver de todos modos (para darle seguimiento a
      // su propia reserva), aunque esté en una ubicación que
      // normalmente no vería.
      const esApartadoPropio = vendedorIdSesion && estadosLocales.get(l.id)?.vendedorId === vendedorIdSesion;
      if (!esApartadoPropio) return false;
    }
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      if (!l.id.toLowerCase().includes(q) && !l.material.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Aplica el nombre amigable de ubicación (Puebla/Veracruz) — siempre al
 * final, después de filtrar/chequear visibilidad, para no afectar esa
 * lógica (que necesita el código crudo, ej. "TMM1/Existencias", no
 * "Puebla"). Exportada porque routes/lotes.ts también la necesita: ahí
 * se re-chequea visibilidad en el detalle de un solo lote, y ese chequeo
 * debe correr ANTES de transformar la ubicación, no después. */
export function conUbicacionAmigable(lote: Lote): Lote {
  return { ...lote, ubicacion: etiquetaUbicacion(lote.ubicacion) };
}

export async function listLotes(params: ListParams = {}): Promise<PaginatedResponse<Lote>> {
  const { page = 1, pageSize = 24 } = params;
  const { lotes: todos, estadosLocales } = await getAllLotesConEstados();
  const filtrados = filtrar(todos, params, estadosLocales);
  const items = filtrados.slice((page - 1) * pageSize, page * pageSize).map(conUbicacionAmigable);
  return { items, total: filtrados.length, page, pageSize, totalPages: Math.ceil(filtrados.length / pageSize) };
}

/**
 * Devuelve el lote CRUDO (ubicación sin transformar) — a propósito.
 * Antes esta función ya devolvía el lote con conUbicacionAmigable()
 * aplicado, y como routes/lotes.ts vuelve a chequear visibilidad
 * (esUbicacionVisibleParaCliente) sobre el resultado, terminaba
 * comparando "Puebla"/"Veracruz" contra "existencias"/"alm" — que
 * nunca coincide — y por eso CUALQUIER lote le daba 404 a
 * vendedores/clientes, aunque sí apareciera en la lista (que sí
 * filtraba bien, porque ahí el chequeo corría antes de transformar).
 * Quien llame a getLote() y vaya a exponer el resultado debe aplicar
 * conUbicacionAmigable() él mismo, después de cualquier chequeo de
 * visibilidad — igual que ya hace listLotes() arriba.
 */
export async function getLote(id: string): Promise<Lote | null> {
  const { lotes: todos } = await getAllLotesConEstados();
  return todos.find(l => l.id === id) ?? null;
}

/** ¿Este lote está apartado, ahora mismo, por este vendedor? — para la
 * excepción de "puedo ver mi propio apartado aunque esté en una
 * ubicación que normalmente no vería". */
export function esLoteApartadoPorVendedor(loteId: string, vendedorId: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM apartados WHERE lote_id = ? AND vendedor_id = ? AND expira_en > datetime('now')
  `).get(loteId, vendedorId);
  return Boolean(row);
}

export { esUbicacionVisibleParaCliente };