# Sistema Completo — Petravia Catálogo

> Este documento describe el sistema **tal como está implementado hoy**. Reemplaza
> la versión anterior de este archivo, que describía una arquitectura de un solo
> `ADMIN_KEY` ya migrada al modelo multi-vendedor descrito abajo.

## Descripción General

Monorepo (Turborepo) con:
- **Frontend**: React + Vite, Tailwind CSS, TanStack Query.
- **Backend**: Node.js + Express, TypeScript, SQLite (`better-sqlite3`).
- **Fuente de catálogo**: Odoo, vía XML-RPC (los lotes/materiales viven en Odoo;
  SQLite solo guarda sesiones, tokens de cliente, apartados e historial).
- **Despliegue**: Docker Compose (contenedores `api` y `web` con Nginx). Ver
  `README-DOCKER.md` para el detalle de infraestructura.

El sistema tiene **tres roles**:

| Rol | Cómo entra | Qué ve |
|---|---|---|
| **Cliente** | Token generado por su vendedor | Catálogo, sus propios apartados, su historial de compras |
| **Vendedor** | Usuario + contraseña | Sus propios clientes y apartados (agrupados por cliente), catálogo completo |
| **Admin** (`es_admin = 1`) | Usuario + contraseña | Todo lo del vendedor + de TODOS los vendedores, y puede dar de alta/gestionar cuentas de vendedor |

No existe ya un `ADMIN_KEY` fijo por variable de entorno: cada vendedor
(incluido el admin) tiene su propia cuenta con contraseña hasheada (scrypt).

---

## Flujo de Uso — Cliente

### 1. Recibe un token de su vendedor
El vendedor genera un token único por cliente desde la pestaña "Clientes" de
su panel (o el admin, para cualquier vendedor).

### 2. Inicia sesión en la web
En `/login`, ingresa su token. Queda autenticado (el token se guarda en el
cliente vía `useClientAuth` / `localStorage`).

### 3. Explora el catálogo
`/catalogo` — puede:
- Ver todos los lotes disponibles (agrupados por material o en grilla plana).
- Filtrar por estado, tipo (láminas/bloques), acabado.
- Buscar por metraje deseado — la búsqueda avanzada devuelve **lotes
  individuales** que cumplen solos y **combos** de 2-3 lotes que suman el
  metraje pedido (`BuscadorAvanzado.tsx`).

### 4. Aparta uno o más lotes
Desde el detalle del lote: "Apartar". El apartado queda con **48 horas** de
expiración, asociado al vendedor que dio de alta al cliente
(`clientVendedorId`, resuelto automáticamente por el token — el cliente no lo
elige).

### 5. Revisa "Mis Apartados"
`MisApartados.tsx` — lista sus apartados vigentes, puede liberarlos antes de
que expiren, y generar un PDF de su selección (`POST /api/apartados/pdf`),
que además dispara un correo al cliente y uno de aviso al vendedor.

### 6. El vendedor confirma la venta
El apartado se marca como vendido desde el panel del vendedor o del admin.

---

## Flujo de Uso — Vendedor

### 1. Inicia sesión
`/login` con usuario y contraseña → `POST /api/auth/vendedor/login`. La
sesión se guarda en `sessionStorage` (permite varias sesiones de distintos
vendedores simultáneas, cada una en su propia pestaña).

### 2. Da de alta clientes
Pestaña **Clientes** — genera un token por cliente (email + nombre opcional).
Puede desactivar tokens existentes.

### 3. Gestiona sus Apartados
Pestaña **Apartados** — los ve **agrupados por cliente**: primero un grid de
tarjetas (una por cliente, con conteo de lotes), y al entrar a una se ve el
detalle de esos apartados sin mezclarse con los de otro cliente. Desde ahí:
- **Prorrogar** (extender el plazo de expiración).
- **Liberar** (cancelar, el lote vuelve a estar disponible).
- **Confirmar venta**.
- Clic en la foto de un lote → vista previa completa (mismo detalle que en
  Catálogo), sin salir del contexto de Apartados.

