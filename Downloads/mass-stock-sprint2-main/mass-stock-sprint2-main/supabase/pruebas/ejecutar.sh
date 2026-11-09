#!/usr/bin/env bash
# Ejecuta las pruebas de los Sprints 2 y 3 en un PostgreSQL local (no en Supabase).
# Uso: bash supabase/pruebas/ejecutar.sh   (usa PGHOST/PGPORT/PGUSER si están definidos)
set -euo pipefail
cd "$(dirname "$0")/../.."
BD=mass_stock_pruebas
psql -q -d postgres -c "drop database if exists $BD" -c "create database $BD"
P="psql -q -v ON_ERROR_STOP=1 -d $BD"
$P -f supabase/pruebas/00_simular_supabase.sql
for f in supabase/migrations/*.sql; do $P -f "$f" > /dev/null; done
$P -f supabase/seed.sql > /dev/null
psql -q -d $BD -f supabase/pruebas/01_pruebas_sprint2_y_3.sql 2>&1 | grep -E "^ *[0-9]+ \| (OK|FALLA)|^ *[0-9]+ \| +[0-9]+$" || true
