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

export function Header({ email }: { email?: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <a href="/dashboard" className="font-semibold">
          Auto-Publicator
        </a>
        {email && (
          <div className="flex items-center gap-4 text-sm text-muted">
            <a href="/reels" className="hover:text-foreground">
              Reels
            </a>
            <a href="/ideas" className="hover:text-foreground">
              Ideas
            </a>
            <a href="/brand" className="hover:text-foreground">
              Brand Kit
            </a>
            <a href="/settings" className="hover:text-foreground">
              Ajustes
            </a>
            <span className="hidden sm:inline">{email}</span>
            <form action="/auth/signout" method="post">
              <button className="hover:text-foreground">Salir</button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