### 4. Ve el Catálogo
Igual que el cliente, pero puede iniciar apartados en nombre de sus clientes
si el flujo lo requiere (vista showcase, agrupado por material, 4 columnas en
pantallas anchas).

---

## Flujo de Uso — Admin

Todo lo anterior, más:

### Dar de alta vendedores
Pestaña **Vendedores** (solo visible si `esAdmin`) — crea cuentas con
usuario/contraseña propios. También puede hacerse por línea de comandos sin
necesidad de que la API esté corriendo:

```bash
cd apps/api
node scripts/crear-vendedor.mjs --usuario=jperez --password="claveSegura123" --nombre="Juan Pérez" --email=jperez@petravia.mx
# agregar --admin=true para crear otra cuenta admin
```

### Ver todo, de todos
- **Clientes**: todos los tokens de todos los vendedores, indicando a quién
  pertenece cada uno.
- **Apartados**: los de todos los vendedores, agrupados por cliente igual que
  en el panel de vendedor, mostrando además "Vendedor: nombre" en cada lote
  (porque un mismo admin puede estar viendo clientes de distintos vendedores).
- **Activar/desactivar** cuentas de vendedor (no puede desactivarse a sí
  mismo).

---

## Endpoints API

Base: `/api`. Autenticación por header `Authorization: Bearer <token>` en
todos los endpoints protegidos.

### Autenticación (`/api/auth`)

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| POST | `/login` | Cliente | Login con token → `{ token, email, nombre }` |
| POST | `/vendedor/login` | Vendedor | Login con usuario/contraseña → `{ token, vendedorId, usuario, nombre, esAdmin, expiresAt }` |
| POST | `/vendedor/logout` | Vendedor | Invalida la sesión actual |
| POST | `/generar-token` | Vendedor | Genera un token de cliente propio. Body: `{ email, nombre? }` |
| GET | `/tokens` | Vendedor | Lista los tokens (clientes) del vendedor autenticado |
| DELETE | `/tokens/:tokenId` | Vendedor | Desactiva un token propio |

### Lotes / Catálogo (`/api/lotes`)

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/` | Público* | Lista de lotes (filtros por query) |
| GET | `/buscar` | Público* | Búsqueda avanzada: `?material=&grupo=&metraje=` → `{ individual: Lote[], combos: [...] }` |
| GET | `/filtros/materiales` | Público* | Materiales únicos disponibles |
| GET | `/filtros/grupos` | Público* | Grupos únicos disponibles |
| GET | `/:id` | Público* | Detalle de un lote |
| POST | `/:id/apartar` | Cliente | Aparta el lote por 48h. Body: `{ nombre? }` (si no se envía, se usa la parte local del email) |

\* Protegido a nivel de ruta de React (`ProtectedCatalogo`), no de API — requiere sesión de cliente o vendedor en el frontend.

### Apartados del cliente autenticado (`/api/apartados`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Apartados vigentes/expirados del cliente, con datos del lote |
| GET | `/historial` | Historial de compras confirmadas del cliente |
| POST | `/pdf` | Genera PDF de sus apartados, lo envía por correo al cliente y notifica al vendedor, y lo devuelve para descarga |
| DELETE | `/:id` | Cancela un apartado propio |

### Vendedor (`/api/vendedor`) — requiere sesión de vendedor

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/me` | Datos de la sesión actual |
| GET | `/apartados?filtro=pendiente\|expirado` | Apartados de los clientes del vendedor |
| GET | `/estadisticas` | Estadísticas propias |
| POST | `/apartados/:id/confirmar` | Confirma venta (lote → vendido) |
| POST | `/apartados/:id/prorrogar` | Extiende expiración. Body: `{ horas?: number }` (default 24h, rango -168 a 168) |
| DELETE | `/apartados/:id` | Libera el apartado |

