"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AvisoSinConexion, useConexion } from "@/components/Conexion";
import { useFicha } from "@/components/FichaProducto";
import { BarraPercha, Cargando, Encabezado, Etiqueta, EtiquetaStock, MensajeError, Vacio } from "@/components/ui";
import { supabaseNavegador } from "@/lib/supabase/client";
import { coincide, diasHasta, fecha, mensajeError } from "@/lib/formato";
import type { Categoria, FilaStock } from "@/lib/tipos";

type Columna = "nombre" | "categoria" | "percha" | "almacen" | "total" | "vencimiento" | "estado";
type FiltroEstado = "todos" | "ok" | "bajo_minimo" | "sin_stock" | "por_reponer";

const POR_PAGINA = 20; // RNF-08
const PESO_ESTADO = { sin_stock: 0, critico: 1, bajo_minimo: 2, ok: 3 } as const;

/** RF-34: stock en almacén, en percha y total de cada producto, actualizado en tiempo real. */
export function TablaStock() {
  const params = useSearchParams();
  const { abrir } = useFicha();
  const { version, marcarActualizado } = useConexion();

  const [filas, setFilas] = useState<FilaStock[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [estado, setEstado] = useState<FiltroEstado>((params.get("estado") as FiltroEstado) ?? "todos");
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>(
    params.get("orden") === "vencimiento" ? { col: "vencimiento", asc: true } : { col: "nombre", asc: true },
  );
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const supabase = supabaseNavegador();
    let vigente = true;
    Promise.all([
      supabase.from("v_stock").select("*").eq("activo", true),
      supabase.from("categorias").select("id, nombre, activa").eq("activa", true).order("nombre"),
    ]).then(([s, c]) => {
      if (!vigente) return;
      if (s.error) setError(mensajeError(s.error));
      else {
        setError(null);
        setFilas(s.data as FilaStock[]);
        marcarActualizado();
      }
      setCategorias((c.data as Categoria[]) ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [version, marcarActualizado]);

  const visibles = useMemo(() => {
    if (!filas) return [];
    const r = filas.filter((f) => {
      if (texto && !coincide(f.nombre, texto) && !f.codigo_barras.includes(texto.trim())) return false;
      if (categoria !== "todas" && f.categoria_id !== categoria) return false;
      switch (estado) {
        case "ok":
          return f.estado_stock === "ok";
        case "bajo_minimo":
          return f.estado_stock === "bajo_minimo" || f.estado_stock === "critico";
        case "sin_stock":
          return f.estado_stock === "sin_stock";
        case "por_reponer":
          return f.estado_percha !== "ok";
        default:
          return true;
      }
    });
    const valor = (f: FilaStock): string | number => {
      switch (orden.col) {
        case "nombre":
          return f.nombre.toLowerCase();
        case "categoria":
          return f.categoria;
        case "percha":
          return f.percha / f.minimo_percha;
        case "almacen":
          return f.almacen;
        case "total":
          return f.total;
        case "vencimiento":
          return f.proximo_vencimiento ?? "9999-12-31";
        case "estado":
          return PESO_ESTADO[f.estado_stock];
      }
    };
    return r.sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return orden.asc ? c : -c;
    });
  }, [filas, texto, categoria, estado, orden]);

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const pagVisibles = visibles.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  const Th = ({ col, children, derecha }: { col: Columna; children: React.ReactNode; derecha?: boolean }) => (
    <th className={derecha ? "text-right" : ""} aria-sort={orden.col === col ? (orden.asc ? "ascending" : "descending") : "none"}>
      <button
        className="inline-flex items-center gap-1 hover:text-texto"
        onClick={() => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : true }))}
      >
        {children}
        <span aria-hidden className="text-[10px]">{orden.col === col ? (orden.asc ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <>
      <Encabezado
        ruta="Control › Stock en tiempo real"
        titulo="Stock en tiempo real"
        descripcion="Cuánto hay en percha y en almacén de cada producto. Haz clic en una fila para ver su ficha."
      />
      <AvisoSinConexion />

      <div className="panel">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
          <div className="min-w-48 flex-1">
            <label className="etiqueta" htmlFor="filtro">
              Filtrar esta tabla
            </label>
            <input
              id="filtro"
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
            <label className="etiqueta" htmlFor="cat">
              Categoría
            </label>
            <select
              id="cat"
              className="campo"
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setPagina(0);
              }}
            >
              <option value="todas">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="est">
              Estado
            </label>
            <select
              id="est"
              className="campo"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as FiltroEstado);
                setPagina(0);
              }}
            >
              <option value="todos">Todos</option>
              <option value="ok">OK</option>
              <option value="bajo_minimo">Bajo mínimo</option>
              <option value="sin_stock">Sin stock</option>
              <option value="por_reponer">Percha por reponer</option>
            </select>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-borde px-4 py-2 text-xs text-suave">
          <b className="text-texto">Cómo leer la barra de percha:</b>
          <span>se llena a medida que la percha se acerca a su mínimo; el número dice cuántas unidades hay.</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-5 rounded-full bg-ok" /> Cubierta
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-5 rounded-full bg-amarillo-oscuro" /> Por reponer
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-5 rounded-full border border-peligro/50 bg-peligro-fondo" /> Vacía
          </span>
        </p>

        <div className="p-4 pb-0">
          <MensajeError>{error}</MensajeError>
        </div>

        {filas === null && !error ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio>{filas?.length ? "Ningún producto coincide con los filtros." : "Todavía no hay productos en el catálogo."}</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[860px]">
              <thead>
                <tr>
                  <Th col="nombre">Producto</Th>
                  <Th col="categoria">Categoría</Th>
                  <Th col="percha">En percha</Th>
                  <Th col="almacen" derecha>
                    En almacén
                  </Th>
                  <Th col="total" derecha>
                    Stock total
                  </Th>
                  <Th col="vencimiento">Próx. vencimiento</Th>
                  <Th col="estado">Estado del stock</Th>
                </tr>
              </thead>
              <tbody>
                {pagVisibles.map((f) => {
                  const dias = f.proximo_vencimiento ? diasHasta(f.proximo_vencimiento) : null;
                  return (
                    <tr
                      key={f.producto_id}
                      className="cursor-pointer hover:bg-azul-claro/40"
                      tabIndex={0}
                      onClick={() => abrir(f.producto_id)}
                      onKeyDown={(e) => e.key === "Enter" && abrir(f.producto_id)}
                    >
                      <td>
                        <span className="font-semibold">{f.nombre}</span>
                        <span className="block font-mono text-xs text-suave">{f.codigo_barras}</span>
                      </td>
                      <td>{f.categoria}</td>
                      <td>
                        <BarraPercha percha={f.percha} minimo={f.minimo_percha} estado={f.estado_percha} />
                      </td>
                      <td className="text-right font-semibold">{f.almacen}</td>
                      <td className="text-right">
                        <b className="text-base">{f.total}</b>
                        <span className="block text-xs text-suave">mín. {f.stock_minimo}</span>
                      </td>
                      <td>{dias !== null && dias <= 7 ? <Etiqueta tono="aviso">Vence en {dias} {dias === 1 ? "día" : "días"}</Etiqueta> : fecha(f.proximo_vencimiento)}</td>
                      <td>
                        <EtiquetaStock estado={f.estado_stock} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde px-4 py-3 text-xs text-suave">
          <span>
            Mostrando {pagVisibles.length} de {visibles.length} productos. El estado del stock compara el total con el stock mínimo; la barra compara la
            percha con su mínimo de percha.
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
      </div>
    </>
  );
}
