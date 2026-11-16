"use client";

import { useCallback, useEffect, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, MensajeError } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fechaHora } from "@/lib/formato";
import { NOMBRE_ROL, type Perfil, type Rol } from "@/lib/tipos";

type Respuesta = { ok?: boolean; mensaje?: string; correoEnviado?: boolean; errorCorreo?: string };

async function llamar(metodo: "POST" | "PATCH", cuerpo: object): Promise<Respuesta> {
  try {
    const r = await fetch("/api/admin/usuarios", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return await r.json();
  } catch {
    return { mensaje: "No hay conexión con el servidor. Inténtalo de nuevo." };
  }
}

/** RF-04 y RF-05: usuarios con uno de los tres roles. Las claves se envían por correo y nunca las visualiza el admin. */
export default function Usuarios() {
  const yo = usePerfil();
  const { avisar, confirmar } = useAvisos();
  const [usuarios, setUsuarios] = useState<Perfil[] | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; nombre: string; correo: string; rol: Rol }>({ id: null, nombre: "", correo: "", rol: "reponedor" });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloCorreo, setFalloCorreo] = useState<string | null>(null);

  /** Si el correo no salió, deja un aviso fijo con el motivo; la clave temporal nunca se muestra al admin. */
  const revisarCorreo = (r: Respuesta, correo: string, nombre: string) => {
    if (r.correoEnviado !== false) return false;
    setFalloCorreo(
      `No se pudo enviar el correo a ${nombre} (${correo}). Motivo: ${r.errorCorreo ?? "error desconocido"} ` +
        `Cuando lo corrijas, pulsa «Restablecer clave» en su fila para enviarle una nueva clave temporal.`,
    );
    avisar("El correo no se pudo enviar. Revisa el aviso en rojo.", "error");
    return true;
  };

  const cargar = useCallback(async () => {
    const { data } = await supabaseNavegador().from("perfiles").select("*").order("nombre");
    setUsuarios((data as Perfil[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiar = () => {
    setEdit({ id: null, nombre: "", correo: "", rol: "reponedor" });
    setError(null);
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const r = edit.id
      ? await llamar("PATCH", { id: edit.id, accion: "editar", nombre: edit.nombre, rol: edit.rol })
      : await llamar("POST", { nombre: edit.nombre, correo: edit.correo, rol: edit.rol });
    setEnviando(false);
    if (!r.ok) return setError(r.mensaje ?? "No se pudo guardar.");
    if (edit.id) avisar("Usuario actualizado.");
    else if (!revisarCorreo(r, edit.correo, edit.nombre)) {
      setFalloCorreo(null);
      avisar(`Usuario creado. Se ha enviado una contraseña temporal (válida 15 min) a ${edit.correo}.`);
    }
    limpiar();
    cargar();
  }

  async function accion(u: Perfil, tipo: "activar" | "desactivar" | "restablecer") {
    if (tipo !== "activar") {
      const ok = await confirmar(
        tipo === "desactivar"
          ? { titulo: `¿Desactivar a ${u.nombre}?`, texto: "No podrá iniciar sesión. Sus registros se conservan y puedes activarlo de nuevo.", boton: "Desactivar", peligro: true }
          : {
              titulo: `¿Restablecer la contraseña de ${u.nombre}?`,
              texto: `Se generará una contraseña temporal válida por 15 minutos y se enviará automáticamente a su correo (${u.correo}). La cuenta se desbloqueará y deberá cambiarla al ingresar.`,
              boton: "Restablecer y enviar correo",
            },
      );
      if (!ok) return;
    }
    const r = await llamar("PATCH", { id: u.id, accion: tipo });
    if (!r.ok) return avisar(r.mensaje ?? "No se pudo completar la acción.", "error");
    if (tipo === "activar") avisar(`${u.nombre} activado.`);
    else if (tipo === "desactivar") avisar(`${u.nombre} desactivado.`);
    else if (!revisarCorreo(r, u.correo, u.nombre)) {
      setFalloCorreo(null);
      avisar(`Contraseña temporal enviada al correo de ${u.nombre}.`);
    }
    cargar();
  }

  const bloqueado = (u: Perfil) => !!u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date();

  return (
    <>
      <Encabezado
        ruta="Administración › Usuarios"
        titulo="Usuarios y Accesos"
        descripcion="Crea cuentas de personal y gestiona roles."
      />

      {falloCorreo && (
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            <MensajeError>{falloCorreo}</MensajeError>
          </div>
          <button type="button" className="btn-secundario" onClick={() => setFalloCorreo(null)}>
            Cerrar
          </button>
        </div>
      )}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,340px)_1fr]">
        <form onSubmit={guardar} className="panel h-fit p-4 sm:p-5" noValidate>
          <h2 className="text-base font-bold">{edit.id ? "Editar usuario" : "Nuevo usuario"}</h2>
          {/* En pantallas medianas el formulario va arriba en una fila; en muy anchas, al costado de la tabla. */}
          <div className="grid gap-x-3 md:grid-cols-3 2xl:grid-cols-1">
            <div>
              <label className="etiqueta mt-4" htmlFor="u-nombre">
                Nombre completo
              </label>
              <input id="u-nombre" className="campo" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} />
            </div>
            <div>
              <label className="etiqueta mt-4" htmlFor="u-correo">
                Correo
              </label>
              <input
                id="u-correo"
                className="campo"
                type="email"
                placeholder="nombre@mass.pe"
                value={edit.correo}
                disabled={!!edit.id}
                onChange={(e) => setEdit({ ...edit, correo: e.target.value })}
              />
            </div>
            <div>
              <label className="etiqueta mt-4" htmlFor="u-rol">
                Rol
              </label>
              <select id="u-rol" className="campo" value={edit.rol} onChange={(e) => setEdit({ ...edit, rol: e.target.value as Rol })}>
                <option value="reponedor">Reponedor</option>
                <option value="supervisor">Supervisor</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
          </div>
          {!edit.id && (
            <p className="ayuda mt-2">
              Se enviará una clave temporal al correo registrado.
            </p>
          )}
          <div className="mt-3">
            <MensajeError>{error}</MensajeError>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-principal" disabled={enviando}>
              {enviando ? "Guardando…" : edit.id ? "Guardar cambios" : "Crear usuario"}
            </button>
            {edit.id && (
              <button type="button" className="btn-secundario" onClick={limpiar}>
                Cancelar
              </button>
            )}
          </div>
        </form>

        <section className="panel min-w-0">
          <h2 className="border-b border-borde p-4 text-base font-bold">Usuarios ({usuarios?.length ?? "…"})</h2>
          {usuarios === null ? (
            <Cargando />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla min-w-[860px]">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Último acceso</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const esYo = yo?.id === u.id;
                    const b = bloqueado(u);
                    return (
                      <tr key={u.id} className={!u.activo ? "opacity-60" : ""}>
                        <td>
                          <span className="font-semibold">{u.nombre}</span>
                          {esYo && <span className="ml-2 text-xs font-bold text-azul">(tú)</span>}
                          <span className="block text-xs text-suave">{u.correo}</span>
                        </td>
                        <td>
                          <Etiqueta tono={u.rol === "administrador" ? "peligro" : u.rol === "supervisor" ? "aviso" : "ok"}>
                            {NOMBRE_ROL[u.rol]}
                          </Etiqueta>
                        </td>
                        <td>
                          {b ? (
                            <Etiqueta tono="peligro">Bloqueado temporalmente</Etiqueta>
                          ) : u.activo ? (
                            u.debe_cambiar_password ? (
                              <Etiqueta tono="aviso">Clave temporal pendiente</Etiqueta>
                            ) : (
                              <Etiqueta tono="ok">Activo</Etiqueta>
                            )
                          ) : (
                            <Etiqueta tono="neutro">Desactivado</Etiqueta>
                          )}
                        </td>
                        <td className="text-xs whitespace-nowrap text-suave">{fechaHora(u.ultimo_acceso) || "Nunca"}</td>
                        <td className="text-right">
                          {/* Tres columnas fijas: los botones quedan alineados en todas las filas, también en la tuya (sin «Desactivar»). */}
                          <div className="ml-auto grid w-max grid-cols-[4.5rem_8.5rem_6.5rem] gap-1.5">
                            <button
                              className="btn-secundario min-h-8 px-2 text-xs whitespace-nowrap"
                              onClick={() => {
                                setEdit({ id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol });
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="btn-secundario min-h-8 px-2 text-xs whitespace-nowrap"
                              title="Genera una clave temporal de 15 min y la envía a su correo"
                              onClick={() => accion(u, "restablecer")}
                            >
                              Restablecer clave
                            </button>
                            {esYo ? (
                              <span className="grid min-h-8 place-items-center text-[11px] text-suave" title="No puedes desactivar tu propia cuenta">
                                Tu cuenta
                              </span>
                            ) : (
                              <button
                                className={`${u.activo ? "btn-peligro" : "btn-secundario"} min-h-8 px-2 text-xs whitespace-nowrap`}
                                onClick={() => accion(u, u.activo ? "desactivar" : "activar")}
                              >
                                {u.activo ? "Desactivar" : "Activar"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
