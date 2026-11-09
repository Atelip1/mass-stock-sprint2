"use client";

import { useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { usePerfil } from "@/components/Shell";
import { Encabezado, MensajeError } from "@/components/ui";
import { fechaHora } from "@/lib/formato";
import { useTema } from "@/lib/tema";
import { NOMBRE_ROL } from "@/lib/tipos";

/** RF-03 y RNF-19 (Figuras 20, 36 y 48): tu contraseña y la apariencia del sistema. */
export default function MiCuenta() {
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const [tema, setTema] = useTema();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    if (!actual) return setError("Escribe tu contraseña actual.");
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== repite) return setError("Las dos contraseñas nuevas no coinciden. Escríbelas de nuevo.");
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/mi-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actual, nueva }) });
      const d = await r.json();
      if (!r.ok) setError(d.mensaje ?? "No se pudo cambiar la contraseña.");
      else {
        avisar("Contraseña cambiada. Úsala la próxima vez que ingreses.");
        setActual("");
        setNueva("");
        setRepite("");
      }
    } catch {
      setError("No hay conexión con el servidor. Inténtalo de nuevo.");
    }
    setEnviando(false);
  }

  return (
    <>
      <Encabezado ruta="Mi cuenta" titulo="Mi cuenta" descripcion="Tu contraseña y la apariencia del sistema." />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={cambiar} className="panel p-4 sm:p-5" noValidate>
          <h2 className="text-base font-bold">Cambiar contraseña</h2>
          <label className="etiqueta mt-4" htmlFor="actual">
            Contraseña actual
          </label>
          <input id="actual" className="campo" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          <label className="etiqueta mt-4" htmlFor="nueva">
            Nueva contraseña
          </label>
          <input id="nueva" className="campo" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <p className="ayuda">Al menos 8 caracteres.</p>
          <label className="etiqueta mt-4" htmlFor="repite">
            Repite la nueva contraseña
          </label>
          <input id="repite" className="campo" type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} />
          <div className="mt-3">
            <MensajeError>{error}</MensajeError>
          </div>
          <button className="btn-principal mt-4 w-full" disabled={enviando}>
            {enviando ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>

        <div className="panel h-fit p-4 sm:p-5">
          <h2 className="text-base font-bold">Tu cuenta</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-suave">Nombre</dt>
            <dd>{perfil.nombre}</dd>
            <dt className="text-suave">Correo</dt>
            <dd className="truncate">{perfil.correo}</dd>
            <dt className="text-suave">Rol</dt>
            <dd>{NOMBRE_ROL[perfil.rol]}</dd>
            <dt className="text-suave">Último acceso</dt>
            <dd>{fechaHora(perfil.ultimo_acceso)}</dd>
          </dl>

          <h2 className="mt-6 text-base font-bold">Apariencia</h2>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-azul" checked={tema === "oscuro"} onChange={(e) => setTema(e.target.checked ? "oscuro" : "claro")} />
            Modo oscuro
          </label>
          <p className="ayuda">Se recuerda en este equipo.</p>

          <h2 className="mt-6 text-base font-bold">Sesión</h2>
          <button
            className="btn-secundario mt-2"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/login";
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}
