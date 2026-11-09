"use client";

import { useState } from "react";
import { Escaner } from "./Escaner";

/**
 * Campo de código de barras que acepta lectora USB (escribe el código y envía Enter)
 * o la cámara del celular (RF-14, RF-22, RNF-08).
 */
export function CampoCodigo({
  valor,
  onCambiar,
  onLeido,
  id,
  deshabilitado,
  placeholder = "Escanea o escribe el código",
}: {
  valor: string;
  onCambiar: (v: string) => void;
  /** Se llama cuando el código está completo: Enter de la lectora, lectura con cámara o 13/8 dígitos escritos. */
  onLeido: (codigo: string) => void;
  id?: string;
  deshabilitado?: boolean;
  placeholder?: string;
}) {
  const [camara, setCamara] = useState(false);

  return (
    <>
      <div className="flex gap-2">
        <input
          id={id}
          className="campo font-mono"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          disabled={deshabilitado}
          value={valor}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 13);
            onCambiar(v);
            if (v.length === 13) onLeido(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (valor) onLeido(valor);
            }
          }}
        />
        <button type="button" className="btn-secundario shrink-0" onClick={() => setCamara(true)} disabled={deshabilitado}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Cámara
        </button>
      </div>
      {camara && (
        <Escaner
          onCerrar={() => setCamara(false)}
          onLeer={(c) => {
            setCamara(false);
            onCambiar(c);
            onLeido(c);
          }}
        />
      )}
    </>
  );
}
