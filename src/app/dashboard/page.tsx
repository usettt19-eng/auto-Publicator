import type { BrandKit } from "@/lib/brand-kit/schema";
import { requireWorkspace } from "@/lib/workspace";
import { Card, Header } from "@/components/ui";
import { AuditPanel } from "./audit-panel";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { instagram, instagram_error } = await searchParams;
  const { supabase, user, workspace } = await requireWorkspace();

  const [{ data: account }, { data: audit }, { data: brandKit }] = await Promise.all([
    supabase
      .from("instagram_accounts")
      .select("username, profile_picture_url, followers_count, account_type")
      .eq("workspace_id", workspace.id)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("brand_audits")
      .select("id, status, error, website_url")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("brand_kits").select("kit, updated_at").eq("workspace_id", workspace.id).maybeSingle(),
  ]);
  const kit = brandKit?.kit as BrandKit | undefined;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Configura tu marca</h1>

        {instagram === "connected" && (
          <p className="rounded-lg bg-green-100 px-4 py-2 text-sm text-green-900">Instagram conectado.</p>
        )}
        {typeof instagram_error === "string" && (
          <p className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-900">{instagram_error}</p>
        )}

        <Card>
          <h2 className="mb-1 font-semibold">1. Conecta Instagram</h2>
          <p className="mb-4 text-sm text-muted">
            Necesitas una cuenta profesional (Business o Creator). Usaremos tus publicaciones para
            entender qué funciona y, más adelante, para publicar los reels que apruebes.
          </p>
          {account ? (
            <div className="flex items-center gap-3">
              {account.profile_picture_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.profile_picture_url} alt="" className="h-10 w-10 rounded-full" />
              )}
              <div className="text-sm">
                <p className="font-medium">@{account.username}</p>
                <p className="text-muted">
                  {account.followers_count ?? "?"} seguidores · {account.account_type ?? "cuenta"}
                </p>
              </div>
              <a href="/api/instagram/connect" className="ml-auto text-sm text-accent hover:underline">
                Reconectar
              </a>
            </div>
          ) : (
            <a
              href="/api/instagram/connect"
              className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Conectar Instagram
            </a>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">2. Audita tu marca</h2>
          <p className="mb-4 text-sm text-muted">
            Leemos tu sitio web (y tu Instagram si está conectado) para extraer voz, colores,
            productos y nicho.
          </p>
          <AuditPanel initialAudit={audit} defaultUrl={workspace.website_url ?? ""} />
        </Card>

        {kit && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">3. Tu Brand Kit</h2>
              <a href="/brand" className="text-sm text-accent hover:underline">
                Revisar y editar
              </a>
            </div>
            <p className="font-medium">{kit.brand_name}</p>
            <p className="mb-4 text-sm text-muted">{kit.one_liner}</p>
            <div className="mb-4 flex gap-2">
              {[...kit.visual_identity.primary_colors, ...kit.visual_identity.secondary_colors].map((c) => (
                <span key={c} title={c} className="h-8 w-8 rounded-full border border-border" style={{ background: c }} />
              ))}
            </div>
            <p className="text-sm">
              <span className="text-muted">Tono:</span> {kit.voice.tone.join(", ")}
            </p>
            <p className="text-sm">
              <span className="text-muted">Pilares:</span> {kit.content_pillars.map((p) => p.name).join(" · ")}
            </p>
          </Card>
        )}
      </main>
    </>
  );
}
