-- =====================================================================
-- Mass Stock · Sprint 4 · Control y análisis
-- RF-19 aprobación de ajustes, RF-20 anulación, RF-21 importación de ventas,
-- RF-26 cantidad sugerida (en alertas_activas), RF-32 y RF-33 inicios por rol,
-- RF-37 rotación ABC, RF-39 indicadores, RF-40 línea base.
-- Ejecutar DESPUÉS de la migración del Sprint 3.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RF-19, RN-13: aprobar o rechazar un ajuste. Nadie aprueba su propio conteo.
-- ---------------------------------------------------------------------
create or replace function public.resolver_ajuste(p_ajuste uuid, p_aprobar boolean, p_motivo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a      public.ajustes%rowtype;
  v_prod public.productos%rowtype;
  v_mov  uuid;
  v_rest int;
  v_tom  int;
  v_lote uuid;
  v_hay  int;
  r      record;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'supervisor' then
    raise exception 'Solo el supervisor o el administrador aprueban ajustes.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo; es obligatorio para aprobar o rechazar.';
  end if;
  select * into a from public.ajustes where id = p_ajuste for update;
  if not found or a.estado <> 'pendiente' then
    raise exception 'Este ajuste ya fue resuelto. Actualiza la lista.';
  end if;
  if a.registrado_por = auth.uid() then
    raise exception 'No puedes aprobar ni rechazar un conteo que registraste tú; pide a otro supervisor o al administrador.';
  end if;
  select * into v_prod from public.productos where id = a.producto_id;

  if not p_aprobar then
    update public.ajustes set estado = 'rechazado', motivo = btrim(p_motivo), resuelto_por = auth.uid(), resuelto_en = now()
     where id = p_ajuste;
    return null;
  end if;

  insert into public.movimientos (tipo, motivo, detalle, usuario_id)
  values ('ajuste', btrim(p_motivo),
          format('Conteo físico en %s: sistema %s, contado %s', public.nombre_ubicacion(a.ubicacion), a.sistema, a.contado),
          auth.uid())
  returning id into v_mov;

  if a.diferencia < 0 then
    v_rest := -a.diferencia;
    select coalesce(sum(x.cantidad), 0) into v_hay
      from public.existencias x join public.lotes l on l.id = x.lote_id
     where l.producto_id = a.producto_id and x.ubicacion = a.ubicacion and public.lote_vigente(l.fecha_vencimiento);
    if v_hay < v_rest then
      raise exception 'El stock de % en % cambió desde el conteo (ahora hay %). Rechaza este ajuste y registra un conteo nuevo.',
        v_prod.nombre, public.nombre_ubicacion(a.ubicacion), v_hay;
    end if;
    for r in
      select x.lote_id, x.cantidad
        from public.existencias x join public.lotes l on l.id = x.lote_id
       where l.producto_id = a.producto_id and x.ubicacion = a.ubicacion and x.cantidad > 0 and public.lote_vigente(l.fecha_vencimiento)
       order by l.fecha_vencimiento nulls last, l.creado_en
    loop
      exit when v_rest = 0;
      v_tom := least(v_rest, r.cantidad);
      perform public._mover(r.lote_id, a.ubicacion, -v_tom);
      insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, cantidad)
      values (v_mov, a.producto_id, r.lote_id, a.ubicacion, v_tom);
      v_rest := v_rest - v_tom;
    end loop;
  elsif a.diferencia > 0 then
    -- Las unidades de más se suman al lote vigente que vence más tarde.
    select l.id into v_lote from public.lotes l
     where l.producto_id = a.producto_id and public.lote_vigente(l.fecha_vencimiento)
     order by l.fecha_vencimiento desc nulls first, l.creado_en desc limit 1;
    if v_lote is null then
      raise exception '% no tiene lotes vigentes. Registra un ingreso con su lote en lugar de aprobar este ajuste.', v_prod.nombre;
    end if;
    perform public._mover(v_lote, a.ubicacion, a.diferencia);
    insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_destino, cantidad)
    values (v_mov, a.producto_id, v_lote, a.ubicacion, a.diferencia);
  end if;

  update public.ajustes set estado = 'aprobado', motivo = btrim(p_motivo), resuelto_por = auth.uid(), resuelto_en = now(),
         movimiento_id = v_mov
   where id = p_ajuste;
  return v_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-20, RN-14: anular un movimiento. Queda marcado y el stock se revierte.
