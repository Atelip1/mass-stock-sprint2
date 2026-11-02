/**
 * Descarga una tabla como CSV que Excel en español abre bien:
 * separador «;», BOM UTF-8 para las tildes y fechas ya formateadas (RF-38).
 */
export function descargarCSV(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".csv") ? nombre : `${nombre}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Número con coma decimal (es-PE usa punto; Excel en español espera coma en CSV con «;»). */
export function numCSV(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}
