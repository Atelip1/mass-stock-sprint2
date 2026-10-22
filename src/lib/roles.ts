import type { Rol } from "./tipos";

export type Pantalla = {
  href: string;
  etiqueta: string;
  grupo: "Operación" | "Control" | "Análisis" | "Administración" | null;
  roles: Rol[];
};

const TODOS: Rol[] = ["administrador", "supervisor", "reponedor"];

/**
 * Matriz de acceso (Tabla 2 del informe de avance), solo con las pantallas ya construidas.
 * Cada sprint agrega aquí sus pantallas; el menú y el middleware leen esta misma lista (RF-02).
 */
export const PANTALLAS: Pantalla[] = [
  { href: "/", etiqueta: "Inicio", grupo: null, roles: TODOS },
  { href: "/ingreso", etiqueta: "Registrar ingreso", grupo: "Operación", roles: ["administrador", "reponedor"] },
  { href: "/stock", etiqueta: "Stock en tiempo real", grupo: "Control", roles: TODOS },
  { href: "/catalogo", etiqueta: "Catálogo", grupo: "Administración", roles: ["administrador", "supervisor"] },
  { href: "/usuarios", etiqueta: "Usuarios", grupo: "Administración", roles: ["administrador"] },
];

export const GRUPOS = ["Operación", "Control", "Análisis", "Administración"] as const;

/** ¿El rol puede abrir esta ruta? Las rutas que no están en la matriz (sin acceso, cambio de contraseña) son libres. */
export function puedeAbrir(ruta: string, rol: Rol): boolean {
  const pantalla = PANTALLAS.filter((p) => p.href !== "/").find(
    (p) => ruta === p.href || ruta.startsWith(p.href + "/"),
  );
  if (!pantalla) return true;
  return pantalla.roles.includes(rol);
}
