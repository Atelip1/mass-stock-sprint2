"use client";

import { useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { Encabezado, Etiqueta, MensajeError } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, hoyISO, mensajeError } from "@/lib/formato";
import { descargarCSV } from "@/lib/csv";

type Celda = string | number | boolean | Date | null;
type Resultado = { movimiento_id: string | null; filas_ok: number; unidades: number; errores: { fila: string; mensaje: string }[] };

/** Lee un CSV detectando el separador (; , o tabulación) y respetando comillas. */
function leerCSV(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/)[0] ?? "";
  const sep = [";", ",", "\t"].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

const texto = (v: Celda) => (v === null || v === undefined ? "" : String(v)).trim();

/** RF-21: el jefe de tienda carga el Excel (o CSV) de ventas que exporta la caja al cierre. */
export default function ImportarVentas() {
  const { avisar } = useAvisos();
  const { estado } = useConexion();
  const [fechaVentas, setFechaVentas] = useState(hoyISO());
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<string[][]>([]);
  const [encabezado, setEncabezado] = useState(0);
  const [colCodigo, setColCodigo] = useState(-1);
  const [colCantidad, setColCantidad] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function cargar(f: File) {
    setError(null);
    setResultado(null);
    try {
      let datos: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { default: leerExcel } = await import("read-excel-file");
        datos = ((await leerExcel(f)) as Celda[][]).map((r) => r.map(texto));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        datos = leerCSV(await f.text());
      } else {
        return setError("Elige un archivo .xlsx o .csv. Si la caja exporta .xls, ábrelo en Excel y guárdalo como .xlsx.");
      }
      if (datos.length < 2) return setError("El archivo no tiene filas de ventas.");
      // Busca la fila de encabezados y las columnas de código y cantidad.
      const h = Math.max(0, datos.slice(0, 10).findIndex((r) => r.some((c) => /c[oó]d|barra|ean/i.test(c))));
      const enc = datos[h].map((c) => c.toLowerCase());
      setEncabezado(h);
      setColCodigo(enc.findIndex((c) => /barra|ean|c[oó]d/.test(c)));
      setColCantidad(enc.findIndex((c) => /cant|unid|vendid/.test(c)));
      setFilas(datos);
      setArchivo(f.name);
    } catch {
      setError("No se pudo leer el archivo. Revisa que no esté abierto en Excel ni dañado.");
    }
  }

  // Une las filas del mismo código (la caja exporta una fila por ticket) y conserva el número de fila para los errores.
  const envio = useMemo(() => {
    if (colCodigo < 0 || colCantidad < 0) return [];
    const grupos = new Map<string, { filas: number[]; cantidad: number }>();
    const sueltas: { fila: string; codigo: string; cantidad: string }[] = [];
    filas.slice(encabezado + 1).forEach((r, i) => {
      const n = encabezado + i + 2;
      const codigo = (r[colCodigo] ?? "").replace(/\s/g, "");
      const cant = (r[colCantidad] ?? "").replace(",", ".");
      if (!codigo && !cant) return;
      if (/e\+/i.test(codigo)) {
        sueltas.push({ fila: String(n), codigo: "", cantidad: cant });
        return;
      }
      if (!codigo || !/^\d+$/.test(cant)) {
        sueltas.push({ fila: String(n), codigo, cantidad: cant });
        return;
      }
      const g = grupos.get(codigo) ?? { filas: [], cantidad: 0 };
      g.filas.push(n);
      g.cantidad += Number(cant);
      grupos.set(codigo, g);
    });
    return [...[...grupos].map(([codigo, g]) => ({ fila: g.filas.join(", "), codigo, cantidad: String(g.cantidad) })), ...sueltas];
  }, [filas, encabezado, colCodigo, colCantidad]);

  async function importar() {
    if (!fechaVentas) return setError("Elige la fecha de las ventas.");
    if (colCodigo < 0 || colCantidad < 0) return setError("Elige qué columna tiene el código de barras y cuál la cantidad.");
    if (!envio.length) return setError("No hay filas con código y cantidad.");
    setEnviando(true);
    setError(null);
    const { data, error: e } = await supabaseNavegador().rpc("importar_ventas", { p_fecha: fechaVentas, p_filas: envio });
    setEnviando(false);
    if (e) return setError(mensajeError(e));
    const r = data as Resultado;
    setResultado(r);
    if (r.filas_ok) avisar(`Ventas del ${fecha(fechaVentas)} importadas: ${r.filas_ok} productos, ${r.unidades} unidades.`);
  }

  const encabezados = filas[encabezado] ?? [];

  return (
    <>
      <Encabezado
        ruta="Operación › Importar ventas"
        titulo="Importar ventas de caja"
        descripcion="Carga el Excel que exporta la caja al cierre. Cada venta sale de la percha por FEFO; las filas con error se informan sin cancelar el resto."
      />
      <AvisoSinConexion />
      <section className="panel p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[200px_1fr]">
          <div>
            <label className="etiqueta" htmlFor="fecha">
              Fecha de las ventas
            </label>
            <input id="fecha" type="date" className="campo" max={hoyISO()} value={fechaVentas} onChange={(e) => setFechaVentas(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="archivo">
              Archivo de la caja (.xlsx o .csv)
            </label>
            <input
              id="archivo"
              type="file"
              accept=".xlsx,.csv,.txt"
              className="campo file:mr-3 file:rounded file:border-0 file:bg-fondo file:px-3 file:py-1 file:font-semibold"
              onChange={(e) => e.target.files?.[0] && cargar(e.target.files[0])}
            />
            <p className="ayuda">
              Necesita una columna con el código de barras y otra con la cantidad vendida.{" "}
              <button
                type="button"
                className="enlace"
                onClick={() => descargarCSV("plantilla-ventas", ["Código de barras", "Producto", "Cantidad"], [["7751271002226", "Fideos Don Vittorio 500g", 4]])}
              >
                Descargar plantilla
              </button>
            </p>
          </div>
        </div>

        {archivo && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="etiqueta" htmlFor="col-codigo">
                  Columna del código de barras
                </label>
                <select id="col-codigo" className="campo" value={colCodigo} onChange={(e) => setColCodigo(Number(e.target.value))}>
                  <option value={-1}>Elige la columna</option>
                  {encabezados.map((c, i) => (
                    <option key={i} value={i}>
                      {c || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="etiqueta" htmlFor="col-cantidad">
                  Columna de la cantidad
                </label>
                <select id="col-cantidad" className="campo" value={colCantidad} onChange={(e) => setColCantidad(Number(e.target.value))}>
                  <option value={-1}>Elige la columna</option>
                  {encabezados.map((c, i) => (
                    <option key={i} value={i}>
                      {c || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-4 text-sm">
              <b>{archivo}</b>: {filas.length - encabezado - 1} filas, {envio.length} {envio.length === 1 ? "producto" : "productos"} distintos. Vista previa:
            </p>
            <div className="mt-2 max-h-72 overflow-auto rounded-md border border-borde">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fila</th>
                    {encabezados.map((c, i) => (
                      <th key={i} className={i === colCodigo || i === colCantidad ? "text-azul" : ""}>
                        {c || `Columna ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(encabezado + 1, encabezado + 9).map((r, i) => (
                    <tr key={i}>
                      <td className="text-suave">{encabezado + i + 2}</td>
                      {encabezados.map((_, j) => (
                        <td key={j} className={j === colCodigo ? "font-mono" : ""}>
                          {r[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>
        <button className="btn-principal mt-4" disabled={!archivo || enviando || estado !== "conectado"} onClick={importar}>
          {enviando ? "Importando…" : `Importar ventas del ${fecha(fechaVentas)}`}
        </button>
      </section>

      {resultado && (
        <section className="panel mt-4 p-4 sm:p-5">
          <h2 className="text-base font-bold">Resultado</h2>
          <p className="mt-2 flex flex-wrap gap-2 text-sm">
            <Etiqueta tono="ok">
              {resultado.filas_ok} {resultado.filas_ok === 1 ? "producto importado" : "productos importados"} · {resultado.unidades} unidades
            </Etiqueta>
            {resultado.errores.length > 0 && <Etiqueta tono="peligro">{resultado.errores.length} con error</Etiqueta>}
          </p>
          {resultado.errores.length > 0 && (
            <>
              <p className="mt-3 text-sm text-suave">
                Estas filas no se cargaron. Corrígelas (por ejemplo, registra la reposición pendiente o el producto que falta) y regístralas con «Registrar salida» por
                venta.
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Problema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.errores.map((e, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">{e.fila}</td>
                        <td>{/e\+/i.test(e.mensaje) || e.mensaje.startsWith("falta el código") ? `${e.mensaje} Si el código aparece como 7,75E+12, da formato de texto a esa columna en Excel.` : e.mensaje}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
