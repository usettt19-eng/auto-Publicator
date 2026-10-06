import { Header } from "@/components/ui";
import { getAccessToken } from "@/lib/instagram/accounts";
import { getRecentMedia } from "@/lib/instagram/api";
import { bestPostingHours, type HourStat } from "@/lib/reels/best-hours";
import { requireWorkspace } from "@/lib/workspace";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { supabase, user, workspace } = await requireWorkspace();
  const [{ data: ws }, { data: account }] = await Promise.all([
    supabase.from("workspaces").select("timezone, posting_hour").eq("id", workspace.id).single(),
    supabase
      .from("instagram_accounts")
      .select("id")
      .eq("workspace_id", workspace.id)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const timezone = ws?.timezone ?? "UTC";

  let bestHours: HourStat[] | null = null;
  let bestHoursError: string | null = null;
  if (!account) {
    bestHoursError = "Conecta Instagram en el panel para ver tus mejores horas.";
  } else {
    try {
      const media = await getRecentMedia(await getAccessToken(account.id), 50);
      bestHours = bestPostingHours(media, timezone);
    } catch (err) {
      console.error("[settings] best hours", err);
      bestHoursError = "No se pudieron leer tus publicaciones de Instagram.";
    }
  }

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Ajustes</h1>
        <SettingsForm zones={Intl.supportedValuesOf("timeZone")} timezone={timezone} postingHour={ws?.posting_hour ?? 18} bestHours={bestHours} bestHoursError={bestHoursError} />
      </main>
    </>
  );
}
