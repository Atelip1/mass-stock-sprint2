"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { Icono, type NombreIcono } from "@/components/Iconos";
import { usePerfil } from "@/components/Shell";
import { Cargando, duracion, Etiqueta, EtiquetaNivel, EtiquetaVence, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { hora, mensajeError } from "@/lib/formato";
import { useAhora } from "@/lib/useAhora";
import { NADA, useDatos } from "@/lib/datos";
import { NOMBRE_ROL, type AlertaActiva, type LineaHistorial } from "@/lib/tipos";

type Resumen = {
  alertas_abastecimiento: number;
  perchas_por_reponer: number;
  lotes_por_vencer: number;
  dias_aviso?: number;
  movimientos_hoy: number;
  percha_vacia_por_dia: { dia: string; productos: number }[];
};

type LoteVence = { lote_id: string; producto_id: string; nombre: string; codigo_lote: string; cantidad: number; dias: number };

export default function Inicio() {
  const perfil = usePerfil();
  const ahora = useAhora(60_000);
  const hoy = ahora?.toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      {/* RF-10 (documento): saludo con nombre completo, rol y tienda asignada. */}
      <section className="fondo-marca relative mb-6 overflow-hidden rounded-2xl px-5 py-6 text-white shadow-elevada sm:px-7">
        <svg className="pointer-events-none absolute -right-10 -bottom-16 h-48 w-96 opacity-80" viewBox="0 0 400 200" aria-hidden>
          <path d="M0 170 C 120 110, 250 120, 400 40" fill="none" stroke="#ffd100" strokeWidth="5" strokeLinecap="round" />
          <path d="M40 200 C 160 140, 280 150, 420 70" fill="none" stroke="#ffd100" strokeOpacity="0.35" strokeWidth="12" strokeLinecap="round" />
        </svg>
        <p className="text-xs font-semibold tracking-[0.14em] text-amarillo uppercase">Inicio</p>
        <h1 className="mt-1 text-3xl font-extrabold">Hola, {perfil.nombre.split(" ")[0]} 👋</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/85">
          <span className="font-semibold text-white">{perfil.nombre}</span>
          <span aria-hidden>·</span>
          <span className="rounded-full bg-amarillo px-2 py-0.5 text-xs font-bold text-tinta">{NOMBRE_ROL[perfil.rol]}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Icono nombre="tienda" className="size-4 text-amarillo" /> Tienda Mass Bolognesi · Chincha
          </span>
        </p>
        <p className="mt-2 min-h-5 text-sm text-white/75 first-letter:uppercase">
          {perfil.rol === "reponedor" ? "Tus reposiciones pendientes de este turno." : hoy ? `${hoy}. Lo que necesita atención ahora y lo que pasó hoy en la tienda.` : ""}
        </p>
      </section>
      {perfil.rol === "reponedor" ? <InicioReponedor /> : <InicioGestion />}
    </>
  );
}

/** Fecha AAAA-MM-DD en hora de Lima. */
const diaLima = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** RF-08 (documento): unidades recibidas (ingresos) frente a unidades llevadas a percha (reposiciones), por día. */
function useFlujoSemana() {
  return useDatos<{ dia: string; ingresos: number; reposiciones: number }[]>("inicio-flujo-7d", async () => {
    const dias = Array.from({ length: 7 }, (_, i) => diaLima(new Date(Date.now() - (6 - i) * 86_400_000)));
    const { data, error } = await supabaseNavegador()
      .from("v_historial")
      .select("creado_en, tipo, cantidad")
      .eq("anulado", false)
      .in("tipo", ["ingreso", "reposicion"])
      .gte("creado_en", new Date(Date.now() - 8 * 86_400_000).toISOString());
    if (error) return { data: null, error };
    const porDia = new Map(dias.map((d) => [d, { dia: d, ingresos: 0, reposiciones: 0 }]));
    for (const m of (data ?? []) as { creado_en: string; tipo: string; cantidad: number }[]) {
      const fila = porDia.get(diaLima(new Date(m.creado_en)));
      if (!fila) continue;
      if (m.tipo === "ingreso") fila.ingresos += m.cantidad;
      else fila.reposiciones += m.cantidad;
    }
    return { data: [...porDia.values()], error: null };
  });
}

