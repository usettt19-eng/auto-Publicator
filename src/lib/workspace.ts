import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Workspace = {
  id: string;
  name: string;
  owner_id: string;
  website_url: string | null;
  timezone: string;
};

/** Devuelve el usuario autenticado y su workspace (lo crea en el primer acceso). */
export async function requireWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing, error } = await supabase
    .from("workspaces")
    .select("id, name, owner_id, website_url, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<Workspace>();
  if (error) throw error;
  if (existing) return { supabase, user, workspace: existing };

  const { data: created, error: insertError } = await supabase
    .from("workspaces")
    .insert({ name: user.email ?? "Mi marca", owner_id: user.id })
    .select("id, name, owner_id, website_url, timezone")
    .single<Workspace>();
  if (insertError) throw insertError;
  return { supabase, user, workspace: created };
}
