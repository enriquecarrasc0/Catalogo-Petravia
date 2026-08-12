# Sistema de Apartados - Documentación

## Descripción General

El sistema de apartados permite a clientes privados **reservar temporalmente** uno o más lotes por **48 horas**. Durante este período, el lote está en estado `apartado` y no puede ser comprado por otros clientes. Si la venta no se completa en las 48 horas, el lote automáticamente vuelve a estado `disponible`.

## Flujo de Uso

### 1. Cliente aparta un lote
- En la página de detalle del lote, hace clic en **"Apartar Lote"**
- Se abre un modal pidiendo:
  - Email del cliente
  - Nombre del cliente
  - Metraje deseado (opcional) - para tracking de cuánto necesita el cliente
- El cliente puede apartar **múltiples lotes** para alcanzar su metraje total

### 2. Confirmación de apartado
- El apartado se crea con un ID único
- El lote cambia de estado: `disponible` → `apartado`
- El apartado **vence en 48 horas**

### 2.1 Descarga del PDF final (con notificación por correo)
- Desde "Mis Apartados", el cliente puede dar clic en **"Descargar PDF"**
- En ese momento el backend:
  1. Genera un PDF real (server-side, con `pdfkit`) con el resumen de todos sus apartados activos
  2. Envía ese PDF por correo al cliente (`clienteEmail`)
  3. Envía un correo de notificación al administrador (`ADMIN_EMAIL`), avisando quién y qué apartó, con el mismo PDF adjunto
  4. Devuelve el PDF al navegador para descarga inmediata
- Endpoint: `POST /api/apartados/pdf` (requiere token de cliente)
- Si el envío de correo falla (ej. SMTP mal configurado), la descarga del PDF **no se ve afectada** — el error solo se registra en el log del servidor

### 3. Venta completada
- El cliente contacía a Petravia para completar la compra
- Un admin/vendedor confirma la venta con el endpoint `/api/apartados/:id/confirmar-venta`
- El lote se marca como `vendido`
- Todos los otros apartados del mismo lote se eliminan

### 4. Apartado expirado (automático)
- Si pasan 48 horas sin confirmar venta
- Una tarea de limpieza (ejecutada cada 60 minutos) detecta apartados expirados
- El lote vuelve a `disponible`
- El apartado se elimina de la BD

## Endpoints API

### Apartar un lote
```http
POST /api/lotes/:id/apartar
Content-Type: application/json

{
  "clienteEmail": "cliente@example.com",
  "clienteNombre": "Juan Pérez",
  "metrajeDeseado": 25.50
}
```

**Respuesta:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid-del-apartado",
    "loteId": "F 590",
    "clienteEmail": "cliente@example.com",
    "clienteNombre": "Juan Pérez",
    "metrajeDeseado": 25.50,
    "creadoEn": "2026-06-09T14:30:00Z",
    "expiraEn": "2026-06-11T14:30:00Z"
  }
}
```

### Obtener apartados de un cliente
```http
GET /api/apartados?email=cliente@example.com
```

### Generar PDF final + enviar correos (cliente y admin)
```http
POST /api/apartados/pdf
Authorization: Bearer <token-del-cliente>
```
Responde con el PDF (`application/pdf`) y, como efecto secundario en el servidor,
envía el PDF por correo al cliente y notifica al administrador.

### Cancelar un apartado
```http
DELETE /api/apartados/:id
```

### Confirmar venta (marcar como vendido)
```http
POST /api/apartados/:id/confirmar-venta
```

## Estructura de Base de Datos

### Tabla `apartados`
```sql
CREATE TABLE apartados (
  id TEXT PRIMARY KEY,           -- UUID
  lote_id TEXT NOT NULL,          -- FK → lotes.id
  cliente_email TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  metraje_deseado REAL,           -- opcional
  creado_en TEXT,                 -- ISO datetime
  expira_en TEXT NOT NULL         -- creado_en + 48 horas
);

CREATE INDEX idx_apartados_lote ON apartados(lote_id);
CREATE INDEX idx_apartados_expira ON apartados(expira_en);
```

### Campo agregado a `lotes`
- `estado: 'disponible' | 'vendido' | 'apartado'`
- El campo `cliente` se rellena cuando un lote está `apartado`

## Logica de Limpieza

La función `iniciarLimpiezaApartados()` en `apartadosCleanup.ts`:
1. Se ejecuta al iniciar el servidor
2. Luego cada 60 minutos
3. Para cada apartado expirado:
   - Verifica si hay otros apartados vigentes para el mismo lote
   - Si no hay, marca el lote como `disponible`
   - Elimina el apartado de la BD

## Uso Típico en Frontend

```tsx
import { useState } from 'react';
import ApartarModal from '@/components/catalog/ApartarModal';

export function LoteDetallePage() {
  const [isApartarOpen, setIsApartarOpen] = useState(false);
  const { data: lote } = useLote(loteId);

  if (!lote) return null;

  return (
    <div>
      {/* Detalles del lote */}
      <button
        onClick={() => setIsApartarOpen(true)}
        className="btn-primary"
      >
        Apartar Lote
      </button>

      <ApartarModal
        lote={lote}
        isOpen={isApartarOpen}
        onClose={() => setIsApartarOpen(false)}
      />
    </div>
  );
}
```

## Consideraciones

- **48 horas es un límite flexible**: Se puede ajustar la constante en `apartadosCleanup.ts`
- **Notificaciones por email**: Al descargar el PDF desde "Mis Apartados", se envía automáticamente
  una copia al cliente y una notificación al administrador (`ADMIN_EMAIL` en `.env`). Requiere
  configurar las variables `SMTP_*` en `apps/api/.env` (ver `.env.example`). Si usas Gmail,
  necesitas una "contraseña de aplicación" (https://myaccount.google.com/apppasswords), no la
  contraseña normal de la cuenta.
- **Sin validación de clientes**: Cualquiera puede apartar lotes. Se podría agregar autenticación si lo requieres
- **Sin límite de apartados por cliente**: Un cliente puede apartar infinitos lotes
