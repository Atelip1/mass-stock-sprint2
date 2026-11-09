import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

let env = {};
try {
  for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, key, { auth: { persistSession: false } });
const nuevaClave = process.argv[2] || "AdminMass2026!";

const { data: usuario } = await admin.from("perfiles").select("id, correo").eq("correo", "admin@mass.pe").maybeSingle();

if (!usuario) {
  console.log("No se encontró admin@mass.pe");
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: nuevaClave });
if (error) {
  console.error("Error al actualizar clave:", error.message);
} else {
  await admin.from("perfiles").update({ debe_cambiar_password: false, intentos_fallidos: 0, bloqueado_hasta: null }).eq("id", usuario.id);
  console.log(`Clave de admin@mass.pe actualizada a: ${nuevaClave}`);
}
