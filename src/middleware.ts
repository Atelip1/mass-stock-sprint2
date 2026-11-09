import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { puedeAbrir } from "@/lib/roles";
import type { Rol } from "@/lib/tipos";

/** Cabecera interna con el perfil ya leído aquí, para que el layout no lo vuelva a pedir a Supabase. */
export const CABECERA_PERFIL = "x-mass-perfil";

/**
 * Se ejecuta antes de cada pantalla:
 * - renueva la sesión de Supabase y verifica el token (getClaims),
 * - sin sesión, envía al inicio de sesión (RF-01),
 * - con contraseña temporal, obliga a cambiarla (RF-03),
 * - si el rol no puede ver la pantalla, muestra «Sin acceso» (RF-02),
 * - pasa el perfil al layout en una cabecera interna (un viaje a Supabase menos por clic).
 * Los permisos reales se validan otra vez en la base de datos (RLS, RNF-13).
 */
export async function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  // Nadie puede enviar esta cabecera desde afuera.
  req.headers.delete(CABECERA_PERFIL);

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

  // getClaims verifica el token sin ir al servidor cuando el proyecto usa llaves asimétricas;
  // si no, consulta a Supabase Auth igual que getUser.
  const { data } = await supabase.auth.getClaims();
  const usuarioId = (data?.claims?.sub as string | undefined) ?? null;

  // Las funciones de servidor validan su propio acceso.
  if (ruta.startsWith("/api/")) return res;

  const conCookies = (r: NextResponse) => {
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  const redirigir = (destino: string, busqueda = "") => {
    const url = req.nextUrl.clone();
    url.pathname = destino;
    url.search = busqueda;
    return conCookies(NextResponse.redirect(url));
  };

  if (ruta === "/login") return usuarioId ? redirigir("/") : res;
  if (!usuarioId) return redirigir("/login");

  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", usuarioId).maybeSingle();

  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    return redirigir("/login", "?motivo=desactivado");
  }
  if (perfil.debe_cambiar_password && ruta !== "/cambiar-password") return redirigir("/cambiar-password");
  if (!perfil.debe_cambiar_password && ruta === "/cambiar-password") return redirigir("/");

  const cabeceras = new Headers(req.headers);
  cabeceras.set(CABECERA_PERFIL, encodeURIComponent(JSON.stringify(perfil)));

  if (!puedeAbrir(ruta, perfil.rol as Rol)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sin-acceso";
    return conCookies(NextResponse.rewrite(url, { request: { headers: cabeceras } }));
  }
  return conCookies(NextResponse.next({ request: { headers: cabeceras } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
