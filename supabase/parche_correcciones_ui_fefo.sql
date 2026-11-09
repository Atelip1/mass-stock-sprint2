-- =====================================================================
-- Mass Stock · Parche de actualización rápida (Supabase SQL Editor)
-- Corrige:
-- 1. Alertas parciales en estado «repuesto» que aún no superan el mínimo.
-- 2. Reposición de percha con reparto automático FEFO multilote.
-- 3. Auto-aprobación permitida para el rol Administrador en modo demostración.
-- =====================================================================

-- 1. Alertas parciales siguen accionables («pendiente») si no cubren el mínimo
create or replace function public._alerta(p_prod uuid, p_tipo text, p_cond boolean, p_nivel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cond then
    update public.alertas
       set nivel = p_nivel,
           estado = case when estado = 'repuesto' then 'pendiente' else estado end,
           actualizado_en = now()
     where producto_id = p_prod and tipo = p_tipo and estado <> 'cerrado'
       and (nivel <> p_nivel or estado = 'repuesto');
    insert into public.alertas (producto_id, tipo, nivel) values (p_prod, p_tipo, p_nivel)
    on conflict do nothing;
  else
    update public.alertas set estado = 'cerrado', cerrada_en = now(), actualizado_en = now()
     where producto_id = p_prod and tipo = p_tipo and estado <> 'cerrado';
  end if;
end $$;

-- 2. Permitir retomar alertas con reposición parcial
create or replace function public.tomar_alerta(p_alerta uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_prod uuid;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no puede reponer la percha.' using errcode = '42501';
  end if;
  update public.alertas
     set estado = case when estado in ('pendiente', 'repuesto') then 'en_reposicion' else estado end,
         tomada_por = coalesce(tomada_por, auth.uid()), tomada_en = coalesce(tomada_en, now()), actualizado_en = now()
   where id = p_alerta and tipo = 'percha' and estado in ('pendiente', 'en_reposicion', 'repuesto')
   returning producto_id into v_prod;
  if v_prod is null then
    raise exception 'Esta alerta ya fue atendida. Actualiza la lista.';
  end if;
  return v_prod;
end $$;

-- 3. Reposición de percha con reparto automático FEFO multilote
create or replace function public.registrar_reposicion(p_producto uuid, p_lote uuid, p_cantidad int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prod  public.productos%rowtype;
  v_lote  public.lotes%rowtype;
  v_total int;
  v_rest  int := p_cantidad;
  v_tom   int;
  v_mov   uuid;
  r       record;
begin
  if public.rol_actual() is distinct from 'administrador' and public.rol_actual() is distinct from 'reponedor' then
    raise exception 'Tu rol no puede registrar reposiciones.' using errcode = '42501';
  end if;
  select * into v_prod from public.productos where id = p_producto and activo;
  if not found then raise exception 'Elige un producto activo.'; end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un número entero mayor que 0.';
  end if;

  if p_lote is not null then
    select * into v_lote from public.lotes where id = p_lote and producto_id = p_producto;
    if not found then raise exception 'Elige un lote de %.', v_prod.nombre; end if;
    if not public.lote_vigente(v_lote.fecha_vencimiento) then
      raise exception 'El lote % venció el %; no se puede poner en percha. Regístralo como salida por vencimiento.',
        v_lote.codigo_lote, to_char(v_lote.fecha_vencimiento, 'DD/MM/YYYY');
    end if;
  end if;

  select coalesce(sum(x.cantidad), 0) into v_total
    from public.existencias x join public.lotes l on l.id = x.lote_id
   where l.producto_id = p_producto and x.ubicacion = 'almacen' and public.lote_vigente(l.fecha_vencimiento);

  if v_total < p_cantidad then
    raise exception 'El almacén tiene % disponibles de %; no puedes trasladar %. Corrige la cantidad.',
      v_total, v_prod.nombre, p_cantidad;
  end if;

  insert into public.movimientos (tipo, detalle, usuario_id)
  values ('reposicion', coalesce('Almacén ' || v_lote.zona_almacen || ' → percha', 'Almacén (FEFO) → percha'), auth.uid())
  returning id into v_mov;

  perform public._marcar_repuesto(p_producto, 'percha');

  for r in
    select x.lote_id, x.cantidad
      from public.existencias x join public.lotes l on l.id = x.lote_id
     where l.producto_id = p_producto and x.ubicacion = 'almacen' and x.cantidad > 0 and public.lote_vigente(l.fecha_vencimiento)
     order by (p_lote is not null and l.id = p_lote) desc, l.fecha_vencimiento nulls last, l.creado_en
  loop
    exit when v_rest = 0;
    v_tom := least(v_rest, r.cantidad);
    perform public._mover(r.lote_id, 'almacen', -v_tom);
    perform public._mover(r.lote_id, 'percha', v_tom);
    insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, ubicacion_destino, cantidad)
    values (v_mov, p_producto, r.lote_id, 'almacen', 'percha', v_tom);
    v_rest := v_rest - v_tom;
  end loop;

  return v_mov;
end $$;

-- 4. Permitir al Administrador aprobar su propio conteo en pruebas/demostración
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
  if a.registrado_por = auth.uid() and public.rol_actual() is distinct from 'administrador' then
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

-- Recalcula el estado de todas las alertas actuales (destraba las que quedaron en «repuesto» parcial)
do $$ declare r record; begin for r in select id from public.productos loop perform public.evaluar_alertas(r.id); end loop; end $$;
