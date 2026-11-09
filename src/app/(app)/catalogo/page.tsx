"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/Avisos";
import { CampoCodigo } from "@/components/CampoCodigo";
import { useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { usePerfil } from "@/components/Shell";
import { Cargando, Encabezado, Etiqueta, MensajeError, Pestanas, Vacio } from "@/components/ui";
import { Categorias, NuevoProveedor, Proveedores } from "./Extras";
import { supabaseNavegador } from "@/lib/supabase/client";
import { coincide, eanValido, mensajeError } from "@/lib/formato";
import { UNIDADES, type Categoria, type Producto, type Proveedor } from "@/lib/tipos";

type Form = {
  id: string | null;
  nombre: string;
  categoria_id: string;
  proveedor_id: string;
  codigo_barras: string;
  unidad: string;
  stock_minimo: string;
  minimo_percha: string;
  controla_vencimiento: boolean;
};

const VACIO: Form = {
  id: null,
  nombre: "",
  categoria_id: "",
  proveedor_id: "",
  codigo_barras: "",
  unidad: "unidad",
  stock_minimo: "",
  minimo_percha: "",
  controla_vencimiento: true,
};

/** RF-06, RF-08, RF-09: catálogo de productos. El administrador registra y edita; el supervisor solo consulta. */
export default function Catalogo() {
  const perfil = usePerfil();
  const esAdmin = perfil.rol === "administrador";
  const { version } = useConexion();

  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [form, setForm] = useState<Form>(VACIO);
  const [pestana, setPestana] = useState<"productos" | "categorias" | "proveedores">("productos");

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    const [p, c, v] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("categorias").select("id, nombre, activa").eq("activa", true).order("nombre"),
      supabase.from("proveedores").select("*").eq("activo", true).order("razon_social"),
    ]);
    setProductos((p.data as Producto[]) ?? []);
    setCategorias((c.data as Categoria[]) ?? []);
    setProveedores((v.data as Proveedor[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  return (
    <>
      <Encabezado
        ruta="Administración › Catálogo"
        titulo="Catálogo de productos"
        descripcion={esAdmin ? "Registra productos sin duplicados y con categoría y proveedor de una lista." : "Consulta los productos, categorías y proveedores registrados."}
      />
      <Pestanas
        valor={pestana}
        onCambiar={setPestana}
        opciones={[
          { valor: "productos", etiqueta: "Productos", cantidad: productos?.filter((p) => p.activo).length },
          { valor: "categorias", etiqueta: "Categorías", cantidad: categorias.length },
          { valor: "proveedores", etiqueta: "Proveedores", cantidad: proveedores.length },
        ]}
      />
      {pestana === "categorias" && <Categorias esAdmin={esAdmin} productos={productos ?? []} onCambio={cargar} />}
      {pestana === "proveedores" && <Proveedores esAdmin={esAdmin} productos={productos ?? []} onCambio={cargar} />}
      <div className={`grid gap-4 ${esAdmin ? "lg:grid-cols-[minmax(0,420px)_1fr]" : ""} ${pestana === "productos" ? "" : "hidden"}`}>
        {esAdmin && (
          <FormularioProducto
            form={form}
            setForm={setForm}
            categorias={categorias}
            proveedores={proveedores}
            onGuardado={cargar}
            onCategoriaCreada={(c) => setCategorias((cs) => [...cs, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
            onProveedorCreado={(p) => setProveedores((ps) => [...ps, p].sort((a, b) => a.razon_social.localeCompare(b.razon_social)))}
          />
        )}
        <ListaProductos
          productos={productos}
          categorias={categorias}
          esAdmin={esAdmin}
          onEditar={(p) => {
            setForm({
              id: p.id,
              nombre: p.nombre,
              categoria_id: p.categoria_id,
              proveedor_id: p.proveedor_id,
              codigo_barras: p.codigo_barras,
              unidad: p.unidad,
              stock_minimo: String(p.stock_minimo),
              minimo_percha: String(p.minimo_percha),
              controla_vencimiento: p.controla_vencimiento,
            });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onCambio={cargar}
        />
      </div>
    </>
  );
}

function FormularioProducto({
  form,
  setForm,
  categorias,
  proveedores,
  onGuardado,
  onCategoriaCreada,
  onProveedorCreado,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  categorias: Categoria[];
  proveedores: Proveedor[];
  onGuardado: () => void;
  onCategoriaCreada: (c: Categoria) => void;
  onProveedorCreado: (p: Proveedor) => void;
}) {
  const { avisar } = useAvisos();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevaCat, setNuevaCat] = useState<string | null>(null);
  const [parecidas, setParecidas] = useState<Categoria[]>([]);
  // RF-07: productos con nombre parecido; hay que confirmar antes de registrar.
  const [similares, setSimilares] = useState<{ id: string; nombre: string; codigo_barras: string }[]>([]);
  const [nuevoProv, setNuevoProv] = useState(false);
  // RN-06: stock mínimo sugerido con las ventas reales (solo al editar un producto que ya vende).
  const [sugerencia, setSugerencia] = useState<{ sugerido: number | null; venta_diaria: number; dias_entrega: number; dias_seguridad: number; dias_calculo: number } | null>(null);
  useEffect(() => {
    setSimilares([]);
    if (!form.id) return setSugerencia(null);
    supabaseNavegador()
      .rpc("minimo_sugerido", { p_producto: form.id })
      .then(({ data }: { data: unknown }) => setSugerencia(((data as (typeof sugerencia)[]) ?? [])[0] ?? null));
  }, [form.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function generarCodigo() {
    const { data, error: e } = await supabaseNavegador().rpc("generar_codigo_interno");
    if (e) return setError(mensajeError(e));
    set("codigo_barras", data as string);
    setError(null);
  }

  /** RF-09: antes de crear una categoría se buscan parecidas («bebibles» → «Bebidas»). */
  async function crearCategoria(forzar = false) {
    const nombre = (nuevaCat ?? "").trim();
    if (!nombre) return;
    const supabase = supabaseNavegador();
    if (!forzar) {
      const { data } = await supabase.rpc("categorias_parecidas", { p_nombre: nombre });
      if (data && data.length) {
        setParecidas(data as Categoria[]);
        return;
      }
    }
    const { data, error: e } = await supabase.from("categorias").insert({ nombre }).select("id, nombre, activa").single();
    if (e) return setError(e.code === "23505" ? `La categoría «${nombre}» ya existe; elígela de la lista.` : mensajeError(e));
    onCategoriaCreada(data as Categoria);
    set("categoria_id", (data as Categoria).id);
    setNuevaCat(null);
    setParecidas([]);
    avisar(`Categoría «${nombre}» creada.`);
  }

  function validar(): string | null {
    if (!form.nombre.trim()) return "Escribe el nombre del producto, por ejemplo «Arroz Costeño 5kg».";
    if (!form.categoria_id) return "Elige la categoría de la lista.";
    if (!form.proveedor_id) return "Elige el proveedor de la lista.";
    if (!form.codigo_barras) return "El código de barras es obligatorio: escanéalo del empaque o genera uno interno si no trae.";
    if (!eanValido(form.codigo_barras))
      return `El código ${form.codigo_barras} no es un EAN-13 ni EAN-8 válido. Revisa que esté completo; si el producto no trae código, genera uno interno.`;
    if (!(Number(form.stock_minimo) > 0)) return "El stock mínimo debe ser un número mayor que 0.";
    if (!(Number(form.minimo_percha) > 0)) return "El mínimo de percha debe ser un número mayor que 0.";
    return null;
  }

  async function guardar(e: React.FormEvent, confirmado = false) {
    e.preventDefault();
    const v = validar();
    if (v) return setError(v);
    setGuardando(true);
    setError(null);
    if (!confirmado) {
      const { data: par } = await supabaseNavegador().rpc("productos_parecidos", { p_nombre: form.nombre, p_excluir: form.id });
      const lista = (par as typeof similares) ?? [];
      if (lista.length) {
        setSimilares(lista);
        setGuardando(false);
        return;
      }
    }
    setSimilares([]);
    const datos = {
      nombre: form.nombre.trim(),
      categoria_id: form.categoria_id,
      proveedor_id: form.proveedor_id,
      codigo_barras: form.codigo_barras,
      unidad: form.unidad,
      stock_minimo: Number(form.stock_minimo),
      minimo_percha: Number(form.minimo_percha),
      controla_vencimiento: form.controla_vencimiento,
    };
    const supabase = supabaseNavegador();
    const { error: err } = form.id ? await supabase.from("productos").update(datos).eq("id", form.id) : await supabase.from("productos").insert(datos);
    setGuardando(false);
    if (err) return setError(mensajeError(err));
    avisar(form.id ? `«${datos.nombre}» actualizado.` : `«${datos.nombre}» registrado en el catálogo.`);
    setForm(VACIO);
    onGuardado();
  }

  return (
    <form onSubmit={guardar} className="panel h-fit p-4 sm:p-5" noValidate>
      <h2 className="text-base font-bold">{form.id ? "Editar producto" : "Nuevo producto"}</h2>

      <label className="etiqueta mt-4" htmlFor="nombre">
        Nombre
      </label>
      <input id="nombre" className="campo" placeholder="Ej. Arroz Costeño 5kg" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="categoria">
            Categoría
          </label>
          <select id="categoria" className="campo" value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
            <option value="">Elige una categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {nuevaCat === null && (
            <button type="button" className="enlace mt-1 text-xs" onClick={() => setNuevaCat("")}>
              + Nueva categoría
            </button>
          )}
        </div>
        <div>
          <label className="etiqueta" htmlFor="proveedor">
            Proveedor
          </label>
          <select id="proveedor" className="campo" value={form.proveedor_id} onChange={(e) => set("proveedor_id", e.target.value)}>
            <option value="">Elige un proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razon_social}
              </option>
            ))}
          </select>
          {!nuevoProv && (
            <button type="button" className="enlace mt-1 text-xs" onClick={() => setNuevoProv(true)}>
              + Nuevo proveedor
            </button>
          )}
        </div>
      </div>
      {nuevoProv && (
        <NuevoProveedor
          onCancelar={() => setNuevoProv(false)}
          onCreado={(p) => {
            onProveedorCreado(p);
            set("proveedor_id", p.id);
            setNuevoProv(false);
            avisar(`Proveedor «${p.razon_social}» registrado.`);
          }}
        />
      )}

      {nuevaCat !== null && (
        <div className="mt-3 rounded-md border border-borde bg-fondo/60 p-3">
          <label className="etiqueta" htmlFor="nueva-cat">
            Nueva categoría
          </label>
          <div className="flex gap-2">
            <input
              id="nueva-cat"
              className="campo"
              value={nuevaCat}
              autoFocus
              onChange={(e) => {
                setNuevaCat(e.target.value);
                setParecidas([]);
              }}
            />
            <button type="button" className="btn-secundario" onClick={() => crearCategoria()}>
              Crear
            </button>
          </div>
          {parecidas.length > 0 && (
            <div className="mt-2 text-sm">
              <p className="text-aviso">
                Ya existe una categoría parecida. ¿Quieres usar <b>{parecidas[0].nombre}</b>?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {parecidas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="btn-principal min-h-9"
                    onClick={() => {
                      set("categoria_id", c.id);
                      setNuevaCat(null);
                      setParecidas([]);
                    }}
                  >
                    Usar «{c.nombre}»
                  </button>
                ))}
                <button type="button" className="btn-secundario min-h-9" onClick={() => crearCategoria(true)}>
                  Crear «{nuevaCat}» de todos modos
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            className="enlace mt-2 text-xs"
            onClick={() => {
              setNuevaCat(null);
              setParecidas([]);
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      <label className="etiqueta mt-4" htmlFor="codigo">
        Código de barras (obligatorio)
      </label>
      <CampoCodigo id="codigo" valor={form.codigo_barras} onCambiar={(v) => set("codigo_barras", v)} onLeido={() => {}} placeholder="Escanea o escribe los 13 dígitos" />
      <p className="ayuda">
        Se escanea o copia del empaque: lo asigna el fabricante con licencia de GS1 (en Perú empieza con 775); la tienda no lo inventa.{" "}
        <button type="button" className="enlace" onClick={generarCodigo}>
          ¿No trae código? Generar código interno (20–29)
        </button>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="unidad">
            Unidad
          </label>
          <select id="unidad" className="campo" value={form.unidad} onChange={(e) => set("unidad", e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-azul"
            checked={form.controla_vencimiento}
            onChange={(e) => set("controla_vencimiento", e.target.checked)}
          />
          Controla vencimiento
        </label>
        <div>
          <label className="etiqueta" htmlFor="minimo">
            Stock mínimo (total)
          </label>
          <input
            id="minimo"
            className="campo"
            inputMode="numeric"
            value={form.stock_minimo}
            onChange={(e) => set("stock_minimo", e.target.value.replace(/\D/g, ""))}
          />
          <p className="ayuda">Por debajo se pide al proveedor.</p>
          {sugerencia?.sugerido != null && Number(form.stock_minimo) !== sugerencia.sugerido && (
            <p className="mt-1 text-xs">
              Sugerido según ventas: <b>{sugerencia.sugerido}</b>{" "}
              <span className="text-suave">
                ({String(sugerencia.venta_diaria).replace(".", ",")}/día × {sugerencia.dias_entrega} días de entrega + {sugerencia.dias_seguridad} de seguridad)
              </span>{" "}
              <button type="button" className="enlace" onClick={() => set("stock_minimo", String(sugerencia.sugerido))}>
                Usar
              </button>
            </p>
          )}
        </div>
        <div>
          <label className="etiqueta" htmlFor="percha">
            Mínimo de percha
          </label>
          <input
            id="percha"
            className="campo"
            inputMode="numeric"
            value={form.minimo_percha}
            onChange={(e) => set("minimo_percha", e.target.value.replace(/\D/g, ""))}
          />
          <p className="ayuda">Por debajo se repone desde el almacén.</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-suave">El stock entra solo con un ingreso de proveedor; no se registra aquí.</p>
      {similares.length > 0 && (
        <div role="alert" className="mt-3 rounded-md border border-amarillo bg-aviso-fondo/60 p-3 text-sm">
          <p className="font-semibold text-aviso">Ya hay un producto con un nombre parecido:</p>
          <ul className="mt-1 list-inside list-disc">
            {similares.map((p) => (
              <li key={p.id}>
                {p.nombre} <span className="font-mono text-xs text-suave">{p.codigo_barras}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-suave">¿Es otro producto (otra presentación o marca)? Si es el mismo, no lo registres de nuevo.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-principal min-h-9" onClick={(e) => guardar(e as unknown as React.FormEvent, true)}>
              Sí, es otro producto
            </button>
            <button type="button" className="btn-secundario min-h-9" onClick={() => setSimilares([])}>
              Revisar
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn-principal" disabled={guardando}>
          {guardando ? "Guardando…" : form.id ? "Guardar cambios" : "Registrar producto"}
        </button>
        {form.id && (
          <button
            type="button"
            className="btn-secundario"
            onClick={() => {
              setForm(VACIO);
              setError(null);
            }}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function ListaProductos({
  productos,
  categorias,
  esAdmin,
  onEditar,
  onCambio,
}: {
  productos: Producto[] | null;
  categorias: Categoria[];
  esAdmin: boolean;
  onEditar: (p: Producto) => void;
  onCambio: () => void;
}) {
  const { abrir } = useFicha();
  const { avisar, confirmar } = useAvisos();
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [verInactivos, setVerInactivos] = useState(false);
  const [pagina, setPagina] = useState(0);
  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);

  const filtrados = useMemo(
    () =>
      (productos ?? []).filter(
        (p) =>
          (verInactivos || p.activo) &&
          (categoria === "todas" || p.categoria_id === categoria) &&
          (!texto || coincide(p.nombre, texto) || p.codigo_barras.includes(texto.trim())),
      ),
    [productos, texto, categoria, verInactivos],
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / 20));
  const pag = Math.min(pagina, paginas - 1);

  async function cambiarEstado(p: Producto) {
    if (p.activo) {
      const ok = await confirmar({
        titulo: `¿Desactivar ${p.nombre}?`,
        texto: "Dejará de aparecer en ingresos, búsquedas y en la tabla de stock. Su historial se conserva y puedes activarlo de nuevo.",
        boton: "Desactivar",
        peligro: true,
      });
      if (!ok) return;
    }
    const { error } = await supabaseNavegador().from("productos").update({ activo: !p.activo }).eq("id", p.id);
    if (error) return avisar(mensajeError(error), "error");
    avisar(p.activo ? `«${p.nombre}» desactivado.` : `«${p.nombre}» activado.`);
    onCambio();
  }

  return (
    <section className="panel min-w-0">
      <div className="border-b border-borde p-4">
        <h2 className="text-base font-bold">Productos ({filtrados.length})</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <label className="etiqueta" htmlFor="f-texto">
              Filtrar esta tabla
            </label>
            <input
              id="f-texto"
              className="campo"
              placeholder="Nombre o código de barras"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setPagina(0);
              }}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="f-cat">
              Categoría
            </label>
            <select id="f-cat" className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="todas">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-azul" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Ver desactivados
          </label>
        </div>
      </div>
      {productos === null ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <Vacio>{productos.length ? "Ningún producto coincide con los filtros." : "Todavía no hay productos. Registra el primero con el formulario."}</Vacio>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla min-w-[560px]">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Código de barras</th>
                <th>Estado</th>
                {esAdmin && <th className="text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(pag * 20, pag * 20 + 20).map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="enlace text-left" onClick={() => abrir(p.id)}>
                      {p.nombre}
                    </button>
                    <span className="block text-xs text-suave">{nombreCat.get(p.categoria_id) ?? "—"}</span>
                  </td>
                  <td>
                    <span className="font-mono">{p.codigo_barras}</span>
                    {p.codigo_interno && <span className="block text-xs text-suave">Código interno</span>}
                  </td>
                  <td>{p.activo ? <Etiqueta tono="ok">Activo</Etiqueta> : <Etiqueta tono="neutro">Desactivado</Etiqueta>}</td>
                  {esAdmin && (
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        {p.activo && (
                          <button className="btn-secundario min-h-9 px-3" onClick={() => onEditar(p)}>
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
      {paginas > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
          <button className="btn-secundario min-h-9" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
            Anterior
          </button>
          Página {pag + 1} de {paginas}
          <button className="btn-secundario min-h-9" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
