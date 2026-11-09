-- =====================================================================
-- Mass Stock · Sprint 5 y Product Backlog
-- RF-07 aviso de nombre parecido, RF-11 proveedores, RF-28 solicitudes al proveedor,
-- RF-10 fusión de categorías, RF-29 campana de alertas, RF-41 parámetros,
-- RN-06 stock mínimo sugerido. RF-03 (cambio de contraseña) se resuelve en la API.
-- Ejecutar DESPUÉS de la migración del Sprint 4.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rendimiento: refrescar_alertas devuelve si algo cambió, para que las pantallas
-- solo recarguen cuando hace falta. Se llama una vez al entrar y cada 10 minutos.
-- ---------------------------------------------------------------------
drop function if exists public.refrescar_alertas();
create function public.refrescar_alertas() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r record;
  antes text;
  despues text;
begin
  if public.rol_actual() is null then return false; end if;
  select count(*) || '|' || coalesce(max(actualizado_en)::text, '') into antes from public.alertas;
  for r in select id from public.productos loop
    perform public.evaluar_alertas(r.id);
  end loop;
  select count(*) || '|' || coalesce(max(actualizado_en)::text, '') into despues from public.alertas;
  return antes is distinct from despues;
end $$;
revoke all on function public.refrescar_alertas() from public, anon;
grant execute on function public.refrescar_alertas() to authenticated;

-- ---------------------------------------------------------------------
-- RF-41: parámetros que el administrador puede cambiar (RN-06, RN-07, RN-10)
-- ---------------------------------------------------------------------
insert into public.parametros (clave, valor, descripcion) values
  ('dias_seguridad', '1', 'Días de venta que se suman como stock de seguridad al sugerir el stock mínimo (RN-06).')
on conflict (clave) do nothing;

create or replace function public.parametro_int(p_clave text, p_defecto int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::int from public.parametros where clave = p_clave), p_defecto)
$$;