-- ---------------------------------------------------------------------
create or replace function public.anular_movimiento(p_mov uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.movimientos%rowtype;
  r record;
  v_hay int;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador anula movimientos.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  select * into m from public.movimientos where id = p_mov for update;
  if not found then raise exception 'El movimiento no existe.'; end if;
  if m.anulado then raise exception 'Este movimiento ya está anulado.'; end if;

  for r in
    select ml.*, l.codigo_lote, p.nombre
      from public.movimiento_lineas ml
      join public.lotes l on l.id = ml.lote_id
      join public.productos p on p.id = ml.producto_id
     where ml.movimiento_id = p_mov
  loop
    if r.ubicacion_destino is not null then
      select coalesce(cantidad, 0) into v_hay from public.existencias where lote_id = r.lote_id and ubicacion = r.ubicacion_destino;
      if coalesce(v_hay, 0) < r.cantidad then
        raise exception 'No se puede anular: del lote % de % ya salieron unidades de % (quedan % de las %). Anula primero los movimientos posteriores de ese lote.',
          r.codigo_lote, r.nombre, public.nombre_ubicacion(r.ubicacion_destino), coalesce(v_hay, 0), r.cantidad;
      end if;
      perform public._mover(r.lote_id, r.ubicacion_destino, -r.cantidad);
    end if;
    if r.ubicacion_origen is not null then
      perform public._mover(r.lote_id, r.ubicacion_origen, r.cantidad);
    end if;
  end loop;

  update public.movimientos
     set anulado = true, motivo_anulacion = btrim(p_motivo), anulado_por = auth.uid(), anulado_en = now()
   where id = p_mov;
end $$;

-- ---------------------------------------------------------------------
-- RF-21: importar las ventas del día exportadas por la caja.
-- p_filas: [{fila, codigo, cantidad}]. Las filas con error se informan sin cancelar el resto.
-- ---------------------------------------------------------------------
create or replace function public.importar_ventas(p_fecha date, p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mov    uuid;
  f        jsonb;
  v_prod   uuid;
  v_ok     int := 0;
  v_unid   int := 0;
  v_err    jsonb := '[]'::jsonb;
  v_cod    text;
  v_cant   text;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador importa las ventas de caja.' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.hoy() then
    raise exception 'Elige la fecha de las ventas (hoy o un día anterior).';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no tiene filas de ventas.';
  end if;
  if exists (select 1 from public.movimientos where fecha_venta = p_fecha and not anulado) then
    raise exception 'Las ventas del % ya se importaron. Si quieres cargarlas de nuevo, anula esa importación en el Historial.',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  insert into public.movimientos (tipo, motivo, detalle, usuario_id, fecha_venta, creado_en)
  values ('salida', 'venta', 'Ventas de caja del ' || to_char(p_fecha, 'DD/MM/YYYY') || ' (importadas)', auth.uid(), p_fecha,
          case when p_fecha < public.hoy() then (p_fecha + time '22:00') at time zone 'America/Lima' else now() end)
  returning id into v_mov;

  for f in select value from jsonb_array_elements(p_filas) loop
    begin
      v_cod := btrim(coalesce(f ->> 'codigo', ''));
      v_cant := btrim(coalesce(f ->> 'cantidad', ''));
      if v_cod = '' then raise exception 'falta el código de barras.'; end if;
      select id into v_prod from public.productos where codigo_barras = v_cod and activo;
      if v_prod is null then raise exception 'el código % no está en el catálogo.', v_cod; end if;
      if v_cant !~ '^\d{1,6}$' or v_cant::int <= 0 then
        raise exception 'la cantidad «%» no es un número entero mayor que 0.', v_cant;
      end if;
      perform public._salida_linea(v_mov, 'venta', v_prod, v_cant::int, null, null, 'Código ' || v_cod);
      v_ok := v_ok + 1;
      v_unid := v_unid + v_cant::int;
    exception when others then
      v_err := v_err || jsonb_build_object('fila', f -> 'fila', 'mensaje', sqlerrm);
    end;
    v_prod := null;
  end loop;

  if v_ok = 0 then
    delete from public.movimientos where id = v_mov;
    v_mov := null;
  end if;
  return jsonb_build_object('movimiento_id', v_mov, 'filas_ok', v_ok, 'unidades', v_unid, 'errores', v_err);
end $$;

-- ---------------------------------------------------------------------
-- Stock de un producto al cierre de cada día, reconstruido desde los movimientos.
-- Se usa para el stock promedio de la rotación (RN-18 punto 3).
-- ---------------------------------------------------------------------
create or replace function public.stock_diario(p_desde date, p_hasta date)
returns table (producto_id uuid, dia date, stock numeric)
language sql stable security definer set search_path = public as $$
  with dias as (
    select d::date as dia from generate_series(p_desde, p_hasta, interval '1 day') d
  ), actual as (
    select p.id as producto_id, coalesce(sum(x.cantidad), 0) as fisico
      from public.productos p
      left join public.lotes l on l.producto_id = p.id
      left join public.existencias x on x.lote_id = l.id
     where p.activo
     group by p.id
  ), efectos as (
    select ml.producto_id, m.creado_en,
           case when m.tipo = 'reposicion' then 0
                when ml.ubicacion_destino is not null then ml.cantidad
                else -ml.cantidad end as efecto
      from public.movimiento_lineas ml
      join public.movimientos m on m.id = ml.movimiento_id
     where not m.anulado and m.tipo <> 'reposicion'
  )
  select a.producto_id, d.dia,
         greatest(0, a.fisico - coalesce((
           select sum(e.efecto) from efectos e
            where e.producto_id = a.producto_id
              and e.creado_en >= ((d.dia + 1)::timestamp at time zone 'America/Lima')), 0))
    from actual a cross join dias d
$$;

-- RF-37: rotación por ventas con clasificación ABC (RN-18, RN-20). Ingresos y reposiciones no cuentan.
create or replace function public.reporte_rotacion(p_desde date, p_hasta date)
returns table (producto_id uuid, nombre text, codigo_barras text, clase text, unidades bigint,
               stock_promedio numeric, rotacion numeric, cobertura_dias numeric, stock_actual int)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'supervisor' then
    raise exception 'Tu rol no ve los reportes de rotación.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Elige un rango de fechas válido: «Desde» debe ser anterior o igual a «Hasta».';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'Elige un rango de un año como máximo.';
  end if;
  return query
    with abc as (select * from public.clasificacion_abc(p_desde, p_hasta)),
    sp as (select s.producto_id, avg(s.stock) as prom from public.stock_diario(p_desde, p_hasta) s group by s.producto_id)
    select v.producto_id, v.nombre, v.codigo_barras, abc.clase, abc.unidades,
           round(coalesce(sp.prom, 0), 1),
           case when coalesce(sp.prom, 0) = 0 then null else round(abc.unidades / sp.prom, 2) end,
           case when abc.unidades = 0 then null
                else round(v.total / (abc.unidades::numeric / (p_hasta - p_desde + 1)), 1) end,
           v.total
      from public.v_stock v
      join abc on abc.producto_id = v.producto_id
      left join sp on sp.producto_id = v.producto_id
     where v.activo
     order by abc.unidades desc, v.nombre;
end $$;

-- ---------------------------------------------------------------------
-- RF-40: línea base de cada indicador. Cada cambio es una fila nueva (queda registrado).
-- RN-19: los valores «antes» no se escriben en el código; se registran aquí.
-- ---------------------------------------------------------------------
create table public.lineas_base (
  id             uuid primary key default gen_random_uuid(),
  indicador      text not null check (indicador in (
                   'tiempo_reposicion_percha', 'tiempo_reposicion_abastecimiento',
                   'duracion_quiebre', 'rotacion', 'merma_vencimiento')),
  valor          numeric not null check (valor >= 0),
  meta           numeric check (meta >= 0),
  unidad         text not null,
  fecha          date not null,
  fuente         text not null check (length(btrim(fuente)) > 0),
  registrado_por uuid not null references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
alter table public.lineas_base enable row level security;
create policy lineas_base_leer on public.lineas_base for select to authenticated
  using (public.rol_actual() in ('administrador', 'supervisor'));

create or replace function public.unidad_indicador(p text) returns text
language sql immutable as $$
  select case p when 'rotacion' then 'veces' when 'merma_vencimiento' then 'unid.' else 'h' end
$$;

create or replace function public.registrar_linea_base(p_indicador text, p_valor numeric, p_meta numeric, p_fecha date, p_fuente text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.rol_actual() is distinct from 'administrador' then
    raise exception 'Solo el administrador registra la línea base.' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 then raise exception 'Escribe el valor de la línea base (0 o más).'; end if;
  if p_meta is not null and p_meta < 0 then raise exception 'La meta debe ser 0 o más.'; end if;
  if p_fecha is null or p_fecha > public.hoy() then raise exception 'Escribe la fecha en que se midió (hoy o antes).'; end if;
  if coalesce(btrim(p_fuente), '') = '' then
    raise exception 'Escribe la fuente de la medición, por ejemplo «Supervisor de tienda, Tabla 6 punto 10».';
  end if;
  insert into public.lineas_base (indicador, valor, meta, unidad, fecha, fuente, registrado_por)
  values (p_indicador, p_valor, p_meta, public.unidad_indicador(p_indicador), p_fecha, btrim(p_fuente), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RF-39: los cuatro indicadores de RN-18, por semana (la última semana es el valor actual).
-- ---------------------------------------------------------------------
create or replace function public.indicadores(p_semanas int default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_res jsonb := '[]'::jsonb;
  k int;
  v_ini date;
  v_fin date;
  t0 timestamptz;
  t1 timestamptz;
  v_rp numeric; v_ra numeric; v_q numeric; v_rot numeric; v_mer numeric;
  v_vend numeric; v_prom numeric;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'supervisor' then
    raise exception 'Tu rol no ve los indicadores.' using errcode = '42501';
  end if;
  p_semanas := greatest(1, least(coalesce(p_semanas, 7), 26));
  for k in reverse (p_semanas - 1)..0 loop
    v_fin := public.hoy() - 7 * k;
    v_ini := v_fin - 6;
    t0 := v_ini::timestamp at time zone 'America/Lima';
    t1 := (v_fin + 1)::timestamp at time zone 'America/Lima';

    -- (1) Tiempo de reposición: «Repuesto» − «Pendiente», en horas, por tipo.
    select round(avg(extract(epoch from repuesta_en - detectada_en) / 3600)::numeric, 1) into v_rp
      from public.alertas where tipo = 'percha' and repuesta_en >= t0 and repuesta_en < t1;
    select round(avg(extract(epoch from repuesta_en - detectada_en) / 3600)::numeric, 1) into v_ra
      from public.alertas where tipo = 'abastecimiento' and repuesta_en >= t0 and repuesta_en < t1;
    -- (2) Duración del quiebre: horas promedio con la percha vacía (quiebres que terminaron en la semana).
    select round(avg(extract(epoch from fin - inicio) / 3600)::numeric, 1) into v_q
      from public.quiebres where fin >= t0 and fin < t1;
    -- (3) Rotación: unidades vendidas ÷ stock promedio del periodo (todos los productos).
    select coalesce(sum(unidades), 0) into v_vend from public.ventas_periodo(v_ini, v_fin);
    select avg(tot) into v_prom from (
      select dia, sum(stock) as tot from public.stock_diario(v_ini, v_fin) group by dia) x;
    v_rot := case when coalesce(v_prom, 0) = 0 then null else round(v_vend / v_prom, 2) end;
    -- (4) Merma por vencimiento: unidades retiradas por vencimiento.
    select coalesce(sum(ml.cantidad), 0) into v_mer
      from public.movimiento_lineas ml join public.movimientos m on m.id = ml.movimiento_id
     where m.tipo = 'salida' and m.motivo = 'vencimiento' and not m.anulado and m.creado_en >= t0 and m.creado_en < t1;

    v_res := v_res || jsonb_build_object(
      'desde', v_ini, 'hasta', v_fin,
      'tiempo_reposicion_percha', v_rp,
      'tiempo_reposicion_abastecimiento', v_ra,
      'duracion_quiebre', v_q,
      'rotacion', v_rot,
      'merma_vencimiento', v_mer);
  end loop;

  return jsonb_build_object(
    'semanas', v_res,
    'lineas_base', coalesce((
      select jsonb_object_agg(indicador, to_jsonb(b) - 'registrado_por')
        from (select distinct on (indicador) lb.*, pf.nombre as registrado_por_nombre
                from public.lineas_base lb join public.perfiles pf on pf.id = lb.registrado_por
               order by indicador, lb.creado_en desc) b), '{}'::jsonb),
    'historial_lineas_base', coalesce((
      select jsonb_agg(jsonb_build_object('indicador', lb.indicador, 'valor', lb.valor, 'meta', lb.meta, 'unidad', lb.unidad,
                                          'fecha', lb.fecha, 'fuente', lb.fuente, 'registrado_por', pf.nombre, 'creado_en', lb.creado_en)
                       order by lb.creado_en desc)
        from public.lineas_base lb join public.perfiles pf on pf.id = lb.registrado_por), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- RF-32: resumen del inicio del administrador y del supervisor.
-- ---------------------------------------------------------------------
create or replace function public.resumen_inicio()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dias jsonb;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'supervisor' then
    raise exception 'Este resumen es para el administrador y el supervisor.' using errcode = '42501';
  end if;
  -- Productos distintos con la percha vacía en algún momento de cada uno de los últimos 7 días.
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
    'lotes_por_vencer',       (select count(*) from public.v_vencimientos where dias between 0 and 7),
    'movimientos_hoy',        (select count(*) from public.movimientos
                                where not anulado and creado_en >= (public.hoy()::timestamp at time zone 'America/Lima')),
    'percha_vacia_por_dia',   v_dias);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.resolver_ajuste(uuid, boolean, text)',
    'public.anular_movimiento(uuid, text)',
    'public.importar_ventas(date, jsonb)',
    'public.stock_diario(date, date)',
    'public.reporte_rotacion(date, date)',
    'public.registrar_linea_base(text, numeric, numeric, date, text)',
    'public.indicadores(int)',
    'public.resumen_inicio()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- stock_diario solo lo usan otras funciones.
revoke all on function public.stock_diario(date, date) from authenticated;

alter publication supabase_realtime add table public.movimientos;

-- Avisa a la API que hay funciones y tablas nuevas.
notify pgrst, 'reload schema';
