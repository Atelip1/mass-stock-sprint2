import Image from "next/image";
import type { ReactNode } from "react";
import { Icono, LogoMassStock, type NombreIcono } from "./Iconos";

const VENTAJAS: { icono: NombreIcono; texto: string }[] = [
  { icono: "cubo", texto: "Control de inventario" },
  { icono: "campana", texto: "Alertas de reposición" },
  { icono: "indicadores", texto: "Reportes y seguimiento" },
];

/** Marco común del inicio de sesión y del cambio de contraseña (Figuras 1 a 5). */
export function PantallaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-[#eef2fb] lg:grid-cols-[1.15fr_1fr] dark:bg-fondo">
      {/* Panel de marca */}
      <section className="fondo-marca relative isolate flex flex-col overflow-hidden px-6 pt-8 pb-10 text-white sm:px-12 lg:min-h-dvh lg:py-12">
        <Destellos />
        <div className="flex items-center gap-3">
          <LogoMassStock tamano="md" />
          <span className="text-2xl font-extrabold tracking-tight">
            Mass <span className="text-amarillo">Stock</span>
          </span>
          <span className="ml-1 hidden border-l border-white/30 pl-4 text-sm leading-tight text-white/85 sm:block">
            Sistema de gestión
            <br />
            de inventario
          </span>
        </div>

        <div className="relative z-10 mt-10 max-w-xl lg:mt-16">
          <span className="inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 py-1.5 pr-4 pl-1.5 text-sm backdrop-blur">
            <Image src="/mass-logo.png" alt="Mass" width={44} height={44} className="size-11 rounded-xl shadow-md" priority />
            <span className="leading-tight">
              <span className="block text-[11px] text-white/70">Sistema para</span>
              <b className="text-base">tiendas Mass</b>
            </span>
          </span>
          <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold sm:text-5xl">
            Optimiza tu tienda, controla tu{" "}
            <span className="relative whitespace-nowrap text-amarillo">
              inventario
              <svg viewBox="0 0 220 14" className="absolute -bottom-2 left-0 h-3 w-full text-amarillo" preserveAspectRatio="none" aria-hidden>
                <path d="M3 10C60 3 150 2 217 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-md text-base text-white/85">
            Gestiona el stock, vencimientos y reposiciones de manera eficiente, segura y en tiempo real.
          </p>
          <ul className="mt-8 hidden grid-cols-3 gap-3 sm:grid">
            {VENTAJAS.map((v) => (
              <li key={v.texto} className="rounded-2xl border border-white/20 bg-white/[0.07] p-4 text-center backdrop-blur-sm transition hover:bg-white/[0.12]">
                <Icono nombre={v.icono} className="mx-auto size-8 text-amarillo" trazo={1.8} />
                <span className="mt-2 block text-sm leading-tight text-white/95">{v.texto}</span>
              </li>
            ))}
          </ul>
        </div>

        <Ilustracion />

        <p className="relative z-10 mt-auto hidden pt-10 text-xs text-white/60 lg:block">Tienda Mass · Óvalo Francisco Bolognesi, Chincha</p>
      </section>

      {/* Tarjeta de acceso */}
      <section className="relative flex items-start justify-center px-4 py-10 sm:px-8 lg:items-center">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 hidden size-96 rounded-full border-[18px] border-amarillo/80 lg:block" />
        <div className="relative w-full max-w-md animate-entrar">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-7 shadow-[0_30px_60px_-30px_rgb(11_47_181/0.35)] backdrop-blur-xl sm:p-9 dark:border-borde dark:bg-panel/95">
            <div className="mb-7 flex items-center justify-center gap-3">
              <LogoMassStock tamano="lg" />
              <span className="text-3xl font-extrabold tracking-tight">
                Mass <span className="text-amarillo-oscuro">Stock</span>
              </span>
            </div>
            {children}
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-white/60 px-4 py-3 text-center text-xs text-suave dark:bg-panel/60">
            <Icono nombre="escudo" className="size-5 shrink-0 text-azul" trazo={1.8} />
            Uso exclusivo del personal autorizado de tiendas
            <Image src="/mass-logo.png" alt="Mass" width={22} height={22} className="size-[22px] rounded-md" />
          </p>
        </div>
      </section>
    </div>
  );
}

/** Curvas amarillas de fondo, como en la guía visual. */
function Destellos() {
  return (
    <svg className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full lg:block" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden>
      <path d="M-40 760 C 160 690, 330 720, 520 840" fill="none" stroke="#ffd100" strokeOpacity="0.85" strokeWidth="6" />
      <path d="M-40 800 C 180 740, 360 770, 560 900" fill="none" stroke="#ffd100" strokeOpacity="0.35" strokeWidth="14" />
      <circle cx="760" cy="120" r="220" fill="#ffffff" fillOpacity="0.04" />
    </svg>
  );
}

/** Ilustración propia: cajas, lectora de códigos y lista de control. */
function Ilustracion() {
  return (
    <svg
      viewBox="0 0 360 240"
      className="pointer-events-none relative z-0 mx-auto mt-10 hidden w-full max-w-md drop-shadow-[0_20px_30px_rgb(0_0_0/0.35)] lg:block"
      aria-hidden
    >
      <defs>
        <linearGradient id="ms-caja" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9b97a" />
          <stop offset="1" stopColor="#c98f4e" />
        </linearGradient>
        <linearGradient id="ms-caja-lado" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b97d3f" />
          <stop offset="1" stopColor="#a86d33" />
        </linearGradient>
      </defs>
      <ellipse cx="190" cy="226" rx="160" ry="12" fill="#000" opacity="0.25" />
      {/* caja grande */}
      <path d="M150 120h120v100H150z" fill="url(#ms-caja)" />
      <path d="M270 120l30-18v100l-30 18z" fill="url(#ms-caja-lado)" />
      <path d="M150 120l30-18h120l-30 18z" fill="#f2cf98" />
      <path d="M202 120v26h16v-26" fill="#f5dcae" opacity="0.8" />
      <g transform="translate(168 160)" fill="none" stroke="#7a4a1c" strokeWidth="2.2" strokeLinejoin="round" opacity="0.75">
        <path d="M2 5l8-4 8 4-8 4-8-4zM2 5v9l8 4 8-4V5M10 9v9" />
      </g>
      <text x="191" y="176" fontSize="11" fontWeight="700" fill="#7a4a1c" opacity="0.8" fontFamily="Segoe UI, sans-serif">
        Mass Stock
      </text>
      <path d="M240 196h22v14h-22z" fill="#fff" />
      <path d="M243 198v10M246 198v10M248 198v10M251 198v10M254 198v10M256 198v10M259 198v10" stroke="#222" strokeWidth="1.2" />
      {/* caja pequeña */}
      <path d="M70 170h70v50H70z" fill="url(#ms-caja)" />
      <path d="M140 170l20-12v50l-20 12z" fill="url(#ms-caja-lado)" />
      <path d="M70 170l20-12h70l-20 12z" fill="#f2cf98" />
      {/* caja superior */}
      <path d="M176 66h84v54h-84z" fill="url(#ms-caja)" />
      <path d="M260 66l22-13v54l-22 13z" fill="url(#ms-caja-lado)" />
      <path d="M176 66l22-13h84l-22 13z" fill="#f2cf98" />
      {/* lectora */}
      <g transform="rotate(-18 110 110)">
        <rect x="70" y="70" width="86" height="40" rx="18" fill="#1f2a44" />
        <rect x="140" y="76" width="22" height="28" rx="8" fill="#0f1729" />
        <path d="M96 106l-10 58c-1 8 12 10 14 2l14-58z" fill="#1f2a44" />
        <rect x="104" y="114" width="7" height="22" rx="3" fill="#ffd100" transform="rotate(12 107 125)" />
        <rect x="80" y="78" width="40" height="6" rx="3" fill="#ffffff" opacity="0.12" />
      </g>
      {/* lista de control */}
      <g transform="rotate(6 320 150)">
        <rect x="282" y="96" width="74" height="104" rx="8" fill="#1b3fd1" />
        <rect x="288" y="104" width="62" height="90" rx="5" fill="#ffffff" />
        <rect x="306" y="90" width="26" height="12" rx="4" fill="#9aa6bd" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0 ${i * 26})`}>
            <rect x="294" y="114" width="12" height="12" rx="2.5" fill="none" stroke="#c9a400" strokeWidth="2" />
            <path d="M296 120l3 3 6-7" fill="none" stroke="#0b2fb5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="311" y="116" width="32" height="3" rx="1.5" fill="#c7d0e3" />
            <rect x="311" y="122" width="22" height="3" rx="1.5" fill="#dfe5f1" />
          </g>
        ))}
      </g>
    </svg>
  );
}
