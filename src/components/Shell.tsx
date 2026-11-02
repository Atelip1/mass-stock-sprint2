"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GRUPOS, PANTALLAS } from "@/lib/roles";
import { NOMBRE_ROL, type Perfil } from "@/lib/tipos";
import { AvisosProvider } from "./Avisos";
import { BuscadorGlobal } from "./BuscadorGlobal";
import { ConexionProvider, IndicadorConexion, useConexion } from "./Conexion";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useTema } from "@/lib/tema";
import { Campana } from "./Campana";
import { FichaProvider } from "./FichaProducto";

const PerfilCtx = createContext<Perfil | null>(null);
export function usePerfil() {
  const p = useContext(PerfilCtx);
  if (!p) throw new Error("usePerfil fuera de Shell");
  return p;
}

const INACTIVIDAD_MS = 30 * 60_000; // RNF-12
const CLAVE_ACTIVIDAD = "mass-stock:ultima-actividad";

async function cerrarSesion(motivo?: string) {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = motivo ? `/login?motivo=${motivo}` : "/login";
}

/** RNF-12: la sesión se cierra tras 30 minutos sin usar el sistema, aunque la pestaña quede abierta. */
function useCierrePorInactividad() {
  useEffect(() => {
    const leer = () => {
      try {
        return Number(localStorage.getItem(CLAVE_ACTIVIDAD) ?? Date.now());
      } catch {
        return Date.now();
      }
    };
    const marcar = () => {
      try {
        localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
      } catch {}
    };
    if (Date.now() - leer() > INACTIVIDAD_MS) {
      cerrarSesion("inactividad");
      return;
    }
    marcar();
    let ultimoGuardado = Date.now();
    const actividad = () => {
      if (Date.now() - ultimoGuardado > 15_000) {
        ultimoGuardado = Date.now();
        marcar();
      }
    };
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true }));
    const revisar = setInterval(() => {
      if (Date.now() - leer() > INACTIVIDAD_MS) cerrarSesion("inactividad");
    }, 30_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, actividad));
      clearInterval(revisar);
    };
  }, []);
}

/** Alertas activas para la insignia del menú: el reponedor ve las de percha, que son las que atiende. */
function useConteoAlertas(rol: Perfil["rol"]) {
  const { version } = useConexion();
  const [n, setN] = useState(0);
  useEffect(() => {
    let q = supabaseNavegador().from("alertas").select("id", { count: "exact", head: true }).neq("estado", "cerrado");
    if (rol === "reponedor") q = q.eq("tipo", "percha");
    q.then(({ count }: { count: number | null }) => setN(count ?? 0));
  }, [rol, version]);
  return n;
}

function Marca() {
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      {/* RNF-05: reemplazar este ícono por el logo oficial que entregue la tienda (public/logo.svg). */}
      <span className="grid size-9 place-items-center rounded-md bg-amarillo text-marca" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-white">Mass Stock</span>
        <span className="block text-[10px] text-white/70">Tienda Bolognesi · Chincha</span>
      </span>
    </div>
  );
}

