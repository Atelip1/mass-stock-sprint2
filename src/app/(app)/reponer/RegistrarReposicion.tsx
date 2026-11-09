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
import { fecha, fechaHora, mensajeError } from "@/lib/formato";
import { cantidadEn, loteVigente, sugeridoPercha, textoLote, useLotes, useProductosStock } from "@/lib/operacion";
import { useAhora } from "@/lib/useAhora";
import { useDatos } from "@/lib/datos";
import type { AlertaActiva, EstadoPercha, LoteConStock } from "@/lib/tipos";

const MODO_FEFO = "__fefo__";

function estadoPercha(percha: number, minimo: number): EstadoPercha {
  return percha === 0 ? "vacia" : percha <= minimo ? "por_reponer" : "ok";
}

/** RF-16 (Figuras 8, 40 y 51): traslado de unidades del almacén a la percha por FEFO. No cambia el stock total (RN-12). */
export function RegistrarReposicion() {
  const params = useSearchParams();
  const router = useRouter();
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const { estado } = useConexion();
  const ahora = useAhora();
  const productos = useProductosStock();

  const [productoId, setProductoId] = useState<string | null>(params.get("producto"));
  const [filtroPendientes, setFiltroPendientes] = useState("");
  const [codigo, setCodigo] = useState("");
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [loteId, setLoteId] = useState(MODO_FEFO);
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const lotes = useLotes(productoId);
  const producto = productos.find((p) => p.producto_id === productoId) ?? null;
  const lotesAlmacen = useMemo(() => lotes.filter((l) => loteVigente(l) && cantidadEn(l, "almacen") > 0), [lotes]);
  const lote = lotesAlmacen.find((l) => l.id === loteId) ?? null;
  const esFefo = loteId === MODO_FEFO;

  // Lista de pendientes: alertas de percha que se pueden atender con lo que hay en almacén.
  const { datos: alertas } = useDatos<AlertaActiva[]>("alertas-activas", () => supabaseNavegador().rpc("alertas_activas"));
  const pendientes = useMemo(() => {
    const base = (alertas ?? []).filter((a) => a.tipo === "percha" && !a.almacen_vacio);
    const q = filtroPendientes.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => a.nombre.toLowerCase().includes(q) || a.codigo_barras.includes(q));
  }, [alertas, filtroPendientes]);

  // Al elegir producto: usa por defecto el modo Automático FEFO (reparte desde el lote que vence antes).
  useEffect(() => {
    if (!producto) return;
    setLoteId((actual) => (actual === MODO_FEFO || lotesAlmacen.some((l) => l.id === actual) ? actual : MODO_FEFO));
  }, [producto, lotesAlmacen]);

  const totalAlmacenVigente = useMemo(
    () => lotesAlmacen.reduce((acc, l) => acc + cantidadEn(l, "almacen"), 0),
    [lotesAlmacen],
  );
  const sugerido = producto ? sugeridoPercha(producto) : 0;
  const maxDisponible = esFefo ? totalAlmacenVigente : lote ? cantidadEn(lote, "almacen") : 0;

  const [editada, setEditada] = useState(false);
  useEffect(() => {
    if (!producto || lotesAlmacen.length === 0 || editada) return;
    const propuesta = Math.min(sugerido, maxDisponible);
    setCantidad(propuesta > 0 ? String(propuesta) : "");
  }, [producto, lotesAlmacen.length, sugerido, maxDisponible, editada]);

  const elegir = (id: string | null) => {
    setProductoId(id);
    setCantidad("");
    setEditada(false);
    setLoteId(MODO_FEFO);
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

  // Desglose exacto de lotes a tomar en orden FEFO (o del lote único elegido).
  const desgloseFefo = useMemo(() => {
    if (!n || n <= 0) return [];
    const origen: LoteConStock[] = esFefo ? lotesAlmacen : lote ? [lote] : [];
    let restante = n;
    const tramos: { lote: LoteConStock; tomar: number }[] = [];
    for (const l of origen) {
      if (restante <= 0) break;
      const disp = cantidadEn(l, "almacen");
      const tomar = Math.min(restante, disp);
      if (tomar > 0) {
        tramos.push({ lote: l, tomar });
        restante -= tomar;
      }
    }
    return tramos;
  }, [n, esFefo, lotesAlmacen, lote]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return setError("Elige el producto que vas a reponer.");
    if (lotesAlmacen.length === 0) return setError("No hay lotes vigentes en almacén para este producto.");
    if (!esFefo && !lote) return setError("Elige el lote que vas a trasladar.");
    if (!/^\d+$/.test(cantidad) || n <= 0) return setError("La cantidad debe ser un número entero mayor que 0.");
    if (n > maxDisponible) {
      return setError(
        esFefo
          ? `El almacén tiene ${maxDisponible} unidades vigentes en total; no puedes trasladar ${n}. Corrige la cantidad.`
          : `El lote ${lote?.codigo_lote} tiene ${maxDisponible} en almacén; no puedes trasladar ${n}. Usa «Automático (FEFO)» para repartir entre varios lotes o reduce la cantidad.`,
      );
    }
    setEnviando(true);
    setError(null);
    for (const tramo of desgloseFefo) {
      const { error: err } = await supabaseNavegador().rpc("registrar_reposicion", {
        p_producto: producto.producto_id,
        p_lote: tramo.lote.id,
        p_cantidad: tramo.tomar,
      });
      if (err) {
        setEnviando(false);
        return setError(mensajeError(err));
      }
    }
    setEnviando(false);
    const detalleLotes = desgloseFefo.map((t) => `${t.tomar} de ${t.lote.codigo_lote}`).join(" + ");
    avisar(`Reposición registrada (${detalleLotes}): ${n} ${producto.nombre} a la percha.`);
    elegir(null);
    router.replace("/reponer");
  }

  return (
    <>
      <Encabezado ruta="Operación › Registrar reposición" titulo="Registrar reposición" descripcion="Traslado de unidades del almacén a la percha siguiendo el orden FEFO." />
      <AvisoSinConexion />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <section className="panel h-fit p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Pendientes de reponer</h2>
            <span className="text-xs text-suave">{pendientes.length} pendientes</span>
          </div>
          {(alertas ?? []).filter((a) => a.tipo === "percha" && !a.almacen_vacio).length > 4 && (
            <input
              className="campo mt-2"
              placeholder="Filtrar pendientes por nombre o código…"
              value={filtroPendientes}
              onChange={(e) => setFiltroPendientes(e.target.value)}
            />
          )}
          {pendientes.length === 0 ? (
            <Vacio>No hay perchas pendientes con stock en almacén.</Vacio>
          ) : (
            <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{producto.nombre}</h2>
                <span className="font-mono text-xs text-suave">{producto.codigo_barras}</span>
              </div>
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
                <div
                  className={`rounded-md border p-3 ${
                    producto.estado_stock === "ok"
                      ? "border-borde"
                      : producto.estado_stock === "bajo_minimo"
                        ? "border-amarillo bg-aviso-fondo/50"
                        : "border-rojo bg-peligro-fondo/40"
                  }`}
                >
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
                      Modo de selección de lote (FEFO)
                    </label>
                    <select id="lote" className="campo" value={loteId} onChange={(e) => { setLoteId(e.target.value); setEditada(false); }}>
                      <option value={MODO_FEFO}>
                        Automático (FEFO) — reparte desde el que vence antes ({totalAlmacenVigente} disp.)
                      </option>
                      {lotesAlmacen.map((l) => (
                        <option key={l.id} value={l.id}>
                          Solo lote {textoLote(l, "almacen")}
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
                      Sugerido para cubrir percha: <b>{sugerido}</b> · disponible {esFefo ? `en almacén: ${maxDisponible}` : `en este lote: ${maxDisponible}`}
                    </p>
                  </div>
                </div>
              )}

              {desgloseFefo.length > 0 && (
                <div className="mt-3 rounded-md border border-azul/30 bg-azul-claro/30 px-3 py-2 text-xs">
                  <p className="font-semibold text-azul">
                    Desglose FEFO a trasladar ({desgloseFefo.reduce((s, t) => s + t.tomar, 0)} u.):
                  </p>
                  <ul className="mt-1 space-y-0.5 text-texto">
                    {desgloseFefo.map(({ lote: l, tomar }) => (
                      <li key={l.id}>
                        • <b>{tomar} u.</b> del lote <b className="font-mono">{l.codigo_lote}</b> · zona {l.zona_almacen} ·{" "}
                        {l.fecha_vencimiento ? `vence ${fecha(l.fecha_vencimiento)}` : "sin vencimiento"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {n > 0 && n <= maxDisponible && (
                <p className="mt-3 rounded-md bg-fondo px-3 py-2 text-sm">
                  <b>Después del traslado:</b> percha {despuesPercha} de {producto.minimo_percha} mín.{" "}
                  <BarraEstadoTexto estado={estadoPercha(despuesPercha, producto.minimo_percha)} /> · almacén {producto.almacen - n} · total{" "}
                  {producto.total} (sin cambio)
                </p>
              )}

              <p className="mt-3 text-xs text-suave">
                Registra: {perfil.nombre}
                {ahora && ` · ${fechaHora(ahora)}`}
              </p>
              <div className="mt-3">
                <MensajeError>{error}</MensajeError>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-principal" disabled={enviando || estado !== "conectado" || lotesAlmacen.length === 0}>
                  {enviando ? "Registrando…" : "Registrar reposición"}
                </button>
                <button type="button" className="btn-secundario" onClick={() => { elegir(null); router.replace("/reponer"); }}>
                  Limpiar selección
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
