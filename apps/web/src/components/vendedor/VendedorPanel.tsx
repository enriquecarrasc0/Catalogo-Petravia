/**
 * VendedorPanel — gestión de clientes (tokens), apartados y vista del catálogo.
 * Todo lo que ve y administra un vendedor está acotado a SUS propios
 * clientes y apartados — no ve los de otros vendedores.
 */
import { useState, useMemo } from 'react';
import { Key, Users, Copy, Check, Trash2, RotateCcw, AlertCircle, Loader2,
         Package, Clock, CheckCircle, XCircle, LayoutGrid, TimerReset, ArrowLeft, ChevronRight, Expand } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CatalogoPage from '@/pages/CatalogoPage';
import LoteDetalleInline from './LoteDetalleInline';
import { getVendedorSession } from '@/lib/vendedorSession';
import { formatSaldoLote, type TipoLote } from '@petravia/shared';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

const vendedorHeaders = (): Record<string, string> => {
  const sesion = getVendedorSession();
  return {
    'Content-Type': 'application/json',
    ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
  };
};

// ─── Tipos ────────────────────────────────────────────────────

interface ClientToken {
  id: string; token: string; email: string; nombre?: string;
  esActivo: boolean; creadoEn: string; ultimoUso?: string;
}

interface ApartadoVendedor {
  id: string; loteId: string;
  clienteEmail: string; clienteNombre: string;
  creadoEn: string; expiraEn: string;
  expirado: boolean; minutosRestantes: number;
  lote?: {
    id: string; material: string; grupo: string; tipo: TipoLote;
    acabado: string; saldoM2: number; saldoM3?: number; saldoPiezas: number;
    fotos: Array<{ urlThumb: string }>;
  };
}

// ─── API helpers ──────────────────────────────────────────────

