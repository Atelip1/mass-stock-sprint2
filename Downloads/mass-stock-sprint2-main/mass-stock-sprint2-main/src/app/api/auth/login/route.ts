import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
const GENERICO = "Correo o contraseña incorrectos.";

/** RF-01: inicio de sesión con bloqueo temporal tras 5 intentos fallidos y control de expiración de clave temporal. */
export async function POST(req: Request) {
  const { correo, password } = (await req.json().catch(() => ({}))) as { correo?: string; password?: string };
  const email = (correo ?? "").trim().toLowerCase();
  if (!email || !password) {
    return NextResponse.json({ mensaje: "Escribe tu correo y tu contraseña." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: perfil } = await admin
    .from("perfiles")
    .select("*")
    .eq("correo", email)
    .maybeSingle();

  if (perfil?.bloqueado_hasta && new Date(perfil.bloqueado_hasta) > new Date()) {
    return NextResponse.json(
      {
        mensaje: `Cuenta bloqueada temporalmente por ${MAX_INTENTOS} intentos fallidos. Espera ${MINUTOS_BLOQUEO} minutos o pide al administrador que restablezca tu contraseña.`,
        bloqueado: true,
      },
      { status: 423 },
    );
  }

  const supabase = await supabaseServidor();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (!perfil) return NextResponse.json({ mensaje: GENERICO }, { status: 401 });
    const intentos = perfil.intentos_fallidos + 1;
    if (intentos >= MAX_INTENTOS) {
      await admin
        .from("perfiles")
        .update({ intentos_fallidos: 0, bloqueado_hasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60_000).toISOString() })
        .eq("id", perfil.id);
      return NextResponse.json(
        {
          mensaje: `Cuenta bloqueada temporalmente por ${MAX_INTENTOS} intentos fallidos. Espera ${MINUTOS_BLOQUEO} minutos o pide al administrador que restablezca tu contraseña.`,
          bloqueado: true,
        },
        { status: 423 },
      );
    }
    await admin.from("perfiles").update({ intentos_fallidos: intentos }).eq("id", perfil.id);
    const quedan = MAX_INTENTOS - intentos;
    return NextResponse.json(
      { mensaje: `${GENERICO} Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`} antes del bloqueo temporal.` },
      { status: 401 },
    );
  }

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return NextResponse.json({ mensaje: "Tu cuenta está desactivada. Habla con el administrador de la tienda." }, { status: 403 });
  }

  // Validación de seguridad de contraseña temporal (15 minutos)
  // Lee desde user_metadata de Auth o desde el perfil si la columna existe
  const expiraRaw = authData?.user?.user_metadata?.temporal_expira_en || (perfil as Record<string, unknown>).temporal_expira_en;
  if (perfil.debe_cambiar_password && expiraRaw) {
    const ahora = new Date();
    const expira = new Date(String(expiraRaw));
    if (ahora > expira) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          mensaje: "Tu contraseña temporal de 15 minutos ha expirado por seguridad. Solicita al administrador que restablezca tu acceso.",
        },
        { status: 403 },
      );
    }
  }

  await admin
    .from("perfiles")
    .update({ intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: new Date().toISOString() })
    .eq("id", perfil.id);

  return NextResponse.json({ ok: true });
}
