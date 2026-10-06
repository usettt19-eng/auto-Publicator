import { Header } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import { AutomationsPanel, type RuleRow } from "./automations-panel";

export default async function AutomationsPage() {
  const { supabase, user, workspace } = await requireWorkspace();
  const [{ data: rules }, { data: ws }] = await Promise.all([
    supabase
      .from("keyword_rules")
      .select("id, keyword, comment_reply, dm_message, link_url, match_in, active, times_triggered")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase.from("workspaces").select("comment_reply_mode").eq("id", workspace.id).single(),
  ]);
  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Automatizaciones</h1>
        <AutomationsPanel rules={(rules ?? []) as RuleRow[]} mode={(ws?.comment_reply_mode ?? "approval") as "off" | "approval" | "auto"} />
      </main>
    </>
  );
}
