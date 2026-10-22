"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { FilaStock } from "@/lib/tipos";
import { Escaner } from "./Escaner";
import { useFicha } from "./FichaProducto";

/**
 * RF-12: buscador global por nombre, código de barras o lote.
 * Ignora tildes y mayúsculas, acepta palabras parciales («pizza mex») y,
 * si el código es exacto, abre directamente la ficha.
 */
export function BuscadorGlobal() {
  const { abrir } = useFicha();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<FilaStock[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [camara, setCamara] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const turno = useRef(0);

  async function buscar(texto: string) {
    const t = ++turno.current;
    setBuscando(true);
    const { data } = await supabaseNavegador().rpc("buscar_productos", { q: texto, limite: 8 });
    if (t !== turno.current) return null;
    setBuscando(false);
    const filas = (data as FilaStock[]) ?? [];
    setRes(filas);
    setActivo(0);
    return filas;
  }

  useEffect(() => {
    if (!q.trim()) {
      setRes([]);
      return;
    }
    const h = setTimeout(() => buscar(q), 220);
    return () => clearTimeout(h);
  }, [q]);

  const elegir = (f: FilaStock) => {
    abrir(f.producto_id);
    setQ("");
    setRes([]);
    setAbierto(false);
  };

  /** Código escaneado o escrito completo: si coincide exacto, abre la ficha sin pasar por la lista. */
  async function porCodigo(codigo: string) {
    const filas = await buscar(codigo);
    const exacto = filas?.find((f) => f.codigo_barras === codigo);
    if (exacto) elegir(exacto);
    else {
      setQ(codigo);
      setAbierto(true);
    }
  }

  return (
    <div className="relative flex min-w-0 flex-1 gap-2">
      <div className="relative min-w-0 flex-1">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-suave" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="campo pl-9"
          type="search"
          placeholder="Buscar por nombre, código de barras o lote"
          aria-label="Buscar producto"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={async (e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, res.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (/^\d{8}$|^\d{13}$/.test(q.trim())) await porCodigo(q.trim());
              else if (res[activo]) elegir(res[activo]);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
        />
        {abierto && q.trim() && (
          <ul className="absolute z-40 mt-1 max-h-96 w-full overflow-auto rounded-md border border-borde bg-white py-1 shadow-lg" role="listbox">
            {!buscando && res.length === 0 && <li className="px-3 py-3 text-sm text-suave">No se encontró «{q}». Prueba con otra palabra o el código.</li>}
            {res.map((f, i) => (
              <li
                key={f.producto_id}
                role="option"
                aria-selected={i === activo}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === activo ? "bg-azul-claro" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(f);
                }}
                onMouseEnter={() => setActivo(i)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{f.nombre}</span>
                  <span className="font-mono text-xs text-suave">{f.codigo_barras}</span>
                </span>
                <span className="whitespace-nowrap text-right text-xs text-suave">
                  <b className="text-sm text-texto">{f.total}</b> en stock
                  <br />
                  percha {f.percha} · almacén {f.almacen}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn-secundario shrink-0 px-3" onClick={() => setCamara(true)} aria-label="Buscar con la cámara">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        <span className="hidden md:inline">Cámara</span>
      </button>
      {camara && (
        <Escaner
          onCerrar={() => setCamara(false)}
          onLeer={(c) => {
            setCamara(false);
            porCodigo(c);
          }}
        />
      )}
    </div>
  );
}
