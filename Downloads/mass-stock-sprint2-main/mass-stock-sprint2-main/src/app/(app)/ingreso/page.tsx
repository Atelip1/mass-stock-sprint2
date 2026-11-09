"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { CampoCodigo } from "@/components/CampoCodigo";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { SelectorProducto, type OpcionProducto } from "@/components/SelectorProducto";
import { usePerfil } from "@/components/Shell";
import { Encabezado, MensajeError } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fechaHora, hoyISO, mensajeError } from "@/lib/formato";
import { useAhora } from "@/lib/useAhora";
import type { FilaStock, Proveedor } from "@/lib/tipos";

type Linea = {
  clave: number;
  codigo: string;
  productoId: string | null;
  cantidad: string;
  lote: string;
  vencimiento: string;
  zona: string;
  aviso: string | null;
};

let siguiente = 0;
const nuevaLinea = (): Linea => ({
  clave: ++siguiente,
  codigo: "",
  productoId: null,
  cantidad: "",
  lote: "",
  vencimiento: "",
  zona: "",
  aviso: null,
});

// Mantiene compatibilidad con respuestas de v_stock que no incluyan proveedor.
function obtenerProveedorId(producto: FilaStock | null | undefined): string | undefined {
  return (producto as (FilaStock & { proveedor_id?: string }) | null | undefined)?.proveedor_id;
}

