"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { CampoCodigo } from "@/components/CampoCodigo";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { SelectorProducto } from "@/components/SelectorProducto";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, MensajeError, Modal, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { fechaHora, mensajeError } from "@/lib/formato";
import { cantidadEn, loteVigente, useLotes, useProductosStock } from "@/lib/operacion";

type Ajuste = {
  id: string;
  producto_id: string;
  ubicacion: "almacen" | "percha";
  sistema: number;
  contado: number;
  diferencia: number;
  estado: "pendiente" | "aprobado" | "rechazado" | "sin_diferencia";
  registrado_por: string;
  creado_en: string;
  motivo: string | null;
  resuelto_en: string | null;
  producto: { nombre: string } | null;
  registro: { nombre: string } | null;
  resolvio: { nombre: string } | null;
};

const UBIC = { almacen: "Almacén", percha: "Percha" } as const;

/**
 * RF-18 y RF-19 (Figuras 10, 27 y 42): el reponedor o el administrador registra el conteo;
 * el supervisor o el administrador aprueba o rechaza el ajuste. Nadie aprueba su propio conteo (RN-13).
 */
export default function ConteoFisico() {
  const perfil = usePerfil();
  const { avisar } = useAvisos();
  const { estado, version } = useConexion();
  const registra = perfil.rol !== "supervisor";
  const aprueba = perfil.rol !== "reponedor";

  const productos = useProductosStock();
  const [productoId, setProductoId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<"almacen" | "percha">("percha");
  const [contado, setContado] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ajustes, setAjustes] = useState<Ajuste[] | null>(null);
  const [resolver, setResolver] = useState<{ ajuste: Ajuste; aprobar: boolean } | null>(null);

  const lotes = useLotes(productoId);
  const sistema = useMemo(() => lotes.filter(loteVigente).reduce((s, l) => s + cantidadEn(l, ubicacion), 0), [lotes, ubicacion]);

  const cargar = useCallback(async () => {
    const { data } = await supabaseNavegador()
      .from("ajustes")
      .select(
        "*, producto:productos(nombre), registro:perfiles!ajustes_registrado_por_fkey(nombre), resolvio:perfiles!ajustes_resuelto_por_fkey(nombre)",
      )
      .order("creado_en", { ascending: false })
      .limit(50);
    setAjustes((data as Ajuste[]) ?? []);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar, version]);

  const leer = (c: string) => {
    const p = productos.find((x) => x.codigo_barras === c);
    if (!p) return setAviso(`El código ${c} no está en el catálogo.`);
    setProductoId(p.producto_id);
    setCodigo(p.codigo_barras);
    setAviso(null);
    setTimeout(() => document.getElementById("contado")?.focus(), 0);
  };

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!productoId) return setError("Elige el producto que contaste.");
    if (!/^\d+$/.test(contado)) return setError("Escribe las unidades contadas (0 o más).");
    setEnviando(true);
    setError(null);
    const { error: err } = await supabaseNavegador().rpc("registrar_conteo", {
      p_producto: productoId,
      p_ubicacion: ubicacion,
      p_contado: Number(contado),
      p_nota: null,
    });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    const dif = Number(contado) - sistema;
    avisar(
      dif === 0
        ? "Conteo registrado: coincide con el sistema, no requiere ajuste."
        : `Conteo registrado: diferencia ${dif > 0 ? "+" : ""}${dif}. Queda pendiente de aprobación.`,
    );
    setProductoId(null);
    setCodigo("");
    setContado("");
    cargar();
  }

  const pendientes = (ajustes ?? []).filter((a) => a.estado === "pendiente");
  const resueltos = (ajustes ?? []).filter((a) => a.estado !== "pendiente");
  const difActual = contado !== "" ? Number(contado) - sistema : 0;

  return (
    <>
      <Encabezado ruta="Operación › Conteo físico" titulo="Conteo físico" descripcion="Verificación de inventario físico frente al stock registrado en el sistema." />
      <AvisoSinConexion />

      {registra && (
        <form onSubmit={registrar} className="panel mb-4 p-4 sm:p-5" noValidate onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLElement).id !== "contado" && e.preventDefault()}>
          <h2 className="text-base font-bold">Registrar conteo</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="codigo">
                Código de barras
              </label>
              <CampoCodigo id="codigo" valor={codigo} onCambiar={(v) => { setCodigo(v); setAviso(null); }} onLeido={leer} />
              {aviso && <p className="mt-1 text-xs font-medium text-peligro">{aviso}</p>}
            </div>
            <div>
              <label className="etiqueta" htmlFor="producto">
                Producto
              </label>
              <SelectorProducto
                id="producto"
                valor={productoId}
                onCambiar={(id) => {
                  setProductoId(id);
                  const prod = productos.find((p) => p.producto_id === id);
                  setCodigo(prod?.codigo_barras ?? "");
                  setAviso(null);
                }}
                opciones={productos.map((p) => ({ id: p.producto_id, nombre: p.nombre, codigo_barras: p.codigo_barras, detalle: `percha ${p.percha} · almacén ${p.almacen}` }))}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="ubicacion">
                Ubicación contada
              </label>
              <select id="ubicacion" className="campo" value={ubicacion} onChange={(e) => setUbicacion(e.target.value as "almacen" | "percha")}>
                <option value="percha">Percha (góndola)</option>
                <option value="almacen">Almacén (trastienda)</option>
              </select>
            </div>
            <div>
              <label className="etiqueta" htmlFor="contado">
                Unidades físicas contadas
              </label>
              <input id="contado" className="campo" inputMode="numeric" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <div className="md:col-span-2">
              <label className="etiqueta" htmlFor="sistema">
                Según el sistema ({UBIC[ubicacion].toLowerCase()})
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input id="sistema" className="campo w-32" disabled value={productoId ? String(sistema) : ""} />
                {productoId && contado !== "" && (
                  <p className={`text-sm font-semibold ${difActual === 0 ? "text-ok" : difActual < 0 ? "text-peligro" : "text-aviso"}`}>
                    {difActual === 0
                      ? "✓ Coincide exactamente con el sistema (sin diferencia)."
                      : difActual < 0
                        ? `Diferencia: ${difActual} (${Math.abs(difActual) === 1 ? "Falta 1 unidad física" : `Faltan ${Math.abs(difActual)} unidades físicas`})`
                        : `Diferencia: +${difActual} (${difActual === 1 ? "Sobra 1 unidad física" : `Sobran ${difActual} unidades físicas`})`}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <MensajeError>{error}</MensajeError>
          </div>
          <button className="btn-principal mt-4" disabled={enviando || estado !== "conectado"}>
            {enviando ? "Registrando…" : "Registrar conteo"}
          </button>
        </form>
      )}

      <section className="panel">
        <h2 className="border-b border-borde p-4 text-base font-bold">
          {perfil.rol === "reponedor" ? "Mis conteos pendientes de aprobación" : "Ajustes pendientes de aprobación"} ({pendientes.length})
        </h2>
        {ajustes === null ? (
          <Cargando />
        ) : pendientes.length === 0 ? (
          <Vacio>No hay ajustes pendientes.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[680px]">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ubicación</th>
                  <th className="text-right">Sistema</th>
                  <th className="text-right">Contado</th>
                  <th className="text-right">Diferencia</th>
                  <th>Registró</th>
                  {aprueba && <th className="text-right">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {pendientes.map((a) => {
                  const propio = a.registrado_por === perfil.id;
                  const bloqueadoPorSegregacion = propio && perfil.rol !== "administrador";
                  return (
                    <tr key={a.id}>
                      <td className="font-semibold">{a.producto?.nombre}</td>
                      <td>{UBIC[a.ubicacion]}</td>
                      <td className="text-right">{a.sistema}</td>
                      <td className="text-right">{a.contado}</td>
                      <td className={`text-right font-bold ${a.diferencia < 0 ? "text-peligro" : "text-ok"}`}>
                        {a.diferencia > 0 ? `+${a.diferencia}` : a.diferencia}{" "}
                        <span className="text-xs font-normal text-suave">
                          ({a.diferencia < 0 ? `faltan ${Math.abs(a.diferencia)}` : `sobran ${a.diferencia}`})
                        </span>
                      </td>
                      <td>
                        {a.registro?.nombre}
                        <span className="block text-xs text-suave">{fechaHora(a.creado_en)}</span>
                      </td>
                      {aprueba && (
                        <td className="text-right">
                          {bloqueadoPorSegregacion ? (
                            <span className="text-xs text-suave">Registrado por ti; requiere aprobación de otro supervisor o administrador.</span>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex justify-end gap-2">
                                <button className="btn-principal min-h-9 px-3" onClick={() => setResolver({ ajuste: a, aprobar: true })}>
                                  Aprobar
                                </button>
                                <button className="btn-secundario min-h-9 px-3" onClick={() => setResolver({ ajuste: a, aprobar: false })}>
                                  Rechazar
                                </button>
                              </div>
                              {propio && (
                                <span className="text-[11px] text-suave">
                                  Conteo propio (si la BD exige otro aprobador, usa otra cuenta de supervisor/admin)
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {resueltos.length > 0 && (
        <section className="panel mt-4">
          <h2 className="border-b border-borde p-4 text-base font-bold">Últimos conteos resueltos</h2>
          <div className="overflow-x-auto">
            <table className="tabla min-w-[680px]">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ubicación</th>
                  <th className="text-right">Diferencia</th>
                  <th>Estado</th>
                  <th>Motivo</th>
                  <th>Resolvió</th>
                </tr>
              </thead>
              <tbody>
                {resueltos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.producto?.nombre}</td>
                    <td>{UBIC[a.ubicacion]}</td>
                    <td className="text-right">
                      {a.diferencia > 0 ? "+" : ""}
                      {a.diferencia}
                    </td>
                    <td>
                      {a.estado === "aprobado" ? (
                        <Etiqueta tono="ok">Aprobado</Etiqueta>
                      ) : a.estado === "rechazado" ? (
                        <Etiqueta tono="peligro">Rechazado</Etiqueta>
                      ) : (
                        <Etiqueta tono="neutro">Sin diferencia</Etiqueta>
                      )}
                    </td>
                    <td className="text-xs">{a.motivo ?? "—"}</td>
                    <td className="text-xs">
                      {a.resolvio?.nombre ?? a.registro?.nombre}
                      <span className="block text-suave">{fechaHora(a.resuelto_en ?? a.creado_en)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resolver && (
        <ResolverAjuste
          {...resolver}
          onCerrar={() => setResolver(null)}
          onListo={(msg) => {
            setResolver(null);
            avisar(msg);
            cargar();
          }}
        />
      )}
    </>
  );
}

function ResolverAjuste({ ajuste, aprobar, onCerrar, onListo }: { ajuste: Ajuste; aprobar: boolean; onCerrar: () => void; onListo: (m: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    if (!motivo.trim()) return setError("Escribe el motivo; es obligatorio para aprobar o rechazar.");
    setEnviando(true);
    const { error: err } = await supabaseNavegador().rpc("resolver_ajuste", { p_ajuste: ajuste.id, p_aprobar: aprobar, p_motivo: motivo });
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    onListo(aprobar ? `Ajuste aprobado: ${ajuste.producto?.nombre} ${ajuste.diferencia > 0 ? "+" : ""}${ajuste.diferencia}.` : "Ajuste rechazado; el stock no cambió.");
  }
  return (
    <Modal titulo={aprobar ? "Aprobar ajuste" : "Rechazar ajuste"} onCerrar={onCerrar}>
      <p className="mt-2 text-sm text-suave">
        {ajuste.producto?.nombre} en {UBIC[ajuste.ubicacion].toLowerCase()}: sistema {ajuste.sistema}, contado {ajuste.contado} (
        {ajuste.diferencia > 0 ? "+" : ""}
        {ajuste.diferencia}).{" "}
        {aprobar ? "Al aprobar, el stock cambia en esa cantidad." : "Al rechazar, el stock no cambia."}
      </p>
      <label className="etiqueta mt-4" htmlFor="motivo">
        Motivo
      </label>
      <input id="motivo" className="campo" autoFocus placeholder="Ej. botellas dañadas no registradas" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <div className="mt-3">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>
          Cancelar
        </button>
        <button className={aprobar ? "btn-principal" : "btn-peligro"} disabled={enviando} onClick={enviar}>
          {aprobar ? "Aprobar" : "Rechazar"}
        </button>
      </div>
    </Modal>
  );
}
