"use client";

import { useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, EtiquetaVence, MensajeError, Modal, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fecha, mensajeError } from "@/lib/formato";
import { NADA, useDatos } from "@/lib/datos";

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


  return (
    <>
      <Encabezado ruta="Control › Vencimientos" titulo="Vencimientos" descripcion="Lotes vencidos o que vencen en los próximos 30 días, del más urgente al menos urgente." />
      <AvisoSinConexion />
      <MensajeError>{error}</MensajeError>
      <section className="panel">
        {lotes === null ? (
          <Cargando />
        ) : lotes.length === 0 ? (
          <Vacio>Ningún lote con unidades vence en los próximos 30 días.</Vacio>
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
                  <th>{esAdmin ? "Acción" : "Última acción"}</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
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
                          className="campo min-h-9 w-44 py-1.5"
                          aria-label={`Registrar acción para el lote ${l.codigo_lote}`}
                          value=""
                          disabled={estado !== "conectado"}
                          onChange={(e) => e.target.value && setAccion({ lote: l, tipo: e.target.value as keyof typeof ACCION })}
                        >
                          <option value="">{l.ultima_accion ? `${ACCION[l.ultima_accion]} registrada` : "Registrar acción"}</option>
                          <option value="retiro">Retirar (salida por vencimiento)</option>
                          <option value="oferta">Poner en oferta</option>
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
        <p className="border-t border-borde px-4 py-3 text-xs text-suave">
          Un lote está «por vencer» con los días de aviso de Parámetros o menos y «vencido» desde el día siguiente a su fecha; las unidades vencidas no suman al stock disponible
          (RN-10).
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
