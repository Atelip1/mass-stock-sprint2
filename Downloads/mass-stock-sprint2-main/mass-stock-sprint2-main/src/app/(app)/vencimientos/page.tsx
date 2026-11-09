"use client";

import { useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, EtiquetaVence, MensajeError, Modal, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { coincide, fecha, mensajeError } from "@/lib/formato";
import { NADA, useDatos } from "@/lib/datos";

const POR_PAGINA = 20;

type Lote = {
  lote_id: string;
  producto_id: string;
  nombre: string;
  codigo_barras: string;
  codigo_lote: string;
  fecha_vencimiento: string;
  zona_almacen: string;
  percha: number;
  almacen: number;
  cantidad: number;
  dias: number;
  ultima_accion: "retiro" | "oferta" | "devolucion" | null;
  por_vencer: boolean;
};

const ACCION = { retiro: "Retiro", oferta: "Oferta", devolucion: "Devolución" } as const;

/** RF-30 y RF-31 (Figuras 14, 31 y 46): lotes vencidos o que vencen en los próximos 30 días. */
export default function Vencimientos() {
  const perfil = usePerfil();
  const { abrir } = useFicha();
  const { avisar } = useAvisos();
  const { estado } = useConexion();
  const esAdmin = perfil.rol === "administrador";
  const q = useDatos<Lote[]>("vencimientos", () => supabaseNavegador().from("v_vencimientos").select("*").order("fecha_vencimiento"));
  const lotes = q.datos ?? (q.error ? NADA : null);
  const error = q.error;
  const [accion, setAccion] = useState<{ lote: Lote; tipo: keyof typeof ACCION } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroVenc, setFiltroVenc] = useState<"todos" | "vencidos" | "por_vencer">("todos");
  const [pagina, setPagina] = useState(0);

  const filtrados = useMemo(() => {
    if (!lotes) return [];
    return lotes.filter((l) => {
      if (filtroVenc === "vencidos" && l.dias >= 0) return false;
      if (filtroVenc === "por_vencer" && l.dias < 0) return false;
      if (busqueda.trim() && !coincide(l.nombre, busqueda) && !l.codigo_lote.toLowerCase().includes(busqueda.trim().toLowerCase()) && !l.codigo_barras.includes(busqueda.trim())) {
        return false;
      }
      return true;
    });
  }, [lotes, filtroVenc, busqueda]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);

  return (
    <>
      <Encabezado ruta="Control › Vencimientos" titulo="Vencimientos" descripcion="Control preventivo de lotes vencidos o que vencen en los próximos 30 días." />
      <AvisoSinConexion />
      <MensajeError>{error}</MensajeError>
      <section className="panel">
        {lotes === null ? (
          <Cargando />
        ) : lotes.length === 0 ? (
          <Vacio>Ningún lote con unidades vence en los próximos 30 días.</Vacio>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
              <div className="min-w-52 flex-1">
                <label className="etiqueta" htmlFor="v-buscar">
                  Buscar lote o producto
                </label>
                <input
                  id="v-buscar"
                  className="campo"
                  placeholder="Producto, código de barras o lote…"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPagina(0);
                  }}
                />
              </div>
              <div>
                <label className="etiqueta" htmlFor="v-estado">
                  Estado del lote
                </label>
                <select
                  id="v-estado"
                  className="campo"
                  value={filtroVenc}
                  onChange={(e) => {
                    setFiltroVenc(e.target.value as typeof filtroVenc);
                    setPagina(0);
                  }}
                >
                  <option value="todos">Todos ({lotes.length})</option>
                  <option value="vencidos">Vencidos ({lotes.filter((l) => l.dias < 0).length})</option>
                  <option value="por_vencer">Próximos a vencer ({lotes.filter((l) => l.dias >= 0).length})</option>
                </select>
              </div>
            </div>

            {filtrados.length === 0 ? (
              <Vacio>No hay lotes que coincidan con el filtro.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Lote</th>
                      <th>Ubicación</th>
                      <th className="text-right">Cantidad</th>
                      <th>Vence</th>
                      <th>{esAdmin ? "Acción sobre el lote" : "Última acción"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA).map((l) => (
                      <tr key={l.lote_id} className={l.dias < 0 ? "bg-peligro-fondo/40" : ""}>
                        <td>
                          <button className="enlace text-left" onClick={() => abrir(l.producto_id)}>
                            {l.nombre}
                          </button>
                        </td>
                        <td className="font-mono">{l.codigo_lote}</td>
                        <td className="text-xs">
                          Percha {l.percha} · almacén {l.almacen} ({l.zona_almacen})
                        </td>
                        <td className="text-right font-semibold">{l.cantidad}</td>
                        <td>
                          <span className="block text-xs text-suave">{fecha(l.fecha_vencimiento)}</span>
                          <EtiquetaVence dias={l.dias} porVencer={l.por_vencer} />
                        </td>
                        <td>
                          {esAdmin ? (
                            <select
                              className="campo min-h-9 w-52 py-1.5"
                              aria-label={`Registrar acción para el lote ${l.codigo_lote}`}
                              value=""
                              disabled={estado !== "conectado"}
                              onChange={(e) => e.target.value && setAccion({ lote: l, tipo: e.target.value as keyof typeof ACCION })}
                            >
                              <option value="">{l.ultima_accion ? `${ACCION[l.ultima_accion]} registrada` : "Registrar acción"}</option>
                              <option value="retiro">Retirar lote completo ({l.cantidad} u.)</option>
                              <option value="oferta">Marcar en oferta</option>
                              <option value="devolucion">Devolver al proveedor</option>
                            </select>
                          ) : l.ultima_accion ? (
                            <Etiqueta tono="info">{ACCION[l.ultima_accion]}</Etiqueta>
                          ) : (
                            <span className="text-xs text-suave">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
              <span>
                Mostrando {filtrados.length === 0 ? 0 : pag * POR_PAGINA + 1}–{Math.min((pag + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length} lotes
              </span>
              <div className="flex items-center gap-2">
                <button className="btn-secundario min-h-8 px-2.5 text-xs" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
                  Anterior
                </button>
                <span>
                  Página {pag + 1} de {paginas}
                </span>
                <button className="btn-secundario min-h-8 px-2.5 text-xs" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
        <p className="border-t border-borde px-4 py-3 text-xs text-suave">
          Las unidades de lotes vencidos se excluyen automáticamente del stock disponible para venta y reposición.
        </p>
      </section>

      {accion && (
        <AccionLote
          {...accion}
          onCerrar={() => setAccion(null)}
          onListo={(m) => {
            setAccion(null);
            avisar(m);
            q.recargar();
          }}
        />
      )}
    </>
  );
}

function AccionLote({ lote, tipo, onCerrar, onListo }: { lote: Lote; tipo: keyof typeof ACCION; onCerrar: () => void; onListo: (m: string) => void }) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    setEnviando(true);
    const { error: e } = await supabaseNavegador().rpc("registrar_accion_lote", { p_lote: lote.lote_id, p_accion: tipo, p_nota: nota || null });
    setEnviando(false);
    if (e) return setError(mensajeError(e));
    onListo(tipo === "retiro" ? `Lote ${lote.codigo_lote} retirado: salida por vencimiento de ${lote.cantidad} unidades.` : `${ACCION[tipo]} registrada para el lote ${lote.codigo_lote}.`);
  }
  return (
    <Modal titulo={`${ACCION[tipo]} del lote ${lote.codigo_lote}`} onCerrar={onCerrar}>
      <p className="mt-2 text-sm text-suave">
        {lote.nombre} · {lote.cantidad} unidades (percha {lote.percha}, almacén {lote.almacen}).{" "}
        {tipo === "retiro"
          ? "Se registra una salida por vencimiento de todas las unidades del lote. Se puede anular desde el Historial."
          : "Queda anotado en el lote; el stock no cambia."}
      </p>
      <label className="etiqueta mt-4" htmlFor="nota">
        Nota (opcional)
      </label>
      <input id="nota" className="campo" value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "oferta" ? "Ej. 2x1 hasta el sábado" : ""} />
      <div className="mt-3">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <button className={tipo === "retiro" ? "btn-peligro" : "btn-principal"} disabled={enviando} onClick={enviar}>
          {tipo === "retiro" ? `Retirar ${lote.cantidad} unidades` : "Registrar"}
        </button>
      </div>
    </Modal>
  );
}
