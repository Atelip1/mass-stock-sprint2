"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { diasHasta, fecha, fechaHora, mensajeError } from "@/lib/formato";
import type { FilaStock } from "@/lib/tipos";
import { useConexion } from "./Conexion";
import { BarraPercha, duracion, Etiqueta, EtiquetaEstadoReposicion, EtiquetaNivel, EtiquetaStock, EtiquetaTipoAlerta, MensajeError } from "./ui";

type Ctx = { abrir: (productoId: string) => void };
const FichaCtx = createContext<Ctx | null>(null);

export function useFicha() {
  const c = useContext(FichaCtx);
  if (!c) throw new Error("useFicha fuera de FichaProvider");
  return c;
}

/** RF-13: la ficha se abre al hacer clic en un producto de cualquier tabla o del buscador. */
export function FichaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const abrir = useCallback((p: string) => setId(p), []);
  return (
    <FichaCtx.Provider value={{ abrir }}>
      {children}
      {id && <Ficha productoId={id} onCerrar={() => setId(null)} />}
    </FichaCtx.Provider>
  );
}

type Lote = {
  id: string;
  codigo_lote: string;
  fecha_vencimiento: string | null;
  zona_almacen: string;
  existencias: { ubicacion: "almacen" | "percha"; cantidad: number }[];
};

type Mov = {
  id: string;
  tipo: string;
  creado_en: string;
  guia_remision: string | null;
  anulado: boolean;
  usuario: { nombre: string } | null;
  movimiento_lineas: { cantidad: number; ubicacion_origen: string | null; ubicacion_destino: string | null; producto_id: string }[];
};

const TIPO: Record<string, string> = { ingreso: "Ingreso", reposicion: "Reposición", salida: "Salida", ajuste: "Ajuste" };

