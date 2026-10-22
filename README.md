# Mass Stock

Sistema web de control de stock, alertas de quiebre y reposición para la tienda MASS – Óvalo Francisco Bolognesi, Chincha.
Proyecto del curso Metodologías Ágiles · UPSJB · 2026-II.

Arquitectura (Informe de Arquitectura y Planificación): **Next.js en Vercel** + **Supabase** (Auth, API, Realtime y PostgreSQL con RLS).
Las reglas del stock viven en funciones transaccionales de la base de datos y los permisos se validan con Row Level Security.

---

## Estado: incremento del Sprint 2 (19/10 – 01/11/2026)

| HU | RF | Qué hace | Dónde |
|---|---|---|---|
| HU-01 | RF-01 | Inicio y cierre de sesión; mensaje que no revela qué falló; bloqueo de 15 min tras 5 intentos | `/login`, `api/auth/login` |
| HU-02 | RF-02 | Menú por rol agrupado (Operación, Control, Análisis, Administración); «Sin acceso» si se abre por enlace | `lib/roles.ts`, `middleware.ts` |
| HU-04 | RF-04 | Crear, editar, activar y desactivar usuarios; no se puede desactivar al último administrador | `/usuarios`, `api/admin/usuarios` |
| HU-06 | RF-06 | Productos con código de barras obligatorio (valida dígito GS1) o código interno 20–29 | `/catalogo` |
| HU-08 | RF-08 | Buscar, filtrar, editar y desactivar productos (nunca se borran) | `/catalogo` |
| HU-09 | RF-09 | Categoría desde lista; «+ Nueva categoría» sugiere la parecida («bebibles» → «Bebidas») | `/catalogo` |
| HU-12 | RF-12 | Buscador global sin tildes, por palabras parciales, código o lote; código exacto abre la ficha | encabezado |
| HU-14 | RF-14 | Ingreso por guía de remisión con varias líneas; lectora USB elige el producto y pasa a cantidad | `/ingreso` |
| HU-15 | RF-15 | Lote, vencimiento (no pasado) y zona por línea; la mercadería entra al almacén | `/ingreso` |
| HU-22 | RF-22 | Lectura de EAN-13/EAN-8 con la cámara del celular | botón «Cámara» |
| HU-34 | RF-34 | Stock en almacén, percha y total, con barra de percha, estados, filtros, orden y páginas de 20 | `/stock` |
| HU-35 | RF-35 | «Conectado / Reconectando / Sin conexión», hora de actualización y «Reintentar» | encabezado |

Además quedan listos: la **ficha de producto** (RF-13, se abre desde la tabla y el buscador, porque RF-34 y RF-12 la piden),
el **cambio obligatorio de contraseña** en el primer ingreso (parte de RF-03, necesario para RF-04), el **cierre por 30 min de
inactividad** (RNF-12) y el **bloqueo de registros sin conexión** (RNF-18).

Pendiente para el Sprint 3: reposición, salida de varios productos, conteo, alertas y su seguimiento, vencimientos e historial.

---

## Puesta en marcha

### 1. Crear los proyectos de Supabase

Crea dos proyectos en <https://supabase.com> (plan gratuito, región **South America (São Paulo)**):
`mass-stock-dev` (datos de ejemplo) y `mass-stock-prod` (datos reales de la tienda).

En cada proyecto:

1. **SQL Editor** → pega y ejecuta `supabase/migrations/20261019000001_esquema_inicial.sql`.
2. **SQL Editor** → ejecuta `supabase/seed.sql` (categorías oficiales y proveedores).
   Los RUC de los proveedores son de ejemplo: cámbialos por los reales en *Table Editor → proveedores*.
3. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
   (las cuentas solo las crea el administrador) y desactiva **Confirm email**. Pon la longitud mínima de contraseña en 8.

> Con la CLI de Supabase también puedes hacer `supabase link` y `supabase db push`.

### 2. Variables de entorno

Copia `.env.example` como `.env.local` y complétalo con *Project Settings → API* del proyecto de desarrollo.
La `SUPABASE_SERVICE_ROLE_KEY` es secreta: nunca la subas a GitHub ni le pongas el prefijo `NEXT_PUBLIC_`.

### 3. Instalar y crear el primer administrador

```bash
npm install
npm run crear-admin -- "Nombre del Jefe" jefe@mass.pe
```

El comando imprime una contraseña temporal; al ingresar, el sistema pide crear una nueva.

### 4. Datos de ejemplo (solo en desarrollo)

En el SQL Editor del proyecto **de desarrollo** ejecuta `supabase/demo/datos_ejemplo.sql`.
Carga los 9 productos del prototipo con su stock en almacén y percha. **No lo ejecutes en producción.**

### 5. Ejecutar

```bash
npm run dev        # http://localhost:3000
```

La cámara del celular solo funciona con HTTPS o en `localhost`. Para probarla en el celular, usa la vista previa de Vercel.

### 6. Publicar en Vercel

1. Sube el repositorio a GitHub (ramas `develop` y `main`).
2. En Vercel: *Add New → Project* → importa el repositorio. Región de funciones: **São Paulo (gru1)**.
3. En *Settings → Environment Variables* agrega las tres variables:
   - **Preview** → las del proyecto `mass-stock-dev`.
   - **Production** → las del proyecto `mass-stock-prod`.
4. Cada push a `develop` genera una vista previa; al cierre del sprint se integra `develop` en `main` y se publica producción.

---

## Estructura

```
supabase/
  migrations/      Esquema, funciones de registro, vista de stock, RLS y Realtime
  seed.sql         Categorías oficiales y proveedores
  demo/            Datos de ejemplo del prototipo (solo desarrollo)
scripts/
  crear-admin.mjs  Crea el primer administrador
src/
  middleware.ts    Sesión, cambio de contraseña obligatorio y permisos por pantalla
  lib/             Clientes de Supabase, roles (matriz de acceso), formatos y tipos
  components/      Shell (menú y encabezado), buscador, cámara, selector, ficha, conexión, avisos
  app/
    login/  cambiar-password/
    (app)/  inicio, ingreso, stock, catalogo, usuarios, sin-acceso
    api/    auth/login, auth/logout, auth/cambiar-password, admin/usuarios
```

## Cómo agregar una pantalla en los próximos sprints

1. Agrega la función de base de datos en una **nueva migración** (`supabase/migrations/2026MMDD..._nombre.sql`); nunca edites una ya aplicada.
2. Registra la pantalla y sus roles en `src/lib/roles.ts` (el menú y el middleware la toman de ahí).
3. Crea la página en `src/app/(app)/<ruta>/page.tsx` con el `Encabezado` común.
4. Antes de dar la historia por terminada, revisa la definición de terminado: criterio de aceptación, celular real a 360 px,
   permisos probados con los tres roles (también llamando a la API) y mensajes de error que dicen cómo corregir.

## Decisiones del Sprint 2

- **Toda operación que cambia el stock es una función** (`registrar_ingreso`): valida rol, cantidades, lote, vencimiento y zona,
  y si una línea falla no se guarda ninguna. Los mensajes indican la línea y el producto («Línea 2 (Cerveza Pilsen 620ml): …»).
- **No hay políticas DELETE**: productos, lotes y movimientos no se borran (RNF-15).
- **Las zonas del almacén** (A-1 … C-2) están en la tabla `parametros`; el jefe de tienda puede cambiarlas ahí.
- **El logo**: el sistema usa un ícono neutro. Reemplázalo por el logo oficial que entregue la tienda (RNF-05) en
  `src/components/Shell.tsx` y `src/components/PantallaAcceso.tsx`.
