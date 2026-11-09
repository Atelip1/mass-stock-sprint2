-- =====================================================================
-- Mass Stock · Sprint 3 · Operación diaria y alertas
-- RF-16 reposición, RF-17 salida, RF-18 conteo, RF-23 a RF-25 alertas,
-- RF-27 seguimiento, RF-30 vencimientos, RF-36 historial.
-- Ejecutar DESPUÉS de 20261019000001_esquema_inicial.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas nuevas
-- ---------------------------------------------------------------------

-- RF-23, RN-09: una alerta activa por producto y tipo; al cerrarse queda como historial.
create table public.alertas (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos (id),
  tipo          text not null check (tipo in ('abastecimiento', 'percha')),
  nivel         text not null check (nivel in ('preventiva', 'critica', 'sin_stock', 'por_reponer', 'vacia')),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'en_reposicion', 'repuesto', 'cerrado')),
  detectada_en  timestamptz not null default now(),
  tomada_por    uuid references public.perfiles (id),
  tomada_en     timestamptz,
  repuesta_por  uuid references public.perfiles (id),
  repuesta_en   timestamptz,
  cerrada_en    timestamptz,
  actualizado_en timestamptz not null default now()
);
create unique index alertas_activa_uk on public.alertas (producto_id, tipo) where estado <> 'cerrado';
create index alertas_estado_idx on public.alertas (estado, detectada_en desc);

-- RN-18 (2): periodos en que la percha de un producto estuvo vacía.
create table public.quiebres (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id),
  inicio      timestamptz not null default now(),
  fin         timestamptz
);
create unique index quiebres_abierto_uk on public.quiebres (producto_id) where fin is null;

-- RF-18, RF-19: conteos físicos y su ajuste pendiente de aprobación.
create table public.ajustes (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.productos (id),
  ubicacion      text not null check (ubicacion in ('almacen', 'percha')),
  sistema        int not null,
  contado        int not null check (contado >= 0),
  diferencia     int generated always as (contado - sistema) stored,
  estado         text not null check (estado in ('pendiente', 'aprobado', 'rechazado', 'sin_diferencia')),
  nota           text,
  registrado_por uuid not null references public.perfiles (id),
  creado_en      timestamptz not null default now(),
  resuelto_por   uuid references public.perfiles (id),
  resuelto_en    timestamptz,
  motivo         text,
  movimiento_id  uuid references public.movimientos (id)
);
create unique index ajustes_pendiente_uk on public.ajustes (producto_id, ubicacion) where estado = 'pendiente';

-- RN-08: registro de lo que se solicitó al proveedor desde una alerta (el sistema no gestiona la compra).
create table public.solicitudes_proveedor (
  id               uuid primary key default gen_random_uuid(),
  alerta_id        uuid not null references public.alertas (id),
  producto_id      uuid not null references public.productos (id),
  proveedor_id     uuid not null references public.proveedores (id),
  cantidad_sugerida int not null,
  usuario_id       uuid not null references public.perfiles (id),
  creado_en        timestamptz not null default now()
);

-- RF-31: acción tomada sobre un lote por vencer.
create table public.acciones_lote (
  id            uuid primary key default gen_random_uuid(),
  lote_id       uuid not null references public.lotes (id),
  accion        text not null check (accion in ('retiro', 'oferta', 'devolucion')),
  nota          text,
  movimiento_id uuid references public.movimientos (id),
  usuario_id    uuid not null references public.perfiles (id),
  creado_en     timestamptz not null default now()
);

-- Para no importar dos veces las ventas del mismo día (RF-21, Sprint 4).
alter table public.movimientos add column fecha_venta date;
create index movimientos_fecha_venta_idx on public.movimientos (fecha_venta) where fecha_venta is not null and not anulado;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- ¿El lote está vigente hoy? (RN-10: vencido desde el día siguiente a su fecha)
create or replace function public.lote_vigente(f date) returns boolean
language sql stable as $$ select f is null or f >= public.hoy() $$;

