-- =====================================================================
-- Mass Stock · Sprint 2 · Esquema inicial
-- Tablas del negocio, reglas de stock, permisos por rol (RLS) y búsqueda.
-- Ejecutar en el SQL Editor de Supabase (o con `supabase db push`).
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Fecha de hoy en Perú (el servidor de Supabase trabaja en UTC).
create or replace function public.hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Lima')::date $$;

-- Normaliza texto para comparar: sin tildes, minúsculas y sin espacios extra (RN-16, RF-12).
create or replace function public.norm(t text) returns text
language sql immutable parallel safe
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '\s+', ' ', 'g'))
$$;

-- Lleva cada palabra a singular para detectar duplicados (RN-16): «gaseosas» → «gaseosa», «panes» → «pan».
create or replace function public.norm_singular(t text) returns text
language sql immutable parallel safe
as $$
  select coalesce(string_agg(
           case
             when w ~ '[lnrdzjx]es$' and length(w) > 4 then left(w, length(w) - 2)
             when w ~ 's$' and length(w) > 3 then left(w, length(w) - 1)
             else w
           end, ' ' order by i), '')
  from unnest(string_to_array(public.norm(t), ' ')) with ordinality as p(w, i)
$$;

-- Dígito verificador GS1 para una base de 7 o 12 dígitos (RN-03).
create or replace function public.ean_digito(base text) returns int
language plpgsql immutable as $$
declare
  s int := 0;
  n int := length(base);
  i int;
begin
  for i in 1..n loop
    -- Desde la derecha, las posiciones impares pesan 3.
    if ((n - i) % 2) = 0 then s := s + substr(base, i, 1)::int * 3;
    else s := s + substr(base, i, 1)::int; end if;
  end loop;
  return (10 - s % 10) % 10;
end $$;

-- ¿Es un EAN-13 o EAN-8 con dígito verificador correcto?
create or replace function public.ean_valido(c text) returns boolean
language sql immutable as $$
  select c ~ '^(\d{8}|\d{13})$'
     and public.ean_digito(left(c, length(c) - 1)) = right(c, 1)::int
$$;

-- ---------------------------------------------------------------------
-- Perfiles y roles (RN-15)
-- ---------------------------------------------------------------------

create table public.perfiles (
  id                     uuid primary key references auth.users (id) on delete restrict,
  nombre                 text not null check (length(btrim(nombre)) > 0),
  correo                 text not null unique,
  rol                    text not null check (rol in ('administrador', 'supervisor', 'reponedor')),
  activo                 boolean not null default true,
  intentos_fallidos      int not null default 0,
  bloqueado_hasta        timestamptz,
  debe_cambiar_password  boolean not null default true,
  ultimo_acceso          timestamptz,
  creado_en              timestamptz not null default now()
);

-- Rol del usuario que hace la consulta (null si no tiene perfil activo).
create or replace function public.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

-- ---------------------------------------------------------------------
-- Parámetros (RF-41: mientras no exista la pantalla se usan estos valores)
-- ---------------------------------------------------------------------

create table public.parametros (
  clave  text primary key,
  valor  jsonb not null,
  descripcion text not null
);

insert into public.parametros (clave, valor, descripcion) values
  ('dias_aviso_vencimiento', '7',  'Días antes del vencimiento en que un lote pasa a «por vencer» (RN-10).'),
  ('porcentaje_critico',     '50', 'Porcentaje del stock mínimo bajo el cual la alerta es crítica (RN-07).'),
  ('dias_minimo_sugerido',   '14', 'Días de venta usados para sugerir el stock mínimo (RN-06).'),
  ('zonas_almacen', '["A-1","A-2","B-1","B-2","C-1","C-2"]', 'Zonas del almacén para ubicar cada lote (RF-15).');

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------

create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(btrim(nombre)) > 0),
  nombre_norm text generated always as (public.norm(nombre)) stored,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);
create unique index categorias_nombre_activa_uk on public.categorias (nombre_norm) where activa;

