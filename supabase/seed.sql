-- =====================================================================
-- Mass Stock · Datos base
-- Categorías oficiales (Tabla 6, punto 7 del informe de avance) y
-- proveedores de ejemplo. Se ejecuta en desarrollo y en producción.
-- Los RUC son de ejemplo: el jefe de tienda debe reemplazarlos por los reales.
-- =====================================================================

insert into public.categorias (nombre) values
  ('Abarrotes'), ('Bebidas'), ('Lácteos y huevos'), ('Limpieza'), ('Cuidado personal'),
  ('Snacks y golosinas'), ('Conservas'), ('Panadería'), ('Embutidos y congelados'), ('Mascotas')
on conflict do nothing;

insert into public.proveedores (ruc, razon_social, dias_entrega) values
  ('20000000001', 'Centro de distribución Mass',   3),
  ('20000000002', 'Proveedor de bebidas (ejemplo)', 2),
  ('20000000003', 'Proveedor de panificados (ejemplo)', 1)
on conflict (ruc) do nothing;
