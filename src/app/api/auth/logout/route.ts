import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
