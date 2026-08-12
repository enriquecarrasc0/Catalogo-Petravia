/**
 * apps/web/src/pages/LoginPage.tsx
 * ─────────────────────────────────
 * Pantalla de entrada unificada: selector → vendedor | cliente
 */
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, User, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { useClientLogin, useSaveClient, useCurrentClient } from '@/hooks/useClientAuth';
import { getVendedorSession, setVendedorSession } from '@/lib/vendedorSession';
import clsx from 'clsx';

type Vista = 'selector' | 'vendedor' | 'cliente';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export default function LoginPage() {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const existente  = useCurrentClient();
  const saveClient = useSaveClient();
  const { mutate: loginCliente, isPending, error: errorCliente } = useClientLogin();

  const [vista,       setVista]       = useState<Vista>('selector');
  const [showPass,    setShowPass]    = useState(false);
  const [usuario,     setUsuario]     = useState('');
  const [password,    setPassword]    = useState('');
  const [errorVendedor, setErrorVendedor] = useState('');
  const [cargandoVendedor, setCargandoVendedor] = useState(false);
  const [token,       setToken]       = useState('');

  // Si ya hay sesión activa, redirigir
  if (existente)              return <Navigate to="/seleccion" replace />;
  if (getVendedorSession())   return <Navigate to="/vendedor"  replace />;

  async function handleVendedor(e: React.FormEvent) {
    e.preventDefault();
    setErrorVendedor('');
    setCargandoVendedor(true);
    try {
      const res  = await fetch(`${BASE_URL}/auth/vendedor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorVendedor(json.error ?? 'Usuario o contraseña incorrectos');
        return;
      }
      qc.clear(); // por si quedó caché de otra sesión de vendedor en esta pestaña
      setVendedorSession({
        token: json.token,
        vendedorId: json.vendedorId,
        usuario: json.usuario,
        nombre: json.nombre,
        esAdmin: Boolean(json.esAdmin),
      });
      navigate('/vendedor');
    } catch {
      setErrorVendedor('No se pudo conectar con el servidor');
    } finally {
      setCargandoVendedor(false);
    }
  }

  function handleCliente(e: React.FormEvent) {
    e.preventDefault();
    loginCliente(token, {
      onSuccess: (data) => {
        saveClient(data);
        navigate('/seleccion');
      },
    });
  }

  function volverSelector() {
    setVista('selector');
    setErrorVendedor('');
    setUsuario('');
    setPassword('');
    setToken('');
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <a href="/" className="mb-10 flex flex-col items-center gap-2">
        <img src="/brand/isotipo-beige.png" alt="" className="h-16 w-auto" />
        <span
          className="font-display uppercase leading-none"
          style={{ fontSize: '15px', letterSpacing: '0.38em', color: 'var(--beige-dark)', paddingLeft: '0.38em' }}
        >
          Petravia
        </span>
      </a>

      <div className="bg-white border border-stone-200 rounded-xl shadow-sm w-full max-w-sm overflow-hidden">

        {/* ── Selector ──────────────────────────────────────── */}
        {vista === 'selector' && (
          <div className="p-8">
            <h2 className="text-lg font-medium text-stone-800 mb-1">Bienvenido</h2>
            <p className="text-sm text-stone-500 mb-8">¿Cómo deseas ingresar?</p>
            <div className="space-y-3">
              <button
                onClick={() => setVista('cliente')}
                className="w-full flex items-center gap-4 p-4 border border-stone-200 rounded-lg
                           hover:border-stone-400 hover:bg-stone-50 transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-stone-200
                                flex items-center justify-center transition-colors shrink-0">
                  <User size={18} className="text-stone-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Soy cliente</p>
                  <p className="text-xs text-stone-400">Ingresa con tu token de acceso</p>
                </div>
              </button>

              <button
                onClick={() => setVista('vendedor')}
                className="w-full flex items-center gap-4 p-4 border border-stone-200 rounded-lg
                           hover:border-stone-400 hover:bg-stone-50 transition-all group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-stone-200
                                flex items-center justify-center transition-colors shrink-0">
                  <ShieldCheck size={18} className="text-stone-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">Soy vendedor</p>
                  <p className="text-xs text-stone-400">Accede a tu panel de gestión</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Vendedor ──────────────────────────────────────── */}
        {vista === 'vendedor' && (
          <form onSubmit={handleVendedor} className="p-8">
            <button type="button" onClick={volverSelector}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 mb-6 transition-colors">
              <ArrowLeft size={12} /> Volver
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
                <ShieldCheck size={16} className="text-stone-600" />
              </div>
              <div>
                <h2 className="text-base font-medium text-stone-800">Vendedor</h2>
                <p className="text-xs text-stone-400">Panel de gestión</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Usuario</label>
                <input type="text" value={usuario} onChange={e => setUsuario(e.target.value)}
                  placeholder="usuario" autoComplete="username"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md
                             focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password"
                    className="w-full px-3 py-2 pr-10 text-sm border border-stone-200 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {errorVendedor && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{errorVendedor}</p>
                </div>
              )}

              <button type="submit" disabled={cargandoVendedor || !usuario || !password}
                className="w-full py-2.5 bg-stone-900 text-white text-sm font-medium rounded-md
                           hover:bg-stone-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {cargandoVendedor ? 'Verificando...' : 'Entrar'}
              </button>
            </div>
          </form>
        )}

        {/* ── Cliente ───────────────────────────────────────── */}
        {vista === 'cliente' && (
          <form onSubmit={handleCliente} className="p-8">
            <button type="button" onClick={volverSelector}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 mb-6 transition-colors">
              <ArrowLeft size={12} /> Volver
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
                <User size={16} className="text-stone-600" />
              </div>
              <div>
                <h2 className="text-base font-medium text-stone-800">Acceso cliente</h2>
                <p className="text-xs text-stone-400">Ingresa tu token personal</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Token de acceso</label>
                <input type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder="Pega aquí tu token" autoComplete="off"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md font-mono
                             focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent" />
              </div>

              {errorCliente && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{(errorCliente as Error).message}</p>
                </div>
              )}

              <button type="submit" disabled={isPending || !token}
                className={clsx(
                  'w-full py-2.5 text-sm font-medium rounded-md transition-colors mt-2',
                  'bg-stone-900 text-white hover:bg-stone-800',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}>
                {isPending ? 'Verificando...' : 'Ver catálogo'}
              </button>
            </div>

            <p className="text-xs text-stone-400 mt-6 pt-4 border-t border-stone-100">
              ¿No tienes token? Contáctanos para solicitar acceso.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}