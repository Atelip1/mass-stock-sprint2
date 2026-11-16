"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "@/components/Iconos";

const MOTIVOS: Record<string, string> = {
  inactividad: "Tu sesión se cerró tras 30 minutos sin uso. Ingresa de nuevo para continuar.",
  desactivado: "Tu cuenta está desactivada. Habla con el administrador de la tienda.",
};

/** «Recordarme» guarda solo el correo en este equipo; la contraseña nunca se guarda. */
const CLAVE_CORREO = "mass-stock:correo-recordado";

/** RF-01: inicio de sesión. El mensaje de error no dice si falló el correo o la contraseña. */
export function FormularioLogin() {
  const motivo = useSearchParams().get("motivo");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_CORREO);
      if (guardado) {
        setCorreo(guardado);
        setRecordar(true);
      }
    } catch {}
  }, []);

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
        if (recordar) localStorage.setItem(CLAVE_CORREO, correo.trim().toLowerCase());
        else localStorage.removeItem(CLAVE_CORREO);
      } catch {}
      window.location.href = "/";
    } catch {
      setError("No hay conexión con el servidor. Revisa la señal e inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  const aviso = motivo ? MOTIVOS[motivo] : null;

  return (
    <form onSubmit={enviar} noValidate>
      <h2 className="text-3xl font-extrabold tracking-tight">Inicia sesión</h2>
      <p className="mt-1.5 text-sm text-suave">Accede al sistema de gestión de inventario con el correo y la contraseña que te asignó el administrador.</p>

      {error ? (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-peligro-fondo px-3.5 py-2.5 text-sm font-medium text-peligro">
          <Icono nombre="alerta" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : (
        aviso && (
          <p className={`mt-5 rounded-xl px-3.5 py-2.5 text-sm font-medium ${motivo === "inactividad" ? "bg-ok-fondo text-ok" : "bg-aviso-fondo text-aviso"}`}>{aviso}</p>
        )
      )}

      <label className="sr-only" htmlFor="correo">
        Correo electrónico
      </label>
      <div className="relative mt-6">
        <Icono nombre="correo" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-suave" trazo={1.8} />
        <input
          id="correo"
          className="campo h-13 rounded-xl pl-12 text-[15px]"
          type="email"
          autoComplete="username"
          placeholder="Correo electrónico"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
      </div>

      <label className="sr-only" htmlFor="password">
        Contraseña
      </label>
      <div className="relative mt-4">
        <Icono nombre="candado" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-suave" trazo={1.8} />
        <input
          id="password"
          className="campo h-13 rounded-xl pr-12 pl-12 text-[15px]"
          type={ver ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-suave transition hover:bg-fondo hover:text-texto"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={ver}
        >
          <Icono nombre={ver ? "ojo" : "ojoTachado"} className="size-5" trazo={1.8} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input type="checkbox" className="size-4.5 cursor-pointer rounded accent-marca" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
          Recordarme
        </label>
        <button type="button" className="enlace text-sm" onClick={() => setAyuda((a) => !a)} aria-expanded={ayuda}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      {ayuda && (
        <p className="mt-3 animate-entrar rounded-xl bg-azul-claro/60 px-3.5 py-2.5 text-xs text-texto">
          Pide al{" "}
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
          que la restablezca; recibirás una contraseña temporal en tu correo.
        </p>
      )}

      <button className="btn-principal mt-6 h-13 w-full rounded-xl text-base" disabled={enviando || !correo || !password}>
        {enviando ? (
          "Ingresando…"
        ) : (
          <>
            Ingresar <Icono nombre="flecha" className="size-5" trazo={2.4} />
          </>
        )}
      </button>
    </form>
  );
}
