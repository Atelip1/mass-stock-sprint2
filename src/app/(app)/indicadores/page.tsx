"use client";

import { useEffect, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { useConexion } from "@/components/Conexion";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, MensajeError } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, fechaHora, hoyISO, mensajeError } from "@/lib/formato";

type Clave = "tiempo_reposicion_percha" | "tiempo_reposicion_abastecimiento" | "duracion_quiebre" | "rotacion" | "merma_vencimiento";
type Semana = { desde: string; hasta: string } & Record<Clave, number | null>;
type LineaBase = { indicador: Clave; valor: number; meta: number | null; unidad: string; fecha: string; fuente: string; registrado_por_nombre?: string; registrado_por?: string; creado_en: string };
type Datos = { semanas: Semana[]; lineas_base: Partial<Record<Clave, LineaBase>>; historial_lineas_base: LineaBase[] };

/** Los cuatro indicadores que eligió la tienda (RN-18). «Menor es mejor» salvo la rotación. */
const IND: Record<Clave, { nombre: string; mide: string; unidad: string; menorEsMejor: boolean; decimales: number }> = {
  tiempo_reposicion_percha: {
    nombre: "Tiempo de reposición · percha",
    mide: "Horas desde que se detecta la alerta de percha hasta que se registra la reposición.",
    unidad: "h",
    menorEsMejor: true,
    decimales: 1,
  },
  tiempo_reposicion_abastecimiento: {
    nombre: "Tiempo de reposición · abastecimiento",
    mide: "Horas desde la alerta de abastecimiento hasta el ingreso del proveedor.",
    unidad: "h",
    menorEsMejor: true,
    decimales: 1,
  },
  duracion_quiebre: { nombre: "Duración del quiebre", mide: "Horas promedio que un producto pasa con la percha vacía.", unidad: "h", menorEsMejor: true, decimales: 1 },
  rotacion: { nombre: "Rotación", mide: "Unidades vendidas ÷ stock promedio del periodo.", unidad: "veces", menorEsMejor: false, decimales: 2 },
  merma_vencimiento: { nombre: "Merma por vencimiento", mide: "Unidades retiradas por vencimiento en el periodo.", unidad: "unid.", menorEsMejor: true, decimales: 0 },
};
const TARJETAS: (Clave | "tiempo")[] = ["tiempo", "duracion_quiebre", "rotacion", "merma_vencimiento"];

const fmt = (v: number | null | undefined, d: number) => (v === null || v === undefined ? "—" : Number(v).toFixed(d).replace(".", ","));

/** RN-19: variación % = (después − antes) ÷ antes × 100. */
function variacion(actual: number | null | undefined, base: LineaBase | undefined, clave: Clave) {
  if (actual === null || actual === undefined || !base || Number(base.valor) === 0) return null;
  const v = ((actual - Number(base.valor)) / Number(base.valor)) * 100;
  const mejora = IND[clave].menorEsMejor ? v < 0 : v > 0;
  return { v, mejora };
}

