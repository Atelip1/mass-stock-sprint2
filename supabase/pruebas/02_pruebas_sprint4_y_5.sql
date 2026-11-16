-- =====================================================================
-- Mass Stock · Validación funcional de los Sprints 4 y 5
-- Ajustes (aprobar / rechazar), anulación, importación de ventas, cantidad sugerida,
-- inicio por rol, rotación ABC, indicadores con línea base, solicitudes al proveedor,
-- acciones sobre lotes, parámetros y campana de alertas.
-- Se ejecuta DESPUÉS de 01_pruebas_sprint2_y_3.sql, en la misma base de pruebas
-- (usa sus usuarios y datos). Nunca en Supabase.
-- =====================================================================
\set A '''00000000-0000-0000-0000-00000000000a'''
\set S '''00000000-0000-0000-0000-00000000000b'''
\set R '''00000000-0000-0000-0000-00000000000c'''
\set R2 '''00000000-0000-0000-0000-00000000000d'''
delete from t.res;
set role authenticated;

-- ================= SPRINT 4 =================

-- RF-19: ajuste por conteo físico. Lo registra el reponedor; lo resuelve el supervisor con motivo.
set request.jwt.claim.sub = :R;
select registrar_conteo((select id from productos where nombre like 'Cerveza%'), 'almacen', 12, 'Una caja abierta') as aj1 \gset
select t.ok((select estado from ajustes where id = :'aj1') = 'pendiente', 'RF-18 conteo con diferencia queda «Pendiente»');
select t.err(format('select resolver_ajuste(%L, true, %L)', :'aj1', 'ok'), 'supervisor o el administrador', 'RF-19 el reponedor no aprueba ajustes');
set request.jwt.claim.sub = :S;
select t.err(format('select resolver_ajuste(%L, true, %L)', :'aj1', ''), 'motivo', 'RF-19 aprobar exige motivo');
select resolver_ajuste(:'aj1', true, 'Botella rota al descargar');
select t.ok((select estado from ajustes where id = :'aj1') = 'aprobado', 'RF-19 el supervisor aprueba el ajuste');
select t.ok((select almacen from v_stock where nombre like 'Cerveza%') = 12, 'RF-19 al aprobar, el almacén queda con lo contado (12)');
select t.ok(exists(select 1 from v_historial where tipo = 'ajuste' and producto like 'Cerveza%'), 'RF-19 el ajuste aparece en el historial');
select t.err(format('select resolver_ajuste(%L, false, %L)', :'aj1', 'otra vez'), 'ya fue resuelto', 'RF-19 un ajuste resuelto no se vuelve a resolver');

-- El conteo pendiente que dejó la batería 01: no se puede registrar otro igual y el supervisor lo rechaza.
select a.id as aj2, a.producto_id as prod2, a.ubicacion as ubi2,
       (select case when a.ubicacion = 'percha' then s.percha else s.almacen end from v_stock s where s.producto_id = a.producto_id) as antes2
  from ajustes a where a.estado = 'pendiente' order by a.creado_en limit 1 \gset
set request.jwt.claim.sub = :R;
select t.err(format('select registrar_conteo(%L, %L, 0)', :'prod2', :'ubi2'), 'pendiente de aprobación', 'RF-18 no se registra otro conteo mientras hay uno pendiente');
set request.jwt.claim.sub = :S;
select resolver_ajuste(:'aj2', false, 'Se volvió a contar y estaba bien');
select t.ok((select estado from ajustes where id = :'aj2') = 'rechazado', 'RF-19 el supervisor rechaza el ajuste con motivo');
select t.ok((select case when :'ubi2' = 'percha' then percha else almacen end from v_stock where producto_id = :'prod2') = :antes2, 'RF-19 al rechazar, el stock no cambia');
select t.err(format('select registrar_conteo(%L, %L, 1)', (select id from productos where nombre like 'Cerveza%'), 'almacen'), 'no registra conteos', 'RF-18 el supervisor no registra conteos (los aprueba)');

-- RF-20: anular un movimiento con motivo; el stock se revierte.
set request.jwt.claim.sub = :A;
select total as det_antes from v_stock where nombre like 'Detergente%' \gset
select registrar_ingreso('G-ANU', (select id from proveedores where ruc = '20000000001'),
  jsonb_build_array(jsonb_build_object('producto_id', (select id from productos where nombre like 'Detergente%'), 'cantidad', 5, 'lote', 'D9', 'zona', 'A-1'))) as mov_anu \gset
