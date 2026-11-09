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

if (!url || !key) {
  console.log("No se encontraron variables de Supabase.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.from("perfiles").select("id, nombre, correo, rol, activo, debe_cambiar_password");

if (error) {
  console.error("Error al consultar perfiles:", error.message);
} else {
  console.log("Usuarios en la base de datos:");
  console.table(data);
}