function Menu({ perfil, onNavegar }: { perfil: Perfil; onNavegar?: () => void }) {
  const ruta = usePathname();
  const alertas = useConteoAlertas(perfil.rol);
  const visibles = PANTALLAS.filter((p) => p.roles.includes(perfil.rol));
  const enlace = (href: string, etiqueta: string) => {
    const actual = href === "/" ? ruta === "/" : ruta === href || ruta.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavegar}
        aria-current={actual ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${actual ? "bg-amarillo font-semibold text-tinta" : "text-white/90 hover:bg-white/10"}`}
      >
        {etiqueta}
        {href === "/reposicion" && alertas > 0 && (
          <span className="rounded-full bg-peligro px-1.5 text-[11px] font-bold text-white" aria-label={`${alertas} alertas activas`}>
            {alertas}
          </span>
        )}
      </Link>
    );
  };
  return (
    <nav className="flex flex-1 flex-col gap-4 px-3 pb-4" aria-label="Menú principal">
      <div>{visibles.filter((p) => p.grupo === null && p.href !== "/mi-cuenta").map((p) => enlace(p.href, p.etiqueta))}</div>
      {GRUPOS.map((g) => {
        const items = visibles.filter((p) => p.grupo === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">{g}</p>
            {items.map((p) => enlace(p.href, p.etiqueta))}
          </div>
        );
      })}
      <div className="mt-auto border-t border-white/15 pt-3">
        {enlace("/mi-cuenta", "Mi cuenta")}
        <button onClick={() => cerrarSesion()} className="block w-full rounded-md px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10">
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}

function MenuUsuario({ perfil }: { perfil: Perfil }) {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useTema();
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);
  const iniciales = perfil.nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="relative" ref={caja}>
      <button className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-fondo" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span className="grid size-8 place-items-center rounded-full bg-marca text-xs font-bold text-white">{iniciales}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-semibold">{perfil.nombre}</span>
          <span className="block text-xs text-suave">{NOMBRE_ROL[perfil.rol]}</span>
        </span>
      </button>
      {abierto && (
        <div className="panel absolute right-0 z-40 mt-1 w-56 py-1 shadow-lg">
          <p className="truncate border-b border-borde px-3 py-2 text-xs text-suave">{perfil.correo}</p>
          <Link href="/mi-cuenta" className="block px-3 py-2 text-sm hover:bg-fondo" onClick={() => setAbierto(false)}>
            Mi cuenta
          </Link>
          <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fondo" onClick={() => setTema(tema === "oscuro" ? "claro" : "oscuro")} role="switch" aria-checked={tema === "oscuro"}>
            Modo oscuro
            <span className={`relative h-5 w-9 rounded-full transition ${tema === "oscuro" ? "bg-azul" : "bg-borde"}`} aria-hidden>
              <span className={`absolute top-0.5 size-4 rounded-full bg-panel shadow transition-all ${tema === "oscuro" ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
          <button className="block w-full border-t border-borde px-3 py-2 text-left text-sm text-peligro hover:bg-fondo" onClick={() => cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Shell({ perfil, children }: { perfil: Perfil; children: ReactNode }) {
  const [menuMovil, setMenuMovil] = useState(false);
  const router = useRouter();
  useCierrePorInactividad();
  const cerrarMenu = useCallback(() => setMenuMovil(false), []);

  // Prefetch de las pantallas del rol para que el cambio sea inmediato.
  useEffect(() => {
    PANTALLAS.filter((p) => p.roles.includes(perfil.rol)).forEach((p) => router.prefetch(p.href));
  }, [perfil.rol, router]);

  return (
    <PerfilCtx.Provider value={perfil}>
      <AvisosProvider>
        <ConexionProvider>
          <FichaProvider>
            <div className="flex min-h-dvh">
              {/* Menú lateral en escritorio */}
              <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto bg-marca lg:flex">
                <Marca />
                <Menu perfil={perfil} />
              </aside>

              {/* Menú lateral en celular: el mismo, se abre con «Menú» (RNF-01) */}
              {menuMovil && (
                <div className="fixed inset-0 z-50 flex lg:hidden" onClick={cerrarMenu}>
                  <aside className="flex h-full w-72 max-w-[85%] flex-col overflow-y-auto bg-marca" onClick={(e) => e.stopPropagation()}>
                    <Marca />
                    <Menu perfil={perfil} onNavegar={cerrarMenu} />
                  </aside>
                  <div className="flex-1 bg-black/40" />
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-borde bg-panel px-3 py-2 sm:px-5">
                  <button className="btn-secundario px-3 lg:hidden" onClick={() => setMenuMovil(true)} aria-label="Abrir menú">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span className="hidden sm:inline">Menú</span>
                  </button>
                  <BuscadorGlobal />
                  <IndicadorConexion />
                  <Campana perfil={perfil} />
                  <MenuUsuario perfil={perfil} />
                </header>
                <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">{children}</main>
              </div>
            </div>
          </FichaProvider>
        </ConexionProvider>
      </AvisosProvider>
    </PerfilCtx.Provider>
  );
}
