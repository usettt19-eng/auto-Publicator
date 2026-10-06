"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, inputClass } from "@/components/ui";

type AuditStatus = "pending" | "scraping" | "analyzing" | "completed" | "failed";
type Audit = { id: string; status: AuditStatus; error: string | null; website_url: string };

const STATUS_LABEL: Record<AuditStatus, string> = {
  pending: "En cola...",
  scraping: "Leyendo tu sitio web e Instagram...",
  analyzing: "Claude está analizando tu marca...",
  completed: "Auditoría completada",
  failed: "La auditoría falló",
};

const isRunning = (a: Audit | null) => a != null && ["pending", "scraping", "analyzing"].includes(a.status);

export function AuditPanel({ initialAudit, defaultUrl }: { initialAudit: Audit | null; defaultUrl: string }) {
  const router = useRouter();
  const [audit, setAudit] = useState<Audit | null>(initialAudit);
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const running = isRunning(audit);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/audits", { cache: "no-store" });
      if (!res.ok) return;
      const { audit: latest } = (await res.json()) as { audit: Audit | null };
      setAudit(latest);
      if (latest && !isRunning(latest)) router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [running, router]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo iniciar la auditoría");
      setAudit({ id: body.auditId, status: "pending", error: null, website_url: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={start} className="flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tumarca.com"
          required
          disabled={running}
        />
        <Button type="submit" disabled={running || submitting} className="shrink-0">
          {audit?.status === "completed" ? "Volver a auditar" : "Auditar mi marca"}
        </Button>
      </form>
      {audit && (
        <p className={`text-sm ${audit.status === "failed" ? "text-red-600" : "text-muted"}`}>
          {running && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
          {STATUS_LABEL[audit.status]}
          {audit.status === "failed" && audit.error ? `: ${audit.error}` : ""}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
