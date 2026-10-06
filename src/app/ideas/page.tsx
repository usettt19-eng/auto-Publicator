import { Header } from "@/components/ui";
import { getUsage } from "@/lib/reels/production";
import { requireWorkspace } from "@/lib/workspace";
import { IdeasBoard, type IdeaRow } from "./ideas-board";

// Generar ideas con Claude puede tardar más que el límite por defecto.
export const maxDuration = 300;

export default async function IdeasPage() {
  const { supabase, user, workspace } = await requireWorkspace();
  const [{ data: ideas }, { data: kit }, usage] = await Promise.all([
    supabase
      .from("reel_ideas")
      .select("id, title, hook, format, planned_for, status, content_pillars(name)")
      .eq("workspace_id", workspace.id)
      .neq("status", "discarded")
      .order("planned_for", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from("brand_kits").select("id").eq("workspace_id", workspace.id).maybeSingle(),
    getUsage(workspace.id),
  ]);

  const rows: IdeaRow[] = (ideas ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    hook: i.hook,
    format: i.format,
    planned_for: i.planned_for,
    status: i.status as IdeaRow["status"],
    pillar: (i.content_pillars as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Ideas</h1>
        <IdeasBoard ideas={rows} remaining={usage.remaining} hasBrandKit={Boolean(kit)} />
      </main>
    </>
  );
}
