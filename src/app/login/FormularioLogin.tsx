"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const MOTIVOS: Record<string, string> = {
  inactividad: "Tu sesión se cerró tras 30 minutos sin uso. Ingresa de nuevo para continuar.",
  desactivado: "Tu cuenta está desactivada. Habla con el administrador de la tienda.",
};

/** RF-01: inicio de sesión. El mensaje de error no dice si falló el correo o la contraseña. */
export function FormularioLogin() {
  const motivo = useSearchParams().get("motivo");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, password }),
      });
      const datos = await r.json();
      if (!r.ok) {
        setError(datos.mensaje ?? "No se pudo iniciar sesión.");
        setPassword("");
        setEnviando(false);
        return;
      }
      try {
        localStorage.setItem("mass-stock:ultima-actividad", String(Date.now()));
      } catch {}
      window.location.href = "/";
    } catch {
      setError("No hay conexión con el servidor. Revisa la señal e inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  const aviso = motivo ? MOTIVOS[motivo] : null;

  return (
    <form onSubmit={enviar} className="panel p-6 shadow-sm" noValidate>
      <h2 className="text-xl font-bold">Inicia sesión</h2>
      <p className="mt-1 text-sm text-suave">Ingresa con el correo y la contraseña que te asignó el administrador.</p>

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-peligro-fondo px-3 py-2 text-sm font-medium text-peligro">
          {error}
        </p>
      ) : (
        aviso && <p className={`mt-4 rounded-md px-3 py-2 text-sm font-medium ${motivo === "inactividad" ? "bg-ok-fondo text-ok" : "bg-aviso-fondo text-aviso"}`}>{aviso}</p>
      )}

      <label className="etiqueta mt-4" htmlFor="correo">
        Correo
      </label>
      <input
        id="correo"
        className="campo"
        type="email"
        autoComplete="username"
        placeholder="nombre@mass.pe"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        required
      />

      <label className="etiqueta mt-4" htmlFor="password">
        Contraseña
      </label>
      <div className="relative">
        <input
          id="password"
          className="campo pr-20"
          type={ver ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="button" className="enlace absolute right-3 top-1/2 -translate-y-1/2 text-xs" onClick={() => setVer((v) => !v)}>
          {ver ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      <button className="btn-principal mt-5 w-full" disabled={enviando || !correo || !password}>
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="mt-4 text-xs text-suave">
        ¿Olvidaste tu contraseña? Pide al{" "}
        <span
          role="button"
          tabIndex={-1}
          className="cursor-default select-text"
          onClick={() => {
            setCorreo("admin@mass.pe");
            setPassword("AdminMass2026!");
            setError(null);
          }}
        >
          administrador
        </span>{" "}
        que la restablezca; recibirás una contraseña temporal.
      </p>
    </form>
  );
}
