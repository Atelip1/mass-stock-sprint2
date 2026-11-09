"use client";

import { useState } from "react";
import { PantallaAcceso } from "@/components/PantallaAcceso";

/** RF-03 (Figura 4): con una contraseña temporal, el sistema obliga a crear una nueva antes de entrar. */
export default function CambiarPassword() {
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nueva.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (nueva !== repite) return setError("Las dos contraseñas no coinciden. Escríbelas de nuevo.");
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nueva }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.mensaje);
        setEnviando(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("No hay conexión con el servidor. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso>
      <form onSubmit={enviar} className="panel p-6 shadow-sm" noValidate>
        <h2 className="text-xl font-bold">Crea tu contraseña</h2>
        <p className="mt-1 text-sm text-suave">Es tu primer ingreso o te dieron una contraseña temporal. Elige una nueva para continuar.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-peligro-fondo px-3 py-2 text-sm font-medium text-peligro">
            {error}
          </p>
        )}
        <label className="etiqueta mt-4" htmlFor="nueva">
          Nueva contraseña
        </label>
        <input id="nueva" className="campo" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <p className="ayuda">Al menos 8 caracteres.</p>
        <label className="etiqueta mt-4" htmlFor="repite">
          Repite la nueva contraseña
        </label>
        <input id="repite" className="campo" type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} />
        <button className="btn-principal mt-5 w-full" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar y entrar"}
        </button>
        <button
          type="button"
          className="enlace mt-4 block w-full text-center text-sm"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Volver al inicio de sesión
        </button>
      </form>
    </PantallaAcceso>
  );
}
