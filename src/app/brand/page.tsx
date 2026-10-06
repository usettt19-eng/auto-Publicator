import { Card, Header } from "@/components/ui";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { requireWorkspace } from "@/lib/workspace";
import { BrandKitEditor } from "./brand-kit-editor";

export default async function BrandPage() {
  const { supabase, user, workspace } = await requireWorkspace();
  const { data } = await supabase
    .from("brand_kits")
    .select("kit, edited_by_user, updated_at")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Brand Kit</h1>
          <p className="text-sm text-muted">
            Todo lo que la IA usará para escribir y diseñar tus reels. Revísalo y ajústalo a tu gusto.
          </p>
        </div>
        {data ? (
          <BrandKitEditor initialKit={data.kit as BrandKit} />
        ) : (
          <Card>
            <p className="text-sm">
              Aún no tienes Brand Kit.{" "}
              <a href="/dashboard" className="text-accent hover:underline">
                Audita tu marca
              </a>{" "}
              para generarlo.
            </p>
          </Card>
        )}
      </main>
    </>
  );
}
