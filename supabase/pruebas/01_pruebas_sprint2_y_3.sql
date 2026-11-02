-- =====================================================================
-- Mass Stock · Pruebas de aceptación de los Sprints 2 y 3 (71 casos)
-- Prueba las funciones, la RLS por rol y las alertas llamando a la base como lo hace la API.
-- Cada caso se registra en t.res; al final se listan los resultados (OK / FALLA).
-- Uso (PostgreSQL 15+ local, base vacía):
--   Orden: 00_simular_supabase.sql → supabase/migrations/*.sql → supabase/seed.sql → este archivo.
--   Más simple: bash supabase/pruebas/ejecutar.sh
-- =====================================================================
create schema t; grant usage on schema t to authenticated, anon;
create table t.res (n serial, ok boolean, nombre text, detalle text); grant all on t.res to authenticated, anon; grant all on sequence t.res_n_seq to authenticated, anon;
create function t.ok(c boolean, nombre text, detalle text default null) returns void language plpgsql as $$
begin insert into t.res(ok,nombre,detalle) values (coalesce(c,false), nombre, detalle); end $$;
-- ejecuta sql y espera error que contenga patrón
create function t.err(q text, pat text, nombre text) returns void language plpgsql as $$
begin
  begin execute q; insert into t.res(ok,nombre,detalle) values (false, nombre, 'NO falló');
  exception when others then insert into t.res(ok,nombre,detalle) values (sqlerrm ilike '%'||pat||'%', nombre, sqlerrm); end;
end $$;
grant execute on all functions in schema t to authenticated, anon;

-- Usuarios de prueba: un administrador, un supervisor y dos reponedores.
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','admin@m'),('00000000-0000-0000-0000-00000000000b','sup@m'),
 ('00000000-0000-0000-0000-00000000000c','rep@m'),('00000000-0000-0000-0000-00000000000d','rep2@m');
insert into public.perfiles(id,nombre,correo,rol,debe_cambiar_password) values
 ('00000000-0000-0000-0000-00000000000a','Admin','admin@m','administrador',false),
 ('00000000-0000-0000-0000-00000000000b','Super','sup@m','supervisor',false),
 ('00000000-0000-0000-0000-00000000000c','Repo','rep@m','reponedor',false),
 ('00000000-0000-0000-0000-00000000000d','Repo2','rep2@m','reponedor',false);

\set A '''00000000-0000-0000-0000-00000000000a'''
\set S '''00000000-0000-0000-0000-00000000000b'''
\set R '''00000000-0000-0000-0000-00000000000c'''
\set R2 '''00000000-0000-0000-0000-00000000000d'''
set role authenticated;

-- ================= SPRINT 2 =================
-- RF-06 / RN-01 / RN-03 catálogo (admin)
set request.jwt.claim.sub = :A;
select t.err($$insert into productos(codigo_barras,nombre,categoria_id,proveedor_id,unidad,stock_minimo,minimo_percha) select '7751271005679','X',(select id from categorias where nombre='Bebidas'),(select id from proveedores limit 1),'unidad',5,3$$,'no es un EAN','RF-06 rechaza EAN con dígito verificador malo');
insert into productos(codigo_barras,nombre,categoria_id,proveedor_id,unidad,stock_minimo,minimo_percha,controla_vencimiento)
select c, n, (select id from categorias where nombre=cat), (select id from proveedores where ruc='20000000001'), 'botella', mi, mp, v from (values
 ('775000000001'||ean_digito('775000000001'),'Aceite Primor 1L','Abarrotes',12,8,true),
 ('775000000002'||ean_digito('775000000002'),'Cerveza Pilsen 620ml','Bebidas',24,10,true),
 ('775000000003'||ean_digito('775000000003'),'Detergente Bolívar 800g','Limpieza',10,6,false)) x(c,n,cat,mi,mp,v);
select t.ok((select count(*) from productos)=3,'RF-06 admin registra productos');
select t.err($$insert into productos(codigo_barras,nombre,categoria_id,proveedor_id,unidad,stock_minimo,minimo_percha) select codigo_barras,'Dup',categoria_id,proveedor_id,'unidad',5,3 from productos limit 1$$,'ya pertenece','RN-01 código duplicado entre activos');
select t.ok(ean_valido(generar_codigo_interno()) and generar_codigo_interno() like '20%','RN-03 genera código interno 20 válido');
select t.ok(exists(select 1 from categorias_parecidas('bebibles') where nombre='Bebidas'),'RF-09 «bebibles» sugiere Bebidas');
select t.ok((select count(*) from categorias_parecidas('Limpiezas'))>=1,'RF-09 «Limpiezas» sugiere Limpieza');
-- RF-08 editar y desactivar
update productos set stock_minimo=12 where nombre='Aceite Primor 1L';
select t.ok((select stock_minimo from productos where nombre='Aceite Primor 1L')=12,'RF-08 admin edita producto');
delete from productos; -- sin política DELETE: RLS lo deja en 0 filas
select t.ok((select count(*) from productos)=3,'RNF-15 DELETE no borró filas');

-- Permisos catálogo con otros roles (RNF-13)
set request.jwt.claim.sub = :R;
select t.err($$insert into productos(codigo_barras,nombre,categoria_id,proveedor_id,unidad,stock_minimo,minimo_percha) select '775000000099'||ean_digito('775000000099'),'Y',categoria_id,proveedor_id,'unidad',5,3 from productos limit 1$$,'row-level security','RNF-13 reponedor no crea productos');
update productos set stock_minimo=1;
select t.ok((select min(stock_minimo) from productos)>1,'RNF-13 reponedor no edita productos (0 filas)');
select t.err($$select generar_codigo_interno()$$,'Solo el administrador','RNF-13 reponedor no genera código interno');
set request.jwt.claim.sub = :S;
update productos set stock_minimo=1;
select t.ok((select min(stock_minimo) from productos)>1,'RNF-13 supervisor solo consulta catálogo');
select t.ok((select count(*) from productos)=3,'RF-02 supervisor sí lee catálogo');

-- RF-14 / RF-15 ingreso por guía
set request.jwt.claim.sub = :R;
select registrar_ingreso('G-001',(select id from proveedores where ruc='20000000001'), jsonb_build_array(
  jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',20,'lote','l-a1','vencimiento',(hoy()+5)::text,'zona','A-1'),
  jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',10,'lote','L-A2','vencimiento',(hoy()+60)::text,'zona','A-2'),
  jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',30,'lote','C1','vencimiento',(hoy()+90)::text,'zona','B-1')));
select t.ok((select almacen from v_stock where nombre like 'Aceite%')=30 and (select percha from v_stock where nombre like 'Aceite%')=0,'RF-14 ingreso de varias líneas suma al almacén');
select t.ok(exists(select 1 from lotes where codigo_lote='L-A1' and zona_almacen='A-1'),'RF-15 guarda lote (en mayúsculas), vencimiento y zona');
select t.err($$select registrar_ingreso('G-002',(select id from proveedores limit 1), jsonb_build_array(
  jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',5,'lote','C9','vencimiento',(hoy()+30)::text,'zona','B-1'),
  jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',0,'lote','X','vencimiento',(hoy()+30)::text,'zona','A-1')))$$,'Línea 2','RNF-03 error indica la línea que falla');
select t.ok(not exists(select 1 from lotes where codigo_lote='C9'),'RF-14 si una línea falla no se guarda ninguna');
select t.err($$select registrar_ingreso('G-3',(select id from proveedores limit 1), jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',5,'lote','X1','vencimiento',(hoy()-1)::text,'zona','A-1')))$$,'ya pasó','RF-15 rechaza lote vencido');
select t.err($$select registrar_ingreso('G-3',(select id from proveedores limit 1), jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',5,'lote','X1','zona','A-1')))$$,'controla vencimiento','RF-15 exige vencimiento si el producto lo controla');
select t.err($$select registrar_ingreso('G-3',(select id from proveedores limit 1), jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',5,'lote','X1','vencimiento',(hoy()+9)::text,'zona','Z-9')))$$,'zona','RF-15 zona debe ser de la lista');
select t.err($$select registrar_ingreso('',(select id from proveedores limit 1), '[]')$$,'guía','RF-14 exige número de guía');
update existencias set cantidad=999; -- sin política UPDATE: 0 filas
select t.ok((select max(cantidad) from existencias)<999,'RNF-13 update directo a existencias no tuvo efecto');
select t.ok((select usuario_id from movimientos where guia_remision='G-001')=:R::uuid,'RNF-14 el movimiento guarda el usuario del token');
set request.jwt.claim.sub = :S;
select t.err($$select registrar_ingreso('G-9',(select id from proveedores limit 1), jsonb_build_array(jsonb_build_object('producto_id',(select id from productos limit 1),'cantidad',1,'lote','S','vencimiento',(hoy()+9)::text,'zona','A-1')))$$,'Tu rol no puede','RNF-13 supervisor no registra ingresos');
reset role;
set role anon; set request.jwt.claim.sub = '';
select t.err($$select registrar_ingreso('G',null,'[]')$$,'permission denied','RNF-13 anónimo no ejecuta funciones');
select t.ok((select count(*) from productos)=0,'RNF-13 anónimo no lee productos');
reset role; set role authenticated;

-- RF-12 buscador
set request.jwt.claim.sub = :R;
select t.ok(exists(select 1 from buscar_productos('bolivar') where nombre like 'Detergente%'),'RF-12 busca sin tildes');
select t.ok(exists(select 1 from buscar_productos('ACEITE 1l') where nombre like 'Aceite%'),'RF-12 busca por palabras parciales / mayúsculas');
select t.ok(exists(select 1 from buscar_productos((select codigo_barras from productos where nombre like 'Cerveza%')) where nombre like 'Cerveza%'),'RF-12 busca por código de barras');
select t.ok(exists(select 1 from buscar_productos('l-a2') where nombre like 'Aceite%'),'RF-12 busca por lote');

-- ================= SPRINT 3 =================
-- RF-23 alertas tras ingreso: aceite total 30 > min 12 → sin alerta de abastecimiento, percha 0 → alerta vacía
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='percha' and nivel='vacia' and estado='pendiente'),'RF-23 alerta de percha vacía');
select t.ok(not exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='abastecimiento' and estado<>'cerrado'),'RF-23 sin alerta de abastecimiento si supera el mínimo');
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Detergente%') and tipo='abastecimiento' and nivel='sin_stock'),'RF-23 alerta sin stock para producto sin ingresos');
select t.ok(exists(select 1 from quiebres where producto_id=(select id from productos where nombre like 'Aceite%') and fin is null),'RN-18 registra quiebre de percha');

-- RF-24 / RF-25 alertas ordenadas y tomar alerta
select t.ok((select nivel from alertas_activas() limit 1) in ('sin_stock','vacia'),'RF-24 alertas ordenadas: lo más grave primero');
select tomar_alerta((select id from alertas where tipo='percha' and estado='pendiente' and producto_id=(select id from productos where nombre like 'Aceite%')));
select t.ok((select estado from alertas where tipo='percha' and producto_id=(select id from productos where nombre like 'Aceite%') and estado<>'cerrado')='en_reposicion','RF-25/27 tomar alerta → En reposición');

-- RF-16 reposición
select registrar_reposicion((select id from productos where nombre like 'Aceite%'),(select id from lotes where codigo_lote='L-A1'),9);
select t.ok((select almacen from v_stock where nombre like 'Aceite%')=21 and (select percha from v_stock where nombre like 'Aceite%')=9 and (select total from v_stock where nombre like 'Aceite%')=30,'RF-16 traslado almacén→percha sin cambiar el total');
select t.ok(exists(select 1 from alertas where tipo='percha' and producto_id=(select id from productos where nombre like 'Aceite%') and estado='cerrado' and repuesta_en is not null),'RF-27/RN-09 percha sobre su mínimo: alerta Repuesta y cerrada');
select t.ok(not exists(select 1 from quiebres where producto_id=(select id from productos where nombre like 'Aceite%') and fin is null),'RN-18 quiebre cerrado al reponer');
select t.err($$select registrar_reposicion((select id from productos where nombre like 'Aceite%'),(select id from lotes where codigo_lote='L-A1'),100)$$,'Corrige la cantidad','RF-16 no traslada más de lo que hay');
set request.jwt.claim.sub = :S;
select t.err($$select registrar_reposicion((select id from productos where nombre like 'Aceite%'),(select id from lotes where codigo_lote='L-A1'),1)$$,'Tu rol','RNF-13 supervisor no repone');
set request.jwt.claim.sub = :R;

-- RF-17 salida de varios productos, venta por FEFO
select registrar_reposicion((select id from productos where nombre like 'Aceite%'),(select id from lotes where codigo_lote='L-A2'),5);
select registrar_reposicion((select id from productos where nombre like 'Cerveza%'),(select id from lotes where codigo_lote='C1'),15);
select registrar_salida('venta','Caja 1', jsonb_build_array(
 jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',11),
 jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',3)));
select t.ok((select cantidad from existencias x join lotes l on l.id=x.lote_id where l.codigo_lote='L-A1' and ubicacion='percha')=0
        and (select cantidad from existencias x join lotes l on l.id=x.lote_id where l.codigo_lote='L-A2' and ubicacion='percha')=3,'RF-17/RN-11 venta descuenta de percha por FEFO (vence antes primero)');
select t.ok((select count(*) from movimientos where tipo='salida' and motivo='venta')=1,'RF-17 varias líneas en un solo registro');
select t.err($$select registrar_salida('venta',null, jsonb_build_array(
 jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',1),
 jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',500)))$$,'Línea 2','RF-17 indica la línea sin stock');
select t.ok((select percha from v_stock where nombre like 'Cerveza%')=12,'RF-17 si una línea falla no se descuenta ninguna');
select registrar_salida('merma','Botella rota', jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',2,'lote_id',(select id from lotes where codigo_lote='C1'),'ubicacion','almacen')));
select t.ok((select almacen from v_stock where nombre like 'Cerveza%')=13,'RF-17 merma descuenta lote y ubicación indicados');
select t.err($$select registrar_salida('merma',null, jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Cerveza%'),'cantidad',1)))$$,'lote es obligatorio','RF-17 merma exige lote');
select t.err($$select registrar_salida('regalo',null,'[]')$$,'motivo','RF-17 motivo válido');

-- RF-23 alerta de abastecimiento al bajar del mínimo y nivel crítico
select registrar_salida('merma','prueba', jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Aceite%'),'cantidad',8,'lote_id',(select id from lotes where codigo_lote='L-A1'),'ubicacion','almacen')));
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='abastecimiento' and estado='pendiente' and nivel='preventiva'),'RF-23 alerta de abastecimiento al bajar del mínimo (11 ≤ 12)');
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='percha' and estado='pendiente' and nivel='por_reponer'),'RF-23 alerta de percha por reponer');
select t.ok((select count(*) from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='percha' and estado<>'cerrado')=1,'RN-09 una sola alerta activa por producto y tipo');

-- RF-18 conteo
create temp table c1 as select registrar_conteo((select id from productos where nombre like 'Cerveza%'),'percha',10,'faltan 2') id;
select t.ok((select estado from ajustes where id=(select id from c1))='pendiente','RF-18 conteo con diferencia queda pendiente');
select t.ok((select percha from v_stock where nombre like 'Cerveza%')=12,'RN-13 el conteo no cambia el stock');
select t.err($$select registrar_conteo((select id from productos where nombre like 'Cerveza%'),'percha',9)$$,'pendiente de aprobación','RF-18 no duplica conteo pendiente');
create temp table c2 as select registrar_conteo((select id from productos where nombre like 'Cerveza%'),'almacen',13) id;
select t.ok((select estado from ajustes where id=(select id from c2))='sin_diferencia','RF-18 conteo igual queda sin diferencia');
set request.jwt.claim.sub = :S;
select t.err($$select registrar_conteo((select id from productos where nombre like 'Aceite%'),'percha',1)$$,'Tu rol no registra conteos','RNF-13 supervisor no registra conteos');

-- RF-24 visible para supervisor y RF-27 seguimiento
select t.ok((select count(*) from alertas_activas())>=3,'RF-24 supervisor ve alertas activas');
select t.ok((select count(*) from seguimiento_reposiciones(7) where estado='cerrado')>=1 and (select count(*) from seguimiento_reposiciones(7) where estado='pendiente')>=1,'RF-27 seguimiento muestra activas y cerradas con horas');
select t.err($$select tomar_alerta((select id from alertas where tipo='percha' and estado='pendiente' limit 1))$$,'Tu rol','RNF-13 supervisor no toma alertas de percha');

-- RF-13 ficha: datos de producto, lotes, movimientos y alertas legibles
set request.jwt.claim.sub = :R;
select t.ok((select count(*) from lotes where producto_id=(select id from productos where nombre like 'Aceite%'))=2,'RF-13 ficha: lotes del producto');

-- RF-30 vencimientos
select t.ok(exists(select 1 from v_vencimientos where codigo_lote='L-A1'),'RF-30 lote que vence en 5 días aparece como por vencer');
select t.ok(not exists(select 1 from v_vencimientos where codigo_lote='C1'),'RF-30 lote a 90 días no aparece');

-- RF-36 historial: reponedor ve solo lo suyo
set request.jwt.claim.sub = :A;
select registrar_ingreso('G-ADM',(select id from proveedores where ruc='20000000001'), jsonb_build_array(jsonb_build_object('producto_id',(select id from productos where nombre like 'Detergente%'),'cantidad',4,'lote','D1','zona','C-1')));
select t.ok(exists(select 1 from v_historial where guia_remision='G-ADM') and exists(select 1 from v_historial where guia_remision='G-001'),'RF-36 admin ve todo el historial');
set request.jwt.claim.sub = :S;
select t.ok(exists(select 1 from v_historial where guia_remision='G-ADM') and exists(select 1 from v_historial where guia_remision='G-001'),'RF-36 supervisor ve todo el historial');
set request.jwt.claim.sub = :R;
select t.ok(not exists(select 1 from v_historial where guia_remision='G-ADM') and exists(select 1 from v_historial where guia_remision='G-001'),'RF-36 reponedor ve solo sus registros');
set request.jwt.claim.sub = :R2;
select t.ok((select count(*) from v_historial)=0,'RF-36 otro reponedor no ve registros ajenos');
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Detergente%') and tipo='abastecimiento' and estado='repuesto'),'RN-09 ingreso deja la alerta de abastecimiento «Repuesto» (aún bajo mínimo)');

reset role;
-- RN-10 lote vencido no suma: simular vencimiento
update lotes set fecha_vencimiento = hoy()-1 where codigo_lote='L-A2';
select t.ok((select total from v_stock where nombre like 'Aceite%')=3,'RN-10 lote vencido no suma al stock (solo quedan 3 de L-A1)');
set role authenticated; set request.jwt.claim.sub = :R;
select t.err($$select registrar_reposicion((select id from productos where nombre like 'Aceite%'),(select id from lotes where codigo_lote='L-A2'),1)$$,'venció','RF-16 no pone en percha un lote vencido');
select t.ok(exists(select 1 from v_vencimientos where codigo_lote='L-A2' and dias<0),'RF-30 lote vencido aparece en vencimientos');
select refrescar_alertas();
select t.ok(exists(select 1 from alertas where producto_id=(select id from productos where nombre like 'Aceite%') and tipo='abastecimiento' and estado<>'cerrado' and nivel='critica'),'RF-23 al vencer un lote la alerta pasa a crítica (refrescar_alertas)');
reset role;
select n, case when ok then 'OK ' else 'FALLA' end r, nombre, case when not ok then detalle end from t.res order by n;
select count(*) filter (where ok) ok, count(*) filter (where not ok) fallas from t.res;
