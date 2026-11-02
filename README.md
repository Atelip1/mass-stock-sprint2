# Mass Stock

Sistema web de control de stock, alertas de quiebre y reposición para la tienda MASS – Óvalo Francisco Bolognesi, Chincha.
Proyecto del curso Metodologías Ágiles · UPSJB · 2026-II.

Arquitectura (Informe de Arquitectura y Planificación): **Next.js en Vercel** + **Supabase** (Auth, API, Realtime y PostgreSQL con RLS).
Las reglas del stock viven en funciones transaccionales de la base de datos y los permisos se validan con Row Level Security.

---

## Estado: Sprints 2 a 5 y Product Backlog

| Sprint | HU / RF | Qué hace | Pantalla |
|---|---|---|---|
| 2 | RF-01 | Inicio y cierre de sesión; bloqueo de 15 min tras 5 intentos | `/login` |
| 2 | RF-02 | Menú por rol (Operación, Control, Análisis, Administración); «Sin acceso» por enlace | todas |
| 2 | RF-04, RF-05 | Usuarios con 3 roles; contraseña temporal y restablecimiento | `/usuarios` |
| 2 | RF-06, RF-08, RF-09 | Catálogo con código de barras GS1 o interno 20–29; categoría parecida | `/catalogo` |
| 2 | RF-12, RF-22 | Buscador global sin tildes; lectura con la cámara | encabezado |
| 2 | RF-14, RF-15 | Ingreso por guía con lote, vencimiento y zona | `/ingreso` |
| 2 | RF-34, RF-35 | Stock en tiempo real y estado de la conexión | `/stock` |
| 3 | RF-13 | Ficha con stock, lotes, movimientos y alertas | clic en un producto |
| 3 | RF-16 | Reposición de percha por FEFO desde pendientes, lectora o lista | `/reponer` |
| 3 | RF-17 | Salida de varios productos por venta (FEFO), merma o vencimiento | `/salida` |
| 3 | RF-18 | Conteo físico; el ajuste queda pendiente | `/conteo` |
| 3 | RF-23 | Alertas automáticas de abastecimiento y de percha (RN-07) | base de datos |
| 3 | RF-24, RF-25 | Alertas ordenadas por nivel y ABC, con su acción por fila y para varias | `/reposicion` |
| 3 | RF-27 | Seguimiento: Pendiente, En reposición, Repuesto, Cerrado | `/reposicion` → Seguimiento |
| 3 | RF-30 | Lotes vencidos y por vencer (30 días) | `/vencimientos` |
| 3 | RF-36 | Historial por tipo con contadores; el reponedor ve solo lo suyo | `/historial` |
| 4 | RF-19 | Aprobar o rechazar ajustes con motivo; nadie aprueba su propio conteo | `/conteo` |
| 4 | RF-20 | Anular un movimiento con motivo; el stock se revierte | `/historial` |
| 4 | RF-21 | Importar las ventas de caja (Excel o CSV); las filas con error se informan | `/importar-ventas` |
| 4 | RF-26 | Cantidad sugerida en cada alerta y en la reposición | `/reposicion`, `/reponer` |
| 4 | RF-32, RF-33 | Inicio completo del administrador/supervisor e inicio del reponedor | `/` |
| 4 | RF-37 | Rotación por ventas con clasificación ABC (7, 30, 90 días o rango) | `/rotacion` |
| 4 | RF-39, RF-40 | Indicadores semanales frente a línea base y meta; historial de la línea base | `/indicadores` |
| 5 | RF-03, RNF-19 | Mi cuenta: cambiar la contraseña pidiendo la actual; modo oscuro que se recuerda | `/mi-cuenta`, menú del usuario |
| 5 | RF-05 | Restablecer la contraseña con una temporal (y desbloquear la cuenta) | `/usuarios` |
| 5 | RF-07 | Aviso de nombre parecido al registrar un producto («ACEITES primor 1 L» ≈ «Aceite Primor 1L») | `/catalogo` |
| 5 | RF-11 | Proveedores: «+ Nuevo proveedor», RUC de 11 dígitos sin repetir, días de entrega | `/catalogo` → Proveedores |
| 5 | RF-28 | Solicitudes al proveedor y lista de pedido | `/reposicion` → Solicitudes |
| 5 | RF-31 | Retiro, oferta o devolución de lotes por vencer | `/vencimientos` |
| 5 | RF-38 | Exportar a CSV el stock, las alertas, el historial, la rotación y la lista de pedido | cada tabla |
| Backlog | RF-10 | Fusionar categorías duplicadas | `/catalogo` → Categorías |
| Backlog | RF-29 | Campana con las alertas nuevas; cada aviso lleva a su alerta | encabezado |
| Backlog | RF-41 | Parámetros: días de aviso, % crítico, días del mínimo sugerido, stock de seguridad y zonas | `/parametros` |
| Backlog | RN-06 | Stock mínimo sugerido con las ventas reales al editar un producto | `/catalogo` |

