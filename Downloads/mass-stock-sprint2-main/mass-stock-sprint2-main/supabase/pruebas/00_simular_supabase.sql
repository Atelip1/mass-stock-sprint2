-- =====================================================================
-- Mass Stock · Pruebas · Paso 1: simular Supabase en un PostgreSQL local
-- SOLO para un PostgreSQL de pruebas (NO en Supabase: allí auth y los roles ya existen).
-- Orden: 00_simular_supabase.sql → migraciones → seed.sql → 01_pruebas_sprint2_y_3.sql
-- =====================================================================
do $r$ begin if not exists (select 1 from pg_roles where rolname=$$anon$$) then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $r$;
create schema extensions; create schema auth;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

