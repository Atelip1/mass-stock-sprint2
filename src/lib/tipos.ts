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

export type TipoAlerta = "abastecimiento" | "percha";
export type NivelAlerta = "preventiva" | "critica" | "sin_stock" | "por_reponer" | "vacia";
export type EstadoAlerta = "pendiente" | "en_reposicion" | "repuesto" | "cerrado";
export type ClaseABC = "A" | "B" | "C" | "sin_ventas";

/** Fila de alertas_activas(). */
export type AlertaActiva = {
  id: string;
  producto_id: string;
  nombre: string;
  codigo_barras: string;
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  estado: EstadoAlerta;
  percha: number;
  almacen: number;
  total: number;
  stock_minimo: number;
  minimo_percha: number;
  unidad: string;
  cobertura_dias: number | null;
  horas: number;
  sugerido: number;
  clase: ClaseABC;
  almacen_vacio: boolean;
  responsable: string | null;
  proveedor_id: string;
  detectada_en: string;
};

/** Fila de v_historial. */
export type LineaHistorial = {
  linea_id: string;
  movimiento_id: string;
  creado_en: string;
  tipo: "ingreso" | "reposicion" | "salida" | "ajuste";
  motivo: string | null;
  guia_remision: string | null;
  detalle: string | null;
  anulado: boolean;
  motivo_anulacion: string | null;
  anulado_en: string | null;
  usuario_id: string;
  usuario: string;
  anulado_por: string | null;
  fecha_venta: string | null;
  producto_id: string;
  producto: string;
  codigo_barras: string;
  codigo_lote: string;
  zona_almacen: string;
  ubicacion_origen: "almacen" | "percha" | null;
  ubicacion_destino: "almacen" | "percha" | null;
  cantidad: number;
  efecto: number;
};

/** Lote con sus existencias, para elegirlo en reposición y salida. */
export type LoteConStock = {
  id: string;
  codigo_lote: string;
  fecha_vencimiento: string | null;
  zona_almacen: string;
  existencias: { ubicacion: "almacen" | "percha"; cantidad: number }[];
};

export const NOMBRE_TIPO_MOV: Record<string, string> = {
  ingreso: "Ingreso",
  reposicion: "Reposición",
  salida: "Salida",
  ajuste: "Ajuste",
};