Con esto están los 41 requerimientos funcionales. Queda para la prueba en tienda del Sprint 5: medir la línea base real,
probar en un celular Android de un reponedor y reemplazar el ícono por el logo oficial (RNF-05).

### Decisiones de Sprints 3 y 4 (para revisarlas en la Sprint Review)

- **Cantidad sugerida (RF-26):** lleva el stock al **doble** de su mínimo; en percha, al doble del mínimo de percha sin superar el almacén.
  Coincide con los números del prototipo (Figura 12). Si la tienda prefiere otra cifra, se cambia en una línea de `alertas_activas()`.
- **Alertas:** se recalculan solas al terminar cada movimiento (no a mitad de un traslado) y cuando se abre una pantalla de control,
  porque un lote vence sin que nada cambie en la base de datos.
- **Ajuste positivo:** las unidades de más se suman al lote vigente que vence más tarde. Si no hay lotes vigentes, pide registrar un ingreso.
- **Importar ventas:** se agrupan las filas del mismo código; no se importa dos veces el mismo día (se anula en el Historial y se vuelve a cargar).
- **Indicadores:** la última semana es el valor actual; la línea base nunca está escrita en el código (RN-19), se registra en la pantalla.

## Puesta en marcha

### 1. Crear los proyectos de Supabase

Crea dos proyectos en <https://supabase.com> (plan gratuito, región **South America (São Paulo)**):
`mass-stock-dev` (datos de ejemplo) y `mass-stock-prod` (datos reales de la tienda).

En cada proyecto:

1. **SQL Editor** → pega y ejecuta, **en este orden**, cada archivo de `supabase/migrations/`:
   1. `20261019000001_esquema_inicial.sql` (Sprint 2)
   2. `20261102000001_sprint3_operacion_y_alertas.sql` (Sprint 3)
   3. `20261116000001_sprint4_control_y_analisis.sql` (Sprint 4)
   4. `20261130000001_sprint5_y_backlog.sql` (Sprint 5 y Product Backlog)
2. **SQL Editor** → ejecuta `supabase/seed.sql` (categorías oficiales y proveedores) si aún no lo hiciste.
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

En el SQL Editor del proyecto **de desarrollo** ejecuta `supabase/demo/datos_ejemplo.sql` (después de crear el administrador).
Carga los 9 productos del prototipo con su stock en almacén y percha. **No lo ejecutes en producción.**

### 5. Ejecutar

```bash
npm run dev        # http://localhost:3000
```

La cámara del celular solo funciona con HTTPS o en `localhost`. Para probarla en el celular, usa la vista previa de Vercel.

### Velocidad: por qué `npm run dev` se siente lento

`npm run dev` es el modo de **desarrollo**: compila cada pantalla la primera vez que la abres y no precarga las demás,
así que cada clic tarda alrededor de un segundo (más en Windows). Es normal y no pasa en Vercel.
Para probar la velocidad real en tu computadora (compila una vez y luego cada clic es inmediato):

```bash
npm run rapido     # = npm run build + npm start → http://localhost:3000
```

Medido con 70 ms de demora de red simulada hacia Supabase (como Chincha → São Paulo), del clic en el menú hasta ver los datos:

