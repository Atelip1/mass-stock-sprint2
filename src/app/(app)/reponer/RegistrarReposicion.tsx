"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { CampoCodigo } from "@/components/CampoCodigo";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { SelectorProducto } from "@/components/SelectorProducto";
import { usePerfil } from "@/components/Shell";
import { BarraPercha, Encabezado, EtiquetaStock, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fechaHora, mensajeError } from "@/lib/formato";
import { cantidadEn, loteVigente, sugeridoPercha, textoLote, useLotes, useProductosStock } from "@/lib/operacion";
import { useAhora } from "@/lib/useAhora";
import { useDatos } from "@/lib/datos";
import type { AlertaActiva, EstadoPercha } from "@/lib/tipos";

function estadoPercha(percha: number, minimo: number): EstadoPercha {
  return percha === 0 ? "vacia" : percha <= minimo ? "por_reponer" : "ok";
}

/** RF-16 (Figuras 8, 40 y 51): traslado de un lote del almacén a la percha. No cambia el stock total (RN-12). */
export function RegistrarReposicion() {
  const params = useSearchParams();
  const router = useRouter();
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const { estado } = useConexion();
  const ahora = useAhora();
  const productos = useProductosStock();

  const [productoId, setProductoId] = useState<string | null>(params.get("producto"));
  const [codigo, setCodigo] = useState("");
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [loteId, setLoteId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const lotes = useLotes(productoId);
  const producto = productos.find((p) => p.producto_id === productoId) ?? null;
  const lotesAlmacen = useMemo(() => lotes.filter((l) => loteVigente(l) && cantidadEn(l, "almacen") > 0), [lotes]);
  const lote = lotesAlmacen.find((l) => l.id === loteId) ?? null;

  // Lista de pendientes: alertas de percha que se pueden atender con lo que hay en almacén (RN-08).
  const { datos: alertas } = useDatos<AlertaActiva[]>("alertas-activas", () => supabaseNavegador().rpc("alertas_activas"));
  const pendientes = (alertas ?? []).filter((a) => a.tipo === "percha" && !a.almacen_vacio);

  // Al elegir producto: propone el lote que vence antes (FEFO) y la cantidad sugerida.
  useEffect(() => {
    if (!producto) return;
    setLoteId((actual) => (lotesAlmacen.some((l) => l.id === actual) ? actual : (lotesAlmacen[0]?.id ?? "")));
  }, [producto, lotesAlmacen]);

  const sugerido = producto ? sugeridoPercha(producto) : 0;
  const maxLote = lote ? cantidadEn(lote, "almacen") : 0;
  // Propone el sugerido, pero nunca más de lo que tiene el lote elegido (si no, el traslado fallaría).
  const [editada, setEditada] = useState(false);
  useEffect(() => {
    if (!producto || !lote || editada) return;
    const propuesta = Math.min(sugerido, maxLote);
    setCantidad(propuesta > 0 ? String(propuesta) : "");
  }, [producto, lote, sugerido, maxLote, editada]);

  const elegir = (id: string | null) => {
    setProductoId(id);
    setCantidad("");
    setEditada(false);
    setLoteId("");
    setError(null);
    setAvisoCodigo(null);
  };

  const leer = (c: string) => {
    const p = productos.find((x) => x.codigo_barras === c);
    if (!p) return setAvisoCodigo(`El código ${c} no está en el catálogo.`);
    elegir(p.producto_id);
    setCodigo("");
  };

  const n = Number(cantidad);
  const despuesPercha = producto ? producto.percha + (n || 0) : 0;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return setError("Elige el producto que vas a reponer.");
    if (!lote) return setError("Elige el lote que vas a trasladar.");
    if (!/^\d+$/.test(cantidad) || n <= 0) return setError("La cantidad debe ser un número entero mayor que 0.");
    if (n > maxLote) return setError(`El lote ${lote.codigo_lote} tiene ${maxLote} en almacén; no puedes trasladar ${n}. Corrige la cantidad.`);
    setEnviando(true);
    setError(null);
    const { error: err } = await supabaseNavegador().rpc("registrar_reposicion", {
      p_producto: producto.producto_id,
      p_lote: lote.id,
      p_cantidad: n,
    });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    avisar(`Reposición registrada: ${n} ${producto.nombre} a la percha.`);
    elegir(null);
    router.replace("/reponer");
  }

  return (
    <>
      <Encabezado ruta="Operación › Registrar reposición" titulo="Registrar reposición" descripcion="Traslado de unidades del almacén a la percha. No cambia el stock total." />
      <AvisoSinConexion />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <section className="panel h-fit p-4">
          <h2 className="text-sm font-bold">Pendientes de reponer</h2>
          {pendientes.length === 0 ? (
            <Vacio>No hay perchas pendientes con stock en almacén.</Vacio>
          ) : (
            <ul className="mt-2 space-y-2">
              {pendientes.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => elegir(a.producto_id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition hover:border-azul ${
                      a.producto_id === productoId ? "border-azul bg-azul-claro/50 ring-1 ring-azul" : "border-borde"
                    }`}
                  >
                    <span className="font-semibold">{a.nombre}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-suave">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-fondo">
                        <span
                          className={`block h-full rounded-full ${a.percha === 0 ? "" : "bg-amarillo-oscuro"}`}
                          style={{ width: `${Math.min(100, (a.percha / a.minimo_percha) * 100)}%` }}
                        />
                      </span>
                      Percha <b className="text-texto">{a.percha}</b> de {a.minimo_percha} mín. · almacén <b className="text-texto">{a.almacen}</b>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="etiqueta mt-4" htmlFor="codigo">
            O escanea el producto
          </label>
          <CampoCodigo id="codigo" valor={codigo} onCambiar={(v) => { setCodigo(v); setAvisoCodigo(null); }} onLeido={leer} />
          {avisoCodigo && <p className="mt-1 text-xs font-medium text-peligro">{avisoCodigo}</p>}
          <label className="etiqueta mt-3" htmlFor="producto">
            O elígelo de la lista
          </label>
          <SelectorProducto
            id="producto"
            valor={productoId}
            onCambiar={elegir}
            opciones={productos.map((p) => ({ id: p.producto_id, nombre: p.nombre, codigo_barras: p.codigo_barras, detalle: `percha ${p.percha} · almacén ${p.almacen}` }))}
          />
        </section>

        <form onSubmit={registrar} className="panel h-fit p-4 sm:p-5" noValidate onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && e.preventDefault()}>
          {!producto ? (
            <Vacio>Elige un producto de la lista de pendientes, escanéalo o búscalo.</Vacio>
          ) : (
            <>
              <h2 className="text-lg font-bold">{producto.nombre}</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className={`rounded-md border p-3 ${producto.estado_percha === "ok" ? "border-borde" : "border-amarillo bg-aviso-fondo/50"}`}>
                  <p className="text-xs text-suave">En percha</p>
                  <p className="text-2xl font-bold">
                    {producto.percha} <span className="text-xs font-normal text-suave">de {producto.minimo_percha} mín.</span>
                  </p>
                  <BarraPercha percha={producto.percha} minimo={producto.minimo_percha} estado={producto.estado_percha} compacta />
                </div>
                <div className="rounded-md border border-borde p-3">
                  <p className="text-xs text-suave">En almacén</p>
                  <p className="text-2xl font-bold">{producto.almacen}</p>
                  <p className="text-xs text-suave">disponibles para reponer</p>
                </div>
                <div className="rounded-md border border-borde p-3">
                  <p className="text-xs text-suave">Stock total</p>
                  <p className="text-2xl font-bold">
                    {producto.total} <span className="text-xs font-normal text-suave">mín. {producto.stock_minimo}</span>
                  </p>
                  <EtiquetaStock estado={producto.estado_stock} />
                </div>
              </div>

              {lotesAlmacen.length === 0 ? (
                <p className="mt-4 rounded-md bg-aviso-fondo px-3 py-2 text-sm text-aviso">
                  No hay unidades vigentes en el almacén. Esta percha se atiende con un pedido al proveedor (alerta de abastecimiento).
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="etiqueta" htmlFor="lote">
                      Lote a trasladar (vence antes)
                    </label>
                    <select id="lote" className="campo" value={loteId} onChange={(e) => { setLoteId(e.target.value); setEditada(false); }}>
                      {lotesAlmacen.map((l) => (
                        <option key={l.id} value={l.id}>
                          {textoLote(l, "almacen")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="etiqueta" htmlFor="cantidad">
                      Cantidad colocada en percha
                    </label>
                    <input
                      id="cantidad"
                      className="campo"
                      inputMode="numeric"
                      value={cantidad}
                      onChange={(e) => {
                        setEditada(true);
                        setCantidad(e.target.value.replace(/\D/g, "").slice(0, 6));
                      }}
                    />
                    <p className="ayuda">
                      Sugerido: {sugerido} · este lote tiene {maxLote}
                      {sugerido > maxLote && lotesAlmacen.length > 1 && "; registra el resto con el siguiente lote"}
                    </p>
                  </div>
                </div>
              )}

              {n > 0 && lote && (
                <p className="mt-3 rounded-md bg-fondo px-3 py-2 text-sm">
                  <b>Después del traslado:</b> percha {despuesPercha} de {producto.minimo_percha} mín.{" "}
                  <BarraEstadoTexto estado={estadoPercha(despuesPercha, producto.minimo_percha)} /> · almacén {producto.almacen - n} · total{" "}
                  {producto.total} (sin cambio)
                </p>
              )}

              <p className="mt-3 text-xs text-suave">
                Registra: {perfil.nombre}
                {ahora && ` · ${fechaHora(ahora)}`} (se toma de la sesión)
              </p>
              <div className="mt-3">
                <MensajeError>{error}</MensajeError>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-principal" disabled={enviando || estado !== "conectado" || lotesAlmacen.length === 0}>
                  {enviando ? "Registrando…" : "Registrar reposición"}
                </button>
                <button type="button" className="btn-secundario" onClick={() => { elegir(null); router.replace("/reponer"); }}>
                  Cambiar producto
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}

function BarraEstadoTexto({ estado }: { estado: EstadoPercha }) {
  if (estado === "ok") return <span className="font-semibold text-ok">Cubierta</span>;
  if (estado === "por_reponer") return <span className="font-semibold text-aviso">Por reponer</span>;
  return <span className="font-semibold text-peligro">Vacía</span>;
}
