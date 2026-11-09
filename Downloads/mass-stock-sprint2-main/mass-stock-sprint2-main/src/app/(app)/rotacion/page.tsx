"use client";

import { useEffect, useMemo, useState } from "react";
import { useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { Cargando, Encabezado, EtiquetaClase, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, hoyISO, mensajeError } from "@/lib/formato";
import { descargarCSV, numCSV } from "@/lib/csv";

type Fila = {
  producto_id: string;
  nombre: string;
  codigo_barras: string;
  clase: "A" | "B" | "C" | "sin_ventas";
  unidades: number;
  stock_promedio: number;
  rotacion: number | null;
  cobertura_dias: number | null;
  stock_actual: number;
};

function haceDias(n: number) {
  const d = new Date(hoyISO() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const num = (n: number | null, d = 1) => (n === null ? "—" : n.toFixed(d).replace(".", ","));

/** RF-37 (Figuras 16 y 33): rotación por ventas con clasificación ABC (RN-18, RN-20). */
export default function Rotacion() {
  const { abrir } = useFicha();
  const { version, marcarActualizado } = useConexion();
  const [rango, setRango] = useState<7 | 30 | 90 | null>(30);
  const [desde, setDesde] = useState(() => haceDias(29));
  const [hasta, setHasta] = useState(() => hoyISO());
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegirRango = (d: 7 | 30 | 90) => {
    setRango(d);
    setDesde(haceDias(d - 1));
    setHasta(hoyISO());
  };

  useEffect(() => {
    if (!desde || !hasta) return;
    if (desde > hasta) {
      setError("«Desde» debe ser anterior o igual a «Hasta».");
      return;
    }
    supabaseNavegador()
      .rpc("reporte_rotacion", { p_desde: desde, p_hasta: hasta })
      .then(({ data, error: e }: { data: unknown; error: unknown }) => {
        setError(e ? mensajeError(e) : null);
        setFilas((data as Fila[]) ?? []);
        marcarActualizado();
      });
  }, [desde, hasta, version, marcarActualizado]);

  const cuenta = useMemo(() => {
    const c = { A: 0, B: 0, C: 0, sin_ventas: 0 };
    (filas ?? []).forEach((f) => c[f.clase]++);
    return c;
  }, [filas]);

  function exportar() {
    descargarCSV(
      `rotacion-${desde}-a-${hasta}`,
      ["Producto", "Código de barras", "Clase", "Unidades vendidas", "Stock promedio", "Rotación", "Cobertura (días)", "Stock actual"],
      (filas ?? []).map((f) => [f.nombre, f.codigo_barras, f.clase === "sin_ventas" ? "Sin ventas" : f.clase, f.unidades, numCSV(f.stock_promedio), numCSV(f.rotacion), numCSV(f.cobertura_dias), f.stock_actual]),
    );
  }

  return (
    <>
      <Encabezado ruta="Análisis › Reportes de rotación" titulo="Reportes de rotación" descripcion="Qué productos se venden más, para priorizar su reposición. Solo cuentan las ventas." />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} className={`btn-secundario ${rango === d ? "border-azul ring-1 ring-azul" : ""}`} aria-pressed={rango === d} onClick={() => elegirRango(d)}>
            Últimos {d} días
          </button>
        ))}
        <div>
          <label className="etiqueta" htmlFor="desde">
            Desde
          </label>
          <input id="desde" type="date" className="campo" value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); setRango(null); }} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="hasta">
            Hasta
          </label>
          <input id="hasta" type="date" className="campo" value={hasta} max={hoyISO()} onChange={(e) => { setHasta(e.target.value); setRango(null); }} />
        </div>
        <button className="btn-secundario" disabled={!filas?.length} onClick={exportar}>
          Exportar CSV
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { n: cuenta.A, t: "productos clase A · 80 % de las ventas" },
          { n: cuenta.B, t: "productos clase B · siguiente 15 %" },
          { n: cuenta.C, t: "productos clase C · último 5 %" },
        ].map((c) => (
          <div key={c.t} className="panel p-4">
            <p className="text-3xl font-bold">{c.n}</p>
            <p className="text-sm text-suave">{c.t}</p>
          </div>
        ))}
      </div>

      <MensajeError>{error}</MensajeError>
      <section className="panel">
        {filas === null ? (
          <Cargando />
        ) : filas.length === 0 ? (
          <Vacio>No hay productos activos.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[640px]">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Clase</th>
                  <th className="text-right">Unidades vendidas</th>
                  <th className="text-right" title="Unidades vendidas ÷ stock promedio del periodo">
                    Rotación
                  </th>
                  <th className="text-right" title="Días que alcanza el stock actual al ritmo de venta del periodo">
                    Cobertura
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.producto_id}>
                    <td>
                      <button className="enlace text-left" onClick={() => abrir(f.producto_id)}>
                        {f.nombre}
                      </button>
                    </td>
                    <td>{f.clase === "sin_ventas" ? <span className="inline-flex rounded-full bg-aviso-fondo px-2.5 py-0.5 text-xs font-semibold text-aviso">Sin ventas</span> : <EtiquetaClase clase={f.clase} />}</td>
                    <td className="text-right font-semibold">{f.unidades}</td>
                    <td className="text-right">{num(f.rotacion)}</td>
                    <td className="text-right">{f.cobertura_dias === null ? "—" : `${num(f.cobertura_dias)} d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-borde px-4 py-3 text-xs text-suave">
          Del {fecha(desde)} al {fecha(hasta)}. Rotación = unidades vendidas ÷ stock promedio del periodo. Ingresos y reposiciones internas no se contabilizan como ventas.
        </p>
      </section>
    </>
  );
}
