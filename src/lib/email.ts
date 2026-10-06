import "server-only";
import { Resend } from "resend";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Avisa de que hay un reel listo para revisar. Sin RESEND_API_KEY solo lo registra en el log. */
export async function sendReelReadyEmail(opts: {
  to: string;
  brandName: string;
  reelTitle: string;
  caption: string;
  thumbnailUrl: string | null;
  reviewUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(`[email] RESEND_API_KEY/EMAIL_FROM no configurados; enlace de revisión para ${opts.to}: ${opts.reviewUrl}`);
    return;
  }

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1c1917">
    <h2 style="margin-bottom:4px">Tu reel está listo para revisar</h2>
    <p style="color:#78716c;margin-top:0">${escapeHtml(opts.brandName)}</p>
    ${opts.thumbnailUrl ? `<a href="${opts.reviewUrl}"><img src="${opts.thumbnailUrl}" alt="" style="width:240px;border-radius:12px"></a>` : ""}
    <h3>${escapeHtml(opts.reelTitle)}</h3>
    <p style="white-space:pre-line;font-size:14px">${escapeHtml(opts.caption.slice(0, 500))}</p>
    <p><a href="${opts.reviewUrl}" style="display:inline-block;background:#db2777;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ver, aprobar o pedir cambios</a></p>
    <p style="font-size:12px;color:#78716c">Nada se publica sin tu aprobación. El enlace caduca en 14 días.</p>
  </div>`;

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: opts.to,
    subject: `Nuevo reel para aprobar: ${opts.reelTitle}`,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
