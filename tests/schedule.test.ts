import { describe, expect, it } from "vitest";
import { localDayKey, spreadDates, suggestNextSlot, zonedTimeToUtc } from "@/lib/reels/schedule";

describe("zonedTimeToUtc", () => {
  it("convierte hora local a UTC con y sin horario de verano", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 18 }, "Europe/Madrid").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 12, day: 1, hour: 18 }, "Europe/Madrid").toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 10, hour: 9 }, "America/Mexico_City").toISOString()).toBe("2026-03-10T15:00:00.000Z");
  });
});

describe("suggestNextSlot", () => {
  const now = new Date("2026-10-06T10:00:00Z");

  it("propone mañana a la hora de publicación", () => {
    const slot = suggestNextSlot({ now, timeZone: "Europe/Madrid", postingHour: 18, taken: [] });
    expect(slot.toISOString()).toBe("2026-10-07T16:00:00.000Z");
  });

  it("salta los días ocupados (en hora local)", () => {
    const slot = suggestNextSlot({
      now,
      timeZone: "Europe/Madrid",
      postingHour: 18,
      taken: ["2026-10-07T08:00:00Z", "2026-10-08T21:30:00Z"],
    });
    expect(localDayKey(slot, "Europe/Madrid")).toBe("2026-10-09");
  });

  it("cruza fin de mes", () => {
    const slot = suggestNextSlot({ now: new Date("2026-10-31T10:00:00Z"), timeZone: "UTC", postingHour: 9, taken: [] });
    expect(slot.toISOString()).toBe("2026-11-01T09:00:00.000Z");
  });
});

describe("spreadDates", () => {
  it("reparte las fechas desde mañana", () => {
    const dates = spreadDates(4, 30, new Date("2026-10-06T10:00:00Z"), "UTC");
    expect(dates).toEqual(["2026-10-07", "2026-10-14", "2026-10-22", "2026-10-29"]);
  });
});
