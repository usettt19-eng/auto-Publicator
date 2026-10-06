import { Card, Header } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-20">
        <Card>
          <h1 className="mb-4 text-xl font-semibold">Entrar</h1>
          {error && <p className="mb-3 text-sm text-red-600">El enlace no es válido o caducó.</p>}
          <LoginForm next={typeof next === "string" ? next : "/dashboard"} />
        </Card>
      </main>
    </>
  );
}