| | Versión del Sprint 4 | Ahora |
|---|---|---|
| Promedio por clic (producción) | 0,48 s | 0,10 s al volver · 0,19 s la primera vez |
| Reposición | 0,85 s | 0,06 s |
| Inicio | 1,00 s | 0,06 s |
| `npm run dev`, primera vez en cada pantalla | ~1,5 s (compila) | ~1,6 s (compila); 0,15 s al volver |

Lo que se hizo:

- El middleware verifica la sesión y lee el perfil **una vez** y se lo pasa a la pantalla (antes eran 4 consultas por clic).
- Cada pantalla muestra al instante sus últimos datos y los actualiza en segundo plano (`src/lib/datos.ts`).
- La revisión de alertas por vencimiento corre una vez al entrar y cada 10 minutos, sin frenar las pantallas.
- Al volver a una pantalla en menos de 3 minutos no se pide de nuevo al servidor (`staleTimes` en `next.config.ts`).
- Esqueleto de carga inmediato al hacer clic (`src/app/(app)/loading.tsx`) y Turbopack en `npm run dev`.

### 6. Publicar en Vercel

1. Sube el repositorio a GitHub (ramas `develop` y `main`).
2. En Vercel: *Add New → Project* → importa el repositorio. Región de funciones: **São Paulo (gru1)**.
3. En *Settings → Environment Variables* agrega las tres variables:
   - **Preview** → las del proyecto `mass-stock-dev`.
   - **Production** → las del proyecto `mass-stock-prod`.
4. Cada push a `develop` genera una vista previa; al cierre del sprint se integra `develop` en `main` y se publica producción.

---

### 7. Pruebas de la base de datos (Sprints 2 y 3)

`supabase/pruebas/` tiene 71 casos que prueban las funciones, la RLS por rol (administrador, supervisor,
reponedor y anónimo) y las alertas, llamando a la base de datos como lo hace la API (definición de terminado, punto 3).
Se ejecutan en un PostgreSQL **local**, nunca en Supabase:

```bash
bash supabase/pruebas/ejecutar.sh   # termina con «71 | 0» (correctas | fallas)
```

---

## Estructura

```
supabase/
  migrations/      Esquema y funciones por sprint (stock, alertas, ajustes, ventas, indicadores), RLS y Realtime
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
    (app)/  inicio, ingreso, reponer, salida, conteo, importar-ventas, stock, reposicion,
            vencimientos, historial, rotacion, indicadores, catalogo, usuarios, parametros,
            mi-cuenta, sin-acceso
    api/    auth/login, auth/logout, auth/cambiar-password, admin/usuarios
```

## Cómo agregar una pantalla en los próximos sprints

1. Agrega la función de base de datos en una **nueva migración** (`supabase/migrations/2026MMDD..._nombre.sql`); nunca edites una ya aplicada.
2. Registra la pantalla y sus roles en `src/lib/roles.ts` (el menú y el middleware la toman de ahí).
3. Crea la página en `src/app/(app)/<ruta>/page.tsx` con el `Encabezado` común.
4. Antes de dar la historia por terminada, revisa la definición de terminado: criterio de aceptación, celular real a 360 px,
   permisos probados con los tres roles (también llamando a la API) y mensajes de error que dicen cómo corregir.

## Decisiones del Sprint 2 (siguen vigentes)

- **Toda operación que cambia el stock es una función** (`registrar_ingreso`): valida rol, cantidades, lote, vencimiento y zona,
  y si una línea falla no se guarda ninguna. Los mensajes indican la línea y el producto («Línea 2 (Cerveza Pilsen 620ml): …»).
- **No hay políticas DELETE**: productos, lotes y movimientos no se borran (RNF-15).
- **Las zonas del almacén** (A-1 … C-2) están en la tabla `parametros`; el jefe de tienda puede cambiarlas ahí.
- **El logo**: el sistema usa un ícono neutro. Reemplázalo por el logo oficial que entregue la tienda (RNF-05) en
  `src/components/Shell.tsx` y `src/components/PantallaAcceso.tsx`.
