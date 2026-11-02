import type { Rol } from "./tipos";

export type Pantalla = {
  href: string;
  etiqueta: string;
  grupo: "Operación" | "Control" | "Análisis" | "Administración" | null;
  roles: Rol[];
};

const TODOS: Rol[] = ["administrador", "supervisor", "reponedor"];

/**
 * Matriz de acceso (Tabla 2 del informe de avance).
 * El menú y el middleware leen esta misma lista (RF-02). Los permisos reales
 * se vuelven a validar en la base de datos (RLS y funciones, RNF-13).
 */
export const PANTALLAS: Pantalla[] = [
  { href: "/", etiqueta: "Inicio", grupo: null, roles: TODOS },
  { href: "/ingreso", etiqueta: "Registrar ingreso", grupo: "Operación", roles: ["administrador", "reponedor"] },
  { href: "/reponer", etiqueta: "Registrar reposición", grupo: "Operación", roles: ["administrador", "reponedor"] },
  { href: "/salida", etiqueta: "Registrar salida", grupo: "Operación", roles: ["administrador", "reponedor"] },
  { href: "/conteo", etiqueta: "Conteo físico", grupo: "Operación", roles: TODOS },
  { href: "/importar-ventas", etiqueta: "Importar ventas", grupo: "Operación", roles: ["administrador"] },
  { href: "/stock", etiqueta: "Stock en tiempo real", grupo: "Control", roles: TODOS },
  { href: "/reposicion", etiqueta: "Reposición", grupo: "Control", roles: TODOS },
  { href: "/vencimientos", etiqueta: "Vencimientos", grupo: "Control", roles: TODOS },
  { href: "/historial", etiqueta: "Historial", grupo: "Análisis", roles: TODOS },
  { href: "/rotacion", etiqueta: "Reportes de rotación", grupo: "Análisis", roles: ["administrador", "supervisor"] },
  { href: "/indicadores", etiqueta: "Indicadores", grupo: "Análisis", roles: ["administrador", "supervisor"] },
  { href: "/catalogo", etiqueta: "Catálogo", grupo: "Administración", roles: ["administrador", "supervisor"] },
  { href: "/usuarios", etiqueta: "Usuarios", grupo: "Administración", roles: ["administrador"] },
  { href: "/parametros", etiqueta: "Parámetros", grupo: "Administración", roles: ["administrador"] },
  // Se muestra abajo del menú, junto a «Cerrar sesión».
  { href: "/mi-cuenta", etiqueta: "Mi cuenta", grupo: null, roles: TODOS },
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
