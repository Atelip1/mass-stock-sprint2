/** Formatos de Perú (RNF-17): fechas dd/mm/aaaa, hora de Lima. */
const ZONA = "America/Lima";

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  // Las fechas sin hora (aaaa-mm-dd) se muestran tal cual, sin desfase por zona horaria.
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return new Date(valor).toLocaleDateString("es-PE", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleTimeString("es-PE", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
}

/** Hoy en Lima como aaaa-mm-dd. */
export function hoyISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

/** Días desde hoy hasta una fecha aaaa-mm-dd (negativo si ya pasó). */
export function diasHasta(fechaISO: string): number {
  const a = Date.parse(hoyISO() + "T00:00:00Z");
  const b = Date.parse(fechaISO + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** Texto sin tildes ni mayúsculas, para buscar igual que la base de datos (RN-16). */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Coincide si todas las palabras buscadas aparecen en el texto («pizza mex»). */
export function coincide(texto: string, busqueda: string): boolean {
  const t = normalizar(texto);
  return normalizar(busqueda)
    .split(" ")
    .every((p) => t.includes(p));
}

/** Dígito verificador GS1 (RN-03). */
export function eanValido(codigo: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(codigo)) return false;
  const base = codigo.slice(0, -1);
  let suma = 0;
  for (let i = 0; i < base.length; i++) {
    const desdeDerecha = base.length - i;
    suma += Number(base[i]) * (desdeDerecha % 2 === 1 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10 === Number(codigo.at(-1));
}

/** Mensaje legible a partir de un error de Supabase. Las funciones de la base ya devuelven el texto en español. */
export function mensajeError(error: unknown): string {
  if (!error) return "Ocurrió un error.";
  const e = error as { message?: string; code?: string };
  const m = e.message ?? String(error);
  if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return "No hay conexión con el servidor. Revisa la señal e inténtalo de nuevo.";
  if (/row-level security|permission denied/i.test(m)) return "Tu rol no tiene permiso para esta acción.";
  if (e.code === "23505" && !/ya pertenece/.test(m)) return "Ya existe un registro con ese dato. Revisa que no esté repetido.";
  return m;
}
