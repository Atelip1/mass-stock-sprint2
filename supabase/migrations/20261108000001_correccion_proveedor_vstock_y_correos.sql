-- =====================================================================
-- Mass Stock · Migración de actualización Sprint 3
-- 1. Soporte de expiración de clave temporal a 15 minutos en perfiles.
-- 2. Inclusión del Proveedor en v_stock (RF-11, RF-34).
-- =====================================================================

-- 1. Agregar columna de expiración para claves temporales (15 minutos)
alter table public.perfiles
  add column if not exists temporal_expira_en timestamptz;

-- 2. Actualizar v_stock para incorporar los datos del proveedor
-- Al recrear v_stock, se conservan los tipos y columnas existentes agregando proveedor al final.
drop function if exists public.buscar_productos(text, int);
drop view if exists public.v_stock cascade;

create or replace view public.v_stock as
with e as (
  select l.producto_id,
         sum(case when x.ubicacion = 'almacen' then x.cantidad else 0 end)::int as almacen,
         sum(case when x.ubicacion = 'percha' then x.cantidad else 0 end)::int  as percha,
         min(case when x.cantidad > 0 and public.lote_vigente(l.fecha_vencimiento) then l.fecha_vencimiento end) as proximo_vencimiento
    from public.existencias x
    join public.lotes l on l.id = x.lote_id
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

-- Restaurar buscador global sobre la vista actualizada
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

-- Permisos
grant select on public.v_stock to anon, authenticated;
grant execute on function public.buscar_productos(text, int) to anon, authenticated;
