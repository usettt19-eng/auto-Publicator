import type { Metadata } from "next";
import { ReelReview, type ReviewableReel } from "@/components/reel-review";
import { Card, Header } from "@/components/ui";
import { verifyApprovalToken } from "@/lib/approval-token";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewFromToken } from "../../reels/actions";

export const metadata: Metadata = { title: "Revisar reel", robots: { index: false, follow: false } };

/** Revisión desde el email, sin iniciar sesión. El token firmado da acceso a un solo reel y revisión. */
export default async function ReviewByTokenPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const claims = verifyApprovalToken(token, env.approvalLinkSecret());

  const reel = claims
    ? ((
        await createAdminClient()
          .from("reels")
          .select("id, status, title, caption, video_url, thumbnail_url, scheduled_at, error, revision")
          .eq("id", claims.reelId)
          .maybeSingle()
      ).data as (ReviewableReel & { revision: number }) | null)
    : null;

  const stale = reel && claims && reel.revision !== claims.revision;
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-10">
        <h1 className="text-2xl font-semibold">Revisar reel</h1>
        {!claims || !reel ? (
          <Card>
            <p className="text-sm">Este enlace no es válido o ha caducado. Entra en tu panel para revisar tus reels.</p>
          </Card>
        ) : stale ? (
          <Card>
            <p className="text-sm">Este reel tiene una versión más reciente. Te llegará un nuevo email cuando esté lista.</p>
          </Card>
        ) : (
          <ReelReview reel={reel} mode="email" action={reviewFromToken.bind(null, token)} />
        )}
        <p className="text-xs text-muted">Nada se publica sin tu aprobación.</p>
      </main>
    </>
  );
}