create or replace function public.nombre_ubicacion(u text) returns text
language sql immutable as $$ select case u when 'almacen' then 'almacén' when 'percha' then 'percha' else u end $$;

-- Suma (o resta) unidades de un lote en una ubicación. No permite quedar en negativo.
create or replace function public._mover(p_lote uuid, p_ubic text, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_delta >= 0 then
    insert into public.existencias (lote_id, ubicacion, cantidad) values (p_lote, p_ubic, p_delta)
    on conflict (lote_id, ubicacion)
    do update set cantidad = public.existencias.cantidad + excluded.cantidad, actualizado_en = now();
  else
    update public.existencias set cantidad = cantidad + p_delta, actualizado_en = now()
     where lote_id = p_lote and ubicacion = p_ubic and cantidad + p_delta >= 0;
    if not found then
      raise exception 'No hay unidades suficientes en %.', public.nombre_ubicacion(p_ubic);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RF-23: generación de alertas (RN-07) y registro de quiebres
-- ---------------------------------------------------------------------
create or replace function public._alerta(p_prod uuid, p_tipo text, p_cond boolean, p_nivel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cond then
    update public.alertas set nivel = p_nivel, actualizado_en = now()
     where producto_id = p_prod and tipo = p_tipo and estado <> 'cerrado' and nivel <> p_nivel;
    insert into public.alertas (producto_id, tipo, nivel) values (p_prod, p_tipo, p_nivel)
    on conflict do nothing;
  else
    -- RN-09: se cierra sola cuando se recupera lo que originó la alerta.
    update public.alertas set estado = 'cerrado', cerrada_en = now(), actualizado_en = now()
     where producto_id = p_prod and tipo = p_tipo and estado <> 'cerrado';
  end if;
end $$;

create or replace function public.evaluar_alertas(p_prod uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.v_stock%rowtype;
begin
  select * into s from public.v_stock where producto_id = p_prod;
  if not found then return; end if;

  if s.activo and s.percha = 0 then
    insert into public.quiebres (producto_id) values (p_prod) on conflict do nothing;
  else
    update public.quiebres set fin = now() where producto_id = p_prod and fin is null;
  end if;

  -- Un producto sin mínimos válidos o desactivado no genera alerta.
  perform public._alerta(p_prod, 'abastecimiento',
    s.activo and s.stock_minimo > 0 and s.total <= s.stock_minimo,
    case s.estado_stock when 'sin_stock' then 'sin_stock' when 'critico' then 'critica' else 'preventiva' end);
  perform public._alerta(p_prod, 'percha',
    s.activo and s.minimo_percha > 0 and s.percha <= s.minimo_percha,
    case when s.percha = 0 then 'vacia' else 'por_reponer' end);
end $$;

-- Cada cambio de existencias recalcula las alertas del producto.
-- Es diferido: se evalúa al terminar la operación, no a mitad de un traslado
-- (si no, una reposición crearía una alerta falsa entre «sale del almacén» y «llega a la percha»).
create or replace function public.trg_existencias_alertas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.evaluar_alertas((select producto_id from public.lotes where id = new.lote_id));
  return null;
end $$;
create constraint trigger existencias_alertas after insert or update on public.existencias
deferrable initially deferred
for each row execute function public.trg_existencias_alertas();

-- Cambiar los mínimos, activar o desactivar un producto también recalcula.
create or replace function public.trg_productos_alertas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.evaluar_alertas(new.id);
  return null;
end $$;
create trigger productos_alertas after insert or update of stock_minimo, minimo_percha, activo on public.productos
for each row execute function public.trg_productos_alertas();

-- Un lote vence sin que nada cambie en la base: las pantallas llaman a esta función al abrirse.
create or replace function public.refrescar_alertas() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if public.rol_actual() is null then return; end if;
  for r in select id from public.productos loop
    perform public.evaluar_alertas(r.id);
  end loop;
end $$;

-- Pasa a «Repuesto» la alerta activa (RN-09). Se llama antes de mover el stock.
create or replace function public._marcar_repuesto(p_prod uuid, p_tipo text)
returns void language sql security definer set search_path = public as $$
  update public.alertas
     set estado = 'repuesto', repuesta_por = auth.uid(), repuesta_en = now(),
         tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()),
         actualizado_en = now()
   where producto_id = p_prod and tipo = p_tipo and estado in ('pendiente', 'en_reposicion')
$$;

-- ---------------------------------------------------------------------
-- Ventas, clasificación ABC (RN-20) y alertas para mostrar (RF-24, RF-25, RF-26)
-- ---------------------------------------------------------------------

-- Unidades vendidas por producto en un rango de fechas (incluye ventas importadas de caja).
create or replace function public.ventas_periodo(p_desde date, p_hasta date)
returns table (producto_id uuid, unidades bigint)
language sql stable security definer set search_path = public as $$
  select ml.producto_id, sum(ml.cantidad)
    from public.movimiento_lineas ml
    join public.movimientos m on m.id = ml.movimiento_id
   where m.tipo = 'salida' and m.motivo = 'venta' and not m.anulado
     and m.creado_en >= (p_desde::timestamp at time zone 'America/Lima')
     and m.creado_en <  ((p_hasta + 1)::timestamp at time zone 'America/Lima')
   group by ml.producto_id
$$;

-- RN-20: A = productos que suman el 80 % de las unidades vendidas, B = el siguiente 15 %, C = el resto.
create or replace function public.clasificacion_abc(p_desde date, p_hasta date)
returns table (producto_id uuid, unidades bigint, clase text)
language sql stable security definer set search_path = public as $$
  with v as (
    select p.id as producto_id, coalesce(x.unidades, 0) as unidades
      from public.productos p
      left join public.ventas_periodo(p_desde, p_hasta) x on x.producto_id = p.id
     where p.activo
  ), c as (
    select v.*,
           sum(unidades) over (order by unidades desc, producto_id rows unbounded preceding) - unidades as antes,
           sum(unidades) over () as total
      from v
  )
  select producto_id, unidades,
         case when unidades = 0 then 'sin_ventas'
              when antes < total * 0.80 then 'A'
              when antes < total * 0.95 then 'B'
              else 'C' end
    from c
$$;

-- Alertas activas con todo lo que muestra la pantalla de Reposición.
create or replace function public.alertas_activas()
returns table (
  id uuid, producto_id uuid, nombre text, codigo_barras text, tipo text, nivel text, estado text,
  percha int, almacen int, total int, stock_minimo int, minimo_percha int, unidad text,
  cobertura_dias numeric, horas numeric, sugerido int, clase text, almacen_vacio boolean,
  responsable text, proveedor_id uuid, detectada_en timestamptz
)
language sql stable security definer set search_path = public as $$
  with vd as (
    select producto_id, unidades::numeric / 14 as diaria
      from public.ventas_periodo(public.hoy() - 13, public.hoy())
  ), abc as (
    select * from public.clasificacion_abc(public.hoy() - 29, public.hoy())
  )
  select a.id, s.producto_id, s.nombre, s.codigo_barras, a.tipo, a.nivel, a.estado,
         s.percha, s.almacen, s.total, s.stock_minimo, s.minimo_percha, s.unidad,
         case when coalesce(vd.diaria, 0) = 0 then null
              else round((case when a.tipo = 'percha' then s.percha else s.total end) / vd.diaria, 1) end,
         round(extract(epoch from now() - a.detectada_en) / 3600, 1),
         -- RF-26: lleva el stock al doble de su mínimo; en percha, sin superar lo que hay en almacén.
         case when a.tipo = 'abastecimiento' then greatest(0, 2 * s.stock_minimo - s.total)
              else least(s.almacen, greatest(0, 2 * s.minimo_percha - s.percha)) end,
         coalesce(abc.clase, 'sin_ventas'),
         a.tipo = 'percha' and s.almacen = 0,
         pf.nombre,
         p.proveedor_id,
         a.detectada_en
    from public.alertas a
    join public.v_stock s on s.producto_id = a.producto_id
    join public.productos p on p.id = a.producto_id
    left join vd on vd.producto_id = a.producto_id
    left join abc on abc.producto_id = a.producto_id
    left join public.perfiles pf on pf.id = coalesce(a.repuesta_por, a.tomada_por)
   where a.estado <> 'cerrado' and public.rol_actual() is not null
   order by
     -- Primero lo más grave; dentro de cada nivel, los productos A (RN-20).
     case when a.nivel in ('sin_stock', 'vacia') then 0 when a.nivel = 'critica' then 1 else 2 end,
     (a.tipo = 'percha' and s.almacen = 0),
     case coalesce(abc.clase, 'sin_ventas') when 'A' then 0 when 'B' then 1 when 'C' then 2 else 3 end,
     a.detectada_en
$$;

-- RF-27: seguimiento. Activas y cerradas en los últimos días.
create or replace function public.seguimiento_reposiciones(p_dias int default 7)
returns table (
  id uuid, producto_id uuid, nombre text, tipo text, estado text, responsable text,
  detectada_en timestamptz, repuesta_en timestamptz, cerrada_en timestamptz, horas numeric
)
language sql stable security definer set search_path = public as $$
  select a.id, a.producto_id, p.nombre, a.tipo, a.estado, pf.nombre,
         a.detectada_en, a.repuesta_en, a.cerrada_en,
         round(extract(epoch from coalesce(a.repuesta_en, a.cerrada_en, now()) - a.detectada_en) / 3600, 1)
    from public.alertas a
    join public.productos p on p.id = a.producto_id
    left join public.perfiles pf on pf.id = coalesce(a.repuesta_por, a.tomada_por)
   where public.rol_actual() is not null
     and (a.estado <> 'cerrado' or a.cerrada_en >= now() - make_interval(days => p_dias))
   order by a.estado = 'cerrado', a.detectada_en desc
$$;

-- RF-25: el reponedor toma una alerta de percha (pasa a «En reposición»).
create or replace function public.tomar_alerta(p_alerta uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_prod uuid;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no puede reponer la percha.' using errcode = '42501';
  end if;
  update public.alertas
     set estado = case when estado = 'pendiente' then 'en_reposicion' else estado end,
         tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()), actualizado_en = now()
   where id = p_alerta and tipo = 'percha' and estado in ('pendiente', 'en_reposicion')
   returning producto_id into v_prod;
  if v_prod is null then
    raise exception 'Esta alerta ya fue atendida. Actualiza la lista.';
  end if;
  return v_prod;
end $$;

-- RF-25, RN-08: el administrador solicita al proveedor (una o varias alertas de abastecimiento).
create or replace function public.solicitar_proveedor(p_alertas uuid[])
returns table (proveedor text, ruc text, codigo_barras text, producto text, unidad text, cantidad int)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador solicita mercadería al proveedor.' using errcode = '42501';
  end if;
  for r in
    select a.* from public.alertas_activas() a
     where a.id = any (p_alertas) and a.tipo = 'abastecimiento'
  loop
    update public.alertas
       set estado = case when estado = 'pendiente' then 'en_reposicion' else estado end,
           tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()), actualizado_en = now()
     where id = r.id;
    insert into public.solicitudes_proveedor (alerta_id, producto_id, proveedor_id, cantidad_sugerida, usuario_id)
    values (r.id, r.producto_id, r.proveedor_id, r.sugerido, auth.uid());
    return query
      select v.razon_social, v.ruc, r.codigo_barras, r.nombre, r.unidad, r.sugerido
        from public.proveedores v where v.id = r.proveedor_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RF-14 (actualizado): el ingreso pasa la alerta de abastecimiento a «Repuesto».
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
    select * into v_prod from public.productos where id = nullif(v_linea ->> 'producto_id', '')::uuid and activo;
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
      values (v_prod.id, v_lote, v_venc, v_zona) returning id into v_lote_id;
    end if;

    -- RN-09: el ingreso deja «Repuesta» la alerta de abastecimiento; se cierra sola si el stock supera el mínimo.
    perform public._marcar_repuesto(v_prod.id, 'abastecimiento');
    perform public._mover(v_lote_id, 'almacen', v_cant);

    insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_destino, cantidad)
    values (v_mov, v_prod.id, v_lote_id, 'almacen', v_cant);
  end loop;

  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-16: reposición de percha (traslado del almacén a la percha, RN-12)
