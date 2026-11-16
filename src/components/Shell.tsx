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
import { ICONO_RUTA, Icono, LogoMassStock } from "./Iconos";

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
    <div className="flex items-center gap-3 px-5 pt-5 pb-4">
      {/* RNF-05: reemplazar este ícono por el logo oficial que entregue la tienda (public/logo.svg). */}
      <LogoMassStock tamano="md" />
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-tight text-white">
          Mass <span className="text-amarillo">Stock</span>
        </span>
        <span className="block text-[11px] text-white/65">Tienda Bolognesi · Chincha</span>
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
        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
          actual ? "bg-amarillo font-bold text-tinta shadow-[0_8px_20px_-10px_rgb(255_209_0/0.9)]" : "text-white/85 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icono nombre={ICONO_RUTA[href] ?? "cubo"} className={`size-[18px] shrink-0 ${actual ? "text-marca" : "text-white/60 group-hover:text-amarillo"}`} trazo={2} />
        <span className="flex-1 truncate">{etiqueta}</span>
        {href === "/reposicion" && alertas > 0 && (
          <span className="min-w-5 rounded-full bg-peligro px-1.5 text-center text-[11px] leading-5 font-bold text-white" aria-label={`${alertas} alertas activas`}>
            {alertas}
          </span>
        )}
      </Link>
    );
  };
  return (
    <nav className="flex flex-1 flex-col gap-5 px-3 pb-4" aria-label="Menú principal">
      <div>{visibles.filter((p) => p.grupo === null && p.href !== "/mi-cuenta").map((p) => enlace(p.href, p.etiqueta))}</div>
      {GRUPOS.map((g) => {
        const items = visibles.filter((p) => p.grupo === g);
        if (!items.length) return null;
        return (
          <div key={g} className="space-y-0.5">
            <p className="px-3 pb-1 text-[10.5px] font-bold tracking-[0.12em] text-white/45 uppercase">{g}</p>
            {items.map((p) => enlace(p.href, p.etiqueta))}
          </div>
        );
      })}
      <div className="mt-auto space-y-0.5 border-t border-white/10 pt-3">
        {enlace("/mi-cuenta", "Mi cuenta")}
        <button
          onClick={() => cerrarSesion()}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          <Icono nombre="salir" className="size-[18px] text-white/60 group-hover:text-amarillo" />
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
      <button className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-fondo" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-marca to-marca-profundo text-xs font-bold text-white ring-2 ring-amarillo/70">{iniciales}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-semibold">{perfil.nombre}</span>
          <span className="block text-xs text-suave">{NOMBRE_ROL[perfil.rol]}</span>
        </span>
      </button>
      {abierto && (
        <div className="panel absolute right-0 z-40 mt-2 w-60 animate-entrar overflow-hidden py-1 shadow-elevada">
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
        <ConexionProvider usuarioId={perfil.id}>
          <FichaProvider>
            <div className="flex min-h-dvh">
              {/* Menú lateral en escritorio */}
              <aside className="fondo-marca sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto lg:flex">
                <Marca />
                <Menu perfil={perfil} />
              </aside>

              {/* Menú lateral en celular: el mismo, se abre con «Menú» (RNF-01) */}
              {menuMovil && (
                <div className="fixed inset-0 z-50 flex lg:hidden" onClick={cerrarMenu}>
                  <aside className="fondo-marca flex h-full w-72 max-w-[85%] animate-entrar flex-col overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <Marca />
                    <Menu perfil={perfil} onNavegar={cerrarMenu} />
                  </aside>
                  <div className="flex-1 bg-tinta/50 backdrop-blur-[2px]" />
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-borde/80 bg-panel/85 px-3 py-2.5 shadow-[0_1px_0_rgb(16_24_40/0.02)] backdrop-blur-lg sm:gap-3 sm:px-6">
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
                <main className="mx-auto w-full max-w-7xl flex-1 animate-entrar px-4 py-6 sm:px-8">{children}</main>
              </div>
            </div>
          </FichaProvider>
        </ConexionProvider>
      </AvisosProvider>
    </PerfilCtx.Provider>
  );
}
