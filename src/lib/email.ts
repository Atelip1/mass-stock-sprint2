import "server-only";
import nodemailer from "nodemailer";

export type OpcionesCorreo = {
  para: string;
  asunto: string;
  html: string;
  textoPlano?: string;
};

/**
 * Obtiene el transporte configurado de correo.
 * Soporta Gmail SMTP / cualquier proveedor SMTP.
 */
function obtenerTransporte() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true para 465, false para otros puertos como 587
    auth: { user, pass },
  });
}

/**
 * Envía un correo electrónico vía SMTP o Resend (si está configurado).
 * Si no hay credenciales configuradas, emite un aviso seguro en consola de servidor sin fallar.
 */
export async function enviarCorreo({ para, asunto, html, textoPlano }: OpcionesCorreo): Promise<{ ok: boolean; error?: string }> {
  const remitente = process.env.EMAIL_FROM || '"Mass Stock · Tiendas Mass" <notificaciones@mass-stock.pe>';

  // 1. Si existe clave de Resend configurada
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remitente,
          to: [para],
          subject: asunto,
          html,
          text: textoPlano,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[Email Resend Error]:", err);
        return { ok: false, error: err.message || "Error al enviar correo con Resend" };
      }
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de red con Resend";
      return { ok: false, error: msg };
    }
  }

  // 2. Transporte SMTP (Nodemailer / Gmail)
  const transporter = obtenerTransporte();
  if (!transporter) {
    console.warn(`[Mass Stock Email Simulación] Correo para: ${para} | Asunto: ${asunto}`);
    console.warn(`[Mass Stock Email Simulación] Para envíos reales, define SMTP_USER y SMTP_PASS en .env.local.`);
    return { ok: true };
  }

  try {
    await transporter.sendMail({
      from: remitente,
      to: para,
      subject: asunto,
      html,
      text: textoPlano,
    });
    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al despachar correo por SMTP";
    console.error("[Email SMTP Error]:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Notificación de bienvenida y entrega de contraseña temporal a un nuevo usuario.
 */
export async function enviarCorreoBienvenida(params: {
  nombre: string;
  correo: string;
  claveTemporal: string;
  rol: string;
  minutosValidez?: number;
}) {
  const validez = params.minutosValidez ?? 15;
  const asunto = "¡Bienvenido a la familia Mass Stock! · Tus claves de acceso";
  const textoPlano = `Hola ${params.nombre},\n\nBienvenido(a) al portal Mass Stock de Tiendas Mass.\n\nTus credenciales de acceso son:\nUsuario: ${params.correo}\nContraseña temporal: ${params.claveTemporal}\nRol: ${params.rol}\n\nIMPORTANTE: Por políticas de seguridad institucional, esta clave temporal tiene una vigencia de ${validez} minutos. Al iniciar sesión por primera vez, el sistema te solicitará obligatoriamente crear tu contraseña personal definitiva.\n\nAtentamente,\nEquipo de Sistemas Mass Stock.`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
      .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { background: #003da5; padding: 24px; text-align: center; }
      .header h1 { color: #facc15; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
      .header p { color: #ffffff; margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
      .content { padding: 24px; font-size: 14px; line-height: 1.6; }
      .welcome { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 12px; }
      .badge-box { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 18px 0; border-left: 4px solid #003da5; }
      .field { margin-bottom: 8px; }
      .field:last-child { margin-bottom: 0; }
      .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }
      .val-pass { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 18px; font-weight: bold; color: #003da5; letter-spacing: 1px; }
      .warning-box { background: #fefce8; border: 1px solid #fef08a; border-radius: 6px; padding: 12px; margin-top: 20px; font-size: 13px; color: #854d0e; }
      .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h1>Mass Stock</h1>
        <p>Control de Stock y Reposición · Tienda Óvalo Francisco Bolognesi</p>
      </div>
      <div class="content">
        <p class="welcome">¡Bienvenido(a) a la familia, ${params.nombre}!</p>
        <p>Se ha creado exitosamente tu cuenta de usuario para acceder al portal del sistema <b>Mass Stock</b>.</p>
        
        <div class="badge-box">
          <div class="field">
            <div class="label">Usuario / Correo</div>
            <div style="font-weight: 600;">${params.correo}</div>
          </div>
          <div class="field" style="margin-top: 10px;">
            <div class="label">Contraseña temporal</div>
            <div class="val-pass">${params.claveTemporal}</div>
          </div>
          <div class="field" style="margin-top: 10px;">
            <div class="label">Rol asignado</div>
            <div style="text-transform: capitalize;">${params.rol}</div>
          </div>
        </div>

        <div class="warning-box">
          ⏱ <b>Seguridad del acceso:</b> Esta clave temporal es válida por <b>${validez} minutos</b>. Por seguridad, al iniciar sesión el sistema te solicitará obligatoriamente cambiarla por una nueva contraseña personal.
        </div>

        <p style="margin-top: 20px;">Por favor ingresa al portal institucional para activar tu cuenta antes de que expire la clave temporal.</p>
      </div>
      <div class="footer">
        Este es un correo automático del sistema Mass Stock. No respondas a este mensaje.
      </div>
    </div>
  </body>
  </html>
  `;

  return enviarCorreo({ para: params.correo, asunto, html, textoPlano });
}

/**
 * Notificación de restablecimiento de contraseña temporal solicitada por el administrador.
 */
export async function enviarCorreoRestablecimiento(params: {
  nombre: string;
  correo: string;
  claveTemporal: string;
  minutosValidez?: number;
}) {
  const validez = params.minutosValidez ?? 15;
  const asunto = "Mass Stock · Clave temporal para restablecer contraseña";
  const textoPlano = `Estimado(a) ${params.nombre},\n\nSe ha solicitado el restablecimiento de tu contraseña en Mass Stock.\n\nTu nueva contraseña temporal es: ${params.claveTemporal}\n\nVigencia: ${validez} minutos.\n\nAl ingresar, deberás crear tu nueva contraseña personal.\n\nSi no reconoces esta acción, por favor comunícate de inmediato con el administrador de la tienda.`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
      .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
      .header { background: #003da5; padding: 24px; text-align: center; }
      .header h1 { color: #facc15; margin: 0; font-size: 24px; font-weight: 800; }
      .content { padding: 24px; font-size: 14px; line-height: 1.6; }
      .welcome { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 12px; }
      .badge-box { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 18px 0; border-left: 4px solid #f59e0b; }
      .val-pass { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 20px; font-weight: bold; color: #003da5; letter-spacing: 1px; margin-top: 4px; }
      .warning-box { background: #fefce8; border: 1px solid #fef08a; border-radius: 6px; padding: 12px; margin-top: 20px; font-size: 13px; color: #854d0e; }
      .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h1>Mass Stock</h1>
      </div>
      <div class="content">
        <p class="welcome">Estimado(a) ${params.nombre},</p>
        <p>El administrador del sistema ha solicitado el restablecimiento de tu contraseña de acceso.</p>
        
        <div class="badge-box">
          <div style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase;">Nueva clave temporal</div>
          <div class="val-pass">${params.claveTemporal}</div>
        </div>

        <div class="warning-box">
          ⏱ <b>Caducidad de seguridad:</b> Tienes <b>${validez} minutos</b> para ingresar al portal con esta clave. Al ingresar se te pedirá definir tu nueva contraseña personal.
        </div>

        <p style="margin-top: 20px; font-size: 13px; color: #64748b;">Si tú no solicitaste este cambio, por favor avisa de inmediato al jefe o supervisor de la tienda.</p>
      </div>
      <div class="footer">
        Mass Stock · Tiendas Mass Óvalo Francisco Bolognesi
      </div>
    </div>
  </body>
  </html>
  `;

  return enviarCorreo({ para: params.correo, asunto, html, textoPlano });
}
