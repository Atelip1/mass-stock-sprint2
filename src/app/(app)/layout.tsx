import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { perfilActual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) redirect("/login");
  return <Shell perfil={perfil}>{children}</Shell>;
}
