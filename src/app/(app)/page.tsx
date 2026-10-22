"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConexion } from "@/components/Conexion";
import { usePerfil } from "@/components/Shell";
import { supabaseNavegador } from "@/lib/supabase/client";
import { diasHasta } from "@/lib/formato";
import type { FilaStock } from "@/lib/tipos";

/**
 * Inicio del Sprint 2: resumen del stock y accesos rápidos según el rol.
 * El inicio completo por rol (RF-32, RF-33) llega en el Sprint 4, cuando existan alertas y movimientos de salida.
 */
export default function Inicio() {
  const perfil = usePerfil();
  const { version, marcarActualizado } = useConexion();
  const [filas, setFilas] = useState<FilaStock[] | null>(null);

  useEffect(() => {
    supabaseNavegador()
      .from("v_stock")
      .select("producto_id, total, percha, estado_stock, estado_percha, proximo_vencimiento, activo")
      .eq("activo", true)
      .then(({ data }: { data: unknown }) => {
        setFilas((data as FilaStock[]) ?? []);
        marcarActualizado();
      });
  }, [version, marcarActualizado]);

  const hoy = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });
  const cuenta = (f: (x: FilaStock) => boolean) => (filas ? filas.filter(f).length : "…");

  const tarjetas = [
    { n: cuenta((x) => x.estado_stock === "sin_stock"), texto: "Productos sin stock", href: "/stock?estado=sin_stock", color: "text-peligro" },
    { n: cuenta((x) => x.estado_stock === "bajo_minimo" || x.estado_stock === "critico"), texto: "Bajo el stock mínimo", href: "/stock?estado=bajo_minimo", color: "text-aviso" },
    { n: cuenta((x) => x.estado_percha !== "ok"), texto: "Perchas por reponer", href: "/stock?estado=por_reponer", color: "text-azul" },
    {
      n: cuenta((x) => !!x.proximo_vencimiento && diasHasta(x.proximo_vencimiento) <= 7),
      texto: "Con un lote por vencer en 7 días",
      href: "/stock?orden=vencimiento",
      color: "text-aviso",
    },
  ];

  const accesos =
    perfil.rol === "supervisor"
      ? [{ href: "/stock", texto: "Ver stock en tiempo real" }]
      : [
          { href: "/ingreso", texto: "Registrar ingreso" },
          { href: "/stock", texto: "Ver stock en tiempo real" },
        ];

  return (
    <>
      <div className="mb-5">
        <p className="text-xs text-suave">Inicio</p>
        <h1 className="text-2xl font-bold">Hola, {perfil.nombre.split(" ")[0]}</h1>
        <p className="mt-0.5 text-sm text-suave first-letter:uppercase">{hoy}. Lo que necesita atención ahora en la tienda.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {accesos.map((a) => (
          <Link key={a.href} href={a.href} className={a.href === "/ingreso" ? "btn-principal" : "btn-secundario"}>
            {a.texto}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <Link key={t.texto} href={t.href} className="panel block p-4 transition hover:border-azul">
            <p className={`text-3xl font-bold ${t.color}`}>{t.n}</p>
            <p className="mt-1 text-sm text-suave">{t.texto}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
