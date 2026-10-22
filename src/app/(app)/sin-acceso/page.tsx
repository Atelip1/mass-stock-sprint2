import Link from "next/link";
import { Encabezado } from "@/components/ui";
import { perfilActual } from "@/lib/supabase/server";
import { NOMBRE_ROL } from "@/lib/tipos";

/** RF-02 (Figura 37): una pantalla no permitida abierta por enlace muestra «Sin acceso». */
export default async function SinAcceso() {
  const perfil = await perfilActual();
  return (
    <>
      <Encabezado
        ruta="Sin acceso"
        titulo="Sin acceso"
        descripcion={`Tu rol (${perfil ? NOMBRE_ROL[perfil.rol] : "—"}) no tiene permiso para esta pantalla. Vuelve al inicio para seguir trabajando.`}
      />
      <Link href="/" className="btn-principal">
        Ir al inicio
      </Link>
    </>
  );
}
