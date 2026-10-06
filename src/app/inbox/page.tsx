import { AutoRefresh } from "@/components/auto-refresh";
import { Header } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import { CommentCard, type CommentRow } from "./comment-card";

const TABS = [
  { key: "pending", label: "Por aprobar" },
  { key: "comments", label: "Comentarios" },
  { key: "dms", label: "Mensajes" },
] as const;

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "pending";
  const { supabase, user, workspace } = await requireWorkspace();

  const commentsQuery = supabase
    .from("comments")
    .select("id, ig_username, text, reply_text, reply_status, category, error, dm_sent, created_at, reels(title)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const [{ data: comments }, { count: pendingCount }, { data: dms }] = await Promise.all([
    tab === "dms" ? Promise.resolve({ data: [] }) : tab === "pending" ? commentsQuery.in("reply_status", ["pending_approval", "failed"]) : commentsQuery,
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .in("reply_status", ["pending_approval", "failed"]),
    tab === "dms"
      ? supabase
          .from("dms")
          .select("id, ig_user_id, ig_username, direction, text, created_at")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  const rows: CommentRow[] = (comments ?? []).map((c) => ({
    ...(c as Omit<CommentRow, "reel_title"> & { reels: unknown }),
    reel_title: ((c as { reels: unknown }).reels as { title: string | null } | null)?.title ?? null,
  }));

  return (
    <>
      <Header email={user.email} />
      <AutoRefresh active intervalMs={15000} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Bandeja de entrada</h1>
        <nav className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/inbox?tab=${t.key}`}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.key === tab ? "border-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
            >
              {t.label}
              {t.key === "pending" && pendingCount ? <span className="ml-1 text-accent">({pendingCount})</span> : null}
            </a>
          ))}
        </nav>

        {tab === "dms" ? (
          (dms ?? []).length === 0 ? (
            <p className="text-sm text-muted">Aún no hay mensajes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(dms ?? []).map((m) => (
                <li
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${m.direction === "outbound" ? "self-end bg-accent text-white" : "self-start border border-border bg-card"}`}
                >
                  <p className={`text-xs ${m.direction === "outbound" ? "text-white/80" : "text-muted"}`}>
                    {m.direction === "outbound" ? "Tú" : m.ig_username ? `@${m.ig_username}` : `Usuario ${m.ig_user_id.slice(-4)}`} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-line">{m.text}</p>
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{tab === "pending" ? "No hay respuestas pendientes. 🎉" : "Aún no hay comentarios."}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((c) => (
              <CommentCard key={c.id} comment={c} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
