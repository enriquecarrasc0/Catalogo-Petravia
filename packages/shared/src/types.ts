/**
 * packages/shared/src/types.ts
 * ────────────────────────────
 * Tipos de dominio compartidos entre frontend (apps/web) y backend (apps/api).
 * Cualquier cambio aquí se refleja en ambos lados.
 */

// ─── MATERIALES Y ACABADOS ───────────────────────────────────

export type GrupoMaterial =
  | 'Puebla'
  | 'Veracruz'
  | 'Terracota'
  | 'Caramel Ivory'
  | 'Santo Tomas'
  | 'Aqua Blue'
  | 'Vintage'
  | 'Otros';

export type Acabado =
  | 'Mate'
  | 'Mate S-R'
  | 'Brillado'
  | 'Cepillado'
  | 'Cepillado S-R'
  | 'Sandblast'
  | 'Spazzolato'
  | 'Veteado'
  | 'Book Match'
  | 'Microsandblast'
  | string; // permite nuevos acabados sin romper el tipo

/** Lista fija de grupos de material "ya conocidos" — usada para el selector
 *  de renombrado en el panel de admin/vendedor (no depende del inventario). */
export const GRUPOS_MATERIALES: GrupoMaterial[] = [
  'Puebla', 'Veracruz', 'Terracota', 'Caramel Ivory', 'Santo Tomas', 'Aqua Blue', 'Vintage', 'Otros',
];

/** Lista fija de acabados "ya conocidos" — mismo criterio que arriba. */
export const ACABADOS_CONOCIDOS: string[] = [
  'Mate', 'Mate S-R', 'Brillado', 'Cepillado', 'Cepillado S-R', 'Sandblast',
  'Spazzolato', 'Veteado', 'Book Match', 'Microsandblast',
];

// ─── FOTOS ───────────────────────────────────────────────────

export interface Foto {
  id: string;           // hash MD5 corto (6 chars) – identidad estable
  nombre: string;       // nombre de archivo en almacenamiento
  urlThumb: string;     // URL miniatura (800px) – Cloudflare R2
  urlHd: string;        // URL alta resolución – Cloudflare R2
  loteId: string;       // FK → Lote.id
}

// ─── PIEZAS (dimensiones individuales de un lote) ────────────

export interface Pieza {
  largo: number;   // cm — length_m en Odoo
  ancho: number;   // cm — width_m en Odoo
  grosor?: number; // cm — height_m en Odoo (espesor/grueso en láminas, alto en bloques)
  piezas: number;
  m2: number;
  m3?: number;     // volumen — solo en bloques (largo × ancho × alto)
}

// ─── TIPO DE PRODUCTO ─────────────────────────────────────────

export type TipoLote = 'bloque' | 'lamina' | 'formato';

// ─── LOTE (unidad central del catálogo) ──────────────────────

export type EstadoLote = 'disponible' | 'vendido' | 'apartado';

export interface Lote {
  id: string;            // e.g. "F 590"
  material: string;      // nombre raw del material ("VC Veracruz", etc.)
  grupo: GrupoMaterial;  // grupo normalizado para filtros
  acabado: Acabado;
  tipo: TipoLote;         // bloque, lámina o formato (inferido del nombre del material)
  saldoPiezas: number;
  saldoM2: number;
  saldoM3?: number;      // volumen disponible — solo en bloques (m² no aplica)
  estado: EstadoLote;
  pedido: boolean;       // true si tiene cliente asignado
  cliente?: string;      // nombre del cliente (si aplica)
  piezas: Pieza[];       // dimensiones disponibles
  fotos: Foto[];         // imágenes del lote
  enExcel: boolean;      // tiene entrada en inventario Excel
  creadoEn?: string;     // ISO date
  actualizadoEn?: string;
  ubicacion?: string;    // ubicación de inventario en Odoo (ej. "TMM1/Formato") — solo visible para vendedor/admin
  renombrado?: boolean;  // true si grupo/acabado fueron sobreescritos manualmente desde el panel (overlay local)
}

// ─── FILTROS (para la vista del catálogo) ───────────────────

export interface FiltrosCatalogo {
  grupos: GrupoMaterial[];
  acabados: Acabado[];
  estado: EstadoLote | 'todos';
  tipo: TipoLote | 'todos';
  busqueda: string;
  soloConFoto: boolean;
}

export const FILTROS_DEFAULT: FiltrosCatalogo = {
  grupos: [],
  acabados: [],
  estado: 'disponible',
  tipo: 'todos',
  busqueda: '',
  soloConFoto: false,
};

// ─── RESPUESTAS DE API ───────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  ok: true;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── APARTADOS (reserva temporal de lotes) ──────────────────

export interface Apartado {
  id: string;               // UUID o ID único
  loteId: string;           // FK → Lote.id
  clienteEmail: string;     // Email del cliente
  clienteNombre: string;    // Nombre del cliente
  metrajeDeseado?: number;  // m² que el cliente quiere alcanzar
  creadoEn: string;         // ISO date
  expiraEn: string;         // ISO date (creado_en + 48h)
}

/**
 * Favorito — a diferencia de Apartado, no reserva el lote ni notifica al
 * vendedor. Es una lista puramente personal del cliente ("me gustó esto"),
 * para que después decida cuáles apartar de verdad desde su resumen.
 *
 * A propósito NUNCA se conecta con Odoo — ni para guardar ni para leer.
 * Guarda una instantánea de los datos del lote (material, foto, m²) tal
 * como se veían en el catálogo al momento de darle corazón; el navegador
 * ya tiene esos datos enfrente en ese instante, así que se mandan una vez
 * y quedan aquí. Vive 100% en esta tabla local.
 */
export interface Favorito {
  id: string;               // UUID
  loteId: string;            // FK → Lote.id
  clienteEmail: string;
  creadoEn: string;          // ISO date
  // Instantánea del lote (todos opcionales por si algún cliente viejo no
  // los mandó todavía) — nunca se vuelven a pedir a Odoo.
  material?: string | null;
  grupo?: string | null;
  acabado?: string | null;
  tipo?: TipoLote | null;
  saldoM2?: number | null;
  saldoM3?: number | null;
  saldoPiezas?: number | null;
  fotoUrl?: string | null;
}

/** Instantánea del lote tal como se ve en pantalla al momento de darle
 *  corazón — es lo único que favoritos necesita; nunca vuelve a pedirse
 *  a Odoo, ni al guardar ni al leer. */
export interface SnapshotLote {
  material?: string | null;
  grupo?: string | null;
  acabado?: string | null;
  tipo?: string | null;
  saldoM2?: number | null;
  saldoM3?: number | null;
  saldoPiezas?: number | null;
  fotoUrl?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}