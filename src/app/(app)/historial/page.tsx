"use client";

import { useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { AvisoSinConexion } from "@/components/Conexion";
import { NADA, useDatos } from "@/lib/datos";
import { useFicha } from "@/components/FichaProducto";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, MensajeError, Modal, Pestanas, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { coincide, fecha, fechaHora, hoyISO, mensajeError } from "@/lib/formato";
import { descargarCSV } from "@/lib/csv";
import { NOMBRE_TIPO_MOV, type LineaHistorial } from "@/lib/tipos";

type Pestana = "todos" | "ingreso" | "reposicion" | "salida" | "ajuste";
const MOTIVO: Record<string, string> = { venta: "Venta", merma: "Merma", vencimiento: "Vencimiento" };

function haceDias(n: number) {
  const d = new Date(hoyISO() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Texto de «Motivo / detalle» sin repetir el tipo (RF-36). */
function detalle(l: LineaHistorial) {
  switch (l.tipo) {
    case "ingreso":
      return l.guia_remision ? `Guía ${l.guia_remision}` : "—";
    case "reposicion":
      return l.detalle ?? "Almacén → percha";
    case "salida":
      return [MOTIVO[l.motivo ?? ""] ?? l.motivo, l.ubicacion_origen && l.motivo !== "venta" ? `de ${l.ubicacion_origen === "percha" ? "percha" : "almacén"}` : null, l.detalle]
        .filter(Boolean)
        .join(" · ");
    case "ajuste":
      return [l.detalle, l.motivo].filter(Boolean).join(" · ");
  }
}

/** RF-36 y RF-20 (Figuras 15, 32 y 47): historial por tipo; el administrador anula; el reponedor ve solo lo suyo (RLS). */
export default function Historial() {
  const perfil = usePerfil();
  const { abrir } = useFicha();
  const { avisar } = useAvisos();
  const esAdmin = perfil.rol === "administrador";

  const [desde, setDesde] = useState(() => haceDias(30));
  const [hasta, setHasta] = useState(() => hoyISO());
  const [pestana, setPestana] = useState<Pestana>("todos");
  const [texto, setTexto] = useState("");
  const [usuario, setUsuario] = useState(""); // RF-36: filtro por usuario (vacío = todos)
  const [pagina, setPagina] = useState(0);
  const [anular, setAnular] = useState<LineaHistorial | null>(null);

  const rangoValido = !!desde && !!hasta && desde <= hasta;
  const q = useDatos<LineaHistorial[]>(rangoValido ? `historial-${desde}-${hasta}` : null, () => {
    const ini = new Date(`${desde}T00:00:00-05:00`).toISOString();
    const fin = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + 86_400_000).toISOString();
    return supabaseNavegador().from("v_historial").select("*").gte("creado_en", ini).lt("creado_en", fin).order("creado_en", { ascending: false }).limit(2000);
  });
  const filas = q.datos ?? (q.error ? NADA : null);
  const error = q.error;

  // Usuarios que aparecen en el rango elegido (el reponedor solo se ve a sí mismo por RLS).
  const usuarios = useMemo(() => {
    const m = new Map<string, string>();
    (filas ?? []).forEach((f) => m.set(f.usuario_id, f.usuario));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [filas]);
  const filtradas = useMemo(
    () =>
      (filas ?? []).filter(
        (f) =>
          (!usuario || f.usuario_id === usuario) &&
          (!texto || coincide(f.producto, texto) || f.codigo_lote.toLowerCase().includes(texto.trim().toLowerCase()) || f.codigo_barras.includes(texto.trim())),
      ),
    [filas, texto, usuario],
  );
  const cuenta = (t: Pestana) => (t === "todos" ? filtradas.length : filtradas.filter((f) => f.tipo === t).length);
  const visibles = pestana === "todos" ? filtradas : filtradas.filter((f) => f.tipo === pestana);
  const paginas = Math.max(1, Math.ceil(visibles.length / 20));
  const pag = Math.min(pagina, paginas - 1);
  const lineasDe = (movId: string) => (filas ?? []).filter((f) => f.movimiento_id === movId).length;

  function exportar() {
    descargarCSV(
      `historial-${desde}-a-${hasta}${usuario ? "-" + (usuarios.find(([id]) => id === usuario)?.[1] ?? "usuario").replace(/\s+/g, "-").toLowerCase() : ""}`,
      ["Fecha y hora", "Tipo", "Producto", "Código de barras", "Lote", "Cantidad", "Motivo / detalle", "Usuario", "Anulado", "Motivo de anulación"],
      visibles.map((f) => [
        fechaHora(f.creado_en),
        NOMBRE_TIPO_MOV[f.tipo],
        f.producto,
        f.codigo_barras,
        f.codigo_lote,
        f.efecto,
        detalle(f),
        f.usuario,
        f.anulado ? "Sí" : "No",
        f.motivo_anulacion ?? "",
      ]),
    );
  }

  return (
    <>
      <Encabezado
        ruta="Análisis › Historial"
        titulo="Historial de movimientos"
        descripcion={perfil.rol === "reponedor" ? "Lo que registraste: ingresos, reposiciones, salidas y ajustes." : "Todo lo que entró, se movió o salió del inventario, con quién lo registró."}
      />
      <AvisoSinConexion />
      <Pestanas
        valor={pestana}
        onCambiar={(p) => {
          setPestana(p);
          setPagina(0);
        }}
        opciones={[
          { valor: "todos", etiqueta: "Todos", cantidad: cuenta("todos") },
          { valor: "ingreso", etiqueta: "Ingresos", cantidad: cuenta("ingreso") },
          { valor: "reposicion", etiqueta: "Reposiciones", cantidad: cuenta("reposicion") },
          { valor: "salida", etiqueta: "Salidas", cantidad: cuenta("salida") },
          { valor: "ajuste", etiqueta: "Ajustes", cantidad: cuenta("ajuste") },
        ]}
      />

      <section className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
          <div className="min-w-48 flex-1">
            <label className="etiqueta" htmlFor="filtro">
              Filtrar esta tabla
            </label>
            <input id="filtro" className="campo" placeholder="Producto, código o lote" value={texto} onChange={(e) => { setTexto(e.target.value); setPagina(0); }} />
          </div>
          {perfil.rol !== "reponedor" && (
            <div>
              <label className="etiqueta" htmlFor="usuario">
                Usuario
              </label>
              <select id="usuario" className="campo" value={usuario} onChange={(e) => { setUsuario(e.target.value); setPagina(0); }}>
                <option value="">Todos</option>
                {usuarios.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="etiqueta" htmlFor="desde">
              Desde
            </label>
            <input id="desde" type="date" className="campo" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="hasta">
              Hasta
            </label>
            <input id="hasta" type="date" className="campo" value={hasta} min={desde} max={hoyISO()} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button className="btn-secundario" onClick={exportar} disabled={!visibles.length}>
            Exportar CSV
          </button>
        </div>
        <div className="px-4 pt-3">
          <MensajeError>{error}</MensajeError>
        </div>
        {filas === null ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio>No hay movimientos con estos filtros entre el {fecha(desde)} y el {fecha(hasta)}.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[900px]">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th className="text-right">Cantidad</th>
                  <th>Motivo / detalle</th>
                  <th>Usuario</th>
                  {esAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {visibles.slice(pag * 20, pag * 20 + 20).map((f) => (
                  <tr key={f.linea_id} className={f.anulado ? "text-suave" : ""}>
                    <td className="whitespace-nowrap text-xs">{fechaHora(f.creado_en)}</td>
                    <td>{NOMBRE_TIPO_MOV[f.tipo]}</td>
                    <td>
                      <button className={`enlace text-left ${f.anulado ? "line-through" : ""}`} onClick={() => abrir(f.producto_id)}>
                        {f.producto}
                      </button>
                    </td>
                    <td className="font-mono text-xs">{f.codigo_lote}</td>
                    <td className={`text-right font-bold ${f.anulado ? "line-through" : f.tipo === "reposicion" ? "" : f.efecto < 0 ? "text-peligro" : "text-ok"}`}>
                      {f.tipo !== "reposicion" && f.efecto > 0 ? "+" : ""}
                      {f.efecto}
                    </td>
                    <td className="text-xs">
                      {detalle(f)}
                      {f.anulado && (
                        <span className="mt-1 block">
                          <Etiqueta tono="neutro">Anulado</Etiqueta>{" "}
                          <span>
                            {f.motivo_anulacion} · {f.anulado_por}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="text-xs">{f.usuario}</td>
                    {esAdmin && (
                      <td className="text-right">
                        {!f.anulado && (
                          <button className="btn-peligro min-h-9 px-3" onClick={() => setAnular(f)}>
                            Anular
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
          <span>
            {visibles.length} {visibles.length === 1 ? "línea" : "líneas"}. Los movimientos no se borran: se anulan con motivo y el stock se revierte.
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-2">
              <button className="btn-secundario min-h-9" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
                Anterior
              </button>
              Página {pag + 1} de {paginas}
              <button className="btn-secundario min-h-9" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>
                Siguiente
              </button>
            </span>
          )}
        </div>
      </section>

      {anular && (
        <AnularMovimiento
          linea={anular}
          lineas={lineasDe(anular.movimiento_id)}
          onCerrar={() => setAnular(null)}
          onListo={() => {
            setAnular(null);
            avisar("Movimiento anulado; el stock se revirtió.");
            q.recargar();
          }}
        />
      )}
    </>
  );
}

function AnularMovimiento({ linea, lineas, onCerrar, onListo }: { linea: LineaHistorial; lineas: number; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    if (!motivo.trim()) return setError("Escribe el motivo de la anulación.");
    setEnviando(true);
    const { error: e } = await supabaseNavegador().rpc("anular_movimiento", { p_mov: linea.movimiento_id, p_motivo: motivo });
    setEnviando(false);
    if (e) return setError(mensajeError(e));
    onListo();
  }
  return (
    <Modal titulo={`¿Anular este ${NOMBRE_TIPO_MOV[linea.tipo].toLowerCase()}?`} onCerrar={onCerrar}>
      <p className="mt-2 text-sm text-suave">
        {fechaHora(linea.creado_en)} · {linea.usuario}.{" "}
        {lineas > 1 ? `Se anula el movimiento completo (${lineas} líneas), no solo ${linea.producto}.` : `${linea.producto}, ${Math.abs(linea.efecto)} unidades.`} Queda marcado como
        anulado y el stock vuelve a como estaba. No se puede deshacer.
      </p>
      <label className="etiqueta mt-4" htmlFor="motivo-anulacion">
        Motivo
      </label>
      <input id="motivo-anulacion" className="campo" autoFocus placeholder="Ej. se digitó la cantidad equivocada" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <div className="mt-3">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="btn-peligro" disabled={enviando} onClick={enviar}>
          Anular movimiento
        </button>
      </div>
    </Modal>
  );
}