create or replace function public.actualizar_parametro(p_clave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  n int;
  z text;
  vistas text[] := '{}';
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador cambia los parámetros.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.parametros where clave = p_clave) then
    raise exception 'El parámetro % no existe.', p_clave;
  end if;

  if p_clave = 'zonas_almacen' then
    if jsonb_typeof(p_valor) <> 'array' or jsonb_array_length(p_valor) = 0 then
      raise exception 'Escribe al menos una zona del almacén.';
    end if;
    for z in select btrim(value) from jsonb_array_elements_text(p_valor) loop
      if z = '' then raise exception 'Hay una zona vacía; escribe su nombre o quítala.'; end if;
      if upper(z) = any (vistas) then raise exception 'La zona % está repetida.', z; end if;
      vistas := vistas || upper(z);
    end loop;
  else
    if jsonb_typeof(p_valor) <> 'number' or (p_valor #>> '{}') !~ '^\d+$' then
      raise exception 'Escribe un número entero.';
    end if;
    n := (p_valor #>> '{}')::int;
    if p_clave = 'dias_aviso_vencimiento' and (n < 1 or n > 60) then
      raise exception 'Los días de aviso de vencimiento van de 1 a 60.';
    elsif p_clave = 'porcentaje_critico' and (n < 1 or n > 99) then
      raise exception 'El porcentaje del nivel crítico va de 1 a 99.';
    elsif p_clave = 'dias_minimo_sugerido' and (n < 7 or n > 90) then
      raise exception 'Los días para calcular el mínimo sugerido van de 7 a 90.';
    elsif p_clave = 'dias_seguridad' and (n < 0 or n > 14) then
      raise exception 'Los días de stock de seguridad van de 0 a 14.';
    end if;
  end if;

  update public.parametros set valor = p_valor where clave = p_clave;
  -- El nivel crítico cambia el estado de las alertas.
  if p_clave = 'porcentaje_critico' then perform public.refrescar_alertas(); end if;
end $$;
revoke all on function public.actualizar_parametro(text, jsonb) from public, anon;
grant execute on function public.actualizar_parametro(text, jsonb) to authenticated;

-- Los días de aviso de vencimiento salen del parámetro (antes estaban fijos en 7).
create or replace view public.v_vencimientos with (security_invoker = true) as
select l.id as lote_id, l.producto_id, p.nombre, p.codigo_barras, l.codigo_lote, l.fecha_vencimiento, l.zona_almacen,
       coalesce(sum(x.cantidad) filter (where x.ubicacion = 'percha'), 0)::int as percha,
       coalesce(sum(x.cantidad) filter (where x.ubicacion = 'almacen'), 0)::int as almacen,
       coalesce(sum(x.cantidad), 0)::int as cantidad,
       (l.fecha_vencimiento - public.hoy()) as dias,
       (select a.accion from public.acciones_lote a where a.lote_id = l.id order by a.creado_en desc limit 1) as ultima_accion,
       (l.fecha_vencimiento - public.hoy()) <= public.parametro_int('dias_aviso_vencimiento', 7) as por_vencer
  from public.lotes l
  join public.productos p on p.id = l.producto_id
  left join public.existencias x on x.lote_id = l.id
 where l.fecha_vencimiento is not null and l.fecha_vencimiento <= public.hoy() + 30 and p.activo
 group by l.id, p.id
having coalesce(sum(x.cantidad), 0) > 0;

create or replace function public.resumen_inicio()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dias jsonb;
  v_aviso int := public.parametro_int('dias_aviso_vencimiento', 7);
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'supervisor' then
    raise exception 'Este resumen es para el administrador y el supervisor.' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object('dia', d.dia, 'productos', (
           select count(distinct q.producto_id) from public.quiebres q
            where q.inicio < ((d.dia + 1)::timestamp at time zone 'America/Lima')
              and coalesce(q.fin, now()) >= (d.dia::timestamp at time zone 'America/Lima')))
         order by d.dia)
    into v_dias
    from (select (public.hoy() - g)::date as dia from generate_series(0, 6) g) d;

  return jsonb_build_object(
    'alertas_abastecimiento', (select count(*) from public.alertas where tipo = 'abastecimiento' and estado <> 'cerrado'),
    'perchas_por_reponer',    (select count(*) from public.alertas where tipo = 'percha' and estado <> 'cerrado'),
    'lotes_por_vencer',       (select count(*) from public.v_vencimientos where dias between 0 and v_aviso),
    'dias_aviso',             v_aviso,
    'movimientos_hoy',        (select count(*) from public.movimientos
                                where not anulado and creado_en >= (public.hoy()::timestamp at time zone 'America/Lima')),
    'percha_vacia_por_dia',   v_dias);
end $$;

-- Política para que el administrador edite parámetros solo por la función.
-- (No hay política UPDATE: actualizar_parametro valida cada valor.)

-- ---------------------------------------------------------------------
-- RN-06: stock mínimo sugerido = venta diaria (últimos N días) × (días de entrega + días de seguridad)
-- ---------------------------------------------------------------------
create or replace function public.minimo_sugerido(p_producto uuid)
returns table (sugerido int, venta_diaria numeric, dias_entrega int, dias_seguridad int, dias_calculo int)
language sql stable security definer set search_path = public as $$
  with par as (
    select public.parametro_int('dias_minimo_sugerido', 14) as n, public.parametro_int('dias_seguridad', 1) as seg
  ), v as (
    select coalesce((select unidades from public.ventas_periodo(public.hoy() - (par.n - 1), public.hoy()) where producto_id = p_producto), 0)::numeric / par.n as diaria,
           par.n, par.seg
      from par
  )
  select case when v.diaria = 0 then null else greatest(1, ceil(v.diaria * (pr.dias_entrega + v.seg)))::int end,
         round(v.diaria, 2), pr.dias_entrega, v.seg, v.n
    from public.productos p join public.proveedores pr on pr.id = p.proveedor_id, v
   where p.id = p_producto and public.rol_actual() is not null
$$;
grant execute on function public.minimo_sugerido(uuid) to authenticated;
revoke all on function public.minimo_sugerido(uuid) from public, anon;

-- ---------------------------------------------------------------------
-- RF-07: productos con nombre parecido (RN-16: sin mayúsculas, tildes, espacios ni plural)
-- ---------------------------------------------------------------------
create or replace function public.productos_parecidos(p_nombre text, p_excluir uuid default null)
returns table (id uuid, nombre text, codigo_barras text)
language sql stable set search_path = public, extensions as $$
  select p.id, p.nombre, p.codigo_barras
    from public.productos p
   where p.activo
     and (p_excluir is null or p.id <> p_excluir)
     and length(public.norm(p_nombre)) >= 3
     and (   public.norm_singular(p.nombre) = public.norm_singular(p_nombre)
          or similarity(public.norm_singular(p.nombre), public.norm_singular(p_nombre)) >= 0.6)
   order by similarity(public.norm_singular(p.nombre), public.norm_singular(p_nombre)) desc
   limit 3
$$;
grant execute on function public.productos_parecidos(text, uuid) to authenticated;
revoke all on function public.productos_parecidos(text, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- RF-11: proveedores con mensajes claros (RUC de 11 dígitos y sin repetir)
-- ---------------------------------------------------------------------
create or replace function public.proveedores_validar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_otro text;
begin
  new.ruc := regexp_replace(coalesce(new.ruc, ''), '\s', '', 'g');
  new.razon_social := btrim(coalesce(new.razon_social, ''));
  if new.ruc !~ '^\d{11}$' then
    raise exception 'El RUC debe tener 11 dígitos (tiene %).', length(new.ruc) using errcode = '22023';
  end if;
  if new.razon_social = '' then
    raise exception 'Escribe la razón social del proveedor.' using errcode = '22023';
  end if;
  if new.dias_entrega is null or new.dias_entrega < 1 or new.dias_entrega > 60 then
    raise exception 'Los días de entrega van de 1 a 60.' using errcode = '22023';
  end if;
  select razon_social into v_otro from public.proveedores where ruc = new.ruc and id <> new.id;
  if found then
    raise exception 'El RUC % ya pertenece a %.', new.ruc, v_otro using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' and old.activo and not new.activo
     and exists (select 1 from public.productos where proveedor_id = new.id and activo) then
    raise exception 'No puedes desactivar a %: tiene productos activos. Cámbiales el proveedor primero.', new.razon_social;
  end if;
  return new;
end $$;
drop trigger if exists proveedores_validar on public.proveedores;
create trigger proveedores_validar before insert or update on public.proveedores
for each row execute function public.proveedores_validar();

-- ---------------------------------------------------------------------
-- RF-28: solicitudes al proveedor, para consultarlas y exportar la lista de pedido
-- ---------------------------------------------------------------------
create or replace view public.v_solicitudes with (security_invoker = true) as
select s.id, s.creado_en, s.cantidad_sugerida, s.alerta_id,
       p.id as producto_id, p.nombre as producto, p.codigo_barras, p.unidad,
       v.id as proveedor_id, v.razon_social as proveedor, v.ruc,
       u.nombre as usuario, a.estado as estado_alerta
  from public.solicitudes_proveedor s
  join public.productos p on p.id = s.producto_id
  join public.proveedores v on v.id = s.proveedor_id
  join public.perfiles u on u.id = s.usuario_id
  join public.alertas a on a.id = s.alerta_id;

-- ---------------------------------------------------------------------
-- RF-10: fusionar categorías duplicadas. Los productos pasan a la que se conserva.
-- ---------------------------------------------------------------------
create or replace function public.fusionar_categorias(p_conservar uuid, p_absorber uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c public.categorias%rowtype;
  v_a public.categorias%rowtype;
  n int;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador fusiona categorías.' using errcode = '42501';
  end if;
  if p_conservar = p_absorber then raise exception 'Elige dos categorías distintas.'; end if;
  select * into v_c from public.categorias where id = p_conservar and activa;
  select * into v_a from public.categorias where id = p_absorber and activa;
  if v_c.id is null or v_a.id is null then raise exception 'Elige dos categorías activas.'; end if;
  update public.productos set categoria_id = p_conservar where categoria_id = p_absorber;
  get diagnostics n = row_count;
  update public.categorias set activa = false where id = p_absorber;
  return n;
end $$;
revoke all on function public.fusionar_categorias(uuid, uuid) from public, anon;
grant execute on function public.fusionar_categorias(uuid, uuid) to authenticated;

-- La validación de productos acepta categorías desactivadas solo si el producto ya las tenía
-- (para que la fusión pueda mover productos inactivos sin error).
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
  if not exists (select 1 from public.categorias where id = new.categoria_id and activa)
     and (tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id or new.activo) then
    raise exception 'Elige una categoría activa de la lista.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.proveedores where id = new.proveedor_id and activo)
     and (tg_op = 'INSERT' or new.proveedor_id is distinct from old.proveedor_id) then
    raise exception 'Elige un proveedor activo de la lista.' using errcode = '23503';
  end if;
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- RF-29: campana con el número de alertas nuevas desde la última vez que el usuario la abrió
-- ---------------------------------------------------------------------
alter table public.perfiles add column if not exists alertas_vistas_en timestamptz not null default now();

create or replace function public.alertas_nuevas() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.alertas a, public.perfiles pf
   where pf.id = auth.uid() and pf.activo
     and a.estado <> 'cerrado'
     and a.detectada_en > pf.alertas_vistas_en
     -- El reponedor atiende las de percha; el resto ve todas.
     and (pf.rol <> 'reponedor' or a.tipo = 'percha')
$$;

create or replace function public.marcar_alertas_vistas() returns void
language sql security definer set search_path = public as $$
  update public.perfiles set alertas_vistas_en = now() where id = auth.uid()
$$;
revoke all on function public.alertas_nuevas() from public, anon;
revoke all on function public.marcar_alertas_vistas() from public, anon;
grant execute on function public.alertas_nuevas() to authenticated;
grant execute on function public.marcar_alertas_vistas() to authenticated;

notify pgrst, 'reload schema';
