"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { usePerfil } from "@/components/Shell";
import {
  Cargando,
  duracion,
  Encabezado,
  Etiqueta,
  EtiquetaClase,
  EtiquetaEstadoReposicion,
  EtiquetaNivel,
  EtiquetaTipoAlerta,
  MensajeError,
  Pestanas,
  Vacio,
} from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fechaHora, hoyISO, mensajeError } from "@/lib/formato";
import { descargarCSV, numCSV } from "@/lib/csv";
import { NADA, useDatos } from "@/lib/datos";
import type { AlertaActiva, EstadoAlerta } from "@/lib/tipos";

type Seguimiento = {
  id: string;
  producto_id: string;
  nombre: string;
  tipo: "abastecimiento" | "percha";
  estado: EstadoAlerta;
  responsable: string | null;
  detectada_en: string;
  horas: number;
};

/** RF-24, RF-25, RF-26 y RF-27 (Figuras 12, 13, 29, 30, 44 y 45). */
export default function Reposicion() {
  const perfil = usePerfil();
  const router = useRouter();
  const { abrir } = useFicha();
  const { avisar } = useAvisos();
  const { estado: conexion } = useConexion();
  const esAdmin = perfil.rol === "administrador";
  const repone = perfil.rol !== "supervisor";

  const [vista, setVista] = useState<"alertas" | "seguimiento" | "solicitudes">("alertas");
  const alertasQ = useDatos<AlertaActiva[]>("alertas-activas", () => supabaseNavegador().rpc("alertas_activas"));
  const seguimientoQ = useDatos<Seguimiento[]>("seguimiento", () => supabaseNavegador().rpc("seguimiento_reposiciones", { p_dias: 7 }));
  const alertas = alertasQ.datos ?? (alertasQ.error ? NADA : null);
  const seguimiento = seguimientoQ.datos ?? NADA;
  const recargar = () => {
    alertasQ.recargar();
    seguimientoQ.recargar();
  };
  const [filtroEstado, setFiltroEstado] = useState<EstadoAlerta | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // RF-29: la campana abre esta pantalla con ?alerta=… para mostrar el detalle de esa alerta.
  const [resaltada, setResaltada] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("alerta");
    if (id) setResaltada(id);
  }, []);
  useEffect(() => {
    if (!resaltada || !alertas) return;
    const fila = document.getElementById(`alerta-${resaltada}`);
    if (fila) {
      setVista("alertas");
      fila.scrollIntoView({ block: "center" });
    }
  }, [resaltada, alertas]);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Qué puede hacer este usuario con cada alerta (RF-25, RN-08).
  const accionable = (a: AlertaActiva) =>
    a.tipo === "abastecimiento" ? esAdmin && a.estado === "pendiente" : repone && !a.almacen_vacio && a.estado !== "repuesto";

  const seleccionadas = useMemo(() => (alertas ?? []).filter((a) => sel.has(a.id)), [alertas, sel]);
  const selAbast = seleccionadas.filter((a) => a.tipo === "abastecimiento");
  const selPercha = seleccionadas.filter((a) => a.tipo === "percha");

  async function solicitar(lista: AlertaActiva[]) {
    setTrabajando(true);
    setError(null);
    const { data, error: err } = await supabaseNavegador().rpc("solicitar_proveedor", { p_alertas: lista.map((a) => a.id) });
    setTrabajando(false);
    if (err) return setError(mensajeError(err));
    const filas = (data as { proveedor: string; ruc: string; codigo_barras: string; producto: string; unidad: string; cantidad: number }[]) ?? [];
    descargarCSV(
      `pedido-proveedor-${hoyISO()}`,
      ["Proveedor", "RUC", "Código de barras", "Producto", "Unidad", "Cantidad sugerida"],
      filas.map((f) => [f.proveedor, f.ruc, f.codigo_barras, f.producto, f.unidad, f.cantidad]),
    );
    avisar(`Solicitud registrada para ${filas.length} ${filas.length === 1 ? "producto" : "productos"}; se descargó la lista de pedido.`);
    setSel(new Set());
    recargar();
  }

  async function reponer(a: AlertaActiva) {
    const { error: err } = await supabaseNavegador().rpc("tomar_alerta", { p_alerta: a.id });
    if (err) return setError(mensajeError(err));
    router.push(`/reponer?producto=${a.producto_id}`);
  }

  async function tomarVarias(lista: AlertaActiva[]) {
    setTrabajando(true);
    for (const a of lista) await supabaseNavegador().rpc("tomar_alerta", { p_alerta: a.id });
    setTrabajando(false);
    avisar(`Tomaste ${lista.length} ${lista.length === 1 ? "reposición" : "reposiciones"}; quedan «En reposición» a tu nombre.`);
    setSel(new Set());
    router.push(`/reponer?producto=${lista[0].producto_id}`);
  }

  const conteos = useMemo(() => {
    const c: Record<EstadoAlerta, number> = { pendiente: 0, en_reposicion: 0, repuesto: 0, cerrado: 0 };
    seguimiento.forEach((s) => c[s.estado]++);
    return c;
  }, [seguimiento]);

  const bloqueado = conexion !== "conectado" || trabajando;

  return (
    <>
      <Encabezado ruta="Control › Reposición" titulo="Reposición" descripcion="Alertas de abastecimiento y de percha, y el seguimiento de cada reposición." />
      <AvisoSinConexion />
      <Pestanas
        valor={vista}
        onCambiar={setVista}
        opciones={[
          { valor: "alertas", etiqueta: "Alertas", cantidad: alertas?.length ?? 0 },
          { valor: "seguimiento", etiqueta: "Seguimiento" },
          ...(perfil.rol !== "reponedor" ? [{ valor: "solicitudes" as const, etiqueta: "Solicitudes al proveedor" }] : []),
        ]}
      />
      <div className="mb-3">
        <MensajeError>{error ?? alertasQ.error}</MensajeError>
      </div>

      {vista === "solicitudes" ? (
        <Solicitudes />
      ) : vista === "alertas" ? (
        <section className="panel">
          {alertas === null ? (
            <Cargando />
          ) : alertas.length === 0 ? (
            <Vacio>No hay alertas activas: todo el stock y todas las perchas están sobre su mínimo.</Vacio>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tabla min-w-[1080px]">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <span className="sr-only">Elegir</span>
                      </th>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th>Nivel</th>
                      <th className="text-right">Percha</th>
                      <th className="text-right">Almacén</th>
                      <th className="text-right">Mínimo</th>
                      <th className="text-right" title="Días que alcanza el stock al ritmo de venta de los últimos 14 días">
                        Cobertura
                      </th>
                      <th className="text-right">Desde</th>
                      <th className="text-right">Sugerido</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertas.map((a) => (
                      <tr key={a.id} id={`alerta-${a.id}`} className={sel.has(a.id) ? "bg-azul-claro/40" : a.id === resaltada ? "bg-aviso-fondo/60 outline outline-2 outline-amarillo" : ""}>
                        <td>
                          {accionable(a) && (
                            <input
                              type="checkbox"
                              className="size-4 accent-azul"
                              aria-label={`Elegir ${a.nombre}`}
                              checked={sel.has(a.id)}
                              onChange={(e) =>
                                setSel((s) => {
                                  const n = new Set(s);
                                  if (e.target.checked) n.add(a.id);
                                  else n.delete(a.id);
                                  return n;
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="min-w-48">
                          <button className="enlace text-left" onClick={() => abrir(a.producto_id)}>
                            {a.nombre}
                          </button>
                          <span className="mt-0.5 block text-xs text-suave">
                            ABC: <EtiquetaClase clase={a.clase} />
                          </span>
                        </td>
                        <td>
                          <EtiquetaTipoAlerta tipo={a.tipo} />
                        </td>
                        <td>
                          <EtiquetaNivel nivel={a.nivel} />
                        </td>
                        <td className="text-right">{a.percha}</td>
                        <td className="text-right">{a.almacen}</td>
                        <td className="text-right">{a.tipo === "percha" ? a.minimo_percha : a.stock_minimo}</td>
                        <td className="text-right">{a.cobertura_dias === null ? "—" : `${String(a.cobertura_dias).replace(".", ",")} d`}</td>
                        <td className="text-right whitespace-nowrap">{duracion(a.horas)}</td>
                        <td className="text-right font-semibold">{a.sugerido}</td>
                        <td>
                          <Accion a={a} esAdmin={esAdmin} repone={repone} bloqueado={bloqueado} onSolicitar={() => solicitar([a])} onReponer={() => reponer(a)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(esAdmin || repone) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-borde p-4">
                  {esAdmin && (
                    <button
                      className="btn-secundario"
                      disabled={bloqueado || (selAbast.length === 0 && !alertas.some((a) => a.tipo === "abastecimiento" && a.estado === "pendiente"))}
                      onClick={() =>
                        solicitar(selAbast.length ? selAbast : alertas.filter((a) => a.tipo === "abastecimiento" && a.estado === "pendiente"))
                      }
                    >
                      {selAbast.length
                        ? `Solicitar ${selAbast.length} al proveedor y exportar lista de pedido`
                        : "Solicitar todas al proveedor y exportar lista de pedido"}
                    </button>
                  )}
                  {repone && selPercha.length > 0 && (
                    <button className="btn-secundario" disabled={bloqueado} onClick={() => tomarVarias(selPercha)}>
                      Tomar {selPercha.length} para reponer
                    </button>
                  )}
                  <button className="btn-secundario" onClick={() => exportarAlertas(alertas)}>
                    Exportar CSV
                  </button>
                  <span className="text-xs text-suave">
                    Sugerido: lleva el stock (o la percha) al doble de su mínimo; en percha no supera lo que hay en almacén.
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {(["pendiente", "en_reposicion", "repuesto", "cerrado"] as EstadoAlerta[]).map((e) => (
              <button
                key={e}
                onClick={() => setFiltroEstado((f) => (f === e ? null : e))}
                aria-pressed={filtroEstado === e}
                className={`panel p-3 text-left transition hover:border-azul ${filtroEstado === e ? "border-azul ring-1 ring-azul" : ""}`}
              >
                <span className="block text-2xl font-bold">{conteos[e]}</span>
                <span className="text-sm text-suave">{{ pendiente: "Pendiente", en_reposicion: "En reposición", repuesto: "Repuesto", cerrado: "Cerrado (7 días)" }[e]}</span>
              </button>
            ))}
          </div>
          <section className="panel">
            {seguimiento.length === 0 ? (
              <Vacio>Sin reposiciones en los últimos 7 días.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      <th>Detectado</th>
                      <th className="text-right" title="Desde la detección hasta «Repuesto» (o hasta ahora si sigue abierta)">
                        Tiempo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {seguimiento
                      .filter((s) => !filtroEstado || s.estado === filtroEstado)
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <button className="enlace text-left" onClick={() => abrir(s.producto_id)}>
                              {s.nombre}
                            </button>
                          </td>
                          <td>{s.tipo === "abastecimiento" ? "Abastecimiento" : "Percha"}</td>
                          <td>
                            <EtiquetaEstadoReposicion estado={s.estado} />
                          </td>
                          <td>{s.responsable ?? "—"}</td>
                          <td className="text-xs">{fechaHora(s.detectada_en)}</td>
                          <td className="text-right font-semibold">{duracion(s.horas)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

const NIVEL: Record<string, string> = { sin_stock: "Sin stock", critica: "Crítica", preventiva: "Preventiva", vacia: "Percha vacía", por_reponer: "Por reponer" };
const ESTADO: Record<string, string> = { pendiente: "Pendiente", en_reposicion: "En reposición", repuesto: "Repuesto", cerrado: "Cerrado" };

/** RF-38: exporta las alertas con los mismos datos que la pantalla. */
function exportarAlertas(alertas: AlertaActiva[]) {
  descargarCSV(
    `alertas-${hoyISO()}`,
    ["Producto", "Código de barras", "ABC", "Tipo", "Nivel", "Estado", "Percha", "Almacén", "Mínimo", "Cobertura (días)", "Horas desde detección", "Sugerido", "Responsable"],
    alertas.map((a) => [
      a.nombre,
      a.codigo_barras,
      a.clase === "sin_ventas" ? "Sin ventas" : a.clase,
      a.tipo === "percha" ? "Percha" : "Abastecimiento",
      NIVEL[a.nivel],
      ESTADO[a.estado],
      a.percha,
      a.almacen,
      a.tipo === "percha" ? a.minimo_percha : a.stock_minimo,
      numCSV(a.cobertura_dias),
      numCSV(a.horas),
      a.sugerido,
      a.responsable ?? "",
    ]),
  );
}

type Solicitud = {
  id: string;
  creado_en: string;
  cantidad_sugerida: number;
  producto: string;
  codigo_barras: string;
  unidad: string;
  proveedor: string;
  proveedor_id: string;
  ruc: string;
  usuario: string;
  estado_alerta: EstadoAlerta;
};

/** RF-28: lo que se solicitó al proveedor y la lista de pedido para enviarle. El sistema no gestiona la compra. */
function Solicitudes() {
  const [dias, setDias] = useState(7);
  const [proveedor, setProveedor] = useState("todos");
  const q = useDatos<Solicitud[]>(`solicitudes-${dias}`, () =>
    supabaseNavegador()
      .from("v_solicitudes")
      .select("*")
      .gte("creado_en", new Date(Date.now() - dias * 86_400_000).toISOString())
      .order("creado_en", { ascending: false }),
  );
  const filas = (q.datos ?? NADA).filter((s) => proveedor === "todos" || s.proveedor_id === proveedor);
  const proveedores = [...new Map((q.datos ?? NADA).map((s) => [s.proveedor_id, s.proveedor])).entries()];

  return (
    <section className="panel">
      <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
        <div>
          <label className="etiqueta" htmlFor="sol-dias">
            Periodo
          </label>
          <select id="sol-dias" className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Hoy</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="sol-prov">
            Proveedor
          </label>
          <select id="sol-prov" className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="todos">Todos</option>
            {proveedores.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-secundario"
          disabled={!filas.length}
          onClick={() =>
            descargarCSV(
              `lista-pedido-${hoyISO()}`,
              ["Fecha", "Proveedor", "RUC", "Código de barras", "Producto", "Unidad", "Cantidad sugerida", "Solicitó"],
              filas.map((s) => [fechaHora(s.creado_en), s.proveedor, s.ruc, s.codigo_barras, s.producto, s.unidad, s.cantidad_sugerida, s.usuario]),
            )
          }
        >
          Exportar lista de pedido
        </button>
      </div>
      <MensajeError>{q.error}</MensajeError>
      {q.datos === undefined ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <Vacio>No hay solicitudes en este periodo. Se registran con «Solicitar a proveedor» en las alertas de abastecimiento.</Vacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla min-w-[760px]">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Producto</th>
                <th className="text-right">Cantidad sugerida</th>
                <th>Solicitó</th>
                <th>Estado de la alerta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-xs">{fechaHora(s.creado_en)}</td>
                  <td>
                    {s.proveedor}
                    <span className="block font-mono text-xs text-suave">RUC {s.ruc}</span>
                  </td>
                  <td>
                    {s.producto}
                    <span className="block font-mono text-xs text-suave">{s.codigo_barras}</span>
                  </td>
                  <td className="text-right font-semibold">
                    {s.cantidad_sugerida} <span className="text-xs font-normal text-suave">{s.unidad}</span>
                  </td>
                  <td>{s.usuario}</td>
                  <td>
                    <EtiquetaEstadoReposicion estado={s.estado_alerta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-borde px-4 py-3 text-xs text-suave">El sistema registra lo que se pidió; la compra se hace por el canal de siempre. Al llegar la mercadería, regístrala en «Registrar ingreso».</p>
    </section>
  );
}

function Accion({
  a,
  esAdmin,
  repone,
  bloqueado,
  onSolicitar,
  onReponer,
}: {
  a: AlertaActiva;
  esAdmin: boolean;
  repone: boolean;
  bloqueado: boolean;
  onSolicitar: () => void;
  onReponer: () => void;
}) {
  if (a.tipo === "abastecimiento") {
    if (a.estado === "pendiente" && esAdmin)
      return (
        <button className="btn-principal min-h-9 whitespace-nowrap px-3" disabled={bloqueado} onClick={onSolicitar}>
          Solicitar a proveedor
        </button>
      );
    return (
      <span className="flex flex-col gap-0.5">
        <EtiquetaEstadoReposicion estado={a.estado} />
        {a.estado !== "pendiente" && a.responsable && <span className="text-xs text-suave">{a.estado === "en_reposicion" ? "Solicitado por" : "Ingreso de"} {a.responsable}</span>}
      </span>
    );
  }
  if (a.almacen_vacio)
    return (
      <span className="flex flex-col gap-0.5">
        <Etiqueta tono="peligro">Almacén vacío</Etiqueta>
        <span className="text-xs text-suave">Se atiende con el abastecimiento</span>
      </span>
    );
  if (repone && a.estado !== "repuesto")
    return (
      <span className="flex flex-col gap-0.5">
        <button className="btn-principal min-h-9 whitespace-nowrap px-3" disabled={bloqueado} onClick={onReponer}>
          Reponer percha
        </button>
        {a.estado === "en_reposicion" && a.responsable && <span className="text-xs text-suave">Tomada por {a.responsable}</span>}
      </span>
    );
  return (
    <span className="flex flex-col gap-0.5">
      <EtiquetaEstadoReposicion estado={a.estado} />
      {a.responsable && <span className="text-xs text-suave">{a.responsable}</span>}
    </span>
  );
}