### Admin (`/api/admin`) — requiere `esAdmin`, 403 para vendedor normal

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vendedores` | Lista todas las cuentas de vendedor |
| POST | `/vendedores` | Crea una cuenta de vendedor. Body: `{ usuario, password, nombre, email? }` |
| PATCH | `/vendedores/:id` | Activa/desactiva. Body: `{ esActivo: boolean }` |
| GET | `/clientes` | Todos los tokens de todos los vendedores |
| GET | `/apartados?filtro=` | Todos los apartados de todos los vendedores |
| GET | `/estadisticas` | Totales globales |
| GET | `/resumen-clientes` | Clientes con apartados activos, agrupados, con su vendedor |
| POST | `/apartados/:id/confirmar` | Confirma venta de cualquier vendedor |
| DELETE | `/apartados/:id` | Libera apartado de cualquier vendedor |

### Imágenes (`/api/imagenes`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/:modelo/:id/:campo` | Proxy de imágenes de Odoo (usa `image_256` para el catálogo por performance) |

---

## Componentes Frontend

### Layout y páginas (`/pages`)
- **LoginPage** — login unificado (detecta si es token de cliente o usuario/contraseña de vendedor)
- **ClientLoginPage** — variante de login solo-cliente
- **SeleccionTipoPage** — selector inicial cliente
- **CatalogoPage** — catálogo completo (grilla/agrupado, filtros, búsqueda por metraje), reutilizado tanto en la ruta pública `/catalogo` como embebido dentro de `VendedorPanel`/`AdminPanel`
- **LoteDetallePage** — detalle de lote como página propia (ruta `/catalogo/:loteId`)
- **VendedorPage** — shell del panel de vendedor/admin (decide cuál de los dos `Panel` renderizar según `esAdmin`)
- **AdminPage** — (legacy, panel standalone previo al modelo multi-vendedor)

### Componentes de catálogo (`/components/catalog`)
- **BuscadorAvanzado** — filtros material/grupo/metraje + resultados individuales y combos
- **ApartarModal** — modal para apartar un lote (requiere sesión de cliente)
- **MisApartados** — panel de apartados del cliente autenticado
- **HistorialCompras** — historial de compras confirmadas del cliente
- **FiltrosPanel**, **LoteCard**, **LoteCardShowcase**, **MaterialesGaleria**, **EstadoBadge**, **PanelCliente** — piezas de UI del catálogo

### Vendedor y Admin (`/components/vendedor`, `/components/admin`)
- **VendedorPanel** — tabs Apartados / Clientes / Catálogo. Apartados con
  sub-selección por cliente (grid → detalle) y vista previa de lote al hacer
  clic en la foto.
- **AdminPanel** — igual que VendedorPanel más tab **Vendedores**, y ve datos
  de todos los vendedores (mismo patrón de agrupación por cliente en
  Apartados).
- **LoteDetalleInline** (una copia en cada carpeta) — vista de detalle de lote
  embebida dentro del panel, sin navegar a otra ruta.

### Auth (`/components/auth`)
- **ClientAuthModal** — modal de login de cliente con token

### Hooks (`/hooks`)
- **useClientAuth** — `useClientLogin`, `useCurrentClient`, `useSaveClient`, `useClientLogout`
- **useBusqueda** — `useBusquedaLotes`, `useMateriales`, `useGrupos`
- **useApartar** — `useApartar`, `useObtenerApartados`, `useLiberarApartado`
- **useLotes** — fetch de catálogo (lista, detalle)
- **useAdminLocal** — sesión local del panel legacy `AdminPage`

### Estado global
- **store/catalogoStore.ts** — filtros de catálogo compartidos entre vista showcase y agrupada
- **lib/vendedorSession.ts** — sesión de vendedor en `sessionStorage`, soporta múltiples sesiones simultáneas
- **lib/api.ts** — cliente HTTP base

---

## Base de Datos (SQLite)

### `vendedores`
```sql
id              TEXT PRIMARY KEY,     -- UUID
usuario         TEXT NOT NULL UNIQUE,
password_hash   TEXT NOT NULL,        -- scrypt: "salt:hash"
nombre          TEXT NOT NULL,
email           TEXT,                 -- recibe notificaciones de sus apartados
es_activo       INTEGER NOT NULL DEFAULT 1,
es_admin        INTEGER NOT NULL DEFAULT 0,
creado_en       TEXT DEFAULT (datetime('now'))
```