/** RF-39 y RF-40 (Figuras 17 y 34). */
export default function Indicadores() {
  const perfil = usePerfil();
  const { version, marcarActualizado } = useConexion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Clave>("tiempo_reposicion_percha");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    supabaseNavegador()
      .rpc("indicadores", { p_semanas: 7 })
      .then(({ data, error: e }: { data: unknown; error: unknown }) => {
        setError(e ? mensajeError(e) : null);
        setDatos(data as Datos);
        marcarActualizado();
      });
  }, [version, recarga, marcarActualizado]);

  if (error) return <MensajeError>{error}</MensajeError>;
  if (!datos) return <Cargando />;
  const actual = datos.semanas.at(-1)!;

  return (
    <>
      <Encabezado
        ruta="Análisis › Indicadores"
        titulo="Indicadores de mejora"
        descripcion={`Los cuatro indicadores acordados con la tienda, comparados con su línea base y su meta. Antes y después usan la misma unidad. Periodo: últimas 7 semanas (la actual va del ${fecha(actual.desde)} al ${fecha(actual.hasta)}).`}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TARJETAS.map((t) =>
          t === "tiempo" ? (
            <div key={t} className={`panel p-4 ${sel.startsWith("tiempo") ? "border-azul ring-1 ring-azul" : ""}`}>
              <h2 className="text-sm font-bold">Tiempo de reposición</h2>
              <p className="text-xs text-suave">Horas desde que se detecta la alerta hasta que se repone.</p>
              {(["tiempo_reposicion_percha", "tiempo_reposicion_abastecimiento"] as Clave[]).map((k) => (
                <button key={k} className={`mt-2 block w-full rounded-md p-2 text-left hover:bg-fondo ${sel === k ? "bg-azul-claro/50" : ""}`} onClick={() => setSel(k)} aria-pressed={sel === k}>
                  <span className="text-xs text-suave">{k.endsWith("percha") ? "Percha" : "Abastecimiento"}</span>
                  <Valor clave={k} actual={actual[k]} base={datos.lineas_base[k]} chico />
                </button>
              ))}
            </div>
          ) : (
            <button key={t} className={`panel p-4 text-left transition hover:border-azul ${sel === t ? "border-azul ring-1 ring-azul" : ""}`} onClick={() => setSel(t)} aria-pressed={sel === t}>
              <h2 className="text-sm font-bold">{IND[t].nombre}</h2>
              <p className="text-xs text-suave">{IND[t].mide}</p>
              <Valor clave={t} actual={actual[t]} base={datos.lineas_base[t]} />
            </button>
          ),
        )}
      </div>

      <section className="panel mt-4 p-4 sm:p-5">
        <h2 className="text-base font-bold">{IND[sel].nombre}</h2>
        <p className="text-xs text-suave">
          Valor por semana, en {IND[sel].unidad}. {IND[sel].mide}
        </p>
        <Grafico semanas={datos.semanas} clave={sel} base={datos.lineas_base[sel]} />
        {(() => {
          const v = variacion(actual[sel], datos.lineas_base[sel], sel);
          const b = datos.lineas_base[sel];
          return (
            <p className="mt-2 text-xs text-suave">
              {v && b
                ? `Variación = (${fmt(actual[sel], IND[sel].decimales)} − ${fmt(b.valor, IND[sel].decimales)}) ÷ ${fmt(b.valor, IND[sel].decimales)} × 100 = ${v.v.toFixed(1).replace(".", ",")} %. ${IND[sel].menorEsMejor ? "Menos es mejor." : "Más es mejor."}`
                : b
                  ? "Todavía no hay datos de esta semana para comparar con la línea base."
                  : "Falta registrar la línea base de este indicador para calcular la variación."}
            </p>
          );
        })()}
        {perfil.rol === "administrador" && <FormLineaBase clave={sel} base={datos.lineas_base[sel]} onGuardado={() => setRecarga((r) => r + 1)} />}
      </section>

      {datos.historial_lineas_base.length > 0 && (
        <section className="panel mt-4">
          <h2 className="border-b border-borde p-4 text-base font-bold">Cambios de la línea base</h2>
          <div className="overflow-x-auto">
            <table className="tabla min-w-[720px]">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th className="text-right">Línea base</th>
                  <th className="text-right">Meta</th>
                  <th>Medida el</th>
                  <th>Fuente</th>
                  <th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {datos.historial_lineas_base.map((h, i) => (
                  <tr key={i}>
                    <td>{IND[h.indicador].nombre}</td>
                    <td className="text-right">
                      {fmt(h.valor, IND[h.indicador].decimales)} {h.unidad}
                    </td>
                    <td className="text-right">{h.meta === null ? "—" : `${fmt(h.meta, IND[h.indicador].decimales)} ${h.unidad}`}</td>
                    <td>{fecha(h.fecha)}</td>
                    <td className="text-xs">{h.fuente}</td>
                    <td className="text-xs">
                      {h.registrado_por}
                      <span className="block text-suave">{fechaHora(h.creado_en)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Valor({ clave, actual, base, chico }: { clave: Clave; actual: number | null; base?: LineaBase; chico?: boolean }) {
  const i = IND[clave];
  const v = variacion(actual, base, clave);
  return (
    <span className="block">
      <span className={`block font-bold ${chico ? "text-xl" : "mt-2 text-3xl"}`}>
        {fmt(actual, i.decimales)} <span className="text-sm font-normal">{actual === null ? "" : i.unidad}</span>
      </span>
      <span className="block text-xs text-suave">
        {base ? `Línea base ${fmt(base.valor, i.decimales)} ${i.unidad}${base.meta !== null ? ` · meta ${fmt(base.meta, i.decimales)} ${i.unidad}` : ""}` : "Sin línea base registrada"}
      </span>
      {v && (
        <span className="mt-1 inline-block">
          <Etiqueta tono={v.mejora ? "ok" : "peligro"}>
            {v.v > 0 ? "+" : ""}
            {v.v.toFixed(1).replace(".", ",")} % · {v.mejora ? "mejora" : "empeora"}
          </Etiqueta>
        </span>
      )}
    </span>
  );
}

/** Gráfico de línea semanal con la línea base y la meta punteadas (SVG propio, sin librerías). */
function Grafico({ semanas, clave, base }: { semanas: Semana[]; clave: Clave; base?: LineaBase }) {
  const ancho = 720;
  const alto = 220;
  const m = { izq: 40, der: 16, arr: 16, aba: 28 };
  const valores = semanas.map((s) => s[clave]);
  const refs = [base?.valor, base?.meta].filter((x): x is number => x !== null && x !== undefined).map(Number);
  const max = Math.max(1, ...valores.filter((v): v is number => v !== null).map(Number), ...refs) * 1.15;
  const x = (i: number) => m.izq + (i * (ancho - m.izq - m.der)) / Math.max(1, semanas.length - 1);
  const y = (v: number) => m.arr + (1 - v / max) * (alto - m.arr - m.aba);
  const puntos = valores.map((v, i) => (v === null ? null : ([x(i), y(Number(v))] as const)));
  const tramos: string[] = [];
  let actual = "";
  puntos.forEach((p) => {
    if (!p) {
      if (actual) tramos.push(actual);
      actual = "";
    } else actual += `${actual ? "L" : "M"}${p[0]},${p[1]} `;
  });
  if (actual) tramos.push(actual);
  const d = IND[clave].decimales;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);

  if (valores.every((v) => v === null || v === 0) && clave !== "merma_vencimiento" && !base)
    return <p className="py-10 text-center text-sm text-suave">Todavía no hay datos para este indicador. Se calculan solos a medida que se registran alertas, reposiciones y ventas.</p>;

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="mt-3 w-full" role="img" aria-label={`${IND[clave].nombre} por semana`}>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} stroke="var(--color-borde)" />
          <text x={m.izq - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--color-suave)">
            {fmt(v, d === 0 ? 0 : 1)}
          </text>
        </g>
      ))}
      {base && (
        <>
          <line x1={m.izq} x2={ancho - m.der} y1={y(Number(base.valor))} y2={y(Number(base.valor))} stroke="var(--color-suave)" strokeDasharray="4 4" />
          <text x={m.izq + 4} y={y(Number(base.valor)) - 4} fontSize="10" fill="var(--color-suave)">
            Línea base {fmt(base.valor, d)} {IND[clave].unidad}
          </text>
          {base.meta !== null && (
            <>
              <line x1={m.izq} x2={ancho - m.der} y1={y(Number(base.meta))} y2={y(Number(base.meta))} stroke="var(--color-ok)" strokeDasharray="2 4" />
              <text x={m.izq + 4} y={y(Number(base.meta)) - 4} fontSize="10" fill="var(--color-ok)">
                Meta {fmt(base.meta, d)} {IND[clave].unidad}
              </text>
            </>
          )}
        </>
      )}
      {tramos.map((t, i) => (
        <path key={i} d={t} fill="none" stroke="var(--color-azul)" strokeWidth="2.5" />
      ))}
      {puntos.map(
        (p, i) =>
          p && (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r="4" fill="var(--color-azul)" />
              {i === puntos.length - 1 && (
                <text x={p[0]} y={p[1] - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--color-azul)">
                  {fmt(valores[i], d)} {IND[clave].unidad}
                </text>
              )}
            </g>
          ),
      )}
      {semanas.map((s, i) => (
        <text key={s.hasta} x={x(i)} y={alto - 8} textAnchor="middle" fontSize="10" fill="var(--color-suave)">
          <title>
            {fecha(s.desde)} a {fecha(s.hasta)}
          </title>
          {i === semanas.length - 1 ? "Actual" : `S${i + 1}`}
        </text>
      ))}
    </svg>
  );
}