select t.ok((select total from v_stock where nombre like 'Detergente%') = :det_antes + 5, 'RF-14 el ingreso suma 5 al stock');
set request.jwt.claim.sub = :R;
select t.err(format('select anular_movimiento(%L, %L)', :'mov_anu', 'x'), 'Solo el administrador', 'RF-20 el reponedor no anula movimientos');
set request.jwt.claim.sub = :A;
select t.err(format('select anular_movimiento(%L, %L)', :'mov_anu', ' '), 'motivo', 'RF-20 anular exige motivo');
select anular_movimiento(:'mov_anu', 'Guía registrada dos veces');
select t.ok((select total from v_stock where nombre like 'Detergente%') = :det_antes, 'RF-20 al anular, el stock vuelve a su valor anterior');
select t.ok((select anulado and motivo_anulacion = 'Guía registrada dos veces' from movimientos where id = :'mov_anu'), 'RF-20 el movimiento queda anulado con su motivo');
select t.err(format('select anular_movimiento(%L, %L)', :'mov_anu', 'otra'), 'ya está anulado', 'RF-20 no se anula dos veces');

-- RF-21: importar ventas de caja; las filas con error se informan y no detienen el resto.
select total as cer_antes from v_stock where nombre like 'Cerveza%' \gset
set request.jwt.claim.sub = :R;
select t.err($$select importar_ventas(hoy() - 1, '[{"fila":1,"codigo":"7750000000021","cantidad":"1"}]')$$, 'Solo el administrador', 'RF-21 el reponedor no importa ventas');
set request.jwt.claim.sub = :A;
select t.err($$select importar_ventas(hoy() + 1, '[{"fila":1,"codigo":"7750000000021","cantidad":"1"}]')$$, 'fecha', 'RF-21 no acepta ventas con fecha futura');
select importar_ventas(hoy() - 1, '[
  {"fila":1,"codigo":"7750000000021","cantidad":"3"},
  {"fila":2,"codigo":"0000000000000","cantidad":"1"},
  {"fila":3,"codigo":"7750000000021","cantidad":"x"}]'::jsonb) as imp \gset
select t.ok((:'imp'::jsonb ->> 'filas_ok')::int = 1 and (:'imp'::jsonb ->> 'unidades')::int = 3, 'RF-21 importa las filas válidas (1 fila, 3 unidades)');
select t.ok(jsonb_array_length(:'imp'::jsonb -> 'errores') = 2, 'RF-21 informa las 2 filas con error (código inexistente y cantidad inválida)');
select t.ok((select total from v_stock where nombre like 'Cerveza%') = :cer_antes - 3, 'RF-21 la venta importada descuenta el stock');
select t.ok(exists(select 1 from movimientos where fecha_venta = hoy() - 1 and not anulado), 'RF-21 la importación queda con la fecha de venta');
select t.err($$select importar_ventas(hoy() - 1, '[{"fila":1,"codigo":"7750000000021","cantidad":"1"}]')$$, 'ya se importaron', 'RF-21 no importa dos veces el mismo día');

-- RF-26: cantidad sugerida en cada alerta.
set request.jwt.claim.sub = :S;
select t.ok(exists(select 1 from alertas_activas() where sugerido > 0), 'RF-26 las alertas traen cantidad sugerida');

-- RF-32 / RF-33: inicio por rol.
select t.ok((resumen_inicio() ? 'alertas_abastecimiento') and (resumen_inicio() ? 'percha_vacia_por_dia'), 'RF-32 el supervisor ve el resumen del inicio');
set request.jwt.claim.sub = :R;
select t.err('select resumen_inicio()', 'administrador y el supervisor', 'RF-33 el reponedor tiene su propio inicio (no el resumen)');
select t.ok(exists(select 1 from alertas_activas() where tipo = 'percha'), 'RF-33 el reponedor ve las perchas por reponer');

-- RF-37: rotación con clasificación ABC.
set request.jwt.claim.sub = :S;
select t.ok((select clase from clasificacion_abc(hoy() - 30, hoy()) c join productos p on p.id = c.producto_id where p.nombre like 'Cerveza%') = 'A', 'RF-37 el producto más vendido es clase A');
select t.ok((select count(*) from reporte_rotacion(hoy() - 30, hoy())) > 0, 'RF-37 el reporte de rotación devuelve filas');
select t.err('select * from reporte_rotacion(hoy(), hoy() - 5)', 'rango', 'RF-37 rechaza un rango de fechas al revés');
set request.jwt.claim.sub = :R;
select t.err('select * from reporte_rotacion(hoy() - 30, hoy())', 'rotación', 'RF-37 el reponedor no ve la rotación');

