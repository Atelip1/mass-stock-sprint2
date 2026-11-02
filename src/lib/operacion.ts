"use client";

import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, hoyISO } from "@/lib/formato";
import type { FilaStock, LoteConStock } from "@/lib/tipos";
import { useConexion } from "@/components/Conexion";
import { NADA, useDatos } from "@/lib/datos";

/** Productos activos con su stock (para los selectores de los formularios). Se recarga con cada cambio en tiempo real. */
export function useProductosStock() {
  const { datos } = useDatos<FilaStock[]>("productos-stock", () => supabaseNavegador().from("v_stock").select("*").eq("activo", true).order("nombre"));
  return datos ?? NADA;
}

/** Lotes de un producto con sus existencias, ordenados por vencimiento (FEFO, RN-11). */
export function useLotes(productoId: string | null) {
  const { version } = useConexion();
  const [lotes, setLotes] = useState<LoteConStock[]>([]);
  useEffect(() => {
    if (!productoId) {
      setLotes([]);
      return;
    }
    supabaseNavegador()
      .from("lotes")
      .select("id, codigo_lote, fecha_vencimiento, zona_almacen, existencias(ubicacion, cantidad)")
      .eq("producto_id", productoId)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .order("creado_en", { ascending: true })
      .then(({ data }: { data: unknown }) => setLotes((data as LoteConStock[]) ?? []));
  }, [productoId, version]);
  return lotes;
}

export function cantidadEn(lote: LoteConStock, ubicacion: "almacen" | "percha") {
  return lote.existencias.find((x) => x.ubicacion === ubicacion)?.cantidad ?? 0;
}

export function loteVigente(lote: LoteConStock) {
  return !lote.fecha_vencimiento || lote.fecha_vencimiento >= hoyISO();
}

export function textoLote(lote: LoteConStock, ubicacion?: "almacen" | "percha") {
  const venc = lote.fecha_vencimiento ? `vence ${fecha(lote.fecha_vencimiento)}` : "sin vencimiento";
  if (ubicacion === "almacen") return `${lote.codigo_lote} · ${cantidadEn(lote, "almacen")} en almacén ${lote.zona_almacen} · ${venc}`;
  if (ubicacion === "percha") return `${lote.codigo_lote} · ${cantidadEn(lote, "percha")} en percha · ${venc}`;
  return `${lote.codigo_lote} · ${venc}`;
}

/** RF-26: lleva la percha al doble de su mínimo sin superar lo que hay en almacén (misma fórmula que la base de datos). */
export function sugeridoPercha(p: Pick<FilaStock, "percha" | "almacen" | "minimo_percha">) {
  return Math.min(p.almacen, Math.max(0, 2 * p.minimo_percha - p.percha));
}