-- ---------------------------------------------------------------------
create or replace function public.registrar_reposicion(p_producto uuid, p_lote uuid, p_cantidad int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prod public.productos%rowtype;
  v_lote public.lotes%rowtype;
  v_hay  int;
  v_mov  uuid;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no puede registrar reposiciones.' using errcode = '42501';
  end if;
  select * into v_prod from public.productos where id = p_producto and activo;
  if not found then raise exception 'Elige un producto activo.'; end if;
  select * into v_lote from public.lotes where id = p_lote and producto_id = p_producto;
  if not found then raise exception 'Elige un lote de %.', v_prod.nombre; end if;
  if not public.lote_vigente(v_lote.fecha_vencimiento) then
    raise exception 'El lote % venció el %; no se puede poner en percha. Regístralo como salida por vencimiento.',
      v_lote.codigo_lote, to_char(v_lote.fecha_vencimiento, 'DD/MM/YYYY');
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un número entero mayor que 0.';
  end if;
  select coalesce(cantidad, 0) into v_hay from public.existencias where lote_id = p_lote and ubicacion = 'almacen';
  if coalesce(v_hay, 0) < p_cantidad then
    raise exception 'El lote % tiene % en almacén; no puedes trasladar %. Corrige la cantidad.', v_lote.codigo_lote, coalesce(v_hay, 0), p_cantidad;
  end if;

  insert into public.movimientos (tipo, detalle, usuario_id)
  values ('reposicion', 'Almacén ' || v_lote.zona_almacen || ' → percha', auth.uid())
  returning id into v_mov;

  perform public._marcar_repuesto(p_producto, 'percha');
  perform public._mover(p_lote, 'almacen', -p_cantidad);
  perform public._mover(p_lote, 'percha', p_cantidad);

  insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, ubicacion_destino, cantidad)
  values (v_mov, p_producto, p_lote, 'almacen', 'percha', p_cantidad);
  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-17: salidas por venta, merma o vencimiento (varias líneas)