async function fetchTokens(): Promise<ClientToken[]> {
  const res  = await fetch(`${BASE}/auth/tokens`, { headers: vendedorHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error cargando tokens');
  return (json.data as any[]).map(r => ({
    id: r.id, token: r.token, email: r.email, nombre: r.nombre,
    esActivo:  Boolean(r.es_activo ?? r.esActivo),
    creadoEn:  r.creado_en ?? r.creadoEn,
    ultimoUso: r.ultimo_uso ?? r.ultimoUso,
  }));
}

async function fetchApartados(filtro = 'pendiente'): Promise<ApartadoVendedor[]> {
  const res  = await fetch(`${BASE}/vendedor/apartados?filtro=${filtro}`, { headers: vendedorHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error cargando apartados');
  return json.data;
}

// ─── Tabs ─────────────────────────────────────────────────────

type Tab = 'apartados' | 'clientes' | 'catalogo';

// ─── CopyButton ───────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded hover:bg-stone-200 transition text-stone-400 hover:text-stone-700">
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  );
}

// ─── Panel principal ──────────────────────────────────────────

export default function VendedorPanel() {
  const [tab, setTab] = useState<Tab>('apartados');
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null);

  function cambiarTab(id: Tab) {
    setTab(id);
    setLoteSeleccionado(null); // al cambiar de pestaña, salir del detalle
  }

  return (
    <div>
      {/* Tabs — siempre visibles, sin importar si hay un lote abierto */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {([
            { id: 'apartados', label: 'Apartados',  Icon: Package },
            { id: 'clientes',  label: 'Clientes',    Icon: Key },
            { id: 'catalogo',  label: 'Catálogo',   Icon: LayoutGrid },
          ] as const).map(({ id, label, Icon }) => (
            <button key={id} onClick={() => cambiarTab(id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px shrink-0 whitespace-nowrap
                ${tab === id
                  ? 'border-stone-900 text-stone-900 font-medium'
                  : 'border-transparent text-stone-400 hover:text-stone-700'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      {loteSeleccionado ? (
        // Vista preliminar del lote — accesible desde cualquier pestaña (Apartados o Catálogo)
        <LoteDetalleInline
          loteId={loteSeleccionado}
          onVolver={() => setLoteSeleccionado(null)}
        />
      ) : tab === 'catalogo' ? (
        // Sin max-w-6xl: el catálogo usa su propio max-w-7xl a ancho completo
        <CatalogoPage onLoteClick={setLoteSeleccionado} />
      ) : (
        <div className="max-w-6xl mx-auto px-6 pb-6">
          {tab === 'apartados'  && <TabApartados onLoteClick={setLoteSeleccionado} />}
          {tab === 'clientes'   && <TabClientes />}
        </div>
      )}
    </div>
  );
}

// ─── Tab Apartados ────────────────────────────────────────────

interface GrupoCliente {
  email: string; nombre: string; items: ApartadoVendedor[];
}

function TabApartados({ onLoteClick }: { onLoteClick: (loteId: string) => void }) {
  const [filtro, setFiltro] = useState<'pendiente' | 'expirado'>('pendiente');
  const [clienteSel, setClienteSel] = useState<string | null>(null); // clienteEmail seleccionado
  const qc = useQueryClient();
  const vendedorId = getVendedorSession()?.vendedorId;

  const { data: apartados = [], isLoading, error } = useQuery({
    queryKey: ['vendedor-apartados', vendedorId, filtro],
    queryFn:  () => fetchApartados(filtro),
    enabled: !!vendedorId,
    refetchInterval: 60_000, // refrescar cada minuto
  });

  // Nombre "real" del cliente, tal como fue dado de alta en Mis clientes
  // (más confiable que el nombre capturado al momento de apartar).
  const { data: tokens = [] } = useQuery({
    queryKey: ['vendedor-tokens', vendedorId],
    queryFn: fetchTokens,
    enabled: !!vendedorId,
  });
  const nombresPorEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tokens) if (t.nombre) map.set(t.email, t.nombre);
    return map;
  }, [tokens]);

  function cambiarFiltro(f: 'pendiente' | 'expirado') {
    setFiltro(f);
    setClienteSel(null); // al cambiar de filtro, volver a la vista de clientes
  }

  // Agrupar apartados por cliente — así un vendedor nunca ve los lotes
  // de un cliente mezclados con los de otro.
  const grupos = useMemo<GrupoCliente[]>(() => {
    const map = new Map<string, GrupoCliente>();
    for (const a of apartados) {
      const existente = map.get(a.clienteEmail);
      if (existente) existente.items.push(a);
      else map.set(a.clienteEmail, { email: a.clienteEmail, nombre: nombresPorEmail.get(a.clienteEmail) ?? '', items: [a] });
    }
    return Array.from(map.values()).sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email));
  }, [apartados, nombresPorEmail]);

  const grupoActivo = clienteSel ? grupos.find(g => g.email === clienteSel) ?? null : null;

  const liberar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/vendedor/apartados/${id}`, { method: 'DELETE', headers: vendedorHeaders() });
      if (!res.ok) { const json = await res.json().catch(() => null); throw new Error(json?.error ?? 'Error liberando'); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor-apartados'] }),
  });

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/vendedor/apartados/${id}/confirmar`, { method: 'POST', headers: vendedorHeaders() });
      if (!res.ok) { const json = await res.json().catch(() => null); throw new Error(json?.error ?? 'Error confirmando'); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor-apartados'] }),
  });

  const prorrogar = useMutation({
    mutationFn: async ({ id, horas }: { id: string; horas: number }) => {
      const res = await fetch(`${BASE}/vendedor/apartados/${id}/prorrogar`, {
        method: 'POST', headers: vendedorHeaders(), body: JSON.stringify({ horas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error prorrogando');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor-apartados'] }),
  });

  return (
    <div className="space-y-4">
      {/* Filtro */}
      <div className="flex items-center gap-2">
        {(['pendiente','expirado'] as const).map(f => (
          <button key={f} onClick={() => cambiarFiltro(f)}
            className={`px-3 py-1.5 text-xs rounded-md border transition
              ${filtro === f ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}>
            {f === 'pendiente' ? 'Vigentes' : 'Expirados'}
          </button>
        ))}
        <span className="text-xs text-stone-400 ml-2">
          {apartados.length} apartado{apartados.length !== 1 ? 's' : ''}
          {grupos.length > 0 && ` · ${grupos.length} cliente${grupos.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-sm text-stone-400 py-8"><Loader2 size={16} className="animate-spin" />Cargando...</div>}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md">
          <AlertCircle size={14} className="text-red-500" />
          <p className="text-xs text-red-600">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && apartados.length === 0 && (
        <p className="text-sm text-stone-400 py-8 text-center">No hay apartados {filtro === 'pendiente' ? 'vigentes' : 'expirados'}.</p>
      )}

      {/* Vista 1: cuadro por cliente (sub-selección) */}
      {!isLoading && !grupoActivo && grupos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grupos.map(g => {
            const vigentes = g.items.filter(i => !i.expirado).length;
            return (
              <button key={g.email} onClick={() => setClienteSel(g.email)}
                className="text-left bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-400 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Users size={13} className="text-stone-400 shrink-0" />
                      <p className="text-sm font-medium text-stone-800 truncate">{g.nombre || g.email}</p>
                    </div>
                    {g.nombre && <p className="text-xs text-stone-400 truncate mt-0.5">{g.email}</p>}
                  </div>
                  <ChevronRight size={15} className="text-stone-300 shrink-0 mt-0.5" />
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                    {g.items.length} lote{g.items.length !== 1 ? 's' : ''}
                  </span>
                  {filtro === 'pendiente' && vigentes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <Clock size={11} /> vigentes
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Vista 2: detalle de apartados del cliente seleccionado */}
      {!isLoading && grupoActivo && (
      <div>
        <button onClick={() => setClienteSel(null)}
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition mb-3">
          <ArrowLeft size={13} /> Volver a clientes
        </button>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-stone-400" />
          <div>
            <p className="text-sm font-medium text-stone-800">{grupoActivo.nombre || grupoActivo.email}</p>
            <p className="text-xs text-stone-400">
              {grupoActivo.nombre && `${grupoActivo.email} · `}
              {grupoActivo.items.length} apartado{grupoActivo.items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      <div className="space-y-3">
        {grupoActivo.items.map(a => (
          <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex gap-3">
              {a.lote?.fotos?.[0] && (
                <button
                  onClick={() => onLoteClick(a.loteId)}
                  title="Ver vista preliminar del lote"
                  className="shrink-0 group relative w-16 h-16 rounded-lg overflow-hidden">
                  <img src={a.lote.fotos[0].urlThumb} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                    <Expand size={14} className="text-white opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </button>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-mono text-sm font-semibold text-stone-800">{a.loteId}</p>
                    {a.lote && (
                      <p className="text-xs text-stone-500 mt-0.5">
                        {a.lote.material}
                        {a.lote.acabado && <span className="ml-1">· {a.lote.acabado}</span>}
                        <span className="ml-1">· {formatSaldoLote(a.lote)}</span>
                        <span className="ml-1">· {a.lote.saldoPiezas} pzs</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.expirado
                      ? <span className="flex items-center gap-1 text-xs text-stone-400"><XCircle size={12} />Expirado</span>
                      : <span className="flex items-center gap-1 text-xs text-emerald-600"><Clock size={12} />{a.minutosRestantes >= 60 ? `${Math.floor(a.minutosRestantes/60)}h ${a.minutosRestantes%60}min` : `${a.minutosRestantes} min`} restantes</span>
                    }
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-stone-400">
                    Apartado {new Date(a.creadoEn).toLocaleString('es-MX')}
                  </p>

                  {!a.expirado && (
                    <div className="flex gap-2">
                      <div className="relative">
                        <select
                          disabled={prorrogar.isPending}
                          value=""
                          onChange={(e) => {
                            const horas = Number(e.target.value);
                            if (horas) prorrogar.mutate({ id: a.id, horas });
                            e.target.value = '';
                          }}
                          title="Prorrogar apartado"
                          className="appearance-none flex items-center gap-1.5 pl-7 pr-6 py-1.5 text-xs border border-stone-200
                                     rounded-md hover:border-amber-300 hover:text-amber-700 transition disabled:opacity-50
                                     bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-200">
                          <option value="" disabled>Prorrogar…</option>
                          <option value="6">+6 horas</option>
                          <option value="12">+12 horas</option>
                          <option value="24">+24 horas</option>
                          <option value="48">+48 horas</option>
                          <option value="72">+72 horas</option>
                          <option value="168">+7 días</option>
                        </select>
                        <TimerReset size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      </div>
                      <button onClick={() => liberar.mutate(a.id)} disabled={liberar.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
                                   rounded-md hover:border-red-300 hover:text-red-600 transition disabled:opacity-50">
                        <Trash2 size={12} /> Liberar
                      </button>
                      <button onClick={() => confirmar.mutate(a.id)} disabled={confirmar.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-900 text-white
                                   rounded-md hover:bg-stone-800 transition disabled:opacity-50">
                        <CheckCircle size={12} /> Confirmar venta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
      )}
    </div>
  );
}

// ─── Tab Clientes (tokens) ──────────────────────────────────────

function TabClientes() {
  const qc = useQueryClient();
  const [email,  setEmail]  = useState('');
  const [nombre, setNombre] = useState('');
  const [nuevoToken, setNuevoToken] = useState<string | null>(null);

  const vendedorId = getVendedorSession()?.vendedorId;
  const { data: tokens = [], isLoading, error } = useQuery({
    queryKey: ['vendedor-tokens', vendedorId],
    queryFn: fetchTokens,
    enabled: !!vendedorId,
  });

  const crear = useMutation({
    mutationFn: async ({ email, nombre }: { email: string; nombre?: string }) => {
      const res  = await fetch(`${BASE}/auth/generar-token`, { method: 'POST', headers: vendedorHeaders(), body: JSON.stringify({ email, nombre }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error generando token');
      return json;
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['vendedor-tokens'] }); setNuevoToken(data.token); setEmail(''); setNombre(''); },
  });

  const desactivar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/auth/tokens/${id}`, { method: 'DELETE', headers: vendedorHeaders() });
      if (!res.ok) { const json = await res.json().catch(() => null); throw new Error(json?.error ?? 'Error desactivando'); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor-tokens'] }),
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, esActivo }: { id: string; esActivo: boolean }) => {
      const res = await fetch(`${BASE}/auth/tokens/${id}`, {
        method: 'PATCH', headers: vendedorHeaders(), body: JSON.stringify({ esActivo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error actualizando cliente');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendedor-tokens'] }),
  });

  const activos   = tokens.filter(t => t.esActivo);
  const inactivos = tokens.filter(t => !t.esActivo);

  return (
    <div className="space-y-6">
      {/* Generar */}
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Key size={16} className="text-stone-600" />
          <div>
            <h2 className="text-sm font-medium text-stone-800">Dar de alta un cliente</h2>
            <p className="text-xs text-stone-400">Genera un token de acceso solo para ti — este cliente quedará asociado a tu cuenta</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Email *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@empresa.com" type="email" required
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Nombre (opcional)</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del cliente"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
        </div>
        {crear.error && <p className="text-xs text-red-600 mb-2">{(crear.error as Error).message}</p>}
        <button onClick={() => crear.mutate({ email, nombre: nombre || undefined })} disabled={crear.isPending || !email.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 transition disabled:opacity-50">
          {crear.isPending && <Loader2 size={14} className="animate-spin" />}
          Generar token
        </button>
        {nuevoToken && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs font-medium text-emerald-700 mb-2">✅ Token generado — cópialo ahora:</p>
            <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-md px-3 py-2">
              <code className="text-xs font-mono text-stone-700 flex-1 break-all">{nuevoToken}</code>
              <CopyButton text={nuevoToken} />
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users size={16} className="text-stone-600" />
          <div>
            <h2 className="text-sm font-medium text-stone-800">Mis clientes</h2>
            <p className="text-xs text-stone-400">{activos.length} activos · {inactivos.length} desactivados</p>
          </div>
        </div>
        {isLoading && <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={16} className="animate-spin" />Cargando...</div>}
        {error && <p className="text-xs text-red-600">{(error as Error).message}</p>}
        {!isLoading && tokens.length === 0 && <p className="text-sm text-stone-400">Aún no has dado de alta ningún cliente.</p>}
        <div className="space-y-2">
          {tokens.map(t => (
            <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border
              ${t.esActivo ? 'border-stone-200 bg-stone-50' : 'border-stone-100 opacity-50'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-stone-800">{t.email}</p>
                  {t.nombre && <span className="text-xs text-stone-400">· {t.nombre}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${t.esActivo ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                    {t.esActivo ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <code className="text-xs font-mono text-stone-500 truncate max-w-xs">{t.token}</code>
                  {t.esActivo && <CopyButton text={t.token} />}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  Creado {new Date(t.creadoEn).toLocaleString('es-MX')}
                  {t.ultimoUso && ` · Último uso: ${new Date(t.ultimoUso).toLocaleString('es-MX')}`}
                </p>
              </div>
              {t.esActivo ? (
                <button onClick={() => desactivar.mutate(t.id)} disabled={desactivar.isPending} title="Desactivar"
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition shrink-0">
                  <Trash2 size={14} />
                </button>
              ) : (
                <button onClick={() => cambiarEstado.mutate({ id: t.id, esActivo: true })} disabled={cambiarEstado.isPending}
                  title="Reactivar"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
                             rounded-md hover:border-emerald-300 hover:text-emerald-600 transition disabled:opacity-50 shrink-0">
                  <RotateCcw size={12} /> Reactivar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}