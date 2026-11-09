import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Al volver a una pantalla visitada en los últimos 3 minutos, el navegador la muestra al instante
    // sin pedirla de nuevo al servidor. Los datos de cada pantalla se recargan igual (y en tiempo real);
    // los permisos los sigue aplicando la base de datos (RLS). Cerrar sesión borra esta memoria.
    staleTimes: { dynamic: 180, static: 300 },
  },
};

export default nextConfig;