create table public.proveedores (
  id            uuid primary key default gen_random_uuid(),
  ruc           text not null unique check (ruc ~ '^\d{11}$'),
  razon_social  text not null check (length(btrim(razon_social)) > 0),
  dias_entrega  int not null default 2 check (dias_entrega > 0),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create sequence public.codigo_interno_seq start 1;

create table public.productos (
  id                    uuid primary key default gen_random_uuid(),
  codigo_barras         text not null,
  nombre                text not null check (length(btrim(nombre)) > 0),
  nombre_norm           text generated always as (public.norm(nombre)) stored,
  categoria_id          uuid not null references public.categorias (id),
  proveedor_id          uuid not null references public.proveedores (id),
  unidad                text not null check (unidad in ('unidad', 'botella', 'lata', 'paquete', 'bolsa', 'caja', 'kg', 'litro')),
  stock_minimo          int not null check (stock_minimo > 0),
  minimo_percha         int not null check (minimo_percha > 0),
  controla_vencimiento  boolean not null default true,
  codigo_interno        boolean not null default false,
  activo                boolean not null default true,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
-- RN-01: no hay dos productos activos con el mismo código.
create unique index productos_codigo_activo_uk on public.productos (codigo_barras) where activo;
create index productos_nombre_trgm on public.productos using gin (nombre_norm extensions.gin_trgm_ops);

-- Valida el código y la categoría antes de guardar, con mensajes que dicen cómo corregir (RNF-03).
create or replace function public.productos_validar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_otro text;
begin
  new.codigo_barras := btrim(new.codigo_barras);
  if not public.ean_valido(new.codigo_barras) then
    raise exception 'El código % no es un EAN-13 ni EAN-8 válido. Revisa que esté completo; si el producto no trae código, genera uno interno.', new.codigo_barras
      using errcode = '22023';
  end if;
  if new.codigo_barras ~ '^2[0-9]' and not new.codigo_interno and length(new.codigo_barras) = 13 then
    new.codigo_interno := true;
  end if;
  if new.activo then
    select nombre into v_otro from public.productos
     where codigo_barras = new.codigo_barras and activo and id <> new.id;
    if found then
      raise exception 'El código % ya pertenece a %.', new.codigo_barras, v_otro using errcode = '23505';
    end if;
  end if;
  if not exists (select 1 from public.categorias where id = new.categoria_id and activa) then
    raise exception 'Elige una categoría activa de la lista.' using errcode = '23503';
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create trigger productos_validar before insert or update on public.productos
for each row execute function public.productos_validar();

-- RN-03: código de uso interno (prefijo 20) para productos sin código del fabricante.
create or replace function public.generar_codigo_interno() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_codigo text;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador genera códigos internos.' using errcode = '42501';
  end if;
  loop
    v_base := '20' || lpad(nextval('public.codigo_interno_seq')::text, 10, '0');
    v_codigo := v_base || public.ean_digito(v_base)::text;
    exit when not exists (select 1 from public.productos where codigo_barras = v_codigo);
  end loop;
  return v_codigo;
end $$;

-- RF-09: categorías parecidas a un nombre nuevo («bebibles» → «Bebidas»).
create or replace function public.categorias_parecidas(p_nombre text)
returns table (id uuid, nombre text)
language sql stable set search_path = public, extensions as $$
  select c.id, c.nombre
    from public.categorias c
   where c.activa
     and (   public.norm_singular(c.nombre) = public.norm_singular(p_nombre)
          or similarity(public.norm_singular(c.nombre), public.norm_singular(p_nombre)) >= 0.4
          or (length(public.norm(p_nombre)) >= 4 and left(c.nombre_norm, 4) = left(public.norm(p_nombre), 4)))
   order by similarity(c.nombre_norm, public.norm(p_nombre)) desc
   limit 3
$$;

-- ---------------------------------------------------------------------
-- Inventario: lotes, existencias por ubicación y movimientos (RN-05, RN-12)
-- ---------------------------------------------------------------------

create table public.lotes (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.productos (id),
  codigo_lote        text not null check (length(btrim(codigo_lote)) > 0),
  fecha_vencimiento  date,
  zona_almacen       text not null,
  creado_en          timestamptz not null default now(),
  unique (producto_id, codigo_lote)
);

create table public.existencias (
  lote_id    uuid not null references public.lotes (id),
  ubicacion  text not null check (ubicacion in ('almacen', 'percha')),
  cantidad   int not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (lote_id, ubicacion)
);

create table public.movimientos (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('ingreso', 'reposicion', 'salida', 'ajuste')),
  motivo             text,
  guia_remision      text,
  proveedor_id       uuid references public.proveedores (id),
  detalle            text,
  usuario_id         uuid not null references public.perfiles (id),
  creado_en          timestamptz not null default now(),
  anulado            boolean not null default false,
  motivo_anulacion   text,
  anulado_por        uuid references public.perfiles (id),
  anulado_en         timestamptz
);
create index movimientos_creado_idx on public.movimientos (creado_en desc);

create table public.movimiento_lineas (
  id                 uuid primary key default gen_random_uuid(),
  movimiento_id      uuid not null references public.movimientos (id),
  producto_id        uuid not null references public.productos (id),
  lote_id            uuid not null references public.lotes (id),
  ubicacion_origen   text check (ubicacion_origen in ('almacen', 'percha')),
  ubicacion_destino  text check (ubicacion_destino in ('almacen', 'percha')),
  cantidad           int not null check (cantidad > 0)
);
create index movimiento_lineas_mov_idx on public.movimiento_lineas (movimiento_id);
create index movimiento_lineas_prod_idx on public.movimiento_lineas (producto_id);

-- ---------------------------------------------------------------------
-- RF-14, RF-15: registrar un ingreso por guía de remisión con varias líneas.
-- Toda la operación es una transacción: si una línea falla, no se guarda ninguna.
-- p_lineas: [{producto_id, cantidad, lote, vencimiento (aaaa-mm-dd o null), zona}]
-- ---------------------------------------------------------------------
create or replace function public.registrar_ingreso(p_guia text, p_proveedor_id uuid, p_lineas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rol      text := public.rol_actual();
  v_mov      uuid;
  v_linea    jsonb;
  v_i        int := 0;
  v_prod     public.productos%rowtype;
  v_cant     int;
  v_lote     text;
  v_venc     date;
  v_zona     text;
  v_lote_id  uuid;
  v_lote_venc date;
begin
  if v_rol is null or v_rol not in ('administrador', 'reponedor') then
    raise exception 'Tu rol no puede registrar ingresos.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_guia), '') = '' then
    raise exception 'Escribe el número de la guía de remisión.';
  end if;
  if p_proveedor_id is null or not exists (select 1 from public.proveedores where id = p_proveedor_id and activo) then
    raise exception 'Elige un proveedor de la lista.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto a la guía.';
  end if;

  insert into public.movimientos (tipo, guia_remision, proveedor_id, usuario_id)
  values ('ingreso', btrim(p_guia), p_proveedor_id, auth.uid())
  returning id into v_mov;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;

    select * into v_prod from public.productos
     where id = nullif(v_linea ->> 'producto_id', '')::uuid and activo;
    if not found then
      raise exception 'Línea %: elige un producto activo del catálogo.', v_i;
    end if;

    if coalesce(v_linea ->> 'cantidad', '') !~ '^\d{1,6}$' or (v_linea ->> 'cantidad')::int <= 0 then
      raise exception 'Línea % (%): la cantidad debe ser un número entero mayor que 0.', v_i, v_prod.nombre;
    end if;
    v_cant := (v_linea ->> 'cantidad')::int;

    v_lote := upper(btrim(coalesce(v_linea ->> 'lote', '')));
    if v_lote = '' then
      raise exception 'Línea % (%): escribe el lote que figura en el empaque.', v_i, v_prod.nombre;
    end if;

    v_venc := nullif(v_linea ->> 'vencimiento', '')::date;
    if v_prod.controla_vencimiento and v_venc is null then
      raise exception 'Línea % (%): este producto controla vencimiento; escribe la fecha del empaque.', v_i, v_prod.nombre;
    end if;
    if v_venc is not null and v_venc < public.hoy() then
      raise exception 'Línea % (%): la fecha de vencimiento % ya pasó; no se puede ingresar un lote vencido.', v_i, v_prod.nombre, to_char(v_venc, 'DD/MM/YYYY');
    end if;

    v_zona := btrim(coalesce(v_linea ->> 'zona', ''));
    if v_zona = '' or not exists (
      select 1 from public.parametros p, jsonb_array_elements_text(p.valor) z
       where p.clave = 'zonas_almacen' and z = v_zona) then
      raise exception 'Línea % (%): elige la zona del almacén de la lista.', v_i, v_prod.nombre;
    end if;

    select id, fecha_vencimiento into v_lote_id, v_lote_venc
      from public.lotes where producto_id = v_prod.id and codigo_lote = v_lote;
    if found then
      if v_lote_venc is distinct from v_venc then
        raise exception 'Línea % (%): el lote % ya está registrado con vencimiento %. Revisa el empaque.',
          v_i, v_prod.nombre, v_lote, coalesce(to_char(v_lote_venc, 'DD/MM/YYYY'), 'sin fecha');
      end if;
    else
      insert into public.lotes (producto_id, codigo_lote, fecha_vencimiento, zona_almacen)
      values (v_prod.id, v_lote, v_venc, v_zona)
      returning id into v_lote_id;
    end if;

    -- RN-05: la mercadería que llega entra al almacén.
    insert into public.existencias (lote_id, ubicacion, cantidad)
    values (v_lote_id, 'almacen', v_cant)
    on conflict (lote_id, ubicacion)
    do update set cantidad = public.existencias.cantidad + excluded.cantidad, actualizado_en = now();

    insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_destino, cantidad)
    values (v_mov, v_prod.id, v_lote_id, 'almacen', v_cant);
  end loop;

  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-34: vista del stock por producto (RN-05, RN-07, RN-10)
-- security_invoker: la vista respeta los permisos de quien consulta.
-- ---------------------------------------------------------------------
create or replace view public.v_stock with (security_invoker = true) as
with e as (
  select l.producto_id,
         sum(x.cantidad) filter (where x.ubicacion = 'almacen') as almacen,
         sum(x.cantidad) filter (where x.ubicacion = 'percha')  as percha,
         min(l.fecha_vencimiento) filter (where x.cantidad > 0) as proximo_vencimiento
    from public.lotes l
    join public.existencias x on x.lote_id = l.id
   -- RN-10: un lote vencido (desde el día siguiente a su fecha) no suma al stock.
   where l.fecha_vencimiento is null or l.fecha_vencimiento >= public.hoy()
   group by l.producto_id
), crit as (
  select coalesce((select valor::text::numeric from public.parametros where clave = 'porcentaje_critico'), 50) as pct
)
select p.id                as producto_id,
       p.codigo_barras,
       p.nombre,
       p.nombre_norm,
       p.categoria_id,
       c.nombre            as categoria,
       p.unidad,
       p.stock_minimo,
       p.minimo_percha,
       p.controla_vencimiento,
       p.activo,
       coalesce(e.almacen, 0)::int                        as almacen,
       coalesce(e.percha, 0)::int                         as percha,
       (coalesce(e.almacen, 0) + coalesce(e.percha, 0))::int as total,
       e.proximo_vencimiento,
       case
         when coalesce(e.almacen, 0) + coalesce(e.percha, 0) = 0 then 'sin_stock'
         when coalesce(e.almacen, 0) + coalesce(e.percha, 0) <= p.stock_minimo * crit.pct / 100 then 'critico'
         when coalesce(e.almacen, 0) + coalesce(e.percha, 0) <= p.stock_minimo then 'bajo_minimo'
         else 'ok'
       end as estado_stock,
       case
         when coalesce(e.percha, 0) = 0 then 'vacia'
         when coalesce(e.percha, 0) <= p.minimo_percha then 'por_reponer'
         else 'ok'
       end as estado_percha
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
  cross join crit
  left join e on e.producto_id = p.id;

-- RF-12: buscador global por nombre (palabras parciales, sin tildes), código de barras o lote.
create or replace function public.buscar_productos(q text, limite int default 8)
returns setof public.v_stock
language sql stable set search_path = public, extensions as $$
  with t as (select public.norm(q) as qn, btrim(q) as qc)
  select s.*
    from public.v_stock s, t
   where s.activo
     and length(t.qn) > 0
     and (   s.codigo_barras = t.qc
          or not exists (
               select 1 from unnest(string_to_array(t.qn, ' ')) w
                where s.nombre_norm not like '%' || w || '%')
          or exists (
               select 1 from public.lotes l
                where l.producto_id = s.producto_id and public.norm(l.codigo_lote) = t.qn))
   order by (s.codigo_barras = t.qc) desc,
            similarity(s.nombre_norm, t.qn) desc,
            s.nombre
   limit greatest(1, least(limite, 50))
$$;

-- ---------------------------------------------------------------------
-- Permisos por rol con Row Level Security (RNF-13, RNF-15)
-- No hay políticas DELETE: el historial no se borra.
-- Lotes, existencias y movimientos solo cambian por las funciones de registro.
-- ---------------------------------------------------------------------
alter table public.perfiles          enable row level security;
alter table public.parametros        enable row level security;
alter table public.categorias        enable row level security;
alter table public.proveedores       enable row level security;
alter table public.productos         enable row level security;
alter table public.lotes             enable row level security;
alter table public.existencias       enable row level security;
alter table public.movimientos       enable row level security;
alter table public.movimiento_lineas enable row level security;

-- Lectura para cualquier usuario con perfil activo.
create policy perfiles_leer          on public.perfiles          for select to authenticated using (public.rol_actual() is not null or id = auth.uid());
create policy parametros_leer        on public.parametros        for select to authenticated using (public.rol_actual() is not null);
create policy categorias_leer        on public.categorias        for select to authenticated using (public.rol_actual() is not null);
create policy proveedores_leer       on public.proveedores       for select to authenticated using (public.rol_actual() is not null);
create policy productos_leer         on public.productos         for select to authenticated using (public.rol_actual() is not null);
create policy lotes_leer             on public.lotes             for select to authenticated using (public.rol_actual() is not null);
create policy existencias_leer       on public.existencias       for select to authenticated using (public.rol_actual() is not null);

-- Historial: el reponedor ve solo sus registros (RF-36).
create policy movimientos_leer on public.movimientos for select to authenticated
  using (public.rol_actual() in ('administrador', 'supervisor') or usuario_id = auth.uid());
create policy movimiento_lineas_leer on public.movimiento_lineas for select to authenticated
  using (exists (select 1 from public.movimientos m where m.id = movimiento_id));

-- Catálogo: solo el administrador crea y edita (matriz de acceso, Tabla 2).
create policy categorias_crear   on public.categorias  for insert to authenticated with check (public.rol_actual() = 'administrador');
create policy categorias_editar  on public.categorias  for update to authenticated using (public.rol_actual() = 'administrador') with check (public.rol_actual() = 'administrador');
create policy proveedores_crear  on public.proveedores for insert to authenticated with check (public.rol_actual() = 'administrador');
create policy proveedores_editar on public.proveedores for update to authenticated using (public.rol_actual() = 'administrador') with check (public.rol_actual() = 'administrador');
create policy productos_crear    on public.productos   for insert to authenticated with check (public.rol_actual() = 'administrador');
create policy productos_editar   on public.productos   for update to authenticated using (public.rol_actual() = 'administrador') with check (public.rol_actual() = 'administrador');

-- Nadie anónimo ejecuta funciones; los usuarios con sesión sí (cada función revisa el rol).
revoke execute on function public.registrar_ingreso(text, uuid, jsonb) from public, anon;
revoke execute on function public.generar_codigo_interno()            from public, anon;
grant  execute on function public.registrar_ingreso(text, uuid, jsonb) to authenticated;
grant  execute on function public.generar_codigo_interno()            to authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real (RF-34): avisar a las pantallas cuando cambian las existencias o el catálogo.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.existencias, public.productos;
