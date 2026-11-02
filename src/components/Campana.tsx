"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useDatos } from "@/lib/datos";
import type { AlertaActiva, Perfil } from "@/lib/tipos";
import { useConexion } from "./Conexion";
import { duracion, EtiquetaNivel } from "./ui";

/** RF-29 (Product Backlog): campana con el número de alertas nuevas; cada aviso lleva al detalle de la alerta. */
export function Campana({ perfil }: { perfil: Perfil }) {
  const { version } = useConexion();
  const [nuevas, setNuevas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const { datos } = useDatos<AlertaActiva[]>(abierto ? "alertas-activas" : null, () => supabaseNavegador().rpc("alertas_activas"));

  useEffect(() => {
    supabaseNavegador()
      .rpc("alertas_nuevas")
      .then(({ data }: { data: unknown }) => setNuevas(typeof data === "number" ? data : 0));
  }, [version]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  async function abrir() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente) {
      if (nuevas > 0) {
        await supabaseNavegador().rpc("marcar_alertas_vistas");
        setNuevas(0);
      }
    }
  }

  const lista = (datos ?? [])
    .filter((a) => perfil.rol !== "reponedor" || a.tipo === "percha")
    .sort((a, b) => Date.parse(b.detectada_en) - Date.parse(a.detectada_en))
    .slice(0, 8);

  return (
    <div className="relative" ref={caja}>
      <button className="btn-secundario relative min-h-10 px-3" onClick={abrir} aria-expanded={abierto} aria-label={nuevas ? `Alertas: ${nuevas} nuevas` : "Alertas"}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />
        </svg>
        <span className="hidden xl:inline">Alertas</span>
        {nuevas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-peligro px-1 text-center text-[11px] font-bold leading-5 text-white">{nuevas > 99 ? "99+" : nuevas}</span>
        )}
      </button>
      {abierto && (
        <div className="panel absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] shadow-lg">
          <p className="border-b border-borde px-3 py-2 text-sm font-bold">Alertas activas</p>
          {datos === undefined ? (
            <p className="px-3 py-4 text-sm text-suave">Cargando…</p>
          ) : lista.length === 0 ? (
            <p className="px-3 py-4 text-sm text-suave">No hay alertas activas.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-borde overflow-auto">
              {lista.map((a) => (
                <li key={a.id}>
                  <Link href={`/reposicion?alerta=${a.id}`} onClick={() => setAbierto(false)} className="block px-3 py-2 hover:bg-fondo">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{a.nombre}</span>
                      <EtiquetaNivel nivel={a.nivel} />
                    </span>
                    <span className="text-xs text-suave">
                      {a.tipo === "percha" ? `Percha ${a.percha} de ${a.minimo_percha}` : `Stock ${a.total} de ${a.stock_minimo}`} · hace {duracion(a.horas)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/reposicion" onClick={() => setAbierto(false)} className="enlace block border-t border-borde px-3 py-2 text-center text-sm">
            Ver todas en Reposición
          </Link>
        </div>
      )}
    </div>
  );
}
