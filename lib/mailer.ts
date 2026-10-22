export type AdjuntoCorreo = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type MensajeCorreo = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: AdjuntoCorreo[];
  from?: string;
  replyTo?: string;
};

export type ResultadoCorreo = {
  messageId: string;
  proveedor: "resend" | "smtp";
  accepted?: string[];
};

const RESEND_URL = "https://api.resend.com/emails";
const FROM_DEFAULT = "Ambientes Cáliddos <onboarding@resend.dev>";

function direcciones(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.map((v) => String(v).trim()).filter(Boolean);
}

export function remitenteCorreo(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    FROM_DEFAULT
  );
}

export function correoConfigurado(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() ||
      (process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASS?.trim())
  );
}

function adjuntosResend(adjuntos: AdjuntoCorreo[] | undefined) {
  return (adjuntos ?? []).map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    ...(a.contentType ? { content_type: a.contentType } : {})
  }));
}

function errorResend(status: number, json: { message?: string; error?: string; name?: string }): Error {
  const detalle = json.message || json.error || json.name || "Error desconocido";
  if (status === 403 && /domain is not verified|not verified/i.test(detalle)) {
    return new Error(
      "Resend: el dominio del remitente no está verificado. Verifícalo en resend.com/domains o usa RESEND_FROM con un remitente autorizado."
    );
  }
  if (status === 401) return new Error("Resend: API key inválida o revocada.");
  if (status === 429) return new Error("Resend: límite de envíos alcanzado. Inténtalo más tarde.");
  return new Error(`Resend (${status}): ${detalle}`);
}

/**
 * Envía correo por Resend (HTTPS) si RESEND_API_KEY existe.
 * Si no, mantiene compatibilidad con SMTP/Nodemailer para local o Render pago.
 */
export async function enviarCorreo(mensaje: MensajeCorreo): Promise<ResultadoCorreo> {
  const to = direcciones(mensaje.to);
  if (to.length === 0) throw new Error("Correo destino vacío");

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const body: Record<string, unknown> = {
      from: mensaje.from?.trim() || remitenteCorreo(),
      to,
      subject: mensaje.subject,
      text: mensaje.text
    };
    const cc = direcciones(mensaje.cc);
    const bcc = direcciones(mensaje.bcc);
    if (cc.length) body.cc = cc;
    if (bcc.length) body.bcc = bcc;
    if (mensaje.html) body.html = mensaje.html;
    if (mensaje.replyTo) body.reply_to = mensaje.replyTo;
    if (mensaje.attachments?.length) body.attachments = adjuntosResend(mensaje.attachments);

    let res: Response;
    try {
      res = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      });
    } catch (e) {
      const msg = (e as Error).name === "TimeoutError" ? "tiempo de espera agotado" : (e as Error).message;
      throw new Error(`Resend: no se pudo conectar (${msg})`);
    }

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
      name?: string;
    };
    if (!res.ok) throw errorResend(res.status, json);
    if (!json.id) throw new Error("Resend: respuesta sin identificador de mensaje");

    return { messageId: json.id, proveedor: "resend", accepted: to };
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) {
    throw new Error(
      "Correo no configurado: define RESEND_API_KEY (Recomendado en Render Free) o SMTP_HOST/SMTP_USER/SMTP_PASS."
    );
  }

  const puerto = Number(process.env.SMTP_PORT || 587);
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465,
    auth: { user, pass }
  });
  const info = await transporter.sendMail({
    from: mensaje.from?.trim() || remitenteCorreo(),
    to,
    cc: direcciones(mensaje.cc),
    bcc: direcciones(mensaje.bcc),
    subject: mensaje.subject,
    text: mensaje.text,
    html: mensaje.html,
    replyTo: mensaje.replyTo,
    attachments: mensaje.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType
    }))
  });

  return {
    messageId: info.messageId,
    proveedor: "smtp",
    accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : undefined
  };
}