function FormLineaBase({ clave, base, onGuardado }: { clave: Clave; base?: LineaBase; onGuardado: () => void }) {
  const { avisar } = useAvisos();
  const [valor, setValor] = useState("");
  const [meta, setMeta] = useState("");
  const [fechaMed, setFechaMed] = useState(hoyISO());
  const [fuente, setFuente] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setValor(base ? String(base.valor) : "");
    setMeta(base?.meta !== null && base?.meta !== undefined ? String(base.meta) : "");
    setFechaMed(base?.fecha ?? hoyISO());
    setFuente(base?.fuente ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, base?.creado_en]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const v = Number(valor.replace(",", "."));
    const mt = meta.trim() === "" ? null : Number(meta.replace(",", "."));
    if (valor.trim() === "" || !Number.isFinite(v) || v < 0) return setError("Escribe el valor de la línea base (0 o más).");
    if (mt !== null && (!Number.isFinite(mt) || mt < 0)) return setError("La meta debe ser un número de 0 o más.");
    setEnviando(true);
    const { error: err } = await supabaseNavegador().rpc("registrar_linea_base", { p_indicador: clave, p_valor: v, p_meta: mt, p_fecha: fechaMed, p_fuente: fuente });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    avisar(`Línea base de «${IND[clave].nombre}» guardada.`);
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="mt-4 grid gap-3 border-t border-borde pt-4 sm:grid-cols-2 lg:grid-cols-[140px_140px_160px_1fr_auto] lg:items-end" noValidate>
      <div>
        <label className="etiqueta" htmlFor="lb-valor">
          Línea base ({IND[clave].unidad})
        </label>
        <input id="lb-valor" className="campo" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="lb-meta">
          Meta ({IND[clave].unidad})
        </label>
        <input id="lb-meta" className="campo" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="lb-fecha">
          Medida el
        </label>
        <input id="lb-fecha" type="date" className="campo" max={hoyISO()} value={fechaMed} onChange={(e) => setFechaMed(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="lb-fuente">
          Fuente
        </label>
        <input id="lb-fuente" className="campo" placeholder="Ej. Supervisor de tienda: 3 a 6 h si hay en almacén (Tabla 6, punto 10)" value={fuente} onChange={(e) => setFuente(e.target.value)} />
      </div>
      <button className="btn-principal" disabled={enviando}>
        Guardar línea base
      </button>
      {error && (
        <div className="sm:col-span-2 lg:col-span-5">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
      <p className="text-xs text-suave sm:col-span-2 lg:col-span-5">
        Cada cambio queda registrado con fecha y usuario. Si no se midió antes del Sprint 2, usa la primera semana de uso del sistema y anótalo en la fuente (RN-19).
      </p>
    </form>
  );
}