### `client_tokens`
```sql
id          TEXT PRIMARY KEY,
token       TEXT NOT NULL UNIQUE,
vendedor_id TEXT,                     -- FK → vendedores.id (dueño del cliente)
email       TEXT NOT NULL,
nombre      TEXT,                     -- nombre "real" capturado por el vendedor al dar de alta
es_activo   INTEGER NOT NULL DEFAULT 1,
creado_en   TEXT DEFAULT (datetime('now')),
ultimo_uso  TEXT,
expira_en   TEXT
```

### `apartados`
```sql
id              TEXT PRIMARY KEY,
lote_id         TEXT NOT NULL,        -- name del stock.lot en Odoo
vendedor_id     TEXT,                 -- FK → vendedores.id
cliente_email   TEXT NOT NULL,
cliente_nombre  TEXT NOT NULL,        -- nombre capturado al apartar (puede diferir del de client_tokens.nombre)
creado_en       TEXT DEFAULT (datetime('now')),
expira_en       TEXT NOT NULL         -- creado_en + 48h por defecto
```

> ⚠️ **Nota:** `apartados.cliente_nombre` se llena con `req.body.nombre` al
> momento de apartar, o si no viene, con la parte local del email
> (`cliente@dominio.com` → `"cliente"`). Por eso puede no coincidir con el
> nombre real que el vendedor capturó en `client_tokens.nombre` al dar de
> alta al cliente — el frontend siempre debe preferir este último cuando esté
> disponible (así lo hace `VendedorPanel`/`AdminPanel` al agrupar apartados
> por cliente).

### `ventas_locales`
Overlay local de ventas confirmadas — global, no depende de vendedor
(`lote_id` → `vendido_en`).

### `historial_compras`
Snapshot de cada venta confirmada (material, acabado, m² al momento de la
compra), para no depender de que el dato siga igual en Odoo después.

---

## Limpieza Automática

- **Intervalo**: revisión periódica (`middleware/apartadosCleanup.ts`).
- **Acción**: detecta apartados con `expira_en` vencido.
- **Resultado**: libera el lote (deja de bloquearlo) y limpia el registro.

---

## Seguridad

- **Cliente**: token opaco, validado contra `client_tokens` en cada request (`authClient`). Se guarda en `localStorage` del navegador del cliente.
- **Vendedor/Admin**: usuario + contraseña (scrypt), sesión con token de sesión validado por `authVendedor` / `authAdmin` (este último exige además `es_admin = 1`, devuelve 403 si no).
- **Aislamiento por vendedor**: todo query de apartados/clientes de un vendedor normal está acotado por `vendedor_id` a nivel de servicio — un vendedor nunca puede ver ni tocar datos de otro. El admin es la única excepción explícita.
- **CORS**: configurado por `CORS_ORIGIN` en `.env`.

---

## Variables de Entorno relevantes

Ver `.env.example` para la lista completa. Las más relevantes para este documento:

| Variable | Descripción |
|---|---|
| `DB_PATH` | Ruta del archivo SQLite |
| `CORS_ORIGIN` | Origin permitido |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_KEY` | Conexión XML-RPC a Odoo (fuente del catálogo) |
| `SMTP_*` | Envío de correos (PDF de apartados, notificaciones a vendedor) |
| `VITE_API_URL` | URL del API que usa el frontend (en Docker, Nginx la resuelve internamente) |

No existe ya `ADMIN_KEY`: el primer arranque siembra automáticamente un
vendedor admin a partir de `ADMIN_USER`/`ADMIN_PASS` (ver
`db/migrate.ts::sembrarVendedorInicial`), y a partir de ahí toda cuenta nueva
se crea por el panel o por `scripts/crear-vendedor.mjs`.

---

## Próximos Pasos (Opcionales)

- [ ] Expiración/rotación automática de tokens de cliente inactivos
- [ ] Notificaciones por email cuando un apartado está por vencer (no solo al confirmarse)
- [ ] Integración con Odoo para marcar la venta automáticamente al confirmar
- [ ] 2FA para cuentas de vendedor/admin