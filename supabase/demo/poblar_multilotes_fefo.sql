-- =====================================================================
-- Mass Stock · Habilitar Multilotes FEFO en varios productos
-- Ejecutar en el SQL Editor de Supabase (mass-stock-dev).
-- Esto configura 2 o más lotes con distintas fechas de caducidad en almacén
-- para: Leche Gloria, Gaseosa Inca Kola y Atún Florida.
-- =====================================================================

do $$
declare
  v_prod_leche uuid := '158cd524-7dd1-4bf0-aac8-a6023a26dc9b';
  v_prod_inca  uuid := '32b6f878-4323-4ab9-8dec-48d5ab2b6670';
  v_prod_atun  uuid := '99fbe8da-dc31-4514-be6a-72a7e93c330e';
  v_lote_leche2 uuid;
  v_lote_inca2  uuid;
  v_lote_atun_a uuid;
  v_lote_atun_b uuid;
begin
  -- 1. ATÚN FLORIDA: Cargar existencias a sus 2 lotes (15 u. vencen pronto, 25 u. vencen después)
  select id into v_lote_atun_a from public.lotes where producto_id = v_prod_atun and codigo_lote = 'L-ATUN-A';
  select id into v_lote_atun_b from public.lotes where producto_id = v_prod_atun and codigo_lote = 'L-ATUN-B';

  if v_lote_atun_a is not null then
    insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_atun_a, 'almacen', 15)
    on conflict (lote_id, ubicacion) do update set cantidad = 15;
    insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_atun_a, 'percha', 0)
    on conflict (lote_id, ubicacion) do update set cantidad = 0;
  end if;

  if v_lote_atun_b is not null then
    insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_atun_b, 'almacen', 25)
    on conflict (lote_id, ubicacion) do update set cantidad = 25;
    insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_atun_b, 'percha', 0)
    on conflict (lote_id, ubicacion) do update set cantidad = 0;
  end if;

  -- 2. LECHE GLORIA: Crear 2.° lote (G-9025) que vence en 6 meses (20 u.) para acompañar al lote G-8921 que vence en 4 días (8 u.)
  insert into public.lotes (producto_id, codigo_lote, fecha_vencimiento, zona_almacen)
  values (v_prod_leche, 'G-9025', public.hoy() + 180, 'C-1')
  on conflict (producto_id, codigo_lote) do update set fecha_vencimiento = excluded.fecha_vencimiento
  returning id into v_lote_leche2;

  if v_lote_leche2 is null then
    select id into v_lote_leche2 from public.lotes where producto_id = v_prod_leche and codigo_lote = 'G-9025';
  end if;

  insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_leche2, 'almacen', 20)
  on conflict (lote_id, ubicacion) do update set cantidad = 20;
  insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_leche2, 'percha', 0)
  on conflict (lote_id, ubicacion) do update set cantidad = 0;

  -- 3. INCA KOLA: Crear un 2.° lote (K-1120) que vence antes (en 20 días, 12 u.) para acompañar al lote K-1188 (que vence en 105 días)
  insert into public.lotes (producto_id, codigo_lote, fecha_vencimiento, zona_almacen)
  values (v_prod_inca, 'K-1120', public.hoy() + 20, 'A-2')
  on conflict (producto_id, codigo_lote) do update set fecha_vencimiento = excluded.fecha_vencimiento
  returning id into v_lote_inca2;

  if v_lote_inca2 is null then
    select id into v_lote_inca2 from public.lotes where producto_id = v_prod_inca and codigo_lote = 'K-1120';
  end if;

  insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_inca2, 'almacen', 12)
  on conflict (lote_id, ubicacion) do update set cantidad = 12;
  insert into public.existencias (lote_id, ubicacion, cantidad) values (v_lote_inca2, 'percha', 0)
  on conflict (lote_id, ubicacion) do update set cantidad = 0;

  -- Actualizar alertas para que reconozcan los nuevos stocks
  perform public.evaluar_alertas(v_prod_leche);
  perform public.evaluar_alertas(v_prod_inca);
  perform public.evaluar_alertas(v_prod_atun);

  raise notice 'Multilotes FEFO configurados exitosamente para Atún Florida, Leche Gloria e Inca Kola.';
end $$;
