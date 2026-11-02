"use client";

import { useEffect, useState } from "react";

/**
 * Hora actual que solo existe en el navegador.
 * En el servidor vale null: así el HTML del servidor y el del navegador coinciden
 * (cada uno formatea la hora con espacios distintos y React avisaba «Hydration failed»).
 */
export function useAhora(cadaMs = 30_000): Date | null {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}
