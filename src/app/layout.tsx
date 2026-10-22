import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mass Stock",
  description: "Control de stock, alertas y reposición · Tienda Mass Óvalo Francisco Bolognesi, Chincha",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b2fb5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
