import "server-only";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Perfil } from "@/lib/tipos";

/** Cliente con la sesión del usuario (componentes de servidor y Route Handlers). */
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Desde un componente de servidor no se pueden escribir cookies; el middleware las renueva.
          }
        },
      },
    },
  );
}

/**
 * Cliente con la clave service role: permisos totales.
 * Solo se usa en funciones de servidor para administrar cuentas; nunca llega al navegador.
 */
export function supabaseAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Perfil del usuario con sesión, verificado con Supabase. Lo usan las funciones de la API. */
export async function perfilActual(): Promise<Perfil | null> {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Perfil) ?? null;
}

/**
 * Perfil para el layout de las pantallas: el middleware ya verificó la sesión y lo dejó
 * en una cabecera interna (reemplaza cualquier valor que mande el navegador), así cada clic
 * hace un viaje menos a Supabase. Si falta, se consulta como siempre.
 * No usar en las rutas /api: ahí el middleware no fija la cabecera.
 */
export async function perfilDePantalla(): Promise<Perfil | null> {
  const desdeMiddleware = (await headers()).get("x-mass-perfil");
  if (desdeMiddleware) {
    try {
      return JSON.parse(decodeURIComponent(desdeMiddleware)) as Perfil;
    } catch {
      // Cabecera dañada: se consulta a Supabase.
    }
  }
  return perfilActual();
}
