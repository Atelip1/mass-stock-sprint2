import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { perfilDePantalla } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await perfilDePantalla();
  if (!perfil || !perfil.activo) redirect("/login");
  return <Shell perfil={perfil}>{children}</Shell>;
}
