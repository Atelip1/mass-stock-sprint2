"use client";

import { useEffect, useState } from "react";

/** RNF-19: modo claro u oscuro, recordado en este equipo (no es un dato del negocio). */
import { CLAVE_TEMA as CLAVE } from "./temaScript";
export type Tema = "claro" | "oscuro";

function aplicar(t: Tema) {
  document.documentElement.dataset.theme = t === "oscuro" ? "dark" : "light";
}

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>("claro");
  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "dark" ? "oscuro" : "claro");
  }, []);
  const cambiar = (t: Tema) => {
    setTema(t);
    aplicar(t);
    try {
      localStorage.setItem(CLAVE, t);
    } catch {
      // Sin almacenamiento (ventana privada): el modo dura hasta recargar.
    }
    window.dispatchEvent(new CustomEvent("mass-stock:tema", { detail: t }));
  };
  useEffect(() => {
    const oir = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener("mass-stock:tema", oir);
    return () => window.removeEventListener("mass-stock:tema", oir);
  }, []);
  return [tema, cambiar];
}
