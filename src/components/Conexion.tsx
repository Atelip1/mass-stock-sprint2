"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase/client";
import { hora } from "@/lib/formato";

type Estado = "conectado" | "reconectando" | "sin_conexion";

type Ctx = {
  estado: Estado;
  /** Aumenta cada vez que cambian las existencias o el catálogo; las pantallas recargan sus datos al verlo cambiar. */
  version: number;
  ultimaActualizacion: Date | null;
  marcarActualizado: () => void;
  causa: string | null;
  reintentar: () => void;
};

const ConexionCtx = createContext<Ctx | null>(null);

/**
 * Canal de Supabase Realtime compartido por toda la aplicación (RF-34, RF-35, RNF-18).
 * Si no conecta en 10 s, muestra la causa y el botón «Reintentar».
 */
export function ConexionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>("reconectando");
  const [version, setVersion] = useState(0);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [causa, setCausa] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const canal = useRef<RealtimeChannel | null>(null);
  const estadoRef = useRef<Estado>("reconectando");
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    const supabase = supabaseNavegador();
    let activo = true;
    setEstado("reconectando");
    setCausa(null);

    const limite = setTimeout(() => {
      if (!activo) return;
      if (estadoRef.current === "conectado") return;
      setCausa(navigator.onLine ? "El servidor no responde." : "El dispositivo no tiene internet.");
      setEstado("sin_conexion");
    }, 10_000);

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (!activo) return;
      canal.current = supabase
        .channel("mass-stock")
        .on("postgres_changes", { event: "*", schema: "public", table: "existencias" }, () => setVersion((v) => v + 1))
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, () => setVersion((v) => v + 1))
        .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, () => setVersion((v) => v + 1))
        .on("postgres_changes", { event: "*", schema: "public", table: "ajustes" }, () => setVersion((v) => v + 1))
        .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, () => setVersion((v) => v + 1))
        .subscribe((s: string) => {
          if (!activo) return;
          if (s === "SUBSCRIBED") {
            setEstado("conectado");
            setCausa(null);
            // Al reconectar se recargan los datos por si hubo cambios mientras no había conexión.
            setVersion((v) => v + 1);
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            setEstado("reconectando");
          } else if (s === "CLOSED") {
            setEstado("sin_conexion");
          }
        });
    })();

    const sinRed = () => {
      setEstado("sin_conexion");
      setCausa("El dispositivo no tiene internet.");
    };
    const conRed = () => setIntento((i) => i + 1);
    window.addEventListener("offline", sinRed);
    window.addEventListener("online", conRed);

    return () => {
      activo = false;
      clearTimeout(limite);
      window.removeEventListener("offline", sinRed);
      window.removeEventListener("online", conRed);
      if (canal.current) supabase.removeChannel(canal.current);
    };
  }, [intento]);

  // Un lote vence sin que cambie nada en la base: se revisan las alertas al entrar y cada 10 minutos,
  // en segundo plano, y las pantallas recargan solo si algo cambió (antes cada pantalla esperaba esta revisión).
  useEffect(() => {
    const supabase = supabaseNavegador();
    const revisar = () =>
      supabase.rpc("refrescar_alertas").then(({ data }: { data: unknown }) => {
        if (data === true) setVersion((v) => v + 1);
      });
    revisar();
    const t = setInterval(revisar, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  const marcarActualizado = useCallback(() => setUltima(new Date()), []);
  const reintentar = useCallback(() => setIntento((i) => i + 1), []);

  return (
    <ConexionCtx.Provider value={{ estado, version, ultimaActualizacion: ultima, marcarActualizado, causa, reintentar }}>
      {children}
    </ConexionCtx.Provider>
  );
}

export function useConexion() {
  const c = useContext(ConexionCtx);
  if (!c) throw new Error("useConexion fuera de ConexionProvider");
  return c;
}

/** Indicador del encabezado: «Conectado · act. 22:08», «Reconectando» o «Sin conexión». */
export function IndicadorConexion() {
  const { estado, ultimaActualizacion, causa, reintentar } = useConexion();
  const estilos: Record<Estado, string> = {
    conectado: "bg-ok-fondo text-ok",
    reconectando: "bg-aviso-fondo text-aviso",
    sin_conexion: "bg-peligro-fondo text-peligro",
  };
  const texto: Record<Estado, string> = {
    conectado: "Conectado",
    reconectando: "Reconectando",
    sin_conexion: "Sin conexión",
  };
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${estilos[estado]}`}
        title={causa ?? undefined}
      >
        <span className="size-2 rounded-full bg-current" aria-hidden />
        <span className="hidden sm:inline">
          {texto[estado]}
          {ultimaActualizacion && ` · act. ${hora(ultimaActualizacion)}`}
        </span>
      </span>
      {estado === "sin_conexion" && (
        <button className="enlace text-xs" onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Franja que bloquea los registros mientras no hay conexión (RNF-18). */
export function AvisoSinConexion() {
  const { estado, causa, ultimaActualizacion, reintentar } = useConexion();
  if (estado === "conectado") return null;
  if (estado === "reconectando" && !causa) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-peligro-fondo px-4 py-3 text-sm text-peligro">
      <span>
        <b>Sin conexión.</b> {causa ?? "Intentando reconectar."} Los datos que ves son de las{" "}
        {ultimaActualizacion ? hora(ultimaActualizacion) : "—"} y los registros están bloqueados hasta reconectar.
      </span>
      <button className="btn-secundario min-h-9" onClick={reintentar}>
        Reintentar
      </button>
    </div>
  );
}
