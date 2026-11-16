-- =====================================================================
-- Mass Stock · Observaciones en la reposición (RF-21 del documento de requisitos)
-- registrar_reposicion devuelve el id del movimiento; esta función le agrega
-- la observación que escribió el reponedor. No cambia stock ni lotes.
-- Solo el autor, solo reposiciones no anuladas y solo durante 15 minutos.
-- Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.anotar_movimiento(p_movimiento uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nota text := btrim(coalesce(p_nota, ''));
  v_mov  public.movimientos%rowtype;
begin
  if v_nota = '' then return; end if;
  if length(v_nota) > 200 then
    raise exception 'La observación puede tener hasta 200 caracteres.';
  end if;
  select * into v_mov from public.movimientos where id = p_movimiento;
  if not found or v_mov.usuario_id is distinct from auth.uid() then
    raise exception 'Solo puedes anotar tus propias reposiciones.' using errcode = '42501';
  end if;
  if v_mov.tipo <> 'reposicion' or v_mov.anulado then
    raise exception 'Solo se anotan reposiciones vigentes.';
  end if;
  if v_mov.creado_en < now() - interval '15 minutes' then
    raise exception 'La observación se agrega al registrar la reposición.';
  end if;
  update public.movimientos
     set detalle = concat_ws(' · ', nullif(detalle, ''), 'Obs.: ' || v_nota)
   where id = p_movimiento;
end $$;

revoke all on function public.anotar_movimiento(uuid, text) from public, anon;
grant execute on function public.anotar_movimiento(uuid, text) to authenticated;