/** RF-07 (documento): productos activos en el catálogo. */
function useProductosActivos() {
  return useDatos<number>("inicio-productos-activos", async () => {
    const { count, error } = await supabaseNavegador().from("productos").select("id", { count: "exact", head: true }).eq("activo", true);
    return { data: count ?? 0, error };
  });
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const etiquetaDia = (dia: string, esHoy: boolean) => (esHoy ? "Hoy" : DIAS[new Date(dia + "T12:00:00Z").getUTCDay()]);

/* ---------------- RF-32 (Figuras 6 y 26): administrador y supervisor ---------------- */

function InicioGestion() {
  const { abrir } = useFicha();
  const sb = supabaseNavegador();
  // Las cuatro consultas salen a la vez; al volver al inicio se ven los datos anteriores al instante.
  const resumen = useDatos<Resumen>("inicio-resumen", () => sb.rpc("resumen_inicio"));
  const alertasQ = useDatos<AlertaActiva[]>("alertas-activas", () => sb.rpc("alertas_activas"));
  const lotesQ = useDatos<LoteVence[]>("inicio-lotes", () =>
    sb.from("v_vencimientos").select("lote_id, producto_id, nombre, codigo_lote, cantidad, dias").eq("por_vencer", true).order("fecha_vencimiento").limit(5),
  );
  const movsQ = useDatos<LineaHistorial[]>("inicio-movimientos", () =>
    sb.from("v_historial").select("*").eq("anulado", false).order("creado_en", { ascending: false }).limit(6),
  );
  const flujoQ = useFlujoSemana();
  const activosQ = useProductosActivos();
  const { conectados } = useConexion();
  const r = resumen.datos ?? null;
  const error = resumen.error;
  const alertas = alertasQ.datos ?? NADA;
  const lotes = lotesQ.datos ?? NADA;
  const movs = movsQ.datos ?? NADA;
  const flujo = flujoQ.datos ?? null;

  if (error) return <MensajeError>{error}</MensajeError>;
  if (!r) return <Cargando />;

  const tarjetas: { n: number | string; t: string; icono: NombreIcono; tono: string; href: string }[] = [
    { n: activosQ.datos ?? "—", t: "Productos activos en catálogo", icono: "catalogo", tono: "bg-azul-claro text-azul", href: "/catalogo" },
    { n: r.alertas_abastecimiento, t: "Alertas de abastecimiento", icono: "alerta", tono: "bg-peligro-fondo text-peligro", href: "/reposicion" },
    { n: r.perchas_por_reponer, t: "Perchas por reponer", icono: "percha", tono: "bg-aviso-fondo text-aviso", href: "/reposicion" },
    { n: r.lotes_por_vencer, t: `Lotes por vencer en ${r.dias_aviso ?? 7} días`, icono: "vencimientos", tono: "bg-aviso-fondo text-aviso", href: "/vencimientos" },
    { n: r.movimientos_hoy, t: "Movimientos de hoy", icono: "movimientos", tono: "bg-ok-fondo text-ok", href: "/historial" },
    { n: conectados ?? "—", t: "Personal conectado ahora", icono: "personas", tono: "bg-azul-claro text-azul", href: "/usuarios" },
  ];
  const maxDia = Math.max(1, ...r.percha_vacia_por_dia.map((d) => d.productos));
  const totalSemana = r.percha_vacia_por_dia.reduce((s, d) => s + d.productos, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tarjetas.map((t) => (
          <Link key={t.t} href={t.href} className="panel group block p-4 transition hover:-translate-y-0.5 hover:border-azul/40 hover:shadow-elevada">
            <span className={`grid size-10 place-items-center rounded-xl ${t.tono}`}>
              <Icono nombre={t.icono} className="size-5" />
            </span>
            <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums">{t.n}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-suave">{t.t}</p>
          </Link>
        ))}
      </div>

      <section className="panel mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">Recepciones vs. reposiciones</h2>
            <p className="text-xs text-suave">Unidades recibidas en almacén y unidades llevadas a percha en los últimos 7 días.</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-marca" aria-hidden /> Recepciones
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-amarillo-oscuro" aria-hidden /> Reposiciones
            </span>
          </div>
        </div>
        {flujoQ.error ? (
          <div className="mt-3">
            <MensajeError>{flujoQ.error}</MensajeError>
          </div>
        ) : !flujo ? (
          <Cargando />
        ) : flujo.every((d) => d.ingresos === 0 && d.reposiciones === 0) ? (
          <Vacio>No hubo recepciones ni reposiciones en los últimos 7 días.</Vacio>
        ) : (
          (() => {
            const max = Math.max(1, ...flujo.flatMap((d) => [d.ingresos, d.reposiciones]));
            return (
              <div className="mt-4 grid h-44 grid-cols-7 items-end gap-2 sm:gap-4" role="img" aria-label="Unidades recibidas y repuestas en cada uno de los últimos 7 días">
                {flujo.map((d, i) => {
                  const esHoy = i === flujo.length - 1;
                  return (
                    <div key={d.dia} className="flex h-full flex-col justify-end">
                      <div className="flex flex-1 items-end justify-center gap-1">
                        {[
                          { v: d.ingresos, c: "bg-marca", t: "recepciones" },
                          { v: d.reposiciones, c: "bg-amarillo-oscuro", t: "reposiciones" },
                        ].map((b) => (
                          <div key={b.t} className="flex w-1/2 max-w-7 flex-col items-center justify-end gap-1">
                            <span className="text-[11px] font-semibold tabular-nums">{b.v || ""}</span>
                            <div className={`w-full rounded-t-md ${b.c} transition-all`} style={{ height: `${b.v ? Math.max(6, (b.v / max) * 120) : 3}px`, opacity: b.v ? 1 : 0.25 }} title={`${b.v} unid. ${b.t}`} />
                          </div>
                        ))}
                      </div>
                      <span className={`mt-1.5 text-center text-[11px] ${esHoy ? "font-bold text-texto" : "text-suave"}`}>{etiquetaDia(d.dia, esHoy)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <div className="flex items-center justify-between border-b border-borde p-4">
            <h2 className="text-base font-bold">
              Alertas activas <span className="ml-1 rounded-full bg-peligro px-2 text-xs text-white">{alertas.length}</span>
            </h2>
            <Link href="/reposicion" className="enlace text-sm">
              Ver todas
            </Link>
          </div>
          {alertas.length === 0 ? (
            <Vacio>No hay alertas activas.</Vacio>
          ) : (
            <ul className="divide-y divide-borde">
              {alertas.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`h-9 w-1 rounded-full ${a.nivel === "sin_stock" || a.nivel === "vacia" || a.nivel === "critica" ? "bg-peligro" : "bg-amarillo-oscuro"}`} aria-hidden />
                  <button className="min-w-0 flex-1 text-left" onClick={() => abrir(a.producto_id)}>
                    <span className="block truncate text-sm font-semibold">{a.nombre}</span>
                    <span className="text-xs text-suave">
                      {a.tipo === "percha" ? `Percha ${a.percha} · mínimo de percha ${a.minimo_percha}` : `Stock ${a.total} · mínimo ${a.stock_minimo}`}
                    </span>
                  </button>
                  <EtiquetaNivel nivel={a.nivel} />
                  <span className="w-14 text-right text-xs text-suave">{duracion(a.horas)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel">
            <div className="flex items-center justify-between border-b border-borde p-4">
              <h2 className="text-base font-bold">Lotes por vencer</h2>
              <Link href="/vencimientos" className="enlace text-sm">
                Ver vencimientos
              </Link>
            </div>
            {lotes.length === 0 ? (
              <Vacio>Ningún lote vence en los próximos {r.dias_aviso ?? 7} días.</Vacio>
            ) : (
              <ul className="divide-y divide-borde">
                {lotes.map((l) => (
                  <li key={l.lote_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <button className="min-w-0 text-left" onClick={() => abrir(l.producto_id)}>
                      <span className="block truncate text-sm font-semibold">{l.nombre}</span>
                      <span className="text-xs text-suave">
                        Lote {l.codigo_lote} · {l.cantidad} unid.
                      </span>
                    </button>
                    <EtiquetaVence dias={l.dias} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-4">
            <h2 className="text-base font-bold">Productos con percha vacía por día</h2>
            <p className="text-xs text-suave">Últimos 7 días. Hoy: {r.percha_vacia_por_dia.at(-1)?.productos ?? 0} {r.percha_vacia_por_dia.at(-1)?.productos === 1 ? "producto" : "productos"}.</p>
            {totalSemana === 0 ? (
              <Vacio>Ninguna percha quedó vacía en los últimos 7 días.</Vacio>
            ) : (
              <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label="Productos con percha vacía en cada uno de los últimos 7 días">
                {r.percha_vacia_por_dia.map((d, i) => {
                  const esHoy = i === r.percha_vacia_por_dia.length - 1;
                  return (
                    <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-semibold">{d.productos}</span>
                      <div className={`w-full rounded-t ${esHoy ? "bg-azul" : "bg-azul-claro"}`} style={{ height: `${Math.max(4, (d.productos / maxDia) * 84)}px` }} />
                      <span className={`text-[11px] ${esHoy ? "font-bold" : "text-suave"}`}>{esHoy ? "Hoy" : DIAS[new Date(d.dia + "T12:00:00Z").getUTCDay()]}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="panel mt-4">
        <div className="flex items-center justify-between border-b border-borde p-4">
          <h2 className="text-base font-bold">Últimos movimientos</h2>
          <Link href="/historial" className="enlace text-sm">
            Ver historial
          </Link>
        </div>
        {movs.length === 0 ? (
          <Vacio>Todavía no hay movimientos.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[600px]">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Producto</th>
                  <th>Movimiento</th>
                  <th>Registró</th>
                  <th className="text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.linea_id}>
                    <td className="text-xs text-suave">{hora(m.creado_en)}</td>
                    <td className="font-semibold">{m.producto}</td>
                    <td>
                      <EtiquetaMovimiento m={m} />
                    </td>
                    <td>{m.usuario}</td>
                    <td className={`text-right font-bold ${m.tipo === "reposicion" ? "" : m.efecto < 0 ? "text-peligro" : "text-ok"}`}>
                      {m.tipo !== "reposicion" && m.efecto > 0 ? "+" : ""}
                      {m.efecto}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EtiquetaMovimiento({ m }: { m: LineaHistorial }) {
  switch (m.tipo) {
    case "ingreso":
      return <Etiqueta tono="ok">Ingreso</Etiqueta>;
    case "reposicion":
      return <Etiqueta tono="info">Reposición a percha</Etiqueta>;
    case "ajuste":
      return <Etiqueta tono="aviso">Ajuste</Etiqueta>;
    default:
      return <Etiqueta tono="peligro">{m.motivo === "venta" ? "Venta" : m.motivo === "merma" ? "Merma" : "Vencimiento"}</Etiqueta>;
  }
}

/* ---------------- RF-33 (Figuras 38 y 50): reponedor ---------------- */

function InicioReponedor() {
  const router = useRouter();
  const q = useDatos<AlertaActiva[]>("alertas-activas", () => supabaseNavegador().rpc("alertas_activas"));
  const pendientes = q.datos ? q.datos.filter((a) => a.tipo === "percha" && a.estado !== "repuesto") : q.error ? [] : null;
  const [errorAccion, setError] = useState<string | null>(null);
  const error = errorAccion ?? q.error;

  const accesos = [
    { href: "/ingreso", t: "Registrar ingreso", i: "M12 4v12m0 0-4-4m4 4 4-4M4 20h16" },
    { href: "/reponer", t: "Registrar reposición", i: "M4 6h16M4 12h10M4 18h16M18 9l3 3-3 3" },
    { href: "/salida", t: "Registrar salida", i: "M12 20V8m0 0-4 4m4-4 4 4M4 4h16" },
    { href: "/conteo", t: "Conteo físico", i: "M9 5h6M9 3h6v4H9zM6 5H5v16h14V5h-1M9 12l2 2 4-4" },
  ];

  async function reponer(a: AlertaActiva) {
    const { error: e } = await supabaseNavegador().rpc("tomar_alerta", { p_alerta: a.id });
    if (e) return setError(mensajeError(e));
    router.push(`/reponer?producto=${a.producto_id}`);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {accesos.map((a) => (
          <Link key={a.href} href={a.href} className="panel flex min-h-14 items-center gap-3 p-3 font-semibold transition hover:border-azul">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-amarillo text-tinta" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={a.i} />
              </svg>
            </span>
            <span className="text-sm">{a.t}</span>
          </Link>
        ))}
      </div>

      <section className="panel mt-4">
        <h2 className="border-b border-borde p-4 text-base font-bold">
          Reposiciones de percha pendientes <span className="ml-1 rounded-full bg-peligro px-2 text-xs text-white">{pendientes?.length ?? 0}</span>
        </h2>
        <div className="px-4 pt-3">
          <MensajeError>{error}</MensajeError>
        </div>
        {pendientes === null ? (
          <Cargando />
        ) : pendientes.length === 0 ? (
          <Vacio>No hay perchas por reponer. Buen trabajo.</Vacio>
        ) : (
          <ul className="divide-y divide-borde">
            {pendientes.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`h-10 w-1 rounded-full ${a.percha === 0 ? "bg-peligro" : "bg-amarillo-oscuro"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.nombre}</p>
                  <p className="text-xs text-suave">
                    Percha <b className="text-texto">{a.percha}</b> de {a.minimo_percha} · almacén <b className="text-texto">{a.almacen}</b>
                  </p>
                  <p className="text-xs text-suave">
                    {duracion(a.horas)} esperando{a.estado === "en_reposicion" && a.responsable ? ` · tomada por ${a.responsable}` : ""}
                  </p>
                </div>
                {a.almacen_vacio ? (
                  <Etiqueta tono="peligro">Almacén vacío</Etiqueta>
                ) : (
                  <button className="btn-principal min-h-10 px-4" onClick={() => reponer(a)}>
                    Reponer
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