function Ficha({ productoId, onCerrar }: { productoId: string; onCerrar: () => void }) {
  const { version } = useConexion();
  const [fila, setFila] = useState<FilaStock | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [alertas, setAlertas] = useState<{ id: string; tipo: "abastecimiento" | "percha"; nivel: string; estado: string; detectada_en: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseNavegador();
    let vigente = true;
    (async () => {
      const [a, b, c, d] = await Promise.all([
        supabase.from("v_stock").select("*").eq("producto_id", productoId).maybeSingle(),
        supabase
          .from("lotes")
          .select("id, codigo_lote, fecha_vencimiento, zona_almacen, existencias(ubicacion, cantidad)")
          .eq("producto_id", productoId)
          .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
        supabase
          .from("movimientos")
          .select(
            "id, tipo, creado_en, guia_remision, anulado, usuario:perfiles!movimientos_usuario_id_fkey(nombre), movimiento_lineas!inner(cantidad, ubicacion_origen, ubicacion_destino, producto_id)",
          )
          .eq("movimiento_lineas.producto_id", productoId)
          .order("creado_en", { ascending: false })
          .limit(5),
        supabase.from("alertas").select("id, tipo, nivel, estado, detectada_en").eq("producto_id", productoId).neq("estado", "cerrado"),
      ]);
      if (!vigente) return;
      const e = a.error ?? b.error ?? c.error;
      setError(e ? mensajeError(e) : null);
      setFila((a.data as FilaStock) ?? null);
      setLotes(((b.data as Lote[]) ?? []).filter((l) => l.existencias.some((x) => x.cantidad > 0)));
      setMovs((c.data as unknown as Mov[]) ?? []);
      setAlertas((d.data as typeof alertas) ?? []);
    })();
    return () => {
      vigente = false;
    };
  }, [productoId, version]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const faltanPercha = fila ? Math.max(0, fila.minimo_percha - fila.percha) : 0;
  const faltanStock = fila ? Math.max(0, fila.stock_minimo - fila.total) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onCerrar}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-t-4 border-amarillo bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label="Ficha de producto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-suave">Ficha de producto</p>
            <h2 className="text-xl font-bold">{fila?.nombre ?? "…"}</h2>
            {fila && (
              <p className="text-xs text-suave">
                Código de barras <span className="font-mono">{fila.codigo_barras}</span> · {fila.categoria} · {fila.unidad}
                {fila.proveedor && <span> · Proveedor: <b className="text-texto">{fila.proveedor}</b></span>}
              </p>
            )}
          </div>
          <button className="btn-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>

        {fila && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div
                className={`rounded-md border p-3 ${
                  fila.estado_percha === "ok"
                    ? "border-borde"
                    : fila.estado_percha === "por_reponer"
                      ? "border-amarillo bg-aviso-fondo/50"
                      : "border-rojo bg-peligro-fondo/40"
                }`}
              >
                <p className="text-xs text-suave">En percha</p>
                <p className="text-2xl font-bold">
                  {fila.percha} <span className="text-xs font-normal text-suave">de {fila.minimo_percha} mín.</span>
                </p>
                <BarraPercha percha={fila.percha} minimo={fila.minimo_percha} estado={fila.estado_percha} compacta />
              </div>
              <div className="rounded-md border border-borde p-3">
                <p className="text-xs text-suave">En almacén</p>
                <p className="text-2xl font-bold">{fila.almacen}</p>
                <p className="text-xs text-suave">disponibles para reponer</p>
              </div>
              <div
                className={`rounded-md border p-3 ${
                  fila.estado_stock === "ok"
                    ? "border-borde"
                    : fila.estado_stock === "bajo_minimo"
                      ? "border-amarillo bg-aviso-fondo/50"
                      : "border-rojo bg-peligro-fondo/40"
                }`}
              >
                <p className="text-xs text-suave">Stock total</p>
                <p className="text-2xl font-bold">
                  {fila.total} <span className="text-xs font-normal text-suave">mín. {fila.stock_minimo}</span>
                </p>
                <EtiquetaStock estado={fila.estado_stock} />
              </div>
            </div>
            <p className="mt-3 text-sm text-suave">
              {fila.estado_percha === "ok"
                ? `Percha cubierta (${fila.percha} de ${fila.minimo_percha} mín.).`
                : faltanPercha > 0
                  ? `Percha con ${fila.percha} de ${fila.minimo_percha} mín. (faltan ${faltanPercha} para el mínimo).`
                  : `Percha en el límite mínimo (${fila.percha} de ${fila.minimo_percha}).`}{" "}
              {fila.estado_stock === "ok"
                ? `Stock total sobre el mínimo (${fila.total} de ${fila.stock_minimo}).`
                : faltanStock > 0
                  ? `Stock total bajo mínimo: faltan ${faltanStock} u. para alcanzar ${fila.stock_minimo}.`
                  : `Stock total en el límite mínimo (${fila.total} de ${fila.stock_minimo}).`}
            </p>
          </>
        )}

        <h3 className="mt-6 text-sm font-bold">Alertas activas</h3>
        {alertas.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Sin alertas: el stock y la percha están sobre su mínimo.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {alertas.map((al) => (
              <li key={al.id} className="flex flex-wrap items-center gap-2">
                <EtiquetaTipoAlerta tipo={al.tipo} />
                <EtiquetaNivel nivel={al.nivel} />
                <EtiquetaEstadoReposicion estado={al.estado} />
                <span className="text-xs text-suave">hace {duracion((Date.now() - Date.parse(al.detectada_en)) / 3_600_000)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 text-sm font-bold">Existencias por lote</h3>
        {lotes.length === 0 ? (
          <p className="mt-2 text-sm text-suave">No hay lotes con unidades en almacén ni en percha.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Vence</th>
                  <th>Zona</th>
                  <th className="text-right">Percha</th>
                  <th className="text-right">Almacén</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => {
                  const dias = l.fecha_vencimiento ? diasHasta(l.fecha_vencimiento) : null;
                  const cant = (u: string) => l.existencias.find((x) => x.ubicacion === u)?.cantidad ?? 0;
                  return (
                    <tr key={l.id}>
                      <td className="font-mono">{l.codigo_lote}</td>
                      <td>
                        {fecha(l.fecha_vencimiento)}{" "}
                        {dias !== null && dias < 0 && <Etiqueta tono="peligro">Vencido</Etiqueta>}
                        {dias !== null && dias >= 0 && dias <= 7 && <Etiqueta tono="aviso">En {dias} días</Etiqueta>}
                      </td>
                      <td>{l.zona_almacen}</td>
                      <td className="text-right">{cant("percha")}</td>
                      <td className="text-right">{cant("almacen")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">Últimos 5 movimientos</h3>
          <a href="/historial" onClick={onCerrar} className="enlace text-xs">
            Ver todos en Historial →
          </a>
        </div>
        {movs.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Sin movimientos registrados.</p>
        ) : (
          <ul className="mt-2 divide-y divide-borde text-sm">
            {movs.map((m) => {
              const cant = m.movimiento_lineas.filter((l) => l.producto_id === productoId).reduce((s, l) => s + l.cantidad, 0);
              const signo = m.tipo === "ingreso" ? "+" : m.tipo === "salida" ? "−" : "";
              return (
                <li key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${m.anulado ? "text-suave line-through" : ""}`}>
                  <span className="text-xs text-suave">{fechaHora(m.creado_en)}</span>
                  <span className="font-semibold">{TIPO[m.tipo] ?? m.tipo}</span>
                  <span className="font-semibold">
                    {signo}
                    {cant}
                  </span>
                  {m.guia_remision && <span className="text-xs text-suave">Guía {m.guia_remision}</span>}
                  <span className="ml-auto text-xs text-suave">{m.usuario?.nombre}</span>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
