"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Aviso = { id: number; texto: string; tono: "ok" | "error" };
type Confirmacion = {
  titulo: string;
  texto: string;
  boton: string;
  peligro?: boolean;
  resolver: (ok: boolean) => void;
};

type Ctx = {
  avisar: (texto: string, tono?: "ok" | "error") => void;
  confirmar: (o: { titulo: string; texto: string; boton: string; peligro?: boolean }) => Promise<boolean>;
};

const AvisosCtx = createContext<Ctx | null>(null);

/** Avisos de registro exitoso y confirmación de acciones que no se deshacen fácilmente (RNF-07). */
export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [conf, setConf] = useState<Confirmacion | null>(null);
  const sig = useRef(0);

  const avisar = useCallback((texto: string, tono: "ok" | "error" = "ok") => {
    const id = ++sig.current;
    setAvisos((a) => [...a, { id, texto, tono }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  const confirmar = useCallback<Ctx["confirmar"]>(
    (o) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })),
    [],
  );

  const cerrar = (ok: boolean) => {
    conf?.resolver(ok);
    setConf(null);
  };

  return (
    <AvisosCtx.Provider value={{ avisar, confirmar }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`pointer-events-auto max-w-md rounded-md px-4 py-3 text-sm font-semibold shadow-lg ${
              a.tono === "ok" ? "bg-tinta text-white ring-1 ring-white/10" : "bg-peligro-fondo text-peligro ring-1 ring-peligro/40"
            }`}
          >
            {a.texto}
          </div>
        ))}
      </div>
      {conf && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="panel w-full max-w-sm p-5 shadow-xl">
            <h2 className="text-lg font-bold">{conf.titulo}</h2>
            <p className="mt-2 text-sm text-suave">{conf.texto}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secundario" onClick={() => cerrar(false)} autoFocus>
                Cancelar
              </button>
              <button className={conf.peligro ? "btn-peligro" : "btn-principal"} onClick={() => cerrar(true)}>
                {conf.boton}
              </button>
            </div>
          </div>
        </div>
      )}
    </AvisosCtx.Provider>
  );
}

export function useAvisos() {
  const c = useContext(AvisosCtx);
  if (!c) throw new Error("useAvisos fuera de AvisosProvider");
  return c;
}
