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

export type ProveedorCorreo = "sendgrid" | "resend" | "smtp";

export type ResultadoCorreo = {
  messageId: string;
  proveedor: ProveedorCorreo;
  accepted?: string[];
};

export const MSG_CORREO_NO_CONFIGURADO =
  "Correo no configurado: define SENDGRID_API_KEY (SendGrid), RESEND_API_KEY (Resend) o SMTP_HOST/SMTP_USER/SMTP_PASS.";

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";
const RESEND_URL = "https://api.resend.com/emails";
const FROM_DEFAULT = "Ambientes Cáliddos <onboarding@resend.dev>";

function direcciones(valor: string | string[] | undefined): string[] {
  if (!valor) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.map((v) => String(v).trim()).filter(Boolean);
}

function remitenteBase(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    ""
  );
}

function remitenteResend(): string {
  return process.env.RESEND_FROM?.trim() || remitenteBase() || FROM_DEFAULT;
}

function remitenteSendGrid(): string {
  return process.env.SENDGRID_FROM?.trim() || remitenteBase();
}

export function proveedorCorreo(): ProveedorCorreo | null {
  const forzado = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  const sendgrid = Boolean(process.env.SENDGRID_API_KEY?.trim());
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const smtp = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
  );

  if (forzado === "sendgrid") return sendgrid ? "sendgrid" : null;
  if (forzado === "resend") return resend ? "resend" : null;
  if (forzado === "smtp") return smtp ? "smtp" : null;
  if (sendgrid) return "sendgrid";
  if (resend) return "resend";
  if (smtp) return "smtp";
  return null;
}

export function remitenteCorreo(proveedor: ProveedorCorreo = proveedorCorreo() ?? "resend"): string {
  if (proveedor === "sendgrid") return remitenteSendGrid();
  if (proveedor === "resend") return remitenteResend();
  return process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || remitenteBase() || FROM_DEFAULT;
}

export function correoConfigurado(): boolean {
  return proveedorCorreo() !== null;
}

function adjuntosResend(adjuntos: AdjuntoCorreo[] | undefined) {
  return (adjuntos ?? []).map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    ...(a.contentType ? { content_type: a.contentType } : {})
  }));
}

function adjuntosSendGrid(adjuntos: AdjuntoCorreo[] | undefined) {
  return (adjuntos ?? []).map((a) => ({
    content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
    filename: a.filename,
    type: a.contentType || "application/octet-stream",
    disposition: "attachment"
  }));
}

function parseRemitente(valor: string): { email: string; name?: string } {
  const texto = valor.trim();
  const m = texto.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  const name = m?.[1]?.trim().replace(/^"(.*)"$/, "$1") || undefined;
  const email = (m?.[2] ?? texto).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      `SendGrid: remitente inválido "${valor}". Define SENDGRID_FROM con el correo verificado en SendGrid.`
    );
  }
  return { email, ...(name ? { name } : {}) };
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

function errorSendGrid(status: number, detalle: string): Error {
  if (status === 401) return new Error("SendGrid: API key inválida o sin permiso Mail Send.");
  if (status === 403) {
    return new Error(
      "SendGrid: el remitente no está verificado. Verifícalo en SendGrid → Settings → Sender Authentication."
    );
  }
  if (status === 429) return new Error("SendGrid: límite de envíos alcanzado. Inténtalo más tarde.");
  return new Error(`SendGrid (${status}): ${detalle || "Error desconocido"}`);
}

function detalleSendGrid(texto: string): string {
  try {
    const json = JSON.parse(texto) as { errors?: { message?: string }[]; message?: string };
    return json.errors?.map((e) => e.message).filter(Boolean).join("; ") || json.message || texto;
  } catch {
    return texto;
  }
}

async function enviarConSendGrid(mensaje: MensajeCorreo, to: string[]): Promise<ResultadoCorreo> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) throw new Error("SendGrid: falta SENDGRID_API_KEY.");

  const remitenteTexto = mensaje.from?.trim() || remitenteSendGrid();
  if (!remitenteTexto) {
    throw new Error("SendGrid: define SENDGRID_FROM con el correo verificado en SendGrid.");
  }
  const remitente = parseRemitente(remitenteTexto);

  const cc = direcciones(mensaje.cc);
  const bcc = direcciones(mensaje.bcc);
  const personalizacion: Record<string, unknown> = { to: to.map((email) => ({ email })) };
  if (cc.length) personalizacion.cc = cc.map((email) => ({ email }));
  if (bcc.length) personalizacion.bcc = bcc.map((email) => ({ email }));

  const content = [{ type: "text/plain", value: mensaje.text }];
  if (mensaje.html) content.push({ type: "text/html", value: mensaje.html });

  const body: Record<string, unknown> = {
    personalizations: [personalizacion],
    from: remitente,
    subject: mensaje.subject,
    content
  };
  if (mensaje.replyTo) body.reply_to = parseRemitente(mensaje.replyTo);
  if (mensaje.attachments?.length) body.attachments = adjuntosSendGrid(mensaje.attachments);

  let res: Response;
  try {
    res = await fetch(SENDGRID_URL, {
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
    throw new Error(`SendGrid: no se pudo conectar (${msg})`);
  }

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw errorSendGrid(res.status, detalleSendGrid(texto));
  }

  return {
    messageId: res.headers.get("x-message-id") || `sendgrid-${Date.now()}`,
    proveedor: "sendgrid",
    accepted: to
  };
}

async function enviarConResend(mensaje: MensajeCorreo, to: string[]): Promise<ResultadoCorreo> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Resend: falta RESEND_API_KEY.");

  const body: Record<string, unknown> = {
    from: mensaje.from?.trim() || remitenteResend(),
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

async function enviarConSmtp(mensaje: MensajeCorreo, to: string[]): Promise<ResultadoCorreo> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) throw new Error(MSG_CORREO_NO_CONFIGURADO);

  const puerto = Number(process.env.SMTP_PORT || 587);
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465,
    auth: { user, pass }
  });
  const info = await transporter.sendMail({
    from: mensaje.from?.trim() || remitenteCorreo("smtp"),
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

/**
 * Envía por SendGrid o Resend (HTTPS) según las variables configuradas.
 * MAIL_PROVIDER=sendgrid|resend|smtp permite forzar el proveedor.
 * Si no hay API key, mantiene SMTP/Nodemailer para local o Render pago.
 */
export async function enviarCorreo(mensaje: MensajeCorreo): Promise<ResultadoCorreo> {
  const to = direcciones(mensaje.to);
  if (to.length === 0) throw new Error("Correo destino vacío");

  const proveedor = proveedorCorreo();
  if (!proveedor) throw new Error(MSG_CORREO_NO_CONFIGURADO);
  if (proveedor === "sendgrid") return enviarConSendGrid(mensaje, to);
  if (proveedor === "resend") return enviarConResend(mensaje, to);
  return enviarConSmtp(mensaje, to);
}
