import type { ReactNode } from "react";
import type { EstadoPercha, EstadoStock } from "@/lib/tipos";

/** Encabezado común de cada pantalla: ruta, título y descripción (RNF-06). */
export function Encabezado({ ruta, titulo, descripcion, acciones }: { ruta: string; titulo: string; descripcion: string; acciones?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs text-suave">{ruta}</p>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="mt-0.5 text-sm text-suave">{descripcion}</p>
      </div>
      {acciones}
    </div>
  );
}

type Tono = "ok" | "aviso" | "peligro" | "info" | "neutro";

const TONOS: Record<Tono, string> = {
  ok: "bg-ok-fondo text-ok",
  aviso: "bg-aviso-fondo text-aviso",
  peligro: "bg-peligro-fondo text-peligro",
  info: "bg-azul-claro text-azul",
  neutro: "bg-fondo text-suave",
};

/** Etiqueta de estado: forma de píldora, nunca parece botón (RNF-04). */
export function Etiqueta({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONOS[tono]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function EtiquetaStock({ estado }: { estado: EstadoStock }) {
  switch (estado) {
    case "ok":
      return <Etiqueta tono="ok">OK</Etiqueta>;
    case "bajo_minimo":
      return <Etiqueta tono="aviso">Bajo mínimo</Etiqueta>;
    case "critico":
      return <Etiqueta tono="peligro">Bajo mínimo · crítico</Etiqueta>;
    case "sin_stock":
      return <Etiqueta tono="peligro">Sin stock</Etiqueta>;
  }
}

/** Barra de percha frente a su mínimo: se llena a medida que la percha se acerca al mínimo. */
export function BarraPercha({ percha, minimo, estado, compacta }: { percha: number; minimo: number; estado: EstadoPercha; compacta?: boolean }) {
  const ancho = Math.min(100, Math.round((percha / minimo) * 100));
  const color = estado === "ok" ? "bg-ok" : estado === "por_reponer" ? "bg-amarillo-oscuro" : "";
  const texto = estado === "ok" ? "Cubierta" : estado === "por_reponer" ? "Por reponer" : "Vacía";
  const colorTexto = estado === "ok" ? "text-ok" : estado === "por_reponer" ? "text-aviso" : "text-peligro";
  if (compacta) {
    return (
      <div>
        <div className={`h-1.5 overflow-hidden rounded-full ${estado === "vacia" ? "border border-peligro/50 bg-peligro-fondo" : "bg-fondo"}`}>
          <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
        </div>
        <p className={`mt-1 text-xs font-semibold ${colorTexto}`}>{texto}</p>
      </div>
    );
  }
  return (
    <div className="min-w-36">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span>
          <b className="text-sm">{percha}</b> <span className="text-suave">de {minimo} mín.</span>
        </span>
        <span className={`font-semibold ${colorTexto}`}>{texto}</span>
      </div>
      <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${estado === "vacia" ? "border border-peligro/50 bg-peligro-fondo" : "bg-fondo"}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-suave">{children}</p>;
}

export function Cargando() {
  return <p className="px-4 py-10 text-center text-sm text-suave">Cargando…</p>;
}

export function MensajeError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-peligro-fondo px-3 py-2 text-sm font-medium text-peligro">
      {children}
    </p>
  );
}
