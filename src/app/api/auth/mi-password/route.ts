import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";

/** RF-03: cada usuario cambia su contraseña desde «Mi cuenta»; se pide la actual. */
export async function POST(req: Request) {
  const { actual, nueva } = (await req.json().catch(() => ({}))) as { actual?: string; nueva?: string };
  if (!actual) return NextResponse.json({ mensaje: "Escribe tu contraseña actual." }, { status: 400 });
  if (!nueva || nueva.length < 8) return NextResponse.json({ mensaje: "La nueva contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  if (nueva === actual) return NextResponse.json({ mensaje: "La nueva contraseña debe ser distinta de la actual." }, { status: 400 });

  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ mensaje: "Tu sesión terminó. Vuelve a iniciar sesión." }, { status: 401 });

  // Comprueba la contraseña actual con un cliente aparte, sin tocar la sesión del navegador.
  const verificador = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: malActual } = await verificador.auth.signInWithPassword({ email: user.email, password: actual });
  if (malActual) return NextResponse.json({ mensaje: "La contraseña actual no es correcta." }, { status: 400 });
  await verificador.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) return NextResponse.json({ mensaje: "No se pudo guardar la contraseña. Inténtalo de nuevo." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