-- RF-39 / RF-40: indicadores frente a la línea base.
select t.err($$select registrar_linea_base('rotacion', 1.5, 2, hoy(), 'Prueba')$$, 'Solo el administrador', 'RF-40 el reponedor no registra la línea base');
set request.jwt.claim.sub = :A;
select t.err($$select registrar_linea_base('rotacion', 1.5, 2, hoy(), '')$$, 'fuente', 'RF-40 la línea base exige la fuente');
select t.err($$select registrar_linea_base('rotacion', -1, 2, hoy(), 'Prueba')$$, 'valor', 'RF-40 la línea base no acepta valores negativos');
select registrar_linea_base('rotacion', 1.5, 2, hoy(), 'Prueba automática');
set request.jwt.claim.sub = :S;
select t.ok((indicadores(7) -> 'lineas_base' -> 'rotacion' ->> 'valor')::numeric = 1.5, 'RF-39 los indicadores muestran la línea base registrada');
select t.ok(jsonb_array_length(indicadores(7) -> 'semanas') = 7, 'RF-39 los indicadores traen 7 semanas');
select t.ok(jsonb_array_length(indicadores(7) -> 'historial_lineas_base') >= 1, 'RF-40 queda el historial de la línea base');
set request.jwt.claim.sub = :R;
select t.err('select indicadores(7)', 'no ve los indicadores', 'RF-39 el reponedor no ve los indicadores');

-- ================= SPRINT 5 Y BACKLOG =================

-- RF-28: solicitud al proveedor desde las alertas de abastecimiento.
select t.err(format('select * from solicitar_proveedor(array[%L]::uuid[])', (select id from alertas where tipo = 'abastecimiento' and estado <> 'cerrado' limit 1)), 'Solo el administrador', 'RF-28 el reponedor no solicita al proveedor');
set request.jwt.claim.sub = :A;
select count(*) as filas_pedido from solicitar_proveedor(array(select id from alertas where tipo = 'abastecimiento' and estado = 'pendiente')) \gset
select t.ok(:filas_pedido > 0, 'RF-28 genera la lista de pedido por proveedor', :filas_pedido || ' filas');
select t.ok(exists(select 1 from solicitudes_proveedor), 'RF-28 la solicitud queda registrada');
select t.ok(not exists(select 1 from alertas where tipo = 'abastecimiento' and estado = 'pendiente'), 'RF-28 las alertas solicitadas pasan a «En reposición»');

-- RF-31: acciones sobre lotes por vencer.
select registrar_accion_lote((select id from lotes where codigo_lote = 'C1'), 'oferta', 'Precio especial');
select t.ok(exists(select 1 from acciones_lote al join lotes l on l.id = al.lote_id where l.codigo_lote = 'C1' and al.accion = 'oferta'), 'RF-31 se registra la oferta del lote');
select t.err(format('select registrar_accion_lote(%L, %L)', (select id from lotes where codigo_lote = 'C1'), 'regalo'), 'Elige la acción', 'RF-31 rechaza una acción desconocida');
set request.jwt.claim.sub = :R;
select t.err(format('select registrar_accion_lote(%L, %L)', (select id from lotes where codigo_lote = 'C1'), 'oferta'), 'Solo el administrador', 'RF-31 el reponedor no registra acciones sobre lotes');

-- RF-41: parámetros.
set request.jwt.claim.sub = :A;
select actualizar_parametro('dias_aviso_vencimiento', '10'::jsonb);
select t.ok((select valor::text from parametros where clave = 'dias_aviso_vencimiento') = '10', 'RF-41 el administrador cambia los días de aviso');
select t.err($$select actualizar_parametro('porcentaje_critico', '"abc"'::jsonb)$$, 'número entero', 'RF-41 rechaza un valor que no es número');
select t.err($$select actualizar_parametro('zonas_almacen', '["A-1","a-1"]'::jsonb)$$, 'repetida', 'RF-41 rechaza zonas repetidas');
select actualizar_parametro('dias_aviso_vencimiento', '7'::jsonb);
set request.jwt.claim.sub = :S;
select t.err($$select actualizar_parametro('dias_aviso_vencimiento', '5'::jsonb)$$, 'Solo el administrador', 'RF-41 el supervisor no cambia parámetros');

-- RF-29: campana de alertas nuevas.
set request.jwt.claim.sub = :R;
select count(*) as nuevas from alertas_nuevas() \gset
select marcar_alertas_vistas();
select t.ok(:nuevas >= 0 and (select count(*) from alertas_nuevas()) <= :nuevas, 'RF-29 la campana lista las alertas nuevas y las marca como vistas');

reset role;
select n, case when ok then 'OK ' else 'FALLA' end r, nombre, case when not ok then detalle end from t.res order by n;
select count(*) filter (where ok) ok, count(*) filter (where not ok) fallas from t.res;
