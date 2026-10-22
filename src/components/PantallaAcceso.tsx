import type { ReactNode } from "react";

/** Marco común del inicio de sesión y del cambio de contraseña (Figuras 1 a 5). */
export function PantallaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between bg-azul p-6 text-white sm:p-10">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-amarillo text-azul" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10" />
            </svg>
          </span>
          <span className="text-lg font-bold">Mass Stock</span>
        </div>
        <div className="my-8 max-w-md lg:my-0">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Control de stock y reposición</h1>
          <p className="mt-3 text-sm text-white/80">
            Registra la mercadería que llega, repone la percha a tiempo y mira qué falta antes de que el cliente lo note.
          </p>
          <ul className="mt-6 hidden space-y-3 text-sm text-white/90 sm:block">
            <li>· Ingresos con lote y fecha de vencimiento</li>
            <li>· Alertas cuando la percha baja de su mínimo</li>
            <li>· Seguimiento de cada reposición hasta cerrarla</li>
          </ul>
        </div>
        <p className="hidden text-xs text-white/60 lg:block">Tienda Mass · Óvalo Francisco Bolognesi, Chincha</p>
      </section>
      <section className="flex items-start justify-center px-4 py-8 lg:items-center">
        <div className="w-full max-w-sm">
          {children}
          <p className="mt-4 text-center text-xs text-suave">Uso exclusivo del personal de tienda.</p>
        </div>
      </section>
    </div>
  );
}