-- ---------------------------------------------------------------------

-- Descuenta una línea de salida. Venta: de la percha por FEFO (RN-11). Merma y vencimiento: lote y ubicación exactos.
create or replace function public._salida_linea(
  p_mov uuid, p_motivo text, p_prod uuid, p_cant int, p_lote uuid, p_ubic text, p_etq text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prod public.productos%rowtype;
  v_hay  int;
  v_rest int := p_cant;
  v_tom  int;
  r      record;
  v_lote public.lotes%rowtype;
begin
  select * into v_prod from public.productos where id = p_prod and activo;
  if not found then raise exception '%: elige un producto activo del catálogo.', p_etq; end if;
  if p_cant is null or p_cant <= 0 then
    raise exception '% (%): la cantidad debe ser un número entero mayor que 0.', p_etq, v_prod.nombre;
  end if;

  if p_motivo = 'venta' then
    select coalesce(sum(x.cantidad), 0) into v_hay
      from public.existencias x join public.lotes l on l.id = x.lote_id
     where l.producto_id = p_prod and x.ubicacion = 'percha' and public.lote_vigente(l.fecha_vencimiento);
    if v_hay < p_cant then
      raise exception '% (%): la percha tiene %; no se pueden vender %. Registra primero la reposición o corrige la cantidad.',
        p_etq, v_prod.nombre, v_hay, p_cant;
    end if;
    for r in
      select x.lote_id, x.cantidad
        from public.existencias x join public.lotes l on l.id = x.lote_id
       where l.producto_id = p_prod and x.ubicacion = 'percha' and x.cantidad > 0 and public.lote_vigente(l.fecha_vencimiento)
       order by l.fecha_vencimiento nulls last, l.creado_en
    loop
      exit when v_rest = 0;
      v_tom := least(v_rest, r.cantidad);
      perform public._mover(r.lote_id, 'percha', -v_tom);
      insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, cantidad)
      values (p_mov, p_prod, r.lote_id, 'percha', v_tom);
      v_rest := v_rest - v_tom;
    end loop;
  else
    if p_lote is null then
      raise exception '% (%): elige el lote; en merma y vencimiento el lote es obligatorio.', p_etq, v_prod.nombre;
    end if;
    if p_ubic is null or p_ubic not in ('almacen', 'percha') then
      raise exception '% (%): elige si sale del almacén o de la percha.', p_etq, v_prod.nombre;
    end if;
    select * into v_lote from public.lotes where id = p_lote and producto_id = p_prod;
    if not found then raise exception '% (%): el lote no pertenece a este producto.', p_etq, v_prod.nombre; end if;
    select coalesce(cantidad, 0) into v_hay from public.existencias where lote_id = p_lote and ubicacion = p_ubic;
    if coalesce(v_hay, 0) < p_cant then
      raise exception '% (%): el lote % tiene % en %; no pueden salir %.',
        p_etq, v_prod.nombre, v_lote.codigo_lote, coalesce(v_hay, 0), public.nombre_ubicacion(p_ubic), p_cant;
    end if;
    perform public._mover(p_lote, p_ubic, -p_cant);
    insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, cantidad)
    values (p_mov, p_prod, p_lote, p_ubic, p_cant);
  end if;
