"use client";

import { useEffect, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { Cargando, Encabezado, MensajeError } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/formato";
import { useDatos } from "@/lib/datos";

type Parametro = { clave: string; valor: unknown; descripcion: string };

const NUMEROS: { clave: string; titulo: string; unidad: string; regla: string }[] = [
  { clave: "dias_aviso_vencimiento", titulo: "Aviso de vencimiento", unidad: "días antes", regla: "RN-10" },
  { clave: "porcentaje_critico", titulo: "Nivel crítico del stock", unidad: "% del mínimo", regla: "RN-07" },
  { clave: "dias_minimo_sugerido", titulo: "Ventas para sugerir el mínimo", unidad: "últimos días", regla: "RN-06" },
  { clave: "dias_seguridad", titulo: "Stock de seguridad", unidad: "días de venta", regla: "RN-06" },
];

/** RF-41 (Product Backlog): días de aviso, porcentaje crítico, cálculo del mínimo sugerido y zonas del almacén. */
export default function Parametros() {
  const { avisar } = useAvisos();
  const q = useDatos<Parametro[]>("parametros", () => supabaseNavegador().from("parametros").select("*").order("clave"));
  const [valores, setValores] = useState<Record<string, string>>({});
  const [zonas, setZonas] = useState<string[]>([]);
  const [nuevaZona, setNuevaZona] = useState("");
  const [errores, setErrores] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!q.datos) return;
    const v: Record<string, string> = {};
    q.datos.forEach((p) => {
      if (p.clave === "zonas_almacen") setZonas((p.valor as string[]) ?? []);
      else v[p.clave] = String(p.valor);
    });
    setValores(v);
  }, [q.datos]);

  async function guardar(clave: string, valor: unknown, mensaje: string) {
    const { error } = await supabaseNavegador().rpc("actualizar_parametro", { p_clave: clave, p_valor: valor });
    setErrores((e) => ({ ...e, [clave]: error ? mensajeError(error) : null }));
    if (!error) {
      avisar(mensaje);
      q.recargar();
    }
  }

  if (!q.datos) return q.error ? <MensajeError>{q.error}</MensajeError> : <Cargando />;
  const desc = (clave: string) => q.datos!.find((p) => p.clave === clave)?.descripcion;

  return (
    <>
      <Encabezado ruta="Administración › Parámetros" titulo="Parámetros" descripcion="Valores que usa el sistema para alertas, vencimientos y el stock mínimo sugerido." />
      <div className="grid gap-4 md:grid-cols-2">
        {NUMEROS.map((n) => (
          <form
            key={n.clave}
            className="panel p-4 sm:p-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const v = valores[n.clave] ?? "";
              if (!/^\d+$/.test(v)) return setErrores((x) => ({ ...x, [n.clave]: "Escribe un número entero." }));
              guardar(n.clave, Number(v), `«${n.titulo}» guardado.`);
            }}
          >
            <h2 className="text-base font-bold">{n.titulo}</h2>
            <p className="text-xs text-suave">
              {desc(n.clave)?.includes(n.regla) ? desc(n.clave) : `${desc(n.clave) ?? ""} (${n.regla})`}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                className="campo w-28"
                inputMode="numeric"
                aria-label={n.titulo}
                value={valores[n.clave] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [n.clave]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
              />
              <span className="text-sm text-suave">{n.unidad}</span>
              <button className="btn-secundario ml-auto">Guardar</button>
            </div>
            {errores[n.clave] && (
              <div className="mt-2">
                <MensajeError>{errores[n.clave]}</MensajeError>
              </div>
            )}
          </form>
        ))}

        <section className="panel p-4 sm:p-5 md:col-span-2">
          <h2 className="text-base font-bold">Zonas del almacén</h2>
          <p className="text-xs text-suave">Se eligen al registrar cada ingreso (RF-15). Quitar una zona no cambia los lotes que ya están en ella.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {zonas.map((z) => (
              <li key={z} className="flex items-center gap-1 rounded-full border border-borde bg-fondo py-1 pl-3 pr-1 text-sm font-semibold">
                {z}
                <button className="grid size-6 place-items-center rounded-full text-suave hover:bg-borde" aria-label={`Quitar zona ${z}`} onClick={() => setZonas((zs) => zs.filter((x) => x !== z))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="campo w-40"
              placeholder="Ej. D-1"
              aria-label="Nueva zona"
              value={nuevaZona}
              onChange={(e) => setNuevaZona(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nuevaZona.trim()) {
                  setZonas((zs) => [...zs, nuevaZona.trim()]);
                  setNuevaZona("");
                }
              }}
            />
            <button
              className="btn-secundario"
              disabled={!nuevaZona.trim()}
              onClick={() => {
                setZonas((zs) => [...zs, nuevaZona.trim()]);
                setNuevaZona("");
              }}
            >
              + Agregar zona
            </button>
            <button className="btn-principal ml-auto" onClick={() => guardar("zonas_almacen", zonas, "Zonas del almacén guardadas.")}>
              Guardar zonas
            </button>
          </div>
          {errores["zonas_almacen"] && (
            <div className="mt-2">
              <MensajeError>{errores["zonas_almacen"]}</MensajeError>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
