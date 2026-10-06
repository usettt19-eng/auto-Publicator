export type KeywordRule = {
  id: string;
  keyword: string;
  comment_reply: string | null;
  dm_message: string;
  link_url: string | null;
  active: boolean;
  match_in: "comments" | "dms" | "both";
};

/** Mayúsculas y sin tildes, para que "grow", "GROW" o "Grów" coincidan. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().trim();
}

/** Palabra o frase completa: "GROW" coincide en "quiero GROW!" pero no en "GROWTH". */
export function containsKeyword(text: string, keyword: string): boolean {
  const kw = normalizeText(keyword);
  if (!kw) return false;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalizeText(text));
}

/** Primera regla activa que coincide; ante varias, gana la palabra clave más larga (más específica). */
export function matchKeywordRule<R extends KeywordRule>(text: string, rules: R[], channel: "comments" | "dms"): R | null {
  return (
    rules
      .filter((r) => r.active && (r.match_in === "both" || r.match_in === channel) && containsKeyword(text, r.keyword))
      .sort((a, b) => b.keyword.length - a.keyword.length)[0] ?? null
  );
}

/** Sustituye {usuario} y {link} en los mensajes de las reglas. */
export function renderTemplate(template: string, vars: { username?: string | null; link?: string | null }): string {
  return template
    .replace(/\{(usuario|username)\}/gi, vars.username ? `@${vars.username}` : "")
    .replace(/\{link\}/gi, vars.link ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Texto final del DM: si la plantilla no incluye {link}, el enlace se añade al final. */
export function buildDmText(rule: Pick<KeywordRule, "dm_message" | "link_url">, username: string | null): string {
  const text = renderTemplate(rule.dm_message, { username, link: rule.link_url });
  return rule.link_url && !/\{link\}/i.test(rule.dm_message) ? `${text}\n\n${rule.link_url}` : text;
}

export type CommentDecision =
  | { type: "ignore"; reason: "own_comment" | "reply_off" | "empty" }
  | { type: "rule"; rule: KeywordRule }
  | { type: "ai"; mode: "approval" | "auto" };

/** Qué hacer con un comentario nuevo. */
export function decideCommentAction(opts: {
  text: string;
  fromSelf: boolean;
  rules: KeywordRule[];
  mode: "off" | "approval" | "auto";
}): CommentDecision {
  // Nunca responder a nuestros propios comentarios: evita bucles con las respuestas automáticas.
  if (opts.fromSelf) return { type: "ignore", reason: "own_comment" };
  if (!opts.text.trim()) return { type: "ignore", reason: "empty" };
  const rule = matchKeywordRule(opts.text, opts.rules, "comments");
  if (rule) return { type: "rule", rule };
  if (opts.mode === "off") return { type: "ignore", reason: "reply_off" };
  return { type: "ai", mode: opts.mode };
}
