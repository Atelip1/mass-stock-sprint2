// Crea el primer administrador del sistema (el jefe de tienda).
// Uso:  npm run crear-admin -- "Ana Torres" admin@mass.pe
// Lee las claves de .env.local. Imprime una contraseña temporal que se cambia en el primer ingreso.
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

try {
  for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // Sin .env.local se usan las variables del entorno.
}

const [nombre, correo] = process.argv.slice(2);
if (!nombre || !correo) {
  console.error('Uso: npm run crear-admin -- "Nombre Apellido" correo@mass.pe');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const letras = "abcdefghjkmnpqrstuvwxyz";
let temporal = "Mass-";
for (let i = 0; i < 4; i++) temporal += letras[randomInt(letras.length)];
for (let i = 0; i < 4; i++) temporal += String(randomInt(2, 10));

const admin = createClient(url, clave, { auth: { persistSession: false } });
const email = correo.trim().toLowerCase();

const { data, error } = await admin.auth.admin.createUser({ email, password: temporal, email_confirm: true });
if (error) {
  console.error("No se pudo crear la cuenta:", error.message);
  process.exit(1);
}
const { error: e2 } = await admin.from("perfiles").insert({ id: data.user.id, nombre, correo: email, rol: "administrador" });
if (e2) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error("No se pudo crear el perfil:", e2.message, "\n¿Ejecutaste la migración de la base de datos?");
  process.exit(1);
}

console.log(`\nAdministrador creado: ${nombre} <${email}>`);
console.log(`Contraseña temporal:  ${temporal}`);
console.log("Al ingresar, el sistema pedirá crear una contraseña nueva.\n");
