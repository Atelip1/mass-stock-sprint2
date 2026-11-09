"use client";

import { useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { Cargando, Etiqueta, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { coincide, mensajeError } from "@/lib/formato";
import { useDatos } from "@/lib/datos";
import type { Categoria, Producto, Proveedor } from "@/lib/tipos";

const POR_PAGINA = 20;

/* ---------------- RF-11: proveedores ---------------- */

/** Formulario corto «+ Nuevo proveedor» dentro del registro de productos (Figura 18). */
export function NuevoProveedor({ onCancelar, onCreado }: { onCancelar: () => void; onCreado: (p: Proveedor) => void }) {
  const [ruc, setRuc] = useState("");
  const [razon, setRazon] = useState("");
  const [dias, setDias] = useState("2");
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!/^\d{11}$/.test(ruc)) return setError(`El RUC debe tener 11 dígitos (tiene ${ruc.length}).`);
    if (!razon.trim()) return setError("Escribe la razón social del proveedor.");
    const { data, error: e } = await supabaseNavegador()
      .from("proveedores")
      .insert({ ruc, razon_social: razon.trim(), dias_entrega: Number(dias) || 2 })
      .select("*")
      .single();
    if (e) return setError(mensajeError(e));
    onCreado(data as Proveedor);
  }

  return (
    <div className="mt-3 rounded-md border border-borde bg-fondo/60 p-3">
      <p className="etiqueta">Nuevo proveedor</p>
      <div className="grid gap-2 sm:grid-cols-[130px_1fr_90px]">
        <input className="campo font-mono" inputMode="numeric" placeholder="RUC" aria-label="RUC" value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))} />
        <input className="campo" placeholder="Razón social" aria-label="Razón social" value={razon} onChange={(e) => setRazon(e.target.value)} />
        <input className="campo" inputMode="numeric" aria-label="Días de entrega" title="Días de entrega" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, "").slice(0, 2))} />
      </div>
      <p className="ayuda">El último campo son los días que tarda en entregar; sirven para sugerir el stock mínimo.</p>
      {error && (
        <div className="mt-2">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn-secundario min-h-9" onClick={crear}>
          Registrar proveedor
        </button>
        <button type="button" className="enlace text-xs" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Pestaña «Proveedores» del catálogo: el administrador registra, edita, activa y desactiva; el supervisor consulta. */
export function Proveedores({ esAdmin, productos, onCambio }: { esAdmin: boolean; productos: Producto[]; onCambio: () => void }) {
  const { avisar, confirmar } = useAvisos();
  const q = useDatos<Proveedor[]>("proveedores-todos", () => supabaseNavegador().from("proveedores").select("*").order("razon_social"));
  const [edit, setEdit] = useState<{ id: string | null; ruc: string; razon: string; dias: string }>({ id: null, ruc: "", razon: "", dias: "2" });
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const usados = (id: string) => productos.filter((p) => p.proveedor_id === id && p.activo).length;

  const filtrados = useMemo(
    () => (q.datos ?? []).filter((p) => !busqueda.trim() || coincide(p.razon_social, busqueda) || p.ruc.includes(busqueda.trim())),
    [q.datos, busqueda],
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{11}$/.test(edit.ruc)) return setError(`El RUC debe tener 11 dígitos (tiene ${edit.ruc.length}).`);
    if (!edit.razon.trim()) return setError("Escribe la razón social del proveedor.");
    const datos = { ruc: edit.ruc, razon_social: edit.razon.trim(), dias_entrega: Number(edit.dias) || 2 };
    const sb = supabaseNavegador();
    const { error: e2 } = edit.id ? await sb.from("proveedores").update(datos).eq("id", edit.id) : await sb.from("proveedores").insert(datos);
    if (e2) return setError(mensajeError(e2));
    avisar(edit.id ? "Proveedor actualizado." : `Proveedor «${datos.razon_social}» registrado.`);
    setEdit({ id: null, ruc: "", razon: "", dias: "2" });
    setError(null);
    q.recargar();
    onCambio();
  }

  async function cambiarEstado(p: Proveedor) {
    if (p.activo && !(await confirmar({ titulo: `¿Desactivar a ${p.razon_social}?`, texto: "Dejará de aparecer en ingresos y en el catálogo. Su historial se conserva.", boton: "Desactivar", peligro: true }))) return;
    const { error: e } = await supabaseNavegador().from("proveedores").update({ activo: !p.activo }).eq("id", p.id);
    if (e) return avisar(mensajeError(e), "error");
    avisar(p.activo ? `${p.razon_social} desactivado.` : `${p.razon_social} activado.`);
    q.recargar();
    onCambio();
  }

  return (
    <div className={`grid gap-4 ${esAdmin ? "lg:grid-cols-[minmax(0,360px)_1fr]" : ""}`}>
      {esAdmin && (
        <form onSubmit={guardar} className="panel h-fit p-4 sm:p-5" noValidate>
          <h2 className="text-base font-bold">{edit.id ? "Editar proveedor" : "Nuevo proveedor"}</h2>
          <label className="etiqueta mt-4" htmlFor="pv-ruc">
            RUC
          </label>
          <input id="pv-ruc" className="campo font-mono" inputMode="numeric" value={edit.ruc} onChange={(e) => setEdit({ ...edit, ruc: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
          <label className="etiqueta mt-4" htmlFor="pv-razon">
            Razón social
          </label>
          <input id="pv-razon" className="campo" value={edit.razon} onChange={(e) => setEdit({ ...edit, razon: e.target.value })} />
          <label className="etiqueta mt-4" htmlFor="pv-dias">
            Días de entrega
          </label>
          <input id="pv-dias" className="campo" inputMode="numeric" value={edit.dias} onChange={(e) => setEdit({ ...edit, dias: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          <p className="ayuda">Tiempo estimado de atención de un pedido para sugerir el stock mínimo.</p>
          <div className="mt-3">
            <MensajeError>{error}</MensajeError>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-principal">{edit.id ? "Guardar cambios" : "Registrar proveedor"}</button>
            {edit.id && (
              <button type="button" className="btn-secundario" onClick={() => setEdit({ id: null, ruc: "", razon: "", dias: "2" })}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
      <section className="panel min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-borde p-4">
          <h2 className="text-base font-bold">Proveedores ({filtrados.length})</h2>
          <input
            className="campo sm:w-64"
            placeholder="Buscar por razón social o RUC…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(0);
            }}
          />
        </div>
        {q.datos === undefined ? (
          <Cargando />
        ) : filtrados.length === 0 ? (
          <Vacio>No hay proveedores que coincidan.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[600px]">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th className="text-right">Días de entrega</th>
                  <th className="text-right">Productos</th>
                  <th>Estado</th>
                  {esAdmin && <th className="text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold">{p.razon_social}</span>
                      <span className="block font-mono text-xs text-suave">RUC {p.ruc}</span>
                    </td>
                    <td className="text-right">{p.dias_entrega}</td>
                    <td className="text-right">{usados(p.id)}</td>
                    <td>{p.activo ? <Etiqueta tono="ok">Activo</Etiqueta> : <Etiqueta tono="neutro">Desactivado</Etiqueta>}</td>
                    {esAdmin && (
                      <td>
                        <div className="flex justify-end gap-2">
                          {p.activo && (
                            <button className="btn-secundario min-h-9 px-3" onClick={() => setEdit({ id: p.id, ruc: p.ruc, razon: p.razon_social, dias: String(p.dias_entrega) })}>
                              Editar
                            </button>
                          )}
                          <button className={`${p.activo ? "btn-peligro" : "btn-secundario"} min-h-9 px-3`} onClick={() => cambiarEstado(p)}>
                            {p.activo ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
            <span>
              Mostrando {pag * POR_PAGINA + 1}–{Math.min((pag + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length} proveedores
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
        )}
      </section>
    </div>
  );
}

/* ---------------- RF-10: categorías y su fusión ---------------- */

export function Categorias({ esAdmin, productos, onCambio }: { esAdmin: boolean; productos: Producto[]; onCambio: () => void }) {
  const { avisar, confirmar } = useAvisos();
  const q = useDatos<Categoria[]>("categorias-activas", () => supabaseNavegador().from("categorias").select("id, nombre, activa").eq("activa", true).order("nombre"));
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [nuevaCat, setNuevaCat] = useState("");
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [mostrarFusion, setMostrarFusion] = useState(false);
  const [conservar, setConservar] = useState("");
  const [absorber, setAbsorber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cats = q.datos ?? [];
  const filtradas = useMemo(() => cats.filter((c) => !busqueda.trim() || coincide(c.nombre, busqueda)), [cats, busqueda]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);

  const cuantos = (id: string) => productos.filter((p) => p.categoria_id === id).length;
  const nombre = (id: string) => cats.find((c) => c.id === id)?.nombre ?? "";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const n = nuevaCat.trim();
    if (!n) return setErrorCrear("Escribe el nombre de la categoría.");
    setErrorCrear(null);
    const { error: err } = await supabaseNavegador().from("categorias").insert({ nombre: n });
    if (err) return setErrorCrear(err.code === "23505" ? `La categoría «${n}» ya existe.` : mensajeError(err));
    avisar(`Categoría «${n}» creada.`);
    setNuevaCat("");
    q.recargar();
    onCambio();
  }

  async function fusionar() {
    if (!conservar || !absorber) return setError("Elige la categoría que se conserva y la que se fusiona en ella.");
    if (conservar === absorber) return setError("Elige dos categorías distintas.");
    const ok = await confirmar({
      titulo: `¿Fusionar «${nombre(absorber)}» en «${nombre(conservar)}»?`,
      texto: `Sus ${cuantos(absorber)} productos pasan a «${nombre(conservar)}» y «${nombre(absorber)}» queda desactivada. No se puede deshacer desde aquí.`,
      boton: "Fusionar",
      peligro: true,
    });
    if (!ok) return;
    const { data, error: e } = await supabaseNavegador().rpc("fusionar_categorias", { p_conservar: conservar, p_absorber: absorber });
    if (e) return setError(mensajeError(e));
    avisar(`Categorías fusionadas: ${data} ${data === 1 ? "producto pasó" : "productos pasaron"} a «${nombre(conservar)}».`);
    setAbsorber("");
    setError(null);
    q.recargar();
    onCambio();
  }

  return (
    <div className={`grid gap-4 ${esAdmin ? "lg:grid-cols-[1fr_minmax(0,380px)]" : ""}`}>
      <section className="panel min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-borde p-4">
          <h2 className="text-base font-bold">Categorías ({filtradas.length})</h2>
          <input
            className="campo sm:w-64"
            placeholder="Buscar categoría…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(0);
            }}
          />
        </div>
        {q.datos === undefined ? (
          <Cargando />
        ) : filtradas.length === 0 ? (
          <Vacio>No hay categorías que coincidan.</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Categoría</th>
                <th className="text-right">Productos</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA).map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.nombre}</td>
                  <td className="text-right">{cuantos(c.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filtradas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
            <span>
              Mostrando {pag * POR_PAGINA + 1}–{Math.min((pag + 1) * POR_PAGINA, filtradas.length)} de {filtradas.length} categorías
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
        )}
      </section>
      {esAdmin && (
        <div className="space-y-4">
          <form onSubmit={crear} className="panel h-fit p-4 sm:p-5" noValidate>
            <h2 className="text-base font-bold">Nueva categoría</h2>
            <label className="etiqueta mt-3" htmlFor="cat-nueva">
              Nombre de la categoría
            </label>
            <div className="flex gap-2">
              <input id="cat-nueva" className="campo" placeholder="Ej. Conservas" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} />
              <button className="btn-principal shrink-0">Crear</button>
            </div>
            {errorCrear && (
              <div className="mt-2">
                <MensajeError>{errorCrear}</MensajeError>
              </div>
            )}
          </form>

          <section className="panel h-fit p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Unificar categorías duplicadas</h2>
              <button type="button" className="enlace text-xs" onClick={() => setMostrarFusion((v) => !v)}>
                {mostrarFusion ? "Ocultar" : "Abrir herramienta"}
              </button>
            </div>
            <p className="mt-1 text-xs text-suave">Usa esta opción si se registraron dos nombres equivalentes (ej. «Bebida» y «Bebidas»).</p>
            {mostrarFusion && (
              <div className="mt-3 border-t border-borde pt-3">
                <label className="etiqueta" htmlFor="absorber">
                  Categoría duplicada (se desactiva)
                </label>
                <select id="absorber" className="campo" value={absorber} onChange={(e) => setAbsorber(e.target.value)}>
                  <option value="">Elige la duplicada</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({cuantos(c.id)})
                    </option>
                  ))}
                </select>
                <label className="etiqueta mt-3" htmlFor="conservar">
                  Categoría principal (se conserva)
                </label>
                <select id="conservar" className="campo" value={conservar} onChange={(e) => setConservar(e.target.value)}>
                  <option value="">Elige la que queda</option>
                  {cats
                    .filter((c) => c.id !== absorber)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({cuantos(c.id)})
                      </option>
                    ))}
                </select>
                <div className="mt-3">
                  <MensajeError>{error}</MensajeError>
                </div>
                <button className="btn-peligro mt-3" onClick={fusionar}>
                  Fusionar categorías
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
