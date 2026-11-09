"use client";

import { useId, useMemo, useRef, useState } from "react";
import { coincide } from "@/lib/formato";

export type OpcionProducto = { id: string; nombre: string; codigo_barras: string; detalle?: string };

/**
 * RNF-08: al enfocar se despliega la lista completa; al escribir parte del nombre o del código
 * filtra sin importar tildes ni mayúsculas. Se maneja con teclado (flechas y Enter).
 */
export function SelectorProducto({
  opciones,
  valor,
  onCambiar,
  id,
  deshabilitado,
}: {
  opciones: OpcionProducto[];
  valor: string | null;
  onCambiar: (id: string | null) => void;
  id?: string;
  deshabilitado?: boolean;
}) {
  const elegido = opciones.find((o) => o.id === valor) ?? null;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const filtradas = useMemo(
    () => (texto.trim() ? opciones.filter((o) => coincide(o.nombre, texto) || o.codigo_barras.includes(texto.trim())) : opciones),
    [opciones, texto],
  );

  const elegir = (o: OpcionProducto) => {
    onCambiar(o.id);
    setTexto("");
    setAbierto(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        className="campo pr-9"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={deshabilitado}
        placeholder="Elige un producto o escribe para buscar"
        value={abierto ? texto : (elegido?.nombre ?? "")}
        onFocus={() => {
          setAbierto(true);
          setTexto("");
          setActivo(0);
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((a) => Math.min(a + 1, filtradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && abierto && filtradas[activo]) {
            e.preventDefault();
            elegir(filtradas[activo]);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-suave" aria-hidden>
        ▾
      </span>
      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-borde bg-panel py-1 shadow-lg"
        >
          {filtradas.length === 0 && <li className="px-3 py-2 text-sm text-suave">No hay productos que coincidan.</li>}
          {filtradas.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(o);
              }}
              onMouseEnter={() => setActivo(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === activo ? "bg-azul-claro" : ""
              } ${o.id === valor ? "border-l-4 border-amarillo" : ""}`}
            >
              <span>
                <span className="font-semibold">{o.nombre}</span>
                <span className="block font-mono text-xs text-suave">{o.codigo_barras}</span>
              </span>
              {o.detalle && <span className="whitespace-nowrap text-xs text-suave">{o.detalle}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
