/**
 * AdminPanel — panel del rol ADMIN.
 * El admin ve TODO: apartados y clientes de TODOS los vendedores (con
 * quién los dio de alta), el catálogo, y da de alta/gestiona vendedores.
 * A diferencia del VendedorPanel, aquí no hay acotamiento por vendedor_id.
 */
import { useState, useMemo } from 'react';
import { Key, Users, Copy, Check, Trash2, AlertCircle, Loader2,
         Package, Clock, CheckCircle, XCircle, LayoutGrid,
         ShieldCheck, UserPlus, Ban, RotateCcw, Eye, EyeOff,
         ArrowLeft, ChevronRight, Expand } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import CatalogoPage from '@/pages/CatalogoPage';
import LoteDetalleInline from '../vendedor/LoteDetalleInline';
import { getVendedorSession } from '@/lib/vendedorSession';
import { formatSaldoLote, type TipoLote } from '@petravia/shared';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

const adminHeaders = (): Record<string, string> => {
  const sesion = getVendedorSession();
  return {
    'Content-Type': 'application/json',
    ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
  };
};

// ─── Tipos ────────────────────────────────────────────────────

interface ClienteAdmin {
  id: string; token: string; email: string; nombre?: string;
  esActivo: boolean; creadoEn: string; ultimoUso?: string;
  vendedorNombre: string | null; vendedorUsuario: string | null;
}

interface Vendedor {
  id: string; usuario: string; nombre: string; email?: string | null;
  esActivo: boolean; esAdmin: boolean; creadoEn: string;
}

interface ApartadoAdmin {
  id: string; loteId: string;
  clienteEmail: string; clienteNombre: string;
  creadoEn: string; expiraEn: string;
  expirado: boolean; minutosRestantes: number;
  vendedorNombre: string | null; vendedorUsuario: string | null;
  lote?: {
    id: string; material: string; grupo: string; tipo: TipoLote;
    acabado: string; saldoM2: number; saldoM3?: number; saldoPiezas: number;
    fotos: Array<{ urlThumb: string }>;
  };
}

// ─── API helpers ──────────────────────────────────────────────

