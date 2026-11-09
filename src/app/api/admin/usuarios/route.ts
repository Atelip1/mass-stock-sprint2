import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { perfilActual, supabaseAdmin } from "@/lib/supabase/server";
import type { Rol } from "@/lib/tipos";

const ROLES: Rol[] = ["administrador", "supervisor", "reponedor"];

/** Contraseña temporal legible para dictarla al usuario (sin 0/O ni 1/l). */
function contrasenaTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const digitos = "23456789";
  let s = "Mass-";
  for (let i = 0; i < 4; i++) s += letras[randomInt(letras.length)];
  for (let i = 0; i < 4; i++) s += digitos[randomInt(digitos.length)];
  return s;
}

function error(mensaje: string, status = 400) {
  return NextResponse.json({ mensaje }, { status });
}

async function exigirAdministrador() {
  const yo = await perfilActual();
  if (!yo || !yo.activo || yo.rol !== "administrador") return null;
  return yo;
}

async function adminsActivos(admin: ReturnType<typeof supabaseAdmin>) {
  const { count } = await admin
    .from("perfiles")
    .select("id", { count: "exact", head: true })
    .eq("rol", "administrador")
    .eq("activo", true);
  return count ?? 0;
}

/** RF-04: crear usuario con uno de los tres roles. Devuelve la contraseña temporal una sola vez. */
export async function POST(req: Request) {
  if (!(await exigirAdministrador())) return error("Solo el administrador gestiona usuarios.", 403);

  const body = (await req.json().catch(() => ({}))) as { nombre?: string; correo?: string; rol?: Rol };
  const nombre = (body.nombre ?? "").trim();
  const correo = (body.correo ?? "").trim().toLowerCase();
  const rol = body.rol;

  if (!nombre) return error("Escribe el nombre completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return error("Escribe un correo válido, por ejemplo nombre@mass.pe.");
  if (!rol || !ROLES.includes(rol)) return error("Elige un rol.");

  const admin = supabaseAdmin();
  const { data: existente } = await admin.from("perfiles").select("nombre").eq("correo", correo).maybeSingle();
  if (existente) return error(`El correo ${correo} ya está registrado para ${existente.nombre}.`);

  const temporal = contrasenaTemporal();
  const { data: creado, error: e1 } = await admin.auth.admin.createUser({
    email: correo,
    password: temporal,
    email_confirm: true,
  });
  if (e1 || !creado.user) {
    return error(/already/i.test(e1?.message ?? "") ? `El correo ${correo} ya existe en Supabase Auth.` : "No se pudo crear la cuenta.");
  }

  const { error: e2 } = await admin.from("perfiles").insert({
    id: creado.user.id,
    nombre,
    correo,
    rol,
    debe_cambiar_password: true,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(creado.user.id);
    return error("No se pudo guardar el perfil. Inténtalo de nuevo.");
  }

  return NextResponse.json({ ok: true, temporal });
}

/** RF-04 y RF-05: editar, activar, desactivar o restablecer la contraseña de un usuario. */
export async function PATCH(req: Request) {
  const yo = await exigirAdministrador();
  if (!yo) return error("Solo el administrador gestiona usuarios.", 403);

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    accion?: "editar" | "activar" | "desactivar" | "restablecer";
    nombre?: string;
    rol?: Rol;
  };
  if (!body.id || !body.accion) return error("Solicitud incompleta.");

  const admin = supabaseAdmin();
  const { data: usuario } = await admin.from("perfiles").select("*").eq("id", body.id).maybeSingle();
  if (!usuario) return error("El usuario no existe.", 404);

  const quitaUltimoAdmin = async () =>
    usuario.rol === "administrador" && usuario.activo && (await adminsActivos(admin)) <= 1;

  switch (body.accion) {
    case "editar": {
      const nombre = (body.nombre ?? "").trim();
      if (!nombre) return error("Escribe el nombre completo.");
      if (!body.rol || !ROLES.includes(body.rol)) return error("Elige un rol.");
      if (body.rol !== "administrador" && (await quitaUltimoAdmin())) {
        return error("No puedes quitar el rol al último administrador activo.");
      }
      await admin.from("perfiles").update({ nombre, rol: body.rol }).eq("id", body.id);
      return NextResponse.json({ ok: true });
    }
    case "desactivar": {
      if (await quitaUltimoAdmin()) return error("No puedes desactivar al último administrador activo.");
      await admin.from("perfiles").update({ activo: false }).eq("id", body.id);
      return NextResponse.json({ ok: true });
    }
    case "activar": {
      await admin.from("perfiles").update({ activo: true }).eq("id", body.id);
      return NextResponse.json({ ok: true });
    }
    case "restablecer": {
      const temporal = contrasenaTemporal();
      const { error: e } = await admin.auth.admin.updateUserById(body.id, { password: temporal });
      if (e) return error("No se pudo restablecer la contraseña.");
      await admin
        .from("perfiles")
        .update({ debe_cambiar_password: true, intentos_fallidos: 0, bloqueado_hasta: null })
        .eq("id", body.id);
      return NextResponse.json({ ok: true, temporal });
    }
    default:
      return error("Acción no válida.");
  }
}
