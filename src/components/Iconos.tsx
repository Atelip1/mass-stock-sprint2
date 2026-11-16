import Image from "next/image";

/** Íconos de línea propios (24×24, trazo actual). Sin dependencias externas. */
const RUTAS = {
  cubo: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  inicio: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5",
  ingreso: "M12 3v12m0 0-4-4m4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  reponer: "M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3",
  salida: "M12 21V9m0 0-4 4m4-4 4 4M4 9V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4",
  conteo: "M9 5h6M9 3h6v4H9zM6 5H5v16h14V5h-1M9 13l2 2 4-4",
  importar: "M14 3v5h5M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5zM9 13h6M9 17h6",
  stock: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  reposicion: "M12 3a6 6 0 0 0-6 6v3l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0",
  vencimientos: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  historial: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2",
  rotacion: "M4 19h16M7 15l3-4 3 3 5-7",
  indicadores: "M5 20V12m7 8V6m7 14v-5",
  catalogo: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z",
  usuarios: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.8M15.5 4.2a3 3 0 0 1 0 5.6",
  parametros: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  cuenta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  salir: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11",
  correo: "M4 6h16v12H4zM4 7l8 6 8-6",
  candado: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6zM12 15v2",
  ojo: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ojoTachado: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6",
  flecha: "M5 12h14m-6-6 6 6-6 6",
  escudo: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  tienda: "M4 9l1.5-5h13L20 9M4 9h16M4 9v1a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0V9M5 12v8h14v-8M10 20v-5h4v5",
  campana: "M12 3a6 6 0 0 0-6 6v3l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0",
  grafico: "M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6",
  personas: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.8M15.5 4.2a3 3 0 0 1 0 5.6",
  alerta: "M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  percha: "M3 7h18M3 13h18M3 19h18M6 7v12M18 7v12",
  movimientos: "M7 7h13m0 0-3-3m3 3-3 3M17 17H4m0 0 3-3m-3 3 3 3",
  info: "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
} as const;

export type NombreIcono = keyof typeof RUTAS;

export function Icono({ nombre, className = "size-5", trazo = 2 }: { nombre: NombreIcono; className?: string; trazo?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={trazo} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={RUTAS[nombre]} />
    </svg>
  );
}

/** Ícono del menú según la ruta de cada pantalla. */
export const ICONO_RUTA: Record<string, NombreIcono> = {
  "/": "inicio",
  "/ingreso": "ingreso",
  "/reponer": "reponer",
  "/salida": "salida",
  "/conteo": "conteo",
  "/importar-ventas": "importar",
  "/stock": "stock",
  "/reposicion": "reposicion",
  "/vencimientos": "vencimientos",
  "/historial": "historial",
  "/rotacion": "rotacion",
  "/indicadores": "indicadores",
  "/catalogo": "catalogo",
  "/usuarios": "usuarios",
  "/parametros": "parametros",
  "/mi-cuenta": "cuenta",
};

/** Logo de la tienda (Mass), usado junto al nombre «Mass Stock». */
export function LogoMassStock({ tamano = "md" }: { tamano?: "sm" | "md" | "lg" }) {
  const px = tamano === "lg" ? 56 : tamano === "sm" ? 32 : 40;
  const caja = tamano === "lg" ? "size-14 rounded-2xl" : tamano === "sm" ? "size-8 rounded-lg" : "size-10 rounded-xl";
  return (
    <Image
      src="/mass-logo.png"
      alt="Mass"
      width={px}
      height={px}
      priority
      className={`shrink-0 object-cover shadow-[0_6px_18px_-6px_rgb(255_209_0/0.7)] ${caja}`}
    />
  );
}
