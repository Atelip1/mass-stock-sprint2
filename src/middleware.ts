import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { puedeAbrir } from "@/lib/roles";
import type { Rol } from "@/lib/tipos";

/**
 * Se ejecuta antes de cada pantalla:
 * - renueva la sesión de Supabase,
 * - sin sesión, envía al inicio de sesión (RF-01),
 * - con contraseña temporal, obliga a cambiarla (RF-03),
 * - si el rol no puede ver la pantalla, muestra «Sin acceso» (RF-02).
 * Los permisos reales se validan otra vez en la base de datos (RLS, RNF-13).
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          lista.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ruta = req.nextUrl.pathname;

  // Las funciones de servidor validan su propio acceso.
  if (ruta.startsWith("/api/")) return res;

  const redirigir = (destino: string) => {
    const url = req.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    const r = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (ruta === "/login") {
    return user ? redirigir("/") : res;
  }
  if (!user) return redirigir("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, activo, debe_cambiar_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?motivo=desactivado";
    return NextResponse.redirect(url);
  }

  if (perfil.debe_cambiar_password && ruta !== "/cambiar-password") return redirigir("/cambiar-password");
  if (!perfil.debe_cambiar_password && ruta === "/cambiar-password") return redirigir("/");

  if (!puedeAbrir(ruta, perfil.rol as Rol)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sin-acceso";
    const r = NextResponse.rewrite(url);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
