export type Rol = "administrador" | "supervisor" | "reponedor";

export type Perfil = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  debe_cambiar_password: boolean;
  ultimo_acceso: string | null;
  creado_en: string;
};

export type Categoria = { id: string; nombre: string; activa: boolean };

export type Proveedor = { id: string; ruc: string; razon_social: string; dias_entrega: number; activo: boolean };

export type Producto = {
  id: string;
  codigo_barras: string;
  nombre: string;
  categoria_id: string;
  proveedor_id: string;
  unidad: string;
  stock_minimo: number;
  minimo_percha: number;
  controla_vencimiento: boolean;
  codigo_interno: boolean;
  activo: boolean;
};

export type EstadoStock = "ok" | "bajo_minimo" | "critico" | "sin_stock";
export type EstadoPercha = "ok" | "por_reponer" | "vacia";

/** Fila de la vista v_stock. */
export type FilaStock = {
  producto_id: string;
  codigo_barras: string;
  nombre: string;
  nombre_norm: string;
  categoria_id: string;
  categoria: string;
  unidad: string;
  stock_minimo: number;
  minimo_percha: number;
  controla_vencimiento: boolean;
  activo: boolean;
  almacen: number;
  percha: number;
  total: number;
  proximo_vencimiento: string | null;
  estado_stock: EstadoStock;
  estado_percha: EstadoPercha;
};

export const NOMBRE_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  supervisor: "Supervisor",
  reponedor: "Reponedor",
};

export const UNIDADES = ["unidad", "botella", "lata", "paquete", "bolsa", "caja", "kg", "litro"] as const;
