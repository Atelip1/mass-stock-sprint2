"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConexion } from "@/components/Conexion";
import { mensajeError } from "@/lib/formato";

/**
 * Datos en memoria por pantalla: al volver a una pantalla se muestran los últimos datos al instante
 * y se recargan en segundo plano (y otra vez cada vez que llega un cambio en tiempo real).
 * Se borra al cerrar o recargar la pestaña; nunca se guarda en el disco del equipo.
 */
const memoria = new Map<string, unknown>();

/** Lista vacía fija (no cambia en cada render). */
export const NADA: never[] = [];

export function borrarMemoria() {
  memoria.clear();
}

export function useDatos<T>(clave: string | null, cargar: () => PromiseLike<{ data: unknown; error: unknown }>, deps: unknown[] = []) {
  const { version, marcarActualizado } = useConexion();
  const [datos, setDatos] = useState<T | undefined>(() => (clave ? (memoria.get(clave) as T | undefined) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    if (memoria.has(clave)) setDatos(memoria.get(clave) as T);
    setCargando(true);
    Promise.resolve(cargarRef.current()).then(({ data, error: e }) => {
      if (!vigente) return;
      setCargando(false);
      if (e) {
        setError(mensajeError(e));
        return;
      }
      setError(null);
      memoria.set(clave, data);
      setDatos(data as T);
      marcarActualizado();
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, version, vuelta, marcarActualizado, ...deps]);

  /** Recarga ya (después de una acción del propio usuario, sin esperar el aviso en tiempo real). */
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, cargando, recargar };
}
