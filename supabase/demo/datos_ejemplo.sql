-- =====================================================================
-- Mass Stock · Datos de ejemplo del prototipo
-- SOLO para el proyecto de Supabase de DESARROLLO. No ejecutar en producción.
-- Requisito: haber creado el primer administrador (npm run crear-admin).
-- Carga los 9 productos del prototipo, sus lotes y su stock en almacén y percha.
-- =====================================================================
do $$
declare
  v_admin uuid := (select id from public.perfiles where rol = 'administrador' and activo order by creado_en limit 1);
  v_cd    uuid := (select id from public.proveedores where ruc = '20000000001');
  v_beb   uuid := (select id from public.proveedores where ruc = '20000000002');
  v_mov_i uuid;
  v_mov_r uuid;
  r record;
  v_lote uuid;
begin
  if v_admin is null then
    raise exception 'Primero crea el administrador con «npm run crear-admin».';
  end if;

  -- Productos: código, nombre, categoría, proveedor, unidad, mínimo, mínimo de percha, controla vencimiento
  insert into public.productos (codigo_barras, nombre, categoria_id, proveedor_id, unidad, stock_minimo, minimo_percha, controla_vencimiento)
  select x.codigo, x.nombre, c.id, case when x.beb then v_beb else v_cd end, x.unidad, x.minimo, x.percha, x.venc
    from (values
      ('7751271005678', 'Aceite Primor 1L',           'Abarrotes',        false, 'botella', 12,  8, true),
      ('7750181003330', 'Agua San Luis 625ml',        'Bebidas',          true,  'botella', 20, 12, true),
      ('7751271001236', 'Arroz Costeño 5kg',          'Abarrotes',        false, 'bolsa',   30, 10, true),
      ('2000000000015', 'Azúcar Rubia a granel',      'Abarrotes',        false, 'kg',      10,  8, false),
      ('7750181009912', 'Cerveza Pilsen 620ml',       'Bebidas',          true,  'botella', 24, 10, true),
      ('7752063000482', 'Detergente Bolívar 800g',    'Limpieza',         false, 'bolsa',   10,  6, false),
      ('7751271002226', 'Fideos Don Vittorio 500g',   'Abarrotes',        false, 'paquete', 15, 10, true),
      ('7750218001582', 'Gaseosa Inca Kola 500ml',    'Bebidas',          true,  'botella', 24, 12, true),
      ('7751001190100', 'Leche Gloria 400g',          'Lácteos y huevos', false, 'lata',    15,  8, true)
    ) as x(codigo, nombre, categoria, beb, unidad, minimo, percha, venc)
    join public.categorias c on c.nombre = x.categoria and c.activa
  on conflict do nothing;

  -- Un ingreso y una reposición que dejan el stock como en las capturas del prototipo.
  insert into public.movimientos (tipo, guia_remision, proveedor_id, usuario_id, detalle)
  values ('ingreso', 'T001-000001', v_cd, v_admin, 'Datos de ejemplo') returning id into v_mov_i;
  insert into public.movimientos (tipo, usuario_id, detalle)
  values ('reposicion', v_admin, 'Datos de ejemplo') returning id into v_mov_r;

  for r in
    select p.id as producto_id, x.lote, x.venc, x.zona, x.almacen, x.percha
      from (values
        ('7751271005678', 'L-1201', null::date,                      'A-1',  0,  0),
        ('7750181003330', 'L-2409', (public.hoy() + 150),            'A-2', 30,  2),
        ('7751271001236', 'L-2381', (public.hoy() + 240),            'B-1', 60, 20),
        ('2000000000015', 'G-0001', null::date,                      'B-2', 24, 10),
        ('7750181009912', 'P-5520', (public.hoy() + 60),             'A-2', 10,  8),
        ('7752063000482', 'D-0800', null::date,                      'C-2',  0,  3),
        ('7751271002226', 'F-1503', (public.hoy() + 90),             'B-1', 40, 25),
        ('7750218001582', 'K-1188', (public.hoy() + 105),            'A-2', 48,  0),
        ('7751001190100', 'G-8921', (public.hoy() + 4),              'C-1',  8,  4)
      ) as x(codigo, lote, venc, zona, almacen, percha)
      join public.productos p on p.codigo_barras = x.codigo and p.activo
  loop
    insert into public.lotes (producto_id, codigo_lote, fecha_vencimiento, zona_almacen)
    values (r.producto_id, r.lote, r.venc, r.zona)
    on conflict (producto_id, codigo_lote) do nothing
    returning id into v_lote;
    continue when v_lote is null;

    if r.almacen + r.percha > 0 then
      insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_destino, cantidad)
      values (v_mov_i, r.producto_id, v_lote, 'almacen', r.almacen + r.percha);
    end if;
    if r.percha > 0 then
      insert into public.movimiento_lineas (movimiento_id, producto_id, lote_id, ubicacion_origen, ubicacion_destino, cantidad)
      values (v_mov_r, r.producto_id, v_lote, 'almacen', 'percha', r.percha);
    end if;
    insert into public.existencias (lote_id, ubicacion, cantidad) values
      (v_lote, 'almacen', r.almacen), (v_lote, 'percha', r.percha);
  end loop;
end $$;
