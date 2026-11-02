/** Se muestra al instante al cambiar de pantalla, mientras el servidor responde (sensación de rapidez). */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando pantalla" className="animate-pulse">
      <div className="h-3 w-32 rounded bg-borde" />
      <div className="mt-2 h-7 w-64 rounded bg-borde" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-borde/70" />
      <div className="panel mt-5 h-72" />
    </div>
  );
}
