import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildDmText,
  containsKeyword,
  decideCommentAction,
  matchKeywordRule,
  renderTemplate,
  type KeywordRule,
} from "@/lib/engagement/keywords";
import { parseInstagramWebhook, verifyMetaSignature } from "@/lib/engagement/webhook";

const rule = (keyword: string, extra: Partial<KeywordRule> = {}): KeywordRule => ({
  id: keyword,
  keyword,
  comment_reply: "¡Te lo mandamos por DM, {usuario}!",
  dm_message: "Aquí tienes tu guía: {link}",
  link_url: "https://marca.com/guia",
  active: true,
  match_in: "both",
  ...extra,
});

describe("palabras clave", () => {
  it("coincide sin importar mayúsculas, tildes ni puntuación", () => {
    expect(containsKeyword("quiero la guía GROW!!", "grow")).toBe(true);
    expect(containsKeyword("Grów 🙌", "GROW")).toBe(true);
    expect(containsKeyword("GUIA", "guía")).toBe(true);
  });

  it("solo palabras completas", () => {
    expect(containsKeyword("growth hacking", "GROW")).toBe(false);
    expect(containsKeyword("ingrow", "GROW")).toBe(false);
  });

  it("admite frases de varias palabras", () => {
    expect(containsKeyword("me interesa la  guia   gratis", "guía gratis")).toBe(true);
  });

  it("ignora reglas inactivas o de otro canal y prefiere la más específica", () => {
    const rules = [rule("GUIA"), rule("GUIA GRATIS"), rule("GROW", { active: false }), rule("PRECIO", { match_in: "dms" })];
    expect(matchKeywordRule("quiero la guia gratis", rules, "comments")?.keyword).toBe("GUIA GRATIS");
    expect(matchKeywordRule("GROW", rules, "comments")).toBeNull();
    expect(matchKeywordRule("precio?", rules, "comments")).toBeNull();
    expect(matchKeywordRule("precio?", rules, "dms")?.keyword).toBe("PRECIO");
  });
});

describe("plantillas", () => {
  it("sustituye {usuario} y {link}", () => {
    expect(renderTemplate("¡Hola {usuario}! Mira {link}", { username: "ana", link: "https://x" })).toBe("¡Hola @ana! Mira https://x");
    expect(renderTemplate("Gracias {usuario}", { username: null })).toBe("Gracias");
  });

  it("añade el enlace al DM si la plantilla no lo incluye", () => {
    expect(buildDmText({ dm_message: "Tu guía 👇", link_url: "https://x" }, null)).toBe("Tu guía 👇\n\nhttps://x");
    expect(buildDmText({ dm_message: "Aquí: {link}", link_url: "https://x" }, null)).toBe("Aquí: https://x");
  });
});

describe("decideCommentAction", () => {
  const rules = [rule("GROW")];
  it("nunca responde a la propia cuenta", () => {
    expect(decideCommentAction({ text: "GROW", fromSelf: true, rules, mode: "auto" })).toEqual({ type: "ignore", reason: "own_comment" });
  });
  it("las reglas se aplican aunque las respuestas IA estén apagadas", () => {
    expect(decideCommentAction({ text: "grow", fromSelf: false, rules, mode: "off" }).type).toBe("rule");
  });
  it("sin regla, depende del modo", () => {
    expect(decideCommentAction({ text: "¡Qué bueno!", fromSelf: false, rules, mode: "off" })).toEqual({ type: "ignore", reason: "reply_off" });
    expect(decideCommentAction({ text: "¡Qué bueno!", fromSelf: false, rules, mode: "approval" })).toEqual({ type: "ai", mode: "approval" });
  });
});

describe("webhooks de Meta", () => {
  it("verifica la firma X-Hub-Signature-256", () => {
    const body = JSON.stringify({ object: "instagram" });
    const sig = `sha256=${createHmac("sha256", "secreto").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig, "secreto")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "secreto")).toBe(false);
    expect(verifyMetaSignature(body, sig, "otro")).toBe(false);
    expect(verifyMetaSignature(body, null, "secreto")).toBe(false);
  });

  it("extrae comentarios y mensajes, y distingue los ecos", () => {
    const parsed = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400000",
          time: 1,
          changes: [
            {
              field: "comments",
              value: { from: { id: "999", username: "ana" }, media: { id: "m1", media_product_type: "REELS" }, id: "c1", text: "GROW" },
            },
            { field: "mentions", value: { media_id: "x" } },
          ],
          messaging: [
            { sender: { id: "999" }, recipient: { id: "17841400000" }, timestamp: 5, message: { mid: "mid1", text: "hola" } },
            { sender: { id: "17841400000" }, recipient: { id: "999" }, timestamp: 6, message: { mid: "mid2", text: "eco", is_echo: true } },
            { sender: { id: "999" }, recipient: { id: "17841400000" }, message: { mid: "mid3", is_deleted: true } },
          ],
        },
      ],
    });
    expect(parsed.comments).toEqual([
      { accountIgId: "17841400000", commentId: "c1", parentId: null, mediaId: "m1", fromId: "999", fromUsername: "ana", text: "GROW" },
    ]);
    expect(parsed.messages.map((m) => [m.messageId, m.accountIgId, m.senderId, m.isEcho])).toEqual([
      ["mid1", "17841400000", "999", false],
      ["mid2", "17841400000", "999", true],
    ]);
  });

  it("ignora payloads de otros objetos o mal formados", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [] })).toEqual({ comments: [], messages: [] });
    expect(parseInstagramWebhook(null)).toEqual({ comments: [], messages: [] });
  });
});
