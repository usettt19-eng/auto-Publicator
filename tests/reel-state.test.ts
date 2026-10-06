import { describe, expect, it } from "vitest";
import { canPerform, isPublishable, nextStatus } from "@/lib/reels/state";

describe("máquina de estados de revisión", () => {
  it("solo se aprueba un reel listo", () => {
    expect(nextStatus("approve", "ready")).toBe("approved");
    for (const s of ["queued", "rendering", "rejected", "published", "failed"] as const) {
      expect(canPerform("approve", s)).toBe(false);
    }
  });

  it("pedir cambios vuelve a producción y rechazar es terminal", () => {
    expect(nextStatus("request_changes", "approved")).toBe("changes_requested");
    expect(nextStatus("reject", "ready")).toBe("rejected");
    expect(() => nextStatus("approve", "rejected")).toThrow();
  });

  it("editar el caption no cambia el estado", () => {
    expect(nextStatus("edit_caption", "approved")).toBe("approved");
    expect(() => nextStatus("edit_caption", "published")).toThrow();
  });

  it("reintentar solo desde fallido", () => {
    expect(nextStatus("retry", "failed")).toBe("queued");
    expect(canPerform("retry", "ready")).toBe(false);
  });
});

describe("isPublishable", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("exige aprobación y fecha alcanzada", () => {
    expect(isPublishable({ status: "approved", scheduled_at: "2026-10-10T11:59:00Z" }, now)).toBe(true);
    expect(isPublishable({ status: "approved", scheduled_at: "2026-10-10T12:01:00Z" }, now)).toBe(false);
    expect(isPublishable({ status: "ready", scheduled_at: "2026-10-10T11:00:00Z" }, now)).toBe(false);
    expect(isPublishable({ status: "approved", scheduled_at: null }, now)).toBe(false);
  });
});
