/**
 * apps/web/src/components/layout/AppNavShell.tsx
 * ──────────────────────────────────────────────
 * "Cascarón" de navegación para el panel de vendedor/admin:
 *   · En escritorio, una barra lateral angosta con íconos + etiqueta.
 *   · En móvil, una barra superior compacta (logo + usuario + salir) y
 *     una barra inferior fija con íconos, como una app nativa.
 *
 * Reemplaza la fila de pestañas horizontal de arriba que se usaba antes
 * en AdminPanel/VendedorPanel, y absorbe también el header que antes
 * vivía en VendedorPage.tsx (logo, nombre, botón de salir) — así queda
 * un solo lugar dueño de todo el "chrome" de navegación.
 */
import type { LucideIcon } from 'lucide-react';
import { LogOut } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
}

export default function AppNavShell({
  items, activeId, onSelect, nombre, onLogout, children,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  nombre: string;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Barra lateral — solo escritorio (sm y arriba). "fixed" en vez de
          "sticky": es el patrón más robusto para una barra persistente —
          "sticky" depende de que ningún ancestro tenga cierta configuración
          de overflow (la app ya tiene overflow-x:hidden en html/body como
          salvaguarda de otro fix, lo cual rompía el sticky). */}
      <aside className="hidden sm:flex flex-col items-center w-20 shrink-0 bg-petravia-azul-dark py-5 fixed left-0 top-0 h-screen z-30">
        <img src="/brand/isotipo-beige.png" alt="Petravia" className="w-9 h-9 object-contain mb-6 shrink-0" />

        <nav className="flex flex-col gap-1.5 flex-1 w-full px-2 overflow-y-auto">
          {items.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              title={label}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[10px] leading-tight transition-colors
                ${activeId === id
                  ? 'bg-white text-stone-900 font-medium'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-white/5'}`}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2 pt-3 mt-2 border-t border-white/10 w-full px-2 shrink-0">
          <div
            className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 text-xs font-medium flex items-center justify-center shrink-0"
            title={nombre}
          >
            {iniciales(nombre)}
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="text-stone-400 hover:text-red-300 transition-colors py-1.5"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* Barra superior — solo móvil */}
      <div className="sm:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/brand/isotipo-beige.png" alt="" className="w-8 h-8 object-contain shrink-0" />
          <span className="text-xs text-stone-500 truncate">{nombre}</span>
        </div>
        <button onClick={onLogout} title="Cerrar sesión" className="text-stone-400 shrink-0 ml-3">
          <LogOut size={18} />
        </button>
      </div>

      {/* Contenido — con espacio reservado para las barras fijas en móvil,
          y para la barra lateral fija en escritorio (sm:ml-20, mismo ancho
          que el aside). */}
      <div className="flex-1 min-w-0 pt-14 pb-16 sm:pt-0 sm:pb-0 sm:ml-20">
        {children}
      </div>

      {/* Barra inferior — solo móvil */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-petravia-azul-dark flex justify-around py-1.5">
        {items.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md transition-colors
              ${activeId === id ? 'text-amber-400' : 'text-stone-400'}`}
          >
            <Icon size={18} />
            <span className="text-[9px]">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