/** RF-14, RF-15, RF-22: ingreso de mercadería por guía de remisión, con una o varias líneas. Entra al almacén. */
export default function RegistrarIngreso() {
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const { estado, version } = useConexion();

  const [productos, setProductos] = useState<FilaStock[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [guia, setGuia] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [lineas, setLineas] = useState<Linea[]>(() => [nuevaLinea()]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ahora = useAhora();
  const refsCantidad = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    const supabase = supabaseNavegador();
    Promise.all([
      supabase.from("v_stock").select("*").eq("activo", true).order("nombre"),
      supabase.from("proveedores").select("*").eq("activo", true).order("razon_social"),
      supabase.from("parametros").select("valor").eq("clave", "zonas_almacen").maybeSingle(),
    ]).then(([p, v, z]) => {
      setProductos((p.data as FilaStock[]) ?? []);
      setProveedores((v.data as Proveedor[]) ?? []);
      setZonas((z.data?.valor as string[]) ?? []);
    });
  }, [version]);

  const opciones: OpcionProducto[] = useMemo(
    () => productos.map((p) => ({ id: p.producto_id, nombre: p.nombre, codigo_barras: p.codigo_barras, detalle: `stock ${p.total}` })),
    [productos],
  );
  const porId = useMemo(() => new Map(productos.map((p) => [p.producto_id, p])), [productos]);

  const cambiar = useCallback((clave: number, cambios: Partial<Linea>) => {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }, []);

  /** Al leer un código (lectora o cámara) se elige el producto y el cursor pasa a la cantidad. */
  const leerCodigo = (clave: number, codigo: string) => {
    const p = productos.find((x) => x.codigo_barras === codigo);
    if (!p) {
      cambiar(clave, { productoId: null, aviso: `El código ${codigo} no está en el catálogo. Pide al administrador que registre el producto.` });
      return;
    }
    cambiar(clave, { productoId: p.producto_id, codigo, aviso: null });
    const proveedorProducto = obtenerProveedorId(p);
    if (!proveedorId && proveedorProducto) setProveedorId(proveedorProducto);
    setTimeout(() => refsCantidad.current.get(clave)?.focus(), 0);
  };

  function maxFechaISO() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 10);
    return d.toISOString().slice(0, 10);
  }

  function validar(): string | null {
    if (!guia.trim()) return "Escribe el número de la guía de remisión.";
    if (!proveedorId) return "Elige el proveedor de la guía.";
    const maxVenc = maxFechaISO();
    for (const [i, l] of lineas.entries()) {
      const p = l.productoId ? porId.get(l.productoId) : null;
      const n = `Línea ${i + 1}${p ? ` (${p.nombre})` : ""}`;
      if (!p) return `${n}: elige el producto o escanea su código.`;
      if (!/^\d+$/.test(l.cantidad) || Number(l.cantidad) <= 0) return `${n}: la cantidad debe ser un número entero mayor que 0.`;
      if (!l.lote.trim()) return `${n}: escribe el lote que figura en el empaque.`;
      if (p.controla_vencimiento && !l.vencimiento) return `${n}: este producto controla vencimiento; escribe la fecha del empaque.`;
      if (l.vencimiento && l.vencimiento < hoyISO()) return `${n}: la fecha de vencimiento ya pasó; no se puede ingresar un lote vencido.`;
      if (l.vencimiento && l.vencimiento > maxVenc) return `${n}: la fecha de vencimiento supera el máximo permitido (10 años). Verifica el año.`;
      if (!l.zona) return `${n}: elige la zona del almacén.`;
    }
    return null;
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const v = validar();
    if (v) return setError(v);
    setError(null);
    setEnviando(true);
    const { error: err } = await supabaseNavegador().rpc("registrar_ingreso", {
      p_guia: guia.trim(),
      p_proveedor_id: proveedorId,
      p_lineas: lineas.map((l) => ({
        producto_id: l.productoId,
        cantidad: l.cantidad,
        lote: l.lote.trim(),
        vencimiento: l.vencimiento || null,
        zona: l.zona,
      })),
    });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    const unidades = lineas.reduce((s, l) => s + Number(l.cantidad), 0);
    avisar(`Ingreso registrado: ${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"}, ${unidades} unidades al almacén.`);
    setGuia("");
    setProveedorId("");
    setLineas([nuevaLinea()]);
  }

  const bloqueado = estado !== "conectado";
  const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  return (
    <>
      <Encabezado
        ruta="Operación › Registrar ingreso"
        titulo="Registrar ingreso"
        descripcion="Recepción de mercadería por guía de remisión con lote, vencimiento y zona de almacén."
      />
      <AvisoSinConexion />

      <form
        onSubmit={registrar}
        className="panel p-4 sm:p-5"
        noValidate
        onKeyDown={(e) => {
          // La lectora USB termina cada código con Enter; ese Enter no debe enviar el formulario.
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="guia">
              Guía de remisión
            </label>
            <input id="guia" className="campo" placeholder="T001-000123" value={guia} onChange={(e) => setGuia(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="proveedor">
              Proveedor
            </label>
            <select id="proveedor" className="campo" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Elige un proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Líneas de la guía</h2>
          <span className="text-xs text-suave">
            {lineas.length} {lineas.length === 1 ? "línea" : "líneas"} · {totalUnidades} unidades
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {lineas.map((l, i) => {
            const p = l.productoId ? porId.get(l.productoId) : null;
            return (
              <fieldset key={l.clave} className="rounded-md border border-borde bg-fondo/50 p-3 sm:p-4">
                <legend className="sr-only">Línea {i + 1}</legend>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-suave">Línea {i + 1}</span>
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      className="enlace text-xs text-peligro"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      aria-label={`Quitar línea ${i + 1}`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="etiqueta" htmlFor={`codigo-${l.clave}`}>
                      Código de barras
                    </label>
                    <CampoCodigo
                      id={`codigo-${l.clave}`}
                      valor={l.codigo}
                      onCambiar={(v) => cambiar(l.clave, { codigo: v, aviso: null })}
                      onLeido={(c) => leerCodigo(l.clave, c)}
                    />
                    {l.aviso && <p className="mt-1 text-xs font-medium text-peligro">{l.aviso}</p>}
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`producto-${l.clave}`}>
                      Producto
                    </label>
                    <SelectorProducto
                      id={`producto-${l.clave}`}
                      opciones={opciones}
                      valor={l.productoId}
                      onCambiar={(id) => {
                        const prod = id ? porId.get(id) : null;
                        cambiar(l.clave, { productoId: id, codigo: prod?.codigo_barras ?? "", aviso: null });
                        const proveedorProducto = obtenerProveedorId(prod);
                        if (!proveedorId && proveedorProducto) setProveedorId(proveedorProducto);
                      }}
                    />
                    {p && (
                      <p className="ayuda">
                        Stock actual: <b>{p.almacen}</b> en almacén · <b>{p.percha}</b> en percha · <b>{p.total}</b> total
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`cant-${l.clave}`}>
                      Cantidad
                    </label>
                    <input
                      id={`cant-${l.clave}`}
                      ref={(el) => {
                        if (el) refsCantidad.current.set(l.clave, el);
                        else refsCantidad.current.delete(l.clave);
                      }}
                      className="campo"
                      inputMode="numeric"
                      value={l.cantidad}
                      onChange={(e) => cambiar(l.clave, { cantidad: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    />
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`lote-${l.clave}`}>
                      Lote
                    </label>
                    <input
                      id={`lote-${l.clave}`}
                      className="campo font-mono"
                      placeholder="Del empaque"
                      value={l.lote}
                      onChange={(e) => cambiar(l.clave, { lote: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`venc-${l.clave}`}>
                      Vencimiento {p && !p.controla_vencimiento && <span className="font-normal text-suave">(opcional)</span>}
                    </label>
                    <input
                      id={`venc-${l.clave}`}
                      className="campo"
                      type="date"
                      min={hoyISO()}
                      max={maxFechaISO()}
                      value={l.vencimiento}
                      onChange={(e) => cambiar(l.clave, { vencimiento: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor={`zona-${l.clave}`}>
                      Zona del almacén
                    </label>
                    <select id={`zona-${l.clave}`} className="campo" value={l.zona} onChange={(e) => cambiar(l.clave, { zona: e.target.value })}>
                      <option value="">Elige la zona</option>
                      {zonas.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            );
          })}
        </div>

        <button
          type="button"
          className="btn-secundario mt-3"
          onClick={() => {
            const nueva = nuevaLinea();
            nueva.zona = lineas.at(-1)?.zona ?? "";
            setLineas((ls) => [...ls, nueva]);
            setTimeout(() => document.getElementById(`codigo-${nueva.clave}`)?.focus(), 0);
          }}
        >
          + Agregar otra línea
        </button>

        <p className="mt-4 text-xs text-suave">
          Registra: {perfil.nombre}{ahora && ` · ${fechaHora(ahora)}`}
        </p>
        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-principal" disabled={enviando || bloqueado}>
            {enviando ? "Registrando…" : `Registrar ingreso${lineas.length > 1 ? ` (${lineas.length} líneas)` : ""}`}
          </button>
          <button
            type="button"
            className="btn-secundario"
            onClick={() => {
              setGuia("");
              setProveedorId("");
              setLineas([nuevaLinea()]);
              setError(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}
