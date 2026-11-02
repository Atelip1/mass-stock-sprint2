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

/* ---------- Etiquetas de alertas y reposición (mismos colores en todas las pantallas, RNF-06) ---------- */

export function EtiquetaTipoAlerta({ tipo }: { tipo: "abastecimiento" | "percha" }) {
  return tipo === "abastecimiento" ? <Etiqueta tono="info">Abastecimiento</Etiqueta> : <Etiqueta tono="neutro">Percha</Etiqueta>;
}

export function EtiquetaNivel({ nivel }: { nivel: string }) {
  switch (nivel) {
    case "sin_stock":
      return <Etiqueta tono="peligro">Sin stock</Etiqueta>;
    case "critica":
      return <Etiqueta tono="peligro">Crítica</Etiqueta>;
    case "preventiva":
      return <Etiqueta tono="aviso">Preventiva</Etiqueta>;
    case "vacia":
      return <Etiqueta tono="peligro">Percha vacía</Etiqueta>;
    default:
      return <Etiqueta tono="aviso">Por reponer</Etiqueta>;
  }
}

export function EtiquetaEstadoReposicion({ estado }: { estado: string }) {
  switch (estado) {
    case "pendiente":
      return <Etiqueta tono="aviso">Pendiente</Etiqueta>;
    case "en_reposicion":
      return <Etiqueta tono="info">En reposición</Etiqueta>;
    case "repuesto":
      return <Etiqueta tono="ok">Repuesto</Etiqueta>;
    default:
      return <Etiqueta tono="neutro">Cerrado</Etiqueta>;
  }
}

export function EtiquetaClase({ clase }: { clase: string }) {
  if (clase === "sin_ventas") return <Etiqueta tono="neutro">Sin ventas</Etiqueta>;
  return <Etiqueta tono={clase === "A" ? "info" : "neutro"}>{clase}</Etiqueta>;
}

/** «Por vencer» según el parámetro de días de aviso (RN-10, RF-41); la vista v_vencimientos lo trae calculado. */
export function EtiquetaVence({ dias, porVencer }: { dias: number; porVencer?: boolean }) {
  if (dias < 0) return <Etiqueta tono="peligro">Vencido hace {-dias} {dias === -1 ? "día" : "días"}</Etiqueta>;
  if (dias === 0) return <Etiqueta tono="peligro">Vence hoy</Etiqueta>;
  if (porVencer ?? dias <= 7) return <Etiqueta tono="aviso">En {dias} {dias === 1 ? "día" : "días"}</Etiqueta>;
  return <Etiqueta tono="neutro">En {dias} días</Etiqueta>;
}

/** Horas legibles: «45 min», «4,3 h», «2,1 d». */
export function duracion(horas: number | null | undefined): string {
  if (horas === null || horas === undefined) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toFixed(1).replace(".", ",")} h`;
  return `${(horas / 24).toFixed(1).replace(".", ",")} d`;
}

/** Pestañas simples con contador (RF-36: «las pestañas muestran su cantidad»). */
export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: { valor: T; etiqueta: string; cantidad?: number }[];
  valor: T;
  onCambiar: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 rounded-lg border border-borde bg-panel p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="tab"
          aria-selected={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={`min-h-9 rounded-md px-3 text-sm font-semibold ${o.valor === valor ? "bg-marca text-white" : "text-suave hover:bg-fondo"}`}
        >
          {o.etiqueta}
          {o.cantidad !== undefined && ` (${o.cantidad})`}
        </button>
      ))}
    </div>
  );
}

/** Ventana modal común con título, contenido y acciones. */
export function Modal({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal aria-label={titulo} onClick={onCerrar}>
      <div className="panel w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}