end $$;

-- p_lineas: [{producto_id, cantidad, lote_id (merma/vencimiento), ubicacion (merma/vencimiento)}]
create or replace function public.registrar_salida(p_motivo text, p_detalle text, p_lineas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_mov uuid;
  v_l   jsonb;
  v_i   int := 0;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no puede registrar salidas.' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('venta', 'merma', 'vencimiento') then
    raise exception 'Elige el motivo de la salida: venta, merma o vencimiento.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto a la salida.';
  end if;

  insert into public.movimientos (tipo, motivo, detalle, usuario_id)
  values ('salida', p_motivo, nullif(btrim(coalesce(p_detalle, '')), ''), auth.uid())
  returning id into v_mov;

  for v_l in select value from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;
    if coalesce(v_l ->> 'cantidad', '') !~ '^\d{1,6}$' then
      raise exception 'Línea %: la cantidad debe ser un número entero mayor que 0.', v_i;
    end if;
    perform public._salida_linea(v_mov, p_motivo,
      nullif(v_l ->> 'producto_id', '')::uuid, (v_l ->> 'cantidad')::int,
      nullif(v_l ->> 'lote_id', '')::uuid, nullif(v_l ->> 'ubicacion', ''), 'Línea ' || v_i);
  end loop;
  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-18: conteo físico. Queda pendiente de aprobación (RN-13).
-- ---------------------------------------------------------------------
create or replace function public.registrar_conteo(p_producto uuid, p_ubicacion text, p_contado int, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prod public.productos%rowtype;
  v_sis  int;
  v_id   uuid;
  v_otro text;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no registra conteos; tu rol aprueba o rechaza los ajustes.' using errcode = '42501';
  end if;
  select * into v_prod from public.productos where id = p_producto and activo;
  if not found then raise exception 'Elige un producto activo.'; end if;
  if p_ubicacion is null or p_ubicacion not in ('almacen', 'percha') then
    raise exception 'Elige dónde contaste: almacén o percha.';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Escribe las unidades contadas (0 o más).';
  end if;
  select pf.nombre into v_otro from public.ajustes a join public.perfiles pf on pf.id = a.registrado_por
   where a.producto_id = p_producto and a.ubicacion = p_ubicacion and a.estado = 'pendiente';
  if found then
    raise exception 'Ya hay un conteo de % en % pendiente de aprobación (lo registró %). Espera a que se apruebe o rechace.',
      v_prod.nombre, public.nombre_ubicacion(p_ubicacion), v_otro;
  end if;

  select coalesce(sum(x.cantidad), 0) into v_sis
    from public.existencias x join public.lotes l on l.id = x.lote_id
   where l.producto_id = p_producto and x.ubicacion = p_ubicacion and public.lote_vigente(l.fecha_vencimiento);

  insert into public.ajustes (producto_id, ubicacion, sistema, contado, estado, nota, registrado_por)
  values (p_producto, p_ubicacion, v_sis, p_contado,
          case when p_contado = v_sis then 'sin_diferencia' else 'pendiente' end,
          nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RF-30: lotes vencidos y por vencer (30 días)
-- ---------------------------------------------------------------------
create or replace view public.v_vencimientos with (security_invoker = true) as
select l.id as lote_id, l.producto_id, p.nombre, p.codigo_barras, l.codigo_lote, l.fecha_vencimiento, l.zona_almacen,
       coalesce(sum(x.cantidad) filter (where x.ubicacion = 'percha'), 0)::int as percha,
       coalesce(sum(x.cantidad) filter (where x.ubicacion = 'almacen'), 0)::int as almacen,
       coalesce(sum(x.cantidad), 0)::int as cantidad,
       (l.fecha_vencimiento - public.hoy()) as dias,
       (select a.accion from public.acciones_lote a where a.lote_id = l.id order by a.creado_en desc limit 1) as ultima_accion
  from public.lotes l
  join public.productos p on p.id = l.producto_id
  left join public.existencias x on x.lote_id = l.id
 where l.fecha_vencimiento is not null and l.fecha_vencimiento <= public.hoy() + 30 and p.activo
 group by l.id, p.id
having coalesce(sum(x.cantidad), 0) > 0;

-- RF-31: retiro (genera la salida por vencimiento), oferta o devolución.
create or replace function public.registrar_accion_lote(p_lote uuid, p_accion text, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lote public.lotes%rowtype;
  v_mov  uuid;
  r      record;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador registra acciones sobre lotes.' using errcode = '42501';
  end if;
  if p_accion is null or p_accion not in ('retiro', 'oferta', 'devolucion') then
    raise exception 'Elige la acción: retiro, oferta o devolución.';
  end if;
  select * into v_lote from public.lotes where id = p_lote;
  if not found then raise exception 'El lote no existe.'; end if;

  if p_accion = 'retiro' then
    insert into public.movimientos (tipo, motivo, detalle, usuario_id)
    values ('salida', 'vencimiento', coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Retiro del lote por vencimiento'), auth.uid())
    returning id into v_mov;
    for r in select ubicacion, cantidad from public.existencias where lote_id = p_lote and cantidad > 0 loop
      perform public._mover(p_lote, r.ubicacion, -r.cantidad);
      insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, cantidad)
      values (v_mov, v_lote.producto_id, p_lote, r.ubicacion, r.cantidad);
    end loop;
    if not found then
      raise exception 'El lote % ya no tiene unidades.', v_lote.codigo_lote;
    end if;
  end if;

  insert into public.acciones_lote (lote_id, accion, nota, movimiento_id, usuario_id)
  values (p_lote, p_accion, nullif(btrim(coalesce(p_nota, '')), ''), v_mov, auth.uid());
  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-36: historial, una fila por línea. Respeta RLS: el reponedor ve solo lo suyo.
-- ---------------------------------------------------------------------
create or replace view public.v_historial with (security_invoker = true) as
select ml.id as linea_id, m.id as movimiento_id, m.creado_en, m.tipo, m.motivo, m.guia_remision, m.detalle,
       m.anulado, m.motivo_anulacion, m.anulado_en, m.usuario_id, u.nombre as usuario, ua.nombre as anulado_por,
       m.fecha_venta,
       ml.producto_id, p.nombre as producto, p.codigo_barras, l.codigo_lote, l.zona_almacen,
       ml.ubicacion_origen, ml.ubicacion_destino, ml.cantidad,
       case when m.tipo = 'reposicion' then ml.cantidad
            when ml.ubicacion_destino is not null then ml.cantidad
            else -ml.cantidad end as efecto
  from public.movimiento_lineas ml
  join public.movimientos m on m.id = ml.movimiento_id
  join public.productos p on p.id = ml.producto_id
  join public.lotes l on l.id = ml.lote_id
  left join public.perfiles u on u.id = m.usuario_id
  left join public.perfiles ua on ua.id = m.anulado_por;

-- ---------------------------------------------------------------------
-- Permisos (RLS) de las tablas nuevas. Solo lectura: los cambios van por las funciones.
-- ---------------------------------------------------------------------
alter table public.alertas               enable row level security;
alter table public.quiebres              enable row level security;
alter table public.ajustes               enable row level security;
alter table public.solicitudes_proveedor enable row level security;
alter table public.acciones_lote         enable row level security;

create policy alertas_leer   on public.alertas  for select to authenticated using (public.rol_actual() is not null);
create policy quiebres_leer  on public.quiebres for select to authenticated using (public.rol_actual() is not null);
create policy ajustes_leer   on public.ajustes  for select to authenticated
  using (public.rol_actual() in ('administrador', 'supervisor') or registrado_por = auth.uid());
create policy solicitudes_leer on public.solicitudes_proveedor for select to authenticated
  using (public.rol_actual() in ('administrador', 'supervisor'));
create policy acciones_lote_leer on public.acciones_lote for select to authenticated using (public.rol_actual() is not null);

-- Las funciones internas no se llaman desde la API.
revoke all on function public._mover(uuid, text, int)                         from public, anon, authenticated;
revoke all on function public._alerta(uuid, text, boolean, text)              from public, anon, authenticated;
revoke all on function public.evaluar_alertas(uuid)                           from public, anon, authenticated;
revoke all on function public._marcar_repuesto(uuid, text)                    from public, anon, authenticated;
revoke all on function public._salida_linea(uuid, text, uuid, int, uuid, text, text) from public, anon, authenticated;
revoke all on function public.trg_existencias_alertas()                       from public, anon, authenticated;
revoke all on function public.trg_productos_alertas()                         from public, anon, authenticated;

-- Las funciones de la API: solo con sesión (cada una revisa el rol).
do $$
declare f text;
begin
  foreach f in array array[
    'public.refrescar_alertas()',
    'public.ventas_periodo(date, date)',
    'public.clasificacion_abc(date, date)',
    'public.alertas_activas()',
    'public.seguimiento_reposiciones(int)',
    'public.tomar_alerta(uuid)',
    'public.solicitar_proveedor(uuid[])',
    'public.registrar_ingreso(text, uuid, jsonb)',
    'public.registrar_reposicion(uuid, uuid, int)',
    'public.registrar_salida(text, text, jsonb)',
    'public.registrar_conteo(uuid, text, int, text)',
    'public.registrar_accion_lote(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Tiempo real: las pantallas se actualizan cuando cambian alertas y ajustes.
alter publication supabase_realtime add table public.alertas, public.ajustes;

-- Genera las alertas del stock que ya existe.
do $$ declare r record; begin for r in select id from public.productos loop perform public.evaluar_alertas(r.id); end loop; end $$;

-- Avisa a la API que hay funciones y tablas nuevas.
notify pgrst, 'reload schema';
