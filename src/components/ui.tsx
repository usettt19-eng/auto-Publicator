import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-2xl border border-border bg-card p-6 ${className}`} {...props} />;
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const NAV = [
  { href: "/reels", label: "Reels" },
  { href: "/ideas", label: "Ideas" },
  { href: "/inbox", label: "Bandeja" },
  { href: "/automations", label: "Automatizaciones" },
  { href: "/analytics", label: "Analíticas" },
  { href: "/brand", label: "Brand Kit" },
  { href: "/settings", label: "Ajustes" },
  { href: "/billing", label: "Plan" },
];

export function Header({ email }: { email?: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <a href="/dashboard" className="font-semibold">
          Auto-Publicator
        </a>
        {email && (
          <>
            <nav className="order-last -mx-4 flex w-full gap-4 overflow-x-auto px-4 text-sm text-muted sm:order-none sm:mx-0 sm:w-auto sm:px-0">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} className="whitespace-nowrap hover:text-foreground">
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4 text-sm text-muted">
              <span className="hidden lg:inline">{email}</span>
              <form action="/auth/signout" method="post">
                <button className="hover:text-foreground">Salir</button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
