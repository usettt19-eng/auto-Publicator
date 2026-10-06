import { Header } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-4 py-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Reels de Instagram que suenan a tu marca, en piloto automático.
        </h1>
        <p className="text-lg text-muted">
          Analizamos tu sitio web y tu Instagram, creamos reels con IA y los publicamos solo cuando
          tú los apruebas.
        </p>
        <a
          href="/login"
          className="rounded-lg bg-accent px-5 py-3 font-medium text-white hover:opacity-90"
        >
          Empezar
        </a>
      </main>
    </>
  );
}
