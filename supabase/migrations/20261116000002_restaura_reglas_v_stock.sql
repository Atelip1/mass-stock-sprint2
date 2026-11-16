-- =====================================================================
-- Mass Stock · Restaura las reglas de v_stock perdidas en 20261108000001
-- Al agregar el proveedor a v_stock se perdieron dos cosas del esquema inicial:
-- 1. security_invoker = true: sin ella la vista se salta RLS y el stock se podía
--    leer con la clave pública, sin iniciar sesión.
-- 2. RN-10: un lote vencido (desde el día siguiente a su fecha) no suma al stock;
--    sin el filtro, al vencer un lote no saltaba la alerta crítica.
-- Conserva las columnas del proveedor. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace view public.v_stock with (security_invoker = true) as
with e as (
  select l.producto_id,
         sum(case when x.ubicacion = 'almacen' then x.cantidad else 0 end)::int as almacen,
         sum(case when x.ubicacion = 'percha' then x.cantidad else 0 end)::int  as percha,
         min(case when x.cantidad > 0 then l.fecha_vencimiento end) as proximo_vencimiento
    from public.existencias x
    join public.lotes l on l.id = x.lote_id
   -- RN-10: un lote vencido no suma al stock.
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
       end as estado_percha,
       p.proveedor_id,
       prov.razon_social   as proveedor,
       prov.ruc            as proveedor_ruc
  from public.productos p
  join public.categorias c on c.id = p.categoria_id
  left join public.proveedores prov on prov.id = p.proveedor_id
  cross join crit
  left join e on e.producto_id = p.id;

-- Recalcula las alertas con el stock corregido (los lotes vencidos ya no cuentan).
select public.refrescar_alertas();