async function fetchClientes(): Promise<ClienteAdmin[]> {
  const res  = await fetch(`${BASE}/admin/clientes`, { headers: adminHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error cargando clientes');
  return (json.data as any[]).map(r => ({
    id: r.id, token: r.token, email: r.email, nombre: r.nombre,
    esActivo:  Boolean(r.es_activo ?? r.esActivo),
    creadoEn:  r.creado_en ?? r.creadoEn,
    ultimoUso: r.ultimo_uso ?? r.ultimoUso,
    vendedorNombre: r.vendedorNombre ?? null,
    vendedorUsuario: r.vendedorUsuario ?? null,
  }));
}

async function fetchApartados(filtro = 'pendiente'): Promise<ApartadoAdmin[]> {
  const res  = await fetch(`${BASE}/admin/apartados?filtro=${filtro}`, { headers: adminHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error cargando apartados');
  return json.data;
}

async function fetchVendedores(): Promise<Vendedor[]> {
  const res  = await fetch(`${BASE}/admin/vendedores`, { headers: adminHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Error cargando vendedores');
  return json.data;
}

// ─── Tabs ─────────────────────────────────────────────────────

type Tab = 'apartados' | 'clientes' | 'catalogo' | 'vendedores';

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

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('apartados');
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null);

  function cambiarTab(id: Tab) {
    setTab(id);
    setLoteSeleccionado(null);
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {([
            { id: 'apartados',  label: 'Apartados',  Icon: Package },
            { id: 'clientes',   label: 'Clientes',    Icon: Key },
            { id: 'catalogo',   label: 'Catálogo',   Icon: LayoutGrid },
            { id: 'vendedores', label: 'Vendedores', Icon: ShieldCheck },
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

      {loteSeleccionado ? (
        <LoteDetalleInline
          loteId={loteSeleccionado}
          onVolver={() => setLoteSeleccionado(null)}
        />
      ) : tab === 'catalogo' ? (
        <CatalogoPage onLoteClick={setLoteSeleccionado} />
      ) : (
        <div className="max-w-6xl mx-auto px-6 pb-6">
          {tab === 'apartados'  && <TabApartados onLoteClick={setLoteSeleccionado} />}
          {tab === 'clientes'   && <TabClientes />}
          {tab === 'vendedores' && <TabVendedores />}
        </div>
      )}
    </div>
  );
}

// ─── Tab Apartados (de TODOS los vendedores) ───────────────────

interface GrupoClienteAdmin {
  email: string; nombre: string; items: ApartadoAdmin[];
}

function TabApartados({ onLoteClick }: { onLoteClick: (loteId: string) => void }) {
  const [filtro, setFiltro] = useState<'pendiente' | 'expirado'>('pendiente');
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: apartados = [], isLoading, error } = useQuery({
    queryKey: ['admin-apartados', filtro],
    queryFn:  () => fetchApartados(filtro),
    refetchInterval: 60_000,
  });

  // Nombre "real" del cliente, tal como fue dado de alta (más confiable
  // que el nombre capturado al momento de apartar).
  const { data: clientes = [] } = useQuery({ queryKey: ['admin-clientes'], queryFn: fetchClientes });
  const nombresPorEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientes) if (c.nombre) map.set(c.email, c.nombre);
    return map;
  }, [clientes]);

  function cambiarFiltro(f: 'pendiente' | 'expirado') {
    setFiltro(f);
    setClienteSel(null);
  }

  // Agrupar apartados por cliente — así nunca se mezclan los lotes de
  // un cliente con los de otro, aunque los haya dado de alta un vendedor distinto.
  const grupos = useMemo<GrupoClienteAdmin[]>(() => {
    const map = new Map<string, GrupoClienteAdmin>();
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
      const res = await fetch(`${BASE}/admin/apartados/${id}`, { method: 'DELETE', headers: adminHeaders() });
      if (!res.ok) throw new Error('Error liberando');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-apartados'] }),
  });

  const confirmar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/admin/apartados/${id}/confirmar`, { method: 'POST', headers: adminHeaders() });
      if (!res.ok) throw new Error('Error confirmando');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-apartados'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['pendiente','expirado'] as const).map(f => (
          <button key={f} onClick={() => cambiarFiltro(f)}
            className={`px-3 py-1.5 text-xs rounded-md border transition
              ${filtro === f ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}>
            {f === 'pendiente' ? 'Vigentes' : 'Expirados'}
          </button>
        ))}
        <span className="text-xs text-stone-400 ml-2">
          {apartados.length} apartado{apartados.length !== 1 ? 's' : ''} · todos los vendedores
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
                  <div>
                    <p className="text-xs text-stone-400">
                      Apartado {new Date(a.creadoEn).toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                      <ShieldCheck size={11} className="text-stone-400" />
                      Vendedor: {a.vendedorNombre ?? 'Sin asignar'}{a.vendedorUsuario && <span className="text-stone-400">· {a.vendedorUsuario}</span>}
                    </p>
                  </div>

                  {!a.expirado && (
                    <div className="flex gap-2">
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

// ─── Tab Clientes (de TODOS los vendedores) ────────────────────

function TabClientes() {
  const qc = useQueryClient();
  const { data: clientes = [], isLoading, error } = useQuery({ queryKey: ['admin-clientes'], queryFn: fetchClientes });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, esActivo }: { id: string; esActivo: boolean }) => {
      const res = await fetch(`${BASE}/admin/clientes/${id}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ esActivo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error actualizando cliente');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-clientes'] });
      qc.invalidateQueries({ queryKey: ['admin-clientes-mini'] });
    },
  });

  const activos   = clientes.filter(c => c.esActivo);
  const inactivos = clientes.filter(c => !c.esActivo);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users size={16} className="text-stone-600" />
          <div>
            <h2 className="text-sm font-medium text-stone-800">Todos los clientes</h2>
            <p className="text-xs text-stone-400">{activos.length} activos · {inactivos.length} desactivados · de todos los vendedores</p>
          </div>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={16} className="animate-spin" />Cargando...</div>}
        {error && <p className="text-xs text-red-600">{(error as Error).message}</p>}
        {!isLoading && clientes.length === 0 && <p className="text-sm text-stone-400">Aún no hay clientes dados de alta.</p>}
        {cambiarEstado.error && <p className="text-xs text-red-600 mb-2">{(cambiarEstado.error as Error).message}</p>}

        <div className="space-y-2">
          {clientes.map(c => (
            <div key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border
              ${c.esActivo ? 'border-stone-200 bg-stone-50' : 'border-stone-100 opacity-50'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-stone-800">{c.email}</p>
                  {c.nombre && <span className="text-xs text-stone-400">· {c.nombre}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${c.esActivo ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                    {c.esActivo ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <code className="text-xs font-mono text-stone-500 truncate max-w-xs">{c.token}</code>
                  {c.esActivo && <CopyButton text={c.token} />}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  Creado {new Date(c.creadoEn).toLocaleString('es-MX')}
                  {c.ultimoUso && ` · Último uso: ${new Date(c.ultimoUso).toLocaleString('es-MX')}`}
                </p>
                <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                  <ShieldCheck size={11} className="text-stone-400" />
                  Vendedor: {c.vendedorNombre ?? 'Sin asignar'}{c.vendedorUsuario && <span className="text-stone-400">· {c.vendedorUsuario}</span>}
                </p>
              </div>

              {c.esActivo ? (
                <button onClick={() => cambiarEstado.mutate({ id: c.id, esActivo: false })} disabled={cambiarEstado.isPending}
                  title="Desactivar" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
                             rounded-md hover:border-red-300 hover:text-red-600 transition disabled:opacity-50 shrink-0">
                  <Ban size={12} /> Desactivar
                </button>
              ) : (
                <button onClick={() => cambiarEstado.mutate({ id: c.id, esActivo: true })} disabled={cambiarEstado.isPending}
                  title="Reactivar" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
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

// ─── Tab Vendedores (administración — SOLO ADMIN) ──────────────

function TabVendedores() {
  const qc = useQueryClient();
  const miVendedorId = getVendedorSession()?.vendedorId;

  const [usuario,  setUsuario]  = useState('');
  const [password, setPassword] = useState('');
  const [nombre,   setNombre]   = useState('');
  const [email,    setEmail]    = useState('');
  const [showPass, setShowPass] = useState(false);

  const { data: vendedores = [], isLoading, error } = useQuery({ queryKey: ['admin-vendedores'], queryFn: fetchVendedores });

  const crear = useMutation({
    mutationFn: async () => {
      const res  = await fetch(`${BASE}/admin/vendedores`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ usuario, password, nombre, email: email || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error creando vendedor');
      return json.data as Vendedor;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-vendedores'] });
      setUsuario(''); setPassword(''); setNombre(''); setEmail('');
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, esActivo }: { id: string; esActivo: boolean }) => {
      const res = await fetch(`${BASE}/admin/vendedores/${id}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ esActivo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error actualizando vendedor');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-vendedores'] }),
  });

  const activos   = vendedores.filter(v => v.esActivo);
  const inactivos = vendedores.filter(v => !v.esActivo);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <UserPlus size={16} className="text-stone-600" />
          <div>
            <h2 className="text-sm font-medium text-stone-800">Dar de alta un vendedor</h2>
            <p className="text-xs text-stone-400">Crea una cuenta con su propio usuario y contraseña — solo verá sus propios clientes y apartados</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Usuario *</label>
            <input value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="jperez" autoComplete="off"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Contraseña * (mín. 8 caracteres)</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Email (opcional)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jperez@petravia.mx" type="email"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </div>
        </div>

        {crear.error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md mb-3">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{(crear.error as Error).message}</p>
          </div>
        )}
        {crear.isSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-md mb-3">
            <Check size={14} className="text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700">Vendedor creado. Ya puede iniciar sesión con su usuario y contraseña.</p>
          </div>
        )}

        <button
          onClick={() => crear.mutate()}
          disabled={crear.isPending || !usuario.trim() || !nombre.trim() || password.length < 8}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 transition disabled:opacity-50">
          {crear.isPending && <Loader2 size={14} className="animate-spin" />}
          Crear vendedor
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <Users size={16} className="text-stone-600" />
          <div>
            <h2 className="text-sm font-medium text-stone-800">Vendedores</h2>
            <p className="text-xs text-stone-400">{activos.length} activos · {inactivos.length} desactivados</p>
          </div>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 size={16} className="animate-spin" />Cargando...</div>}
        {error && <p className="text-xs text-red-600">{(error as Error).message}</p>}

        <div className="space-y-2">
          {vendedores.map(v => (
            <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border
              ${v.esActivo ? 'border-stone-200 bg-stone-50' : 'border-stone-100 opacity-50'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-stone-800">{v.nombre}</p>
                  <span className="text-xs text-stone-400">· {v.usuario}</span>
                  {v.id === miVendedorId && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-stone-200 text-stone-600">Tú</span>
                  )}
                  {v.esAdmin && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 flex items-center gap-1">
                      <ShieldCheck size={10} /> Admin
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${v.esActivo ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                    {v.esActivo ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                {v.email && <p className="text-xs text-stone-400 mt-0.5">{v.email}</p>}
                <p className="text-xs text-stone-400 mt-0.5">Creado {new Date(v.creadoEn).toLocaleString('es-MX')}</p>
              </div>

              {v.id !== miVendedorId && (
                v.esActivo ? (
                  <button onClick={() => cambiarEstado.mutate({ id: v.id, esActivo: false })} disabled={cambiarEstado.isPending}
                    title="Desactivar" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
                               rounded-md hover:border-red-300 hover:text-red-600 transition disabled:opacity-50 shrink-0">
                    <Ban size={12} /> Desactivar
                  </button>
                ) : (
                  <button onClick={() => cambiarEstado.mutate({ id: v.id, esActivo: true })} disabled={cambiarEstado.isPending}
                    title="Reactivar" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200
                               rounded-md hover:border-emerald-300 hover:text-emerald-600 transition disabled:opacity-50 shrink-0">
                    <RotateCcw size={12} /> Reactivar
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}