import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServidor } from "@/lib/supabase/server";

/** RF-03: en el primer ingreso (o tras un restablecimiento) el usuario crea su propia contraseña. */
export async function POST(req: Request) {
  const { nueva } = (await req.json().catch(() => ({}))) as { nueva?: string };
  if (!nueva || nueva.length < 8) {
    return NextResponse.json({ mensaje: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ mensaje: "Tu sesión terminó. Vuelve a iniciar sesión." }, { status: 401 });

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    const mismo = /different from the old|same/i.test(error.message);
    return NextResponse.json(
      { mensaje: mismo ? "Elige una contraseña distinta de la temporal." : "No se pudo guardar la contraseña. Inténtalo de nuevo." },
      { status: 400 },
    );
  }

  await supabaseAdmin()
    .from("perfiles")
    .update({ debe_cambiar_password: false, ultimo_acceso: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
