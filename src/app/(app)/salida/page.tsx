"use client";

import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { CampoCodigo } from "@/components/CampoCodigo";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { SelectorProducto } from "@/components/SelectorProducto";
import { usePerfil } from "@/components/Shell";
import { Encabezado, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, fechaHora, mensajeError } from "@/lib/formato";
import { cantidadEn, loteVigente, useProductosStock } from "@/lib/operacion";
import { useAhora } from "@/lib/useAhora";
import type { LoteConStock } from "@/lib/tipos";

type Motivo = "venta" | "merma" | "vencimiento";
type Linea = { clave: number; productoId: string; cantidad: string; origen: string };

const MOTIVOS: { valor: Motivo; titulo: string; texto: string }[] = [
  { valor: "venta", titulo: "Venta", texto: "Unidades vendidas; salen de la percha por FEFO." },
  { valor: "merma", titulo: "Merma", texto: "Producto dañado o no apto." },
  { valor: "vencimiento", titulo: "Vencimiento", texto: "Retiro de un lote vencido o por vencer." },
];

let sig = 0;

/** RF-17 (Figuras 9 y 41): salida de uno o varios productos por venta, merma o vencimiento. */
export default function RegistrarSalida() {
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const { estado, version } = useConexion();
  const ahora = useAhora();
  const productos = useProductosStock();

  const [motivo, setMotivo] = useState<Motivo>("venta");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [codigo, setCodigo] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [infoScan, setInfoScan] = useState<string | null>(null);
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [lotesPorProducto, setLotesPorProducto] = useState<Record<string, LoteConStock[]>>({});

  const porId = useMemo(() => new Map(productos.map((p) => [p.producto_id, p])), [productos]);
  const ids = useMemo(() => [...new Set(lineas.map((l) => l.productoId))].sort().join(","), [lineas]);

  // Lotes de los productos de la salida (para desglose FEFO en venta y selección obligatoria en merma y vencimiento).
  useEffect(() => {
    if (!ids) return;
    supabaseNavegador()
      .from("lotes")
      .select("id, producto_id, codigo_lote, fecha_vencimiento, zona_almacen, existencias(ubicacion, cantidad)")
      .in("producto_id", ids.split(","))
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .then(({ data }: { data: unknown }) => {
        const m: Record<string, LoteConStock[]> = {};
        for (const l of (data as (LoteConStock & { producto_id: string })[]) ?? []) (m[l.producto_id] ??= []).push(l);
        setLotesPorProducto(m);
      });
  }, [ids, version]);

  const desgloseFefoPercha = (productoId: string, cant: number) => {
    const lotesVig = (lotesPorProducto[productoId] ?? []).filter(
      (l) => loteVigente(l) && cantidadEn(l, "percha") > 0,
    );
    if (lotesVig.length === 0) return "Sin lotes vigentes en percha";
    if (!cant || cant <= 0) {
      const primero = lotesVig[0];
      return `Automático (FEFO): inicia por ${primero.codigo_lote}${
        primero.fecha_vencimiento ? ` (vence ${fecha(primero.fecha_vencimiento)})` : ""
      } · ${cantidadEn(primero, "percha")} u.`;
    }
    let rest = cant;
    const partes: string[] = [];
    for (const l of lotesVig) {
      if (rest <= 0) break;
      const disp = cantidadEn(l, "percha");
      const tomar = Math.min(rest, disp);
      if (tomar > 0) {
        partes.push(
          `${tomar} u. de ${l.codigo_lote}${l.fecha_vencimiento ? ` (vence ${fecha(l.fecha_vencimiento)})` : ""}`,
        );
        rest -= tomar;
      }
    }
    return `FEFO: ${partes.join(" + ")}${rest > 0 ? ` (faltan ${rest} u. en percha)` : ""}`;
  };

  const opcionesOrigen = (productoId: string) =>
    (lotesPorProducto[productoId] ?? []).flatMap((l) =>
      (["percha", "almacen"] as const)
        .filter((u) => cantidadEn(l, u) > 0)
        .filter(() => motivo === "vencimiento" || loteVigente(l))
        .map((u) => ({
          valor: `${l.id}|${u}`,
          texto: `${l.codigo_lote} · ${u === "percha" ? "percha" : "almacén"} · ${cantidadEn(l, u)} u. · ${l.fecha_vencimiento ? `vence ${fecha(l.fecha_vencimiento)}` : "sin vencimiento"}${!loteVigente(l) ? " (vencido)" : ""}`,
          cantidad: cantidadEn(l, u),
        })),
    );

  const disponible = (l: Linea) => {
    const p = porId.get(l.productoId);
    if (!p) return 0;
    if (motivo === "venta") return p.percha;
    return opcionesOrigen(l.productoId).find((o) => o.valor === l.origen)?.cantidad ?? 0;
  };

  const agregar = (productoId: string, desdeEscaneo = false) => {
    if (lineas.some((l) => l.productoId === productoId) && motivo === "venta") {
      setAviso("Ese producto ya está en la salida; cambia su cantidad en la lista.");
      setInfoScan(null);
      return;
    }
    const prod = porId.get(productoId);
    setLineas((ls) => [...ls, { clave: ++sig, productoId, cantidad: "", origen: "" }]);
    setElegido(null);
    setCodigo("");
    setAviso(null);
    setInfoScan(desdeEscaneo && prod ? `✓ ${prod.nombre} agregado a la lista. Ingresa la cantidad.` : null);
    setTimeout(() => document.getElementById(`cant-${sig}`)?.focus(), 50);
  };

  const leer = (c: string) => {
    const p = productos.find((x) => x.codigo_barras === c);
    if (!p) {
      setInfoScan(null);
      return setAviso(`El código ${c} no está en el catálogo.`);
    }
    agregar(p.producto_id, true);
  };

  const cambiar = (clave: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...c } : l)));

  function validar(): string | null {
    if (lineas.length === 0) return "Agrega al menos un producto a la salida.";
    for (const [i, l] of lineas.entries()) {
      const p = porId.get(l.productoId);
      const n = `Línea ${i + 1} (${p?.nombre ?? "producto"})`;
      if (!/^\d+$/.test(l.cantidad) || Number(l.cantidad) <= 0) return `${n}: la cantidad debe ser un número entero mayor que 0.`;
      if (motivo !== "venta" && !l.origen) return `${n}: elige el lote y de dónde sale; en ${motivo} es obligatorio.`;
      const d = disponible(l);
      if (Number(l.cantidad) > d)
        return motivo === "venta"
          ? `${n}: la percha tiene ${d}; no se pueden vender ${l.cantidad}. Registra primero la reposición o corrige la cantidad.`
          : `${n}: ese lote tiene ${d} ahí; no pueden salir ${l.cantidad}.`;
    }
    return null;
  }

  async function registrar() {
    const v = validar();
    if (v) return setError(v);
    setEnviando(true);
    setError(null);
    const { error: err } = await supabaseNavegador().rpc("registrar_salida", {
      p_motivo: motivo,
      p_detalle: detalle,
      p_lineas: lineas.map((l) => {
        const [lote_id, ubicacion] = l.origen ? l.origen.split("|") : [null, null];
        return { producto_id: l.productoId, cantidad: l.cantidad, lote_id, ubicacion };
      }),
    });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    const u = lineas.reduce((s, l) => s + Number(l.cantidad), 0);
    avisar(`Salida por ${motivo} registrada: ${lineas.length} ${lineas.length === 1 ? "producto" : "productos"}, ${u} unidades.`);
    setLineas([]);
    setDetalle("");
  }

  const unidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  return (
    <>
      <Encabezado
        ruta="Operación › Registrar salida"
        titulo="Registrar salida"
        descripcion="Unidades que dejan el inventario por venta, merma o vencimiento. Agrega todos los productos de la salida y regístralos juntos."
      />
      <AvisoSinConexion />

      <section className="panel p-4 sm:p-5">
        <h2 className="text-base font-bold">1. Motivo de la salida</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Motivo de la salida">
          {MOTIVOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              role="radio"
              aria-checked={motivo === m.valor}
              onClick={() => {
                setMotivo(m.valor);
                setLineas((ls) => ls.map((l) => ({ ...l, origen: "" })));
              }}
              className={`rounded-md border p-3 text-left transition ${motivo === m.valor ? "border-azul bg-azul-claro/50 ring-1 ring-azul" : "border-borde hover:border-azul"}`}
            >
              <span className="block text-sm font-bold">{m.titulo}</span>
              <span className="block text-xs text-suave">{m.texto}</span>
            </button>
          ))}
        </div>
        <p className="ayuda">El motivo aplica a todos los productos de esta salida.</p>
      </section>

      <section className="panel mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">2. Productos de la salida</h2>
          <span className="text-xs text-suave">
            {lineas.length} {lineas.length === 1 ? "producto" : "productos"} · {unidades} unidades
          </span>
        </div>

        {lineas.length === 0 ? (
          <Vacio>Escanea o elige el primer producto.</Vacio>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="tabla min-w-[640px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th className="text-right">Disponible</th>
                  <th>Cantidad</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const p = porId.get(l.productoId);
                  const ops = opcionesOrigen(l.productoId);
                  return (
                    <tr key={l.clave}>
                      <td className="text-suave">{i + 1}</td>
                      <td>
                        <span className="font-semibold">{p?.nombre}</span>
                        <span className="block font-mono text-xs text-suave">{p?.codigo_barras}</span>
                      </td>
                      <td>
                        {motivo === "venta" ? (
                          <span className="block text-xs font-medium text-azul">
                            {desgloseFefoPercha(l.productoId, Number(l.cantidad))}
                          </span>
                        ) : ops.length === 0 ? (
                          <span className="text-xs text-peligro">Sin unidades</span>
                        ) : (
                          <select className="campo min-w-56" aria-label={`Lote de la línea ${i + 1}`} value={l.origen} onChange={(e) => cambiar(l.clave, { origen: e.target.value })}>
                            <option value="">Elige lote y ubicación</option>
                            {ops.map((o) => (
                              <option key={o.valor} value={o.valor}>
                                {o.texto}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="text-right text-xs text-suave">
                        <b className="text-sm text-texto">{disponible(l)}</b> {motivo === "venta" ? "en percha" : ""}
                      </td>
                      <td>
                        <input
                          id={`cant-${l.clave}`}
                          className="campo w-24"
                          inputMode="numeric"
                          aria-label={`Cantidad de la línea ${i + 1}`}
                          value={l.cantidad}
                          onChange={(e) => cambiar(l.clave, { cantidad: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                        />
                      </td>
                      <td>
                        <button className="btn-secundario min-h-9 px-3" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} aria-label={`Quitar línea ${i + 1}`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 grid gap-3 rounded-md border border-borde bg-fondo/50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="etiqueta" htmlFor="codigo">
              Código de barras
            </label>
            <CampoCodigo id="codigo" valor={codigo} onCambiar={(v) => { setCodigo(v); setAviso(null); setInfoScan(null); }} onLeido={leer} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="producto">
              O elige el producto
            </label>
            <SelectorProducto
              id="producto"
              valor={elegido}
              onCambiar={setElegido}
              opciones={productos.map((p) => ({ id: p.producto_id, nombre: p.nombre, codigo_barras: p.codigo_barras, detalle: `percha ${p.percha} · almacén ${p.almacen}` }))}
            />
          </div>
          <button type="button" className="btn-secundario border-azul text-azul" disabled={!elegido} onClick={() => elegido && agregar(elegido)}>
            + Agregar producto
          </button>
        </div>
        {aviso ? (
          <p className="mt-1 text-xs font-medium text-peligro">{aviso}</p>
        ) : infoScan ? (
          <p className="mt-1 text-xs font-medium text-ok">{infoScan}</p>
        ) : (
          <p className="ayuda">Escanea el código de barras o busca el producto para agregarlo a la lista.</p>
        )}

        <label className="etiqueta mt-4" htmlFor="detalle">
          Detalle (opcional)
        </label>
        <input id="detalle" className="campo" placeholder="Ej. botellas dañadas al descargar" value={detalle} onChange={(e) => setDetalle(e.target.value)} />

        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-principal" disabled={enviando || estado !== "conectado" || lineas.length === 0} onClick={registrar}>
            {enviando ? "Registrando…" : `Registrar salida (${lineas.length} ${lineas.length === 1 ? "producto" : "productos"})`}
          </button>
          <button
            className="btn-secundario"
            onClick={() => {
              setLineas([]);
              setDetalle("");
              setError(null);
            }}
          >
            Cancelar
          </button>
          <span className="text-xs text-suave">
            Registra: {perfil.nombre}
            {ahora && ` · ${fechaHora(ahora)}`}
          </span>
        </div>
      </section>
    </>
  );
}
