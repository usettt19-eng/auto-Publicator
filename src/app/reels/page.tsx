import { AutoRefresh } from "@/components/auto-refresh";
import { ReelReview, type ReviewableReel } from "@/components/reel-review";
import { Header } from "@/components/ui";
import { IN_PROGRESS, type ReelStatus } from "@/lib/reels/state";
import { requireWorkspace } from "@/lib/workspace";
import { reviewFromDashboard } from "./actions";

const TABS: { key: string; label: string; statuses: ReelStatus[] }[] = [
  { key: "review", label: "Para aprobar", statuses: ["ready"] },
  { key: "production", label: "En producción", statuses: IN_PROGRESS },
  { key: "scheduled", label: "Programados", statuses: ["approved", "publishing"] },
  { key: "published", label: "Publicados", statuses: ["published"] },
  { key: "archived", label: "Rechazados y fallidos", statuses: ["rejected", "failed"] },
];

export default async function ReelsPage({ searchParams }: PageProps<"/reels">) {
  const { tab: tabParam } = await searchParams;
  const { supabase, user, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("reels")
    .select("id, status, title, caption, video_url, thumbnail_url, scheduled_at, error, updated_at")
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false })
    .limit(300);
  const reels = (data ?? []) as (ReviewableReel & { updated_at: string })[];

  const counts = Object.fromEntries(TABS.map((t) => [t.key, reels.filter((r) => t.statuses.includes(r.status)).length]));
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];
  const visible = reels
    .filter((r) => tab.statuses.includes(r.status))
    .sort((a, b) =>
      tab.key === "scheduled" ? (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") : b.updated_at.localeCompare(a.updated_at),
    );

  return (
    <>
      <Header email={user.email} />
      <AutoRefresh active={counts.production > 0} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Reels</h1>
          <a href="/ideas" className="text-sm text-accent hover:underline">
            + Crear reels desde ideas
          </a>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/reels?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                t.key === tab.key ? "border-accent font-medium" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label} <span className="text-muted">({counts[t.key]})</span>
            </a>
          ))}
        </nav>
        {visible.length === 0 ? (
          <p className="text-sm text-muted">No hay reels aquí.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((reel) => (
              <ReelReview key={reel.id} reel={reel} mode="dashboard" action={reviewFromDashboard.bind(null, reel.id)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
