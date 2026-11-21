/**
 * Email notifications service supporting direct SMTP (Nodemailer) and Resend API.
 */
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import type {
  PaymentAccountConfig,
  SubscriptionPlanOption,
} from "@/lib/utils/subscription";

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
  cid?: string;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  smtpConfig?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from?: string;
  };
}

const FREE_WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "votredomaine.com",
  "example.com",
]);

const PLACEHOLDER_HOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "votredomaine.com",
  "example.com",
];

function isCustomSenderDomain(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase().trim() || "";
  return Boolean(domain) && !FREE_WEBMAIL_DOMAINS.has(domain);
}

function isPlaceholderOrigin(url: string): boolean {
  const lower = url.toLowerCase();
  return PLACEHOLDER_HOST_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function resolveAppOrigin(
  reqHeaders?: Headers | { get(name: string): string | null } | null,
  fallbackOrigin?: string
): string {
  const envUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (envUrl && !isPlaceholderOrigin(envUrl)) {
    return envUrl;
  }

  if (reqHeaders) {
    const rawForwardedHost = reqHeaders.get("x-forwarded-host");
    const rawHost = rawForwardedHost || reqHeaders.get("host");
    if (rawHost) {
      const host = rawHost.split(",")[0].trim();
      const rawProto = reqHeaders.get("x-forwarded-proto");
      const proto = rawProto
        ? rawProto.split(",")[0].trim()
        : host.includes("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }

  if (fallbackOrigin && fallbackOrigin.trim()) {
    return fallbackOrigin.trim().replace(/\/+$/, "");
  }

  return envUrl || "http://localhost:3000";
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatSender(
  fromValue?: string,
  fallbackUser = "rkonekte509@gmail.com"
): { name: string; address: string } {
  const defaultName = "RKonekte";
  const defaultAddress = fallbackUser || "rkonekte509@gmail.com";

  if (!fromValue || !fromValue.trim()) {
    return { name: defaultName, address: defaultAddress };
  }

  const clean = fromValue
    .trim()
    .replace(/^["'\\]+|["'\\]+$/g, "")
    .replace(/\\"/g, '"');

  // Format 1: "Name" <email@domain.com> or Name <email@domain.com>
  const angleMatch = clean.match(/^(?:["']?([^"']+)["']?\s*)?<([^>]+)>$/);
  if (angleMatch) {
    let name = (angleMatch[1] || "").replace(/["'\\]/g, "").trim() || defaultName;
    if (name.toLowerCase() === "rkonekte") name = "RKonekte";
    return {
      name,
      address: angleMatch[2]?.trim() || defaultAddress,
    };
  }

  // Format 2: email address only (e.g. sales@technozi-ht.com)
  if (clean.includes("@")) {
    const orgName = clean.includes("technozi")
      ? "Technozi"
      : clean.includes("welj")
      ? "WELJ Express"
      : defaultName;
    return { name: orgName, address: clean };
  }

  // Format 3: name only (e.g. "Rkonekte" or "RKonekte")
  let name = clean || defaultName;
  if (name.toLowerCase() === "rkonekte") name = "RKonekte";
  return { name, address: defaultAddress };
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  attachments,
  smtpConfig,
}: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  const cleanPass = (p?: string) => (p ? p.replace(/^["']|["']$/g, "").trim() : "");

  const hasExplicitSmtpConfig = Boolean(smtpConfig?.host && smtpConfig?.user && smtpConfig?.pass);
  let matchedTenantSmtp = false;

  const envHost = process.env.SMTP_HOST?.trim();
  const envUser = process.env.SMTP_USER?.trim();
  const envPass = cleanPass(process.env.SMTP_PASS);
  const hasEnvSmtp = Boolean(envHost && envUser && envPass);

  let host = smtpConfig?.host || envHost || "smtp.gmail.com";
  let port = smtpConfig?.port || parseInt(process.env.SMTP_PORT || "465", 10);
  let user = smtpConfig?.user || envUser || "rkonekte509@gmail.com";
  let pass = cleanPass(smtpConfig?.pass || envPass || "ggkh mkbl dxei hhms");
  let fromRaw = smtpConfig?.from || process.env.EMAIL_FROM;

  // Organization-specific routing if explicitly configured or recipient is on internal company domain:
  if (
    (smtpConfig?.user?.includes("technozi") || to.endsWith("@technozi-ht.com") || to === process.env.TECHNOZI_EMAIL_TO) &&
    process.env.TECHNOZI_SMTP_USER &&
    process.env.TECHNOZI_SMTP_PASS
  ) {
    host = process.env.TECHNOZI_SMTP_HOST || "mail.technozi-ht.com";
    port = parseInt(process.env.TECHNOZI_SMTP_PORT || "465", 10);
    user = process.env.TECHNOZI_SMTP_USER;
    pass = cleanPass(process.env.TECHNOZI_SMTP_PASS);
    fromRaw = process.env.TECHNOZI_EMAIL_FROM || user;
    matchedTenantSmtp = true;
  } else if (
    (smtpConfig?.user?.includes("welj") || to.endsWith("@welj-ht.com") || to === process.env.WELJ_EMAIL_TO) &&
    process.env.WELJ_SMTP_USER &&
    process.env.WELJ_SMTP_PASS
  ) {
    host = process.env.WELJ_SMTP_HOST || "smtp.gmail.com";
    port = parseInt(process.env.WELJ_SMTP_PORT || "465", 10);
    user = process.env.WELJ_SMTP_USER;
    pass = cleanPass(process.env.WELJ_SMTP_PASS);
    fromRaw = process.env.WELJ_EMAIL_FROM || user;
    matchedTenantSmtp = true;
  }

  const sender = formatSender(fromRaw, user);

  // In automated test suites, avoid hammering external SMTP/API with dummy @example.com / @test.com addresses
  if ((process.env.NODE_ENV === "test" || process.env.VITEST) && (to.includes("@example.com") || to.includes("@test.com"))) {
    return { success: true, id: `test-mock-${Date.now()}` };
  }

  // Prepare attachments (including auto-attaching rkonekte-logo if referenced via cid:rkonekte-logo)
  const emailAttachments = [...(attachments || [])];
  if (html.includes("cid:rkonekte-logo") && !emailAttachments.some((a) => a.cid === "rkonekte-logo")) {
    const logoPath = path.join(process.cwd(), "public", "logo-rkonekte.png");
    if (fs.existsSync(logoPath)) {
      emailAttachments.push({
        filename: "logo-rkonekte.png",
        path: logoPath,
        cid: "rkonekte-logo",
        contentType: "image/png",
      });
    }
  }

  const plainText = text || htmlToPlainText(html);
  const entityRefId = crypto.randomUUID();
  const transactionalHeaders = {
    "X-Entity-Ref-ID": entityRefId,
    "X-Auto-Response-Suppress": "OOF, AutoReply",
    "Auto-Submitted": "auto-generated",
  };

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const hasResend = Boolean(resendApiKey && resendApiKey !== "dummy-resend-key-for-dev");
  const resendFromEnv = process.env.RESEND_FROM?.trim();
  let resendSender = resendFromEnv ? formatSender(resendFromEnv, "onboarding@resend.dev") : sender;
  if (!isCustomSenderDomain(resendSender.address)) {
    resendSender = {
      name: resendSender.name || "RKonekte",
      address: "onboarding@resend.dev",
    };
  }

  const preferResend = hasResend && !hasExplicitSmtpConfig && !matchedTenantSmtp;

  const sendViaResend = async (): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const cleanSenderName = (resendSender.name || "").replace(/["'\\]/g, "").trim();
      const resendPayload: Record<string, any> = {
        from: cleanSenderName ? `${cleanSenderName} <${resendSender.address}>` : resendSender.address,
        to: [to],
        subject,
        html,
        text: plainText,
        headers: transactionalHeaders,
      };
      const effectiveReplyTo =
        replyTo?.trim() ||
        (sender.address && sender.address !== resendSender.address ? sender.address : undefined);
      if (effectiveReplyTo) {
        resendPayload.reply_to = effectiveReplyTo;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, error: data?.message || "Erreur d'envoi Resend" };
      }

      console.log(`[RESEND EMAIL SENT] From: "${resendSender.name}" <${resendSender.address}> -> To: ${to} | ID: ${data.id}`);
      return { success: true, id: data.id };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erreur réseau Resend" };
    }
  };

  // 1. Prefer Resend API when configured
  if (preferResend) {
    const resendResult = await sendViaResend();
    if (resendResult.success) {
      return resendResult;
    }
    console.error("[RESEND ERROR]", resendResult.error);
    if (!hasEnvSmtp) {
      return resendResult;
    }
    console.log("[SMTP FALLBACK] Falling back to SMTP because Resend failed...");
  }

  // 2. Send via direct SMTP if credentials exist
  if (host && user && pass) {
    try {
      const isGmailHost = host.toLowerCase().includes("gmail.com");
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // SSL on 465
        auth: {
          user,
          pass,
        },
        ...(isGmailHost ? {} : { tls: { rejectUnauthorized: false } }),
      });

      const mailPayload: Record<string, any> = {
        from: sender,
        to,
        subject,
        text: plainText,
        html,
        headers: transactionalHeaders,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      };
      if (replyTo && replyTo.trim()) {
        mailPayload.replyTo = replyTo.trim();
      }

      const info = await transporter.sendMail(mailPayload);

      console.log(`[SMTP EMAIL SENT] From: "${sender.name}" <${sender.address}> -> To: ${to} | ID: ${info.messageId}`);
      return { success: true, id: info.messageId };
    } catch (smtpErr: any) {
      console.error("[SMTP ERROR]", smtpErr);

      // Automatic fallback to official RKonekte Gmail SMTP if not already using it
      const fallbackUser = envUser || "rkonekte509@gmail.com";
      const fallbackPass = envPass || cleanPass("ggkh mkbl dxei hhms");
      if (user !== fallbackUser && fallbackUser && fallbackPass) {
        try {
          console.log("[SMTP FALLBACK] Retrying with official RKonekte Gmail SMTP...");
          const fbHost = envHost || "smtp.gmail.com";
          const fbIsGmailHost = fbHost.toLowerCase().includes("gmail.com");
          const fbTransporter = nodemailer.createTransport({
            host: fbHost,
            port: parseInt(process.env.SMTP_PORT || "465", 10),
            secure: true,
            auth: { user: fallbackUser, pass: fallbackPass },
            ...(fbIsGmailHost ? {} : { tls: { rejectUnauthorized: false } }),
          });
          const fbSender = formatSender(process.env.EMAIL_FROM, fallbackUser);
          const fbPayload: Record<string, any> = {
            from: fbSender,
            to,
            subject,
            text: plainText,
            html,
            headers: transactionalHeaders,
            attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
          };
          if (replyTo && replyTo.trim()) {
            fbPayload.replyTo = replyTo.trim();
          }

          const fbInfo = await fbTransporter.sendMail(fbPayload);
          console.log(`[SMTP FALLBACK SUCCESS] From: "${fbSender.name}" <${fbSender.address}> -> To: ${to} | ID: ${fbInfo.messageId}`);
          return { success: true, id: fbInfo.messageId };
        } catch (fbErr: any) {
          console.error("[SMTP FALLBACK ERROR]", fbErr);
        }
      }

      if (hasResend && !preferResend) {
        const resendFallback = await sendViaResend();
        if (resendFallback.success) {
          return resendFallback;
        }
      }

      return { success: false, error: smtpErr?.message || "Erreur d'envoi SMTP" };
    }
  }

  // 3. Fallback to Resend API if API Key is configured
  if (hasResend) {
    return await sendViaResend();
  }

  // 4. Fallback: Simulation mode for local dev without credentials
  console.log(`[EMAIL SIMULATION] To: ${to} | Subject: "${subject}"`);
  return { success: true, id: `mock-email-${Date.now()}` };
}

export function generateNewRequestSecretaryEmail(params: {
  requestNumber: string;
  employeeName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  submittedAt: string;
  reviewUrl: string;
}): { subject: string; html: string } {
  const subject = `[Nouvelle Demande] ${params.requestNumber} — ${params.employeeName} (${params.requestedDays} j)`;
  
  // Format leave type to French readable string
  let leaveTypeFr = params.leaveType;
  if (params.leaveType === "ANNUAL") leaveTypeFr = "Congé Annuel";
  else if (params.leaveType === "SICK") leaveTypeFr = "Congé Maladie";
  else if (params.leaveType === "UNPAID") leaveTypeFr = "Congé Sans Solde";
  else if (params.leaveType === "MATERNITY_PATERNITY") leaveTypeFr = "Maternité / Paternité";

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        
        <!-- HEADER -->
        <tr>
          <td style="background-color: #0d9488; padding: 24px 32px; text-align: left;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.2px;">Nouvelle demande de congé</h1>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
              Une nouvelle demande de congé vient d'être enregistrée. Vous pouvez consulter les détails ci-dessous et statuer directement sur la demande.
            </p>

            <!-- REQUEST SUMMARY CARD -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
              <tr>
                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                  <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px;">Numéro de dossier</span>
                  <span style="font-size: 18px; font-weight: 800; color: #047857; font-family: monospace;">${params.requestNumber}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px;">
                  <table width="100%" border="0" cellpadding="6" cellspacing="0" style="font-size: 13px;">
                    <tr>
                      <td style="color: #64748b; width: 38%; padding: 6px 0;">Employé :</td>
                      <td style="font-weight: 700; color: #0f172a; padding: 6px 0;">${params.employeeName}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 6px 0;">Département :</td>
                      <td style="color: #334155; font-weight: 600; padding: 6px 0;">${params.department}</td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 6px 0;">Type de congé :</td>
                      <td style="color: #0f172a; font-weight: 700; padding: 6px 0;">
                        ${leaveTypeFr}
                      </td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 6px 0;">Période :</td>
                      <td style="color: #0f172a; font-weight: 700; padding: 6px 0;">
                        Du ${params.startDate} au ${params.endDate}
                      </td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 6px 0;">Durée calculée :</td>
                      <td style="color: #047857; font-weight: 800; font-size: 14px; padding: 6px 0;">
                        ${params.requestedDays} jour(s)
                      </td>
                    </tr>
                    <tr>
                      <td style="color: #64748b; padding: 6px 0;">Date de soumission :</td>
                      <td style="color: #475569; padding: 6px 0;">${params.submittedAt}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- ACTION BUTTON -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 12px 0;">
              <tr>
                <td align="center">
                  <a href="${params.reviewUrl}" target="_blank" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2);">
                    Consulter et Traiter la Demande →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin: 20px 0 0 0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
              La validation ou le refus s'effectue en un clic de manière sécurisée via votre espace d'administration.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              Système Automatisé de Gestion des Congés • Notification confidentielle
            </p>
          </td>
        </tr>

      </table>
    </body>
    </html>
  `;
  return { subject, html };
}

export function generateDecisionEmployeeEmail(params: {
  requestNumber: string;
  employeeName: string;
  status: "APPROVED" | "REJECTED";
  startDate: string;
  endDate: string;
  rejectionReason?: string;
  viewUrl: string;
}): { subject: string; html: string } {
  const isApproved = params.status === "APPROVED";
  const subject = `[${isApproved ? "VALIDÉE" : "REFUSÉE"}] Demande de congé ${params.requestNumber}`;
  
  const headerBg = isApproved ? "#0d9488" : "#991b1b";
  const statusColor = isApproved ? "#0d9488" : "#dc2626";
  const statusTitle = isApproved ? "Demande Approuvée" : "Demande Refusée";

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        
        <!-- HEADER -->
        <tr>
          <td style="background-color: ${headerBg}; padding: 24px 32px; text-align: left;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.2px;">${statusTitle}</h1>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Bonjour <strong>${params.employeeName}</strong>,
            </p>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
              Votre demande de congé <strong>${params.requestNumber}</strong> a été officiellement traitée par la direction.
            </p>

            <!-- SUMMARY CARD -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
              <tr>
                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                  <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px;">Statut officiel</span>
                  <span style="font-size: 16px; font-weight: 800; color: ${statusColor};">${isApproved ? "Accordée" : "Refusée"}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 16px 20px;">
                  <table width="100%" border="0" cellpadding="6" cellspacing="0" style="font-size: 13px;">
                    <tr>
                      <td style="color: #64748b; width: 38%; padding: 6px 0;">Période :</td>
                      <td style="color: #0f172a; font-weight: 700; padding: 6px 0;">Du ${params.startDate} au ${params.endDate}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${!isApproved && params.rejectionReason ? `
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <strong style="color: #9f1239; font-size: 13px; display: block; margin-bottom: 4px;">Motif de refus :</strong>
                    <p style="margin: 0; font-size: 13px; color: #881337; line-height: 1.5;">${params.rejectionReason}</p>
                  </td>
                </tr>
              </table>
            ` : ""}

            <!-- ACTION BUTTON -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 12px 0;">
              <tr>
                <td align="center">
                  <a href="${params.viewUrl}" target="_blank" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
                    Consulter votre dossier sécurisé →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              Système Automatisé de Gestion des Congés • Notification confidentielle
            </p>
          </td>
        </tr>

      </table>
    </body>
    </html>
  `;
  return { subject, html };
}

export function generateSalaryRevisionEmail(params: {
  reference: string;
  employeeName: string;
  previousSalary: string;
  newSalary: string;
  currency: string;
  effectiveDate: string;
  reason?: string;
  decidedBy?: string;
  companyName?: string;
  branchName?: string;
}): { subject: string; html: string } {
  const company = params.companyName || "e-biznis";
  const subject = `[${company.toUpperCase()} - RÉVISION SALARIALE] Notification de revalorisation de salaire - ${params.reference}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);">
        
        <!-- HEADER WITH PROMINENT COMPANY BRANDING -->
        <tr>
          <td style="background-color: #062653; padding: 28px 32px; text-align: left;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
                    <tr>
                      <td style="background-color: #FF7900; color: #ffffff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${company}
                      </td>
                      <td style="padding-left: 8px;">
                        <span style="background-color: rgba(255,255,255,0.15); color: #34d399; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px;">
                          DÉCISION ADMINISTRATIVE
                        </span>
                      </td>
                    </tr>
                  </table>
                  <h1 style="margin: 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.2px;">
                    Revalorisation Salariale
                  </h1>
                  <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">
                    Entreprise : <strong style="color: #ffffff;">${company}</strong>
                    ${params.branchName ? ` • Succursale : <strong style="color: #ffffff;">${params.branchName}</strong>` : ""}
                    • Réf. ${params.reference}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY CONTENT -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Bonjour <strong>${params.employeeName}</strong>,
            </p>
            <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
              Nous avons le plaisir de vous informer que votre rémunération au sein de l'entreprise <strong>${company}</strong>${params.branchName ? ` (Succursale : <strong>${params.branchName}</strong>)` : ""} a été officiellement revalorisée par la Direction.
            </p>

            <!-- SALARY HIGHLIGHT CARD -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 14px; margin-bottom: 24px; text-align: center;">
              <tr>
                <td style="padding: 24px 20px;">
                  <span style="font-size: 11px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">
                    NOUVEAU SALAIRE ATTRIBUÉ • ${company.toUpperCase()}
                  </span>
                  <div style="font-size: 32px; font-weight: 800; color: #047857; margin: 8px 0 4px 0;">
                    ${params.newSalary} <span style="font-size: 20px; font-weight: 600;">${params.currency}</span>
                  </div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
                    Ancien salaire : <span style="text-decoration: line-through;">${params.previousSalary} ${params.currency}</span>
                  </div>
                </td>
              </tr>
            </table>

            <!-- DETAILS TABLE WITH COMPANY & BRANCH -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; width: 40%;">Entreprise employeur :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #062653;">${company}</td>
              </tr>
              ${params.branchName ? `
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Succursale :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">${params.branchName}</td>
              </tr>
              ` : ""}
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Date d'effet :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">${params.effectiveDate}</td>
              </tr>
              ${params.reason ? `
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Motif / Décision :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">${params.reason}</td>
              </tr>
              ` : ""}
              <tr>
                <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">Attribué par :</td>
                <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #1e293b;">${params.decidedBy || "Direction Générale"} (${company})</td>
              </tr>
            </table>

            <!-- OFFICIAL DOCUMENT CERTIFICATE NOTICE -->
            <div style="background-color: #f1f5f9; border-left: 4px solid #062653; padding: 14px 18px; border-radius: 8px; margin: 0 0 20px 0; font-size: 12px; color: #334155; line-height: 1.55;">
              📄 <strong>Document officiel signé :</strong> La décision administrative officielle portant le visa et la signature de la Direction de <strong>${company}</strong> a été émise et versée à votre dossier du personnel.
            </div>

            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #475569;">
              Cette modification a été enregistrée dans votre dossier professionnel. Nous vous remercions pour votre contribution et votre engagement continu au sein de <strong>${company}</strong>.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 12px; font-weight: 700; color: #062653;">
              Direction des Ressources Humaines • ${company}
            </p>
            <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;">
              Notification officielle et confidentielle générée via le système RKonekte
            </p>
          </td>
        </tr>

      </table>
    </body>
    </html>
  `;
  return { subject, html };
}

function escapeEmailHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateCompanyEventEmail(params: {
  companyName: string;
  employeeName: string;
  eventTitle: string;
  eventTypeLabel: string;
  dateFormatted: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  audienceSummary: string;
  description?: string;
  scheduledBy?: string;
  calendarUrl: string;
}): { subject: string; html: string } {
  const company = params.companyName || "Votre entreprise";
  const subject = `[${company.toUpperCase()} - PLANIFICATION] ${params.eventTitle} (${params.eventDate})`;

  const safeCompany = escapeEmailHtml(company);
  const safeEmployee = escapeEmailHtml(params.employeeName);
  const safeTitle = escapeEmailHtml(params.eventTitle);
  const safeTypeLabel = escapeEmailHtml(params.eventTypeLabel);
  const safeDateFormatted = escapeEmailHtml(params.dateFormatted);
  const safeStartTime = escapeEmailHtml(params.startTime || "09:00");
  const safeEndTime = escapeEmailHtml(params.endTime || "10:00");
  const safeLocation = escapeEmailHtml(params.location || "Bureaux de l'entreprise");
  const safeAudience = escapeEmailHtml(params.audienceSummary);
  const safeScheduledBy = escapeEmailHtml(params.scheduledBy || "Administration");
  const safeDescription = params.description ? escapeEmailHtml(params.description).replace(/\n/g, "<br/>") : "";

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeEmailHtml(subject)}</title>
    </head>
    <body style="margin: 0; padding: 30px 10px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);">

        <!-- HEADER -->
        <tr>
          <td style="background-color: #062653; padding: 26px 32px; text-align: left;">
            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.2px;">
              ${safeTitle}
            </h1>
            <p style="margin: 6px 0 0 0; color: #cbd5e1; font-size: 12px;">
              Planification officielle de l'administration • ${safeDateFormatted}
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
              Bonjour <strong>${safeEmployee}</strong>,
            </p>
            <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.6; color: #475569;">
              L'administration de <strong>${safeCompany}</strong> vous informe qu'un événement officiel vient d'être programmé sur le calendrier de l'entreprise. Vous trouverez tous les détails ci-dessous :
            </p>

            <!-- EVENT DETAILS TABLE -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 22px;">
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b; width: 38%;">Type d'événement :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #062653;">${safeTypeLabel}</td>
              </tr>
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Date :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #0f172a;">${safeDateFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Horaire :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #047857;">${safeStartTime} – ${safeEndTime}</td>
              </tr>
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Lieu / Lien :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">${safeLocation}</td>
              </tr>
              <tr>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">Destinataires :</td>
                <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b;">${safeAudience}</td>
              </tr>
              <tr>
                <td style="padding: 12px 18px; font-size: 13px; color: #64748b;">Planifié par :</td>
                <td style="padding: 12px 18px; font-size: 13px; font-weight: 600; color: #1e293b;">${safeScheduledBy}</td>
              </tr>
            </table>

            ${
              safeDescription
                ? `
            <div style="background-color: #f8fafc; border-left: 4px solid #059669; padding: 14px 18px; border-radius: 8px; margin: 0 0 24px 0; font-size: 13px; color: #334155; line-height: 1.6;">
              <strong style="display: block; color: #062653; margin-bottom: 4px;">Description / Ordre du jour :</strong>
              ${safeDescription}
            </div>
            `
                : ""
            }

            <!-- ACTION BUTTON -->
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 26px 0 10px 0;">
              <tr>
                <td align="center">
                  <a href="${params.calendarUrl}" target="_blank" style="background-color: #059669; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block;">
                    Consulter le Calendrier →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="margin: 0; font-size: 12px; font-weight: 700; color: #062653;">
              ${safeCompany} • Calendrier & Planification Officielle
            </p>
            <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;">
              Notification générée automatiquement via la plateforme RKonekte
            </p>
          </td>
        </tr>

      </table>
    </body>
    </html>
  `;

  return { subject, html };
}

function renderTransactionalEmailLayout(params: {
  title: string;
  preheader: string;
  companyLabel?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  closingNoteHtml?: string;
  footerText: string;
}): string {
  const safeTitle = escapeEmailHtml(params.title);
  const safePreheader = escapeEmailHtml(params.preheader);
  const safeUrl = params.ctaUrl ? escapeEmailHtml(params.ctaUrl) : "";
  const safeCta = params.ctaLabel ? escapeEmailHtml(params.ctaLabel) : "";
  const safeFooter = escapeEmailHtml(params.footerText);

  const ctaSection = safeUrl && safeCta ? `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
          <tr>
            <td align="center" bgcolor="#062653" style="border-radius: 8px;">
              <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">${safeCta}</a>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;">
          Si le bouton ne répond pas, vous pouvez ouvrir cette adresse dans votre navigateur :
        </p>
        <p style="margin: 0 0 18px 0; font-size: 12px; line-height: 1.5; word-break: break-all;">
          <a href="${safeUrl}" target="_blank" style="color: #062653; text-decoration: underline;">${safeUrl}</a>
        </p>` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f8fafc;">${safePreheader}</div>
  <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px;">
    <tr>
      <td style="padding: 22px 28px; border-bottom: 1px solid #e2e8f0;">
        <span style="font-size: 17px; font-weight: 700; color: #062653; letter-spacing: -0.2px;">RKonekte</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 28px; font-size: 14px; line-height: 1.65; color: #334155;">
        ${params.bodyHtml}
        ${ctaSection}
        ${params.closingNoteHtml || ""}
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 1.5; color: #64748b;">
        ${safeFooter}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateCompanyActivationEmail(params: {
  recipientName: string;
  companyName: string;
  email: string;
  activationUrl: string;
  isResend?: boolean;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();
  const safeName = escapeEmailHtml(name);
  const safeCompany = escapeEmailHtml(company);
  const safeEmail = escapeEmailHtml(email);

  const subject = params.isResend
    ? `Nouveau lien de configuration — ${company} (RKonekte)`
    : `Finalisez la création de votre espace ${company} — RKonekte`;

  const introHtml = params.isResend
    ? `Un nouveau lien d'activation vient d'être généré pour l'espace de votre entreprise <strong>${safeCompany}</strong> sur RKonekte.`
    : `Votre demande d'inscription pour l'entreprise <strong>${safeCompany}</strong> a bien été enregistrée sur RKonekte.`;

  const secondaryHtml = params.isResend
    ? `Pour la sécurité de votre compte, tout lien envoyé précédemment a été désactivé.`
    : `Ce compte administrateur associé à <strong>${safeEmail}</strong> vous permettra de configurer votre organisation et vos collaborateurs.`;

  const preheader = params.isResend
    ? `Nouveau lien pour définir le mot de passe de votre espace ${company}.`
    : `Définissez votre mot de passe pour activer l'espace ${company} sur RKonekte.`;

  const bodyHtml = `
    <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
    <p style="margin: 0 0 14px 0;">${introHtml}</p>
    <p style="margin: 0 0 16px 0;">${secondaryHtml}</p>

    <!-- DOCUMENT DE SYNTHÈSE OFFICIEL NATUREL (SANS FOND NI CADRE) -->
    <div style="margin: 22px 0 18px 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      <div style="margin-bottom: 14px;">
        <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ff7900; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Document de Synthèse Officiel</span>
        <h3 style="margin: 0; color: #062653; font-size: 15px; font-weight: 700;">Guide de Démarrage, Tarifs &amp; Engagements</h3>
      </div>

      <div style="margin-bottom: 14px;">
        <h4 style="margin: 0 0 4px 0; color: #062653; font-size: 13px; font-weight: 700;">1. Objectif du Système</h4>
        <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #334155;">
          RKonekte est la plateforme de gestion digitalisée conçue pour automatiser et sécuriser les processus de votre entreprise : formulaires de congés officiels imprimables A4 avec circuit d'approbation hiérarchique, revalorisations salariales formelles avec notifications automatiques, autorisations de dépenses certifiées par signature électronique sans fond (PNG transparent), opérations de caisse et rapports financiers consolidés en temps réel.
        </p>
      </div>

      <div style="margin-bottom: 14px;">
        <h4 style="margin: 0 0 4px 0; color: #062653; font-size: 13px; font-weight: 700;">2. Tarifs &amp; Période Gratuite</h4>
        <p style="margin: 0 0 6px 0; font-weight: 700; color: #059669; font-size: 12px;">
          ✓ Premier mois offert (30 jours gratuits) dès l'activation de votre espace, sans engagement initial.
        </p>
        <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155; margin-bottom: 6px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 4px 0;"><strong>1 mois :</strong> 50 USD / mois</td>
            <td style="padding: 4px 0; text-align: right;"><strong>3 mois :</strong> 135 USD (-10%)</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;"><strong>6 mois :</strong> 255 USD (-15%)</td>
            <td style="padding: 4px 0; text-align: right;"><strong>12 mois :</strong> 510 USD (-15%)</td>
          </tr>
        </table>
        <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
          Moyens de paiement acceptés : Sogebank, Unibank, MonCash. Tout réabonnement anticipé s'ajoute directement à l'échéance : aucun jour restant n'est perdu.
        </p>
      </div>

      <div style="margin-bottom: 18px;">
        <h4 style="margin: 0 0 6px 0; color: #062653; font-size: 13px; font-weight: 700;">3. À savoir avant de vous lancer</h4>
        <ul style="margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: #334155;">
          <li style="margin-bottom: 4px;"><strong>Rôle Administrateur :</strong> Vous disposez de la pleine autorité pour configurer votre logo transparent, vos succursales, et créer les accès de vos collaborateurs.</li>
          <li style="margin-bottom: 4px;"><strong>Cloisonnement &amp; Confidentialité :</strong> Chaque utilisateur (employé, caissier, chef de succursale, RH) n'accède qu'aux modules et données autorisés par son niveau d'accès.</li>
          <li><strong>Sécurité des documents :</strong> Chaque pièce générée est authentifiée, imprimable au format standard A4 et scellée avec vos signatures numériques.</li>
        </ul>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 14px;">
        <p style="margin: 0 0 6px 0; font-size: 13px; line-height: 1.5; color: #0f172a;">
          Cliquez sur le bouton ci-dessous pour accéder à la configuration sécurisée de votre mot de passe :
        </p>
        <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #64748b;">
          <strong>Étape obligatoire :</strong> Sur la page sécurisée qui s'ouvrira, vous validerez le <strong>bouton radio de confirmation d'acceptation</strong> de ces conditions afin de débloquer l'enregistrement de votre mot de passe et activer votre espace.
        </p>
      </div>
    </div>
  `;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company,
    bodyHtml,
    ctaLabel: "Définir mon mot de passe",
    ctaUrl: params.activationUrl,
    closingNoteHtml: `<p style="margin: 0; font-size: 12px; color: #64748b;">Si vous n'êtes pas à l'origine de cette démarche, vous pouvez ignorer cet e-mail.</p>`,
    footerText: `E-mail de service envoyé à ${email} pour l'organisation ${company} via RKonekte.`,
  });

  const introPlain = params.isResend
    ? `Un nouveau lien d'activation vient d'être généré pour l'espace de votre entreprise ${company} sur RKonekte.`
    : `Votre demande d'inscription pour l'entreprise ${company} a bien été enregistrée sur RKonekte.`;

  const secondaryPlain = params.isResend
    ? `Pour la sécurité de votre compte, tout lien envoyé précédemment a été désactivé.`
    : `Ce compte administrateur associé à ${email} vous permettra de configurer votre organisation et vos collaborateurs.`;

  const text = [
    `Bonjour ${name},`,
    "",
    introPlain,
    "",
    secondaryPlain,
    "",
    "Pour définir votre mot de passe et accéder à votre espace, ouvrez ce lien :",
    params.activationUrl,
    "",
    "Si vous n'êtes pas à l'origine de cette démarche, vous pouvez ignorer cet e-mail.",
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email} pour ${company}`,
  ].join("\n");

  return { subject, html, text };
}

export function generatePasswordResetEmail(params: {
  recipientName: string;
  email: string;
  companyName?: string;
  actionUrl: string;
  isInitialSetup?: boolean;
  expiresInLabel?: string;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Utilisateur").trim();
  const email = params.email.trim();
  const company = params.companyName?.trim();
  const expiresLabel = params.expiresInLabel || "1 heure";
  const safeName = escapeEmailHtml(name);
  const safeEmail = escapeEmailHtml(email);
  const safeCompany = company ? escapeEmailHtml(company) : "";

  const subject = params.isInitialSetup
    ? "Configuration de votre mot de passe RKonekte"
    : "Réinitialisation de votre mot de passe RKonekte";

  const bodyHtml = params.isInitialSetup
    ? `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">Une demande d'accès a été enregistrée pour le compte <strong>${safeEmail}</strong>${safeCompany ? ` (${safeCompany})` : ""}, dont le mot de passe n'a pas encore été configuré.</p>
      <p style="margin: 0;">Cliquez ci-dessous pour choisir votre mot de passe et activer votre compte :</p>
    `
    : `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte <strong>${safeEmail}</strong>${safeCompany ? ` (${safeCompany})` : ""}.</p>
      <p style="margin: 0;">Cliquez ci-dessous pour définir un nouveau mot de passe (ce lien reste actif pendant ${escapeEmailHtml(expiresLabel)}) :</p>
    `;

  const ctaLabel = params.isInitialSetup
    ? "Définir mon mot de passe"
    : "Réinitialiser mon mot de passe";

  const preheader = params.isInitialSetup
    ? "Lien pour définir le mot de passe de votre compte RKonekte."
    : `Lien de réinitialisation de mot de passe valable ${expiresLabel}.`;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company || "Gestion des accès",
    bodyHtml,
    ctaLabel,
    ctaUrl: params.actionUrl,
    closingNoteHtml: `<p style="margin: 0; font-size: 12px; color: #64748b;">Si vous n'avez pas effectué cette demande, aucune action n'est nécessaire et votre compte reste inchangé.</p>`,
    footerText: `E-mail de service envoyé à ${email}${company ? ` pour ${company}` : ""} via RKonekte.`,
  });

  const introPlain = params.isInitialSetup
    ? `Une demande d'accès a été enregistrée pour le compte ${email}${company ? ` (${company})` : ""}, dont le mot de passe n'a pas encore été configuré.`
    : `Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte ${email}${company ? ` (${company})` : ""}.`;

  const actionPlain = params.isInitialSetup
    ? "Pour définir votre mot de passe et activer votre compte, ouvrez ce lien :"
    : `Pour définir un nouveau mot de passe (lien valable pendant ${expiresLabel}), ouvrez ce lien :`;

  const text = [
    `Bonjour ${name},`,
    "",
    introPlain,
    "",
    actionPlain,
    params.actionUrl,
    "",
    "Si vous n'avez pas effectué cette demande, vous pouvez ignorer cet e-mail.",
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateEmployeeInvitationEmail(params: {
  firstName: string;
  lastName: string;
  employeeNumber: string;
  companyName: string;
  email: string;
  inviteUrl: string;
}): { subject: string; html: string; text: string } {
  const fullName = `${params.firstName || ""} ${params.lastName || ""}`.trim() || "Collaborateur";
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();
  const matricule = (params.employeeNumber || "").trim();

  const safeFullName = escapeEmailHtml(fullName);
  const safeCompany = escapeEmailHtml(company);
  const safeEmail = escapeEmailHtml(email);
  const safeMatricule = escapeEmailHtml(matricule);

  const subject = `Accès collaborateur ${company} — RKonekte`;
  const preheader = `${company} vous invite à définir votre mot de passe sur RKonekte.`;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company,
    bodyHtml: `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeFullName},</p>
      <p style="margin: 0 0 14px 0;">Votre profil collaborateur vient d'être créé au sein de l'organisation <strong>${safeCompany}</strong> sur la plateforme RKonekte.</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #334155;">
            <div>Identifiant : <strong>${safeEmail}</strong></div>
            ${safeMatricule ? `<div style="margin-top: 4px;">Matricule : <strong>${safeMatricule}</strong></div>` : ""}
          </td>
        </tr>
      </table>
      <p style="margin: 0;">Cliquez ci-dessous pour définir votre mot de passe et accéder à votre espace :</p>
    `,
    ctaLabel: "Définir mon mot de passe",
    ctaUrl: params.inviteUrl,
    closingNoteHtml: `<p style="margin: 0; font-size: 12px; color: #64748b;">Ce lien personnel est valable pendant 7 jours.</p>`,
    footerText: `E-mail de service envoyé à ${email} pour ${company} via RKonekte.`,
  });

  const text = [
    `Bonjour ${fullName},`,
    "",
    `Votre profil collaborateur vient d'être créé au sein de l'organisation ${company} sur RKonekte.`,
    `Identifiant : ${email}`,
    ...(matricule ? [`Matricule : ${matricule}`] : []),
    "",
    "Pour définir votre mot de passe et accéder à votre espace, ouvrez ce lien :",
    params.inviteUrl,
    "",
    "Ce lien personnel est valable pendant 7 jours.",
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email} pour ${company}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateCompanyApprovedEmail(params: {
  recipientName?: string;
  companyName: string;
  email: string;
  tempPassword?: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();
  const tempPass = params.tempPassword?.trim();

  const safeName = escapeEmailHtml(name);
  const safeCompany = escapeEmailHtml(company);
  const safeEmail = escapeEmailHtml(email);
  const safeTempPass = tempPass ? escapeEmailHtml(tempPass) : "";

  const subject = `Votre espace ${company} est actif sur RKonekte`;
  const preheader = `Votre espace administrateur pour ${company} est prêt.`;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company,
    bodyHtml: `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">L'inscription de votre entreprise <strong>${safeCompany}</strong> a été validée sur RKonekte.</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #334155;">
            <div>Identifiant : <strong>${safeEmail}</strong></div>
            ${safeTempPass ? `<div style="margin-top: 4px;">Mot de passe temporaire : <strong style="font-family: monospace;">${safeTempPass}</strong></div>` : ""}
          </td>
        </tr>
      </table>
      <p style="margin: 0;">Vous pouvez dès à présent vous connecter à votre espace d'administration :</p>
    `,
    ctaLabel: "Accéder à mon espace",
    ctaUrl: params.loginUrl,
    footerText: `E-mail de service envoyé à ${email} pour ${company} via RKonekte.`,
  });

  const text = [
    `Bonjour ${name},`,
    "",
    `L'inscription de votre entreprise ${company} a été validée sur RKonekte.`,
    `Identifiant : ${email}`,
    ...(tempPass ? [`Mot de passe temporaire : ${tempPass}`] : []),
    "",
    "Vous pouvez vous connecter via ce lien :",
    params.loginUrl,
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email} pour ${company}`,
  ].join("\n");

  return { subject, html, text };
}

function renderPaymentAccountsEmailBlock(accounts: PaymentAccountConfig[]): {
  html: string;
  text: string[];
} {
  const activeAccounts = (accounts || []).filter(
    (a) => a.enabled && a.accountNumber && !a.accountNumber.toLowerCase().includes("à configurer")
  );
  if (activeAccounts.length === 0) {
    return {
      html: "",
      text: [],
    };
  }

  const rowsHtml = activeAccounts
    .map((acc) => {
      const label = escapeEmailHtml(acc.label);
      const name = acc.accountName ? escapeEmailHtml(acc.accountName) : "";
      const num = escapeEmailHtml(acc.accountNumber);
      const instr = acc.instructions ? escapeEmailHtml(acc.instructions) : "";
      return `
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">
            <div style="font-weight: 700; color: #062653;">${label}</div>
            <div>Compte : <strong>${num}</strong>${name ? ` (${name})` : ""}</div>
            ${instr ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">${instr}</div>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: collapse;">
      ${rowsHtml}
    </table>
  `;

  const text = activeAccounts.map((acc) => {
    const parts = [`- ${acc.label} : ${acc.accountNumber}${acc.accountName ? ` (${acc.accountName})` : ""}`];
    if (acc.instructions) parts.push(`  Note : ${acc.instructions}`);
    return parts.join("\n");
  });

  return { html, text };
}

function renderPlansEmailBlock(plans: SubscriptionPlanOption[]): {
  html: string;
  text: string[];
} {
  const rowsHtml = plans
    .map((p) => {
      const label = escapeEmailHtml(p.label);
      const priceStr = escapeEmailHtml(`${p.price} ${p.currency}`);
      const discountStr =
        p.discountPct > 0 ? ` (-${p.discountPct} %)` : "";
      return `
        <tr>
          <td style="padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">
            <strong>${label}</strong>${escapeEmailHtml(discountStr)}
          </td>
          <td align="right" style="padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #062653;">
            ${priceStr}
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: collapse;">
      ${rowsHtml}
    </table>
  `;

  const text = plans.map(
    (p) =>
      `- ${p.label}${p.discountPct > 0 ? ` (-${p.discountPct}%)` : ""} : ${p.price} ${p.currency}`
  );

  return { html, text };
}

export function generateSubscriptionWelcomeEmail(params: {
  recipientName?: string;
  companyName: string;
  email: string;
  trialMonths: number;
  expiresAtLabel: string;
  plans: SubscriptionPlanOption[];
  paymentAccounts: PaymentAccountConfig[];
  autoMessageBody?: string;
  subscriptionUrl: string;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();

  const safeName = escapeEmailHtml(name);
  const safeCompany = escapeEmailHtml(company);
  const safeExpires = escapeEmailHtml(params.expiresAtLabel);
  const trialText =
    params.trialMonths > 1 ? `${params.trialMonths} mois gratuits` : "1er mois gratuit";

  const plansBlock = renderPlansEmailBlock(params.plans);
  const customNoteHtml = params.autoMessageBody
    ? `<p style="margin: 0 0 14px 0; font-size: 13px; color: #475569;">${escapeEmailHtml(params.autoMessageBody).replace(/\r?\n/g, "<br/>")}</p>`
    : "";

  const subject = `Bienvenue sur RKonekte — ${trialText} activé pour ${company}`;
  const preheader = `Votre accès ${company} est actif gratuitement jusqu'au ${params.expiresAtLabel}.`;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company,
    bodyHtml: `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">Votre compte administrateur pour <strong>${safeCompany}</strong> est désormais activé. Vous bénéficiez de votre <strong>${escapeEmailHtml(trialText)}</strong> jusqu'au <strong>${safeExpires}</strong>.</p>
      ${customNoteHtml}
      <p style="margin: 0 0 8px 0; font-weight: 700; color: #062653; font-size: 13px;">Tarifs de renouvellement après la période gratuite :</p>
      ${plansBlock.html}
    `,
    ctaLabel: "Consulter mon abonnement",
    ctaUrl: params.subscriptionUrl,
    footerText: `E-mail de service envoyé à ${email} pour ${company} via RKonekte.`,
  });

  const text = [
    `Bonjour ${name},`,
    "",
    `Votre compte pour ${company} est activé. Votre ${trialText} court jusqu'au ${params.expiresAtLabel}.`,
    "",
    ...(params.autoMessageBody ? [params.autoMessageBody, ""] : []),
    "Tarifs après la période gratuite :",
    ...plansBlock.text,
    "",
    `Gérer votre abonnement : ${params.subscriptionUrl}`,
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email} pour ${company}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateSubscriptionReminderEmail(params: {
  recipientName?: string;
  companyName: string;
  email: string;
  daysRemaining: number;
  expiresAtLabel: string;
  autoMessageTitle: string;
  autoMessageBody: string;
  plans: SubscriptionPlanOption[];
  paymentAccounts: PaymentAccountConfig[];
  subscriptionUrl: string;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();
  const days = Math.max(0, params.daysRemaining);

  const safeName = escapeEmailHtml(name);
  const safeCompany = escapeEmailHtml(company);
  const safeExpires = escapeEmailHtml(params.expiresAtLabel);
  const safeMsgTitle = escapeEmailHtml(params.autoMessageTitle);
  const safeMsgBody = escapeEmailHtml(params.autoMessageBody).replace(/\r?\n/g, "<br/>");

  const delayLabel =
    days === 0
      ? "aujourd'hui"
      : `dans ${days} jour${days > 1 ? "s" : ""}`;

  const plansBlock = renderPlansEmailBlock(params.plans);
  const accountsBlock = renderPaymentAccountsEmailBlock(params.paymentAccounts);

  const subject = `Rappel abonnement RKonekte — Votre forfait ${company} expire ${delayLabel}`;
  const preheader = `Votre abonnement ${company} arrive à échéance le ${params.expiresAtLabel} (${delayLabel}).`;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader,
    companyLabel: company,
    bodyHtml: `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">Le forfait de votre entreprise <strong>${safeCompany}</strong> expire <strong>${escapeEmailHtml(delayLabel)}</strong> (échéance le <strong>${safeExpires}</strong>).</p>
      <div style="margin: 0 0 16px 0; padding: 12px 16px; background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; color: #7c2d12; font-size: 13px;">
        <div style="font-weight: 700; margin-bottom: 4px;">${safeMsgTitle}</div>
        <div>${safeMsgBody}</div>
      </div>
      <p style="margin: 0 0 8px 0; font-weight: 700; color: #062653; font-size: 13px;">Durées et tarifs disponibles :</p>
      ${plansBlock.html}
      ${accountsBlock.html ? `<p style="margin: 0 0 8px 0; font-weight: 700; color: #062653; font-size: 13px;">Comptes disponibles pour le paiement :</p>${accountsBlock.html}` : ""}
    `,
    ctaLabel: "Choisir ma durée & envoyer ma référence",
    ctaUrl: params.subscriptionUrl,
    footerText: `E-mail de rappel envoyé à ${email} pour ${company} via RKonekte.`,
  });

  const text = [
    `Bonjour ${name},`,
    "",
    `Le forfait de votre entreprise ${company} expire ${delayLabel} (échéance le ${params.expiresAtLabel}).`,
    "",
    params.autoMessageTitle,
    params.autoMessageBody,
    "",
    "Durées et tarifs disponibles :",
    ...plansBlock.text,
    "",
    ...(accountsBlock.text.length > 0 ? ["Comptes disponibles pour le paiement :", ...accountsBlock.text, ""] : []),
    `Soumettre votre référence : ${params.subscriptionUrl}`,
    "",
    "--",
    `RKonekte — E-mail envoyé à ${email} pour ${company}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateSubscriptionDecisionEmail(params: {
  decision: "APPROVED" | "REJECTED";
  recipientName?: string;
  companyName: string;
  email: string;
  durationMonths: number;
  paymentMethod: string;
  paymentReference?: string | null;
  newExpiresAtLabel?: string;
  rejectionReason?: string;
  paymentAccounts?: PaymentAccountConfig[];
  actionUrl: string;
}): { subject: string; html: string; text: string } {
  const name = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const email = params.email.trim();

  const safeName = escapeEmailHtml(name);
  const safeCompany = escapeEmailHtml(company);
  const safeDuration = params.durationMonths === 12 ? "12 mois (1 an)" : `${params.durationMonths} mois`;
  const safeMethod = escapeEmailHtml(params.paymentMethod);
  const safeRef = params.paymentReference
    ? escapeEmailHtml(params.paymentReference)
    : "Preuve jointe";

  if (params.decision === "APPROVED") {
    const safeNewExp = escapeEmailHtml(params.newExpiresAtLabel || "");
    const subject = `Renouvellement confirmé (${safeDuration}) — ${company} | RKonekte`;
    const html = renderTransactionalEmailLayout({
      title: subject,
      preheader: `Votre abonnement ${company} a été prolongé jusqu'au ${params.newExpiresAtLabel || ""}.`,
      companyLabel: company,
      bodyHtml: `
        <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
        <p style="margin: 0 0 14px 0;">Votre paiement pour <strong>${safeCompany}</strong> a été vérifié et validé. Votre accès est désormais prolongé pour <strong>${escapeEmailHtml(safeDuration)}</strong>.</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
          <tr>
            <td style="padding: 12px 16px; font-size: 13px; color: #14532d;">
              <div>Durée validée : <strong>${escapeEmailHtml(safeDuration)}</strong></div>
              <div style="margin-top: 4px;">Méthode : <strong>${safeMethod}</strong> (Réf. ${safeRef})</div>
              <div style="margin-top: 4px;">Nouvelle date d'expiration : <strong>${safeNewExp}</strong></div>
            </td>
          </tr>
        </table>
      `,
      ctaLabel: "Accéder à RKonekte",
      ctaUrl: params.actionUrl,
      footerText: `Confirmation envoyée à ${email} pour ${company} via RKonekte.`,
    });

    const text = [
      `Bonjour ${name},`,
      "",
      `Votre paiement pour ${company} a été validé (${safeDuration}).`,
      `Méthode : ${params.paymentMethod} | Réf. : ${params.paymentReference || "—"}`,
      `Nouvelle date d'expiration : ${params.newExpiresAtLabel || ""}`,
      "",
      `Connexion : ${params.actionUrl}`,
    ].join("\n");

    return { subject, html, text };
  }

  const reason = (params.rejectionReason || "Référence non vérifiée sur le compte de réception.").trim();
  const safeReason = escapeEmailHtml(reason);
  const accountsBlock = params.paymentAccounts
    ? renderPaymentAccountsEmailBlock(params.paymentAccounts)
    : null;

  const subject = `Référence de paiement non validée — ${company} | RKonekte`;
  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: `Votre référence pour ${company} n'a pas pu être validée.`,
    companyLabel: company,
    bodyHtml: `
      <p style="margin: 0 0 14px 0; color: #0f172a; font-size: 15px;">Bonjour ${safeName},</p>
      <p style="margin: 0 0 14px 0;">La référence de paiement soumise pour <strong>${safeCompany}</strong> (${safeMethod} — Réf. <strong>${safeRef}</strong>) n'a pas pu être validée.</p>
      <div style="margin: 0 0 16px 0; padding: 12px 16px; background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; color: #881337; font-size: 13px;">
        <strong>Motif :</strong> ${safeReason}
      </div>
      ${accountsBlock ? `<p style="margin: 0 0 8px 0; font-weight: 700; color: #062653; font-size: 13px;">Comptes disponibles pour soumettre une nouvelle référence :</p>${accountsBlock.html}` : ""}
    `,
    ctaLabel: "Soumettre une nouvelle référence",
    ctaUrl: params.actionUrl,
    footerText: `Notification envoyée à ${email} pour ${company} via RKonekte.`,
  });

  const text = [
    `Bonjour ${name},`,
    "",
    `La référence soumise pour ${company} (${params.paymentMethod} - Réf. ${params.paymentReference || "—"}) n'a pas été validée.`,
    `Motif : ${reason}`,
    "",
    ...(accountsBlock ? ["Comptes disponibles :", ...accountsBlock.text, ""] : []),
    `Soumettre une nouvelle référence : ${params.actionUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateSuperAdminPaymentSubmittedEmail(params: {
  companyName: string;
  payerCompanyName?: string | null;
  submittedByName: string;
  submittedByEmail: string;
  durationMonths: number;
  amountLabel: string;
  paymentMethod: string;
  paymentReference?: string | null;
  proofFileName?: string | null;
  hasProof?: boolean;
  payerNote?: string | null;
  superAdminUrl: string;
}): { subject: string; html: string; text: string } {
  const safeCompany = escapeEmailHtml(params.companyName);
  const safePayerCompany = params.payerCompanyName ? escapeEmailHtml(params.payerCompanyName) : "";
  const safeSubmitter = escapeEmailHtml(params.submittedByName);
  const safeSubEmail = escapeEmailHtml(params.submittedByEmail);
  const safeDuration = params.durationMonths === 12 ? "12 mois (1 an)" : `${params.durationMonths} mois`;
  const safeAmount = escapeEmailHtml(params.amountLabel);
  const safeMethod = escapeEmailHtml(params.paymentMethod);
  const displayRef = params.paymentReference?.trim() || (params.hasProof ? "Preuve jointe" : "—");
  const safeRef = escapeEmailHtml(displayRef);
  const safeProofFile = params.proofFileName ? escapeEmailHtml(params.proofFileName) : "";
  const safeNote = params.payerNote ? escapeEmailHtml(params.payerNote) : "";

  const subject = `Nouveau paiement reçu (${params.companyName}) — ${params.paymentMethod}`;
  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: `${params.companyName} a transmis une preuve de paiement (${params.paymentMethod}) pour ${safeDuration}.`,
    companyLabel: "Super Administration",
    bodyHtml: `
      <p style="margin: 0 0 14px 0;">L'entreprise <strong>${safeCompany}</strong> vient de transmettre un justificatif de paiement pour vérification manuelle :</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #334155;">
            <div>Méthode : <strong>${safeMethod}</strong></div>
            <div style="margin-top: 4px;">Durée demandée : <strong>${escapeEmailHtml(safeDuration)}</strong> (${safeAmount})</div>
            ${params.hasProof ? `<div style="margin-top: 4px;">Preuve importée : <strong>${safeProofFile || "Fichier joint dans le panel"}</strong></div>` : ""}
            ${params.paymentReference?.trim() ? `<div style="margin-top: 4px;">Référence : <strong style="font-family: monospace;">${safeRef}</strong></div>` : ""}
            ${safePayerCompany ? `<div style="margin-top: 4px;">Entreprise indiquée : <strong>${safePayerCompany}</strong></div>` : ""}
            <div style="margin-top: 4px;">Soumis par : <strong>${safeSubmitter}</strong> (${safeSubEmail})</div>
            ${safeNote ? `<div style="margin-top: 4px;">Note / Téléphone : <strong>${safeNote}</strong></div>` : ""}
          </td>
        </tr>
      </table>
    `,
    ctaLabel: "Vérifier dans le panel SuperAdmin",
    ctaUrl: params.superAdminUrl,
    footerText: "Notification automatique destinée au Super-Administrateur RKonekte.",
  });

  const text = [
    `L'entreprise ${params.companyName} a transmis une preuve de paiement :`,
    `- Méthode : ${params.paymentMethod}`,
    `- Durée : ${safeDuration} (${params.amountLabel})`,
    ...(params.hasProof ? [`- Preuve jointe : ${params.proofFileName || "Disponible dans le panel SuperAdmin"}`] : []),
    ...(params.paymentReference?.trim() ? [`- Référence : ${params.paymentReference}`] : []),
    ...(params.payerCompanyName ? [`- Entreprise indiquée : ${params.payerCompanyName}`] : []),
    `- Soumis par : ${params.submittedByName} (${params.submittedByEmail})`,
    ...(params.payerNote ? [`- Note : ${params.payerNote}`] : []),
    "",
    `Vérifier dans le panel SuperAdmin : ${params.superAdminUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateSuperAdminBroadcastEmail(params: {
  recipientName?: string;
  companyName: string;
  subject: string;
  titleHeader?: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): { subject: string; html: string; text: string } {
  const recipient = (params.recipientName || "Responsable").trim();
  const company = (params.companyName || "Votre organisation").trim();
  const safeRecipient = escapeEmailHtml(recipient);
  const safeCompany = escapeEmailHtml(company);
  const subject = params.subject.trim();
  const title = (params.titleHeader || "Communication Officielle RKonekte").trim();
  const safeTitle = escapeEmailHtml(title);

  const formattedMessage = params.message
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const escaped = escapeEmailHtml(paragraph.trim()).replace(/\n/g, "<br />");
      return `<p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">${escaped}</p>`;
    })
    .join("\n");

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ff7900; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Notification Super-Administration</span>
      <h3 style="margin: 0; color: #062653; font-size: 16px; font-weight: 700;">${safeTitle}</h3>
    </div>
    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #0f172a;">Bonjour ${safeRecipient},</p>
    ${formattedMessage}
    <p style="margin: 18px 0 0 0; font-size: 12px; line-height: 1.5; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 12px;">
      Ce message officiel est transmis à l'attention de la direction de <strong>${safeCompany}</strong> par l'équipe de supervision RKonekte.
    </p>
  `;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: subject,
    bodyHtml,
    ctaLabel: params.ctaLabel?.trim() || undefined,
    ctaUrl: params.ctaUrl?.trim() || undefined,
    footerText: `Message officiel de supervision RKonekte adressé à ${safeCompany}.`,
  });

  const textLines = [
    `COMMUNICATION OFFICIELLE RKONEKTE - ${title}`,
    "",
    `Bonjour ${recipient},`,
    "",
    params.message.trim(),
    "",
    params.ctaUrl ? `${params.ctaLabel || "Accéder"} : ${params.ctaUrl}` : "",
    "",
    `Ce message officiel est transmis à l'attention de la direction de ${company} par l'équipe de supervision RKonekte.`,
  ].filter(Boolean);

  return {
    subject,
    html,
    text: textLines.join("\n"),
  };
}

export function generateRevenueSharingProposalEmail(params: {
  recipientName?: string;
  proposerName: string;
  proposerEmail: string;
  currentTechnoziPct: number;
  currentDeveloperPct: number;
  proposedTechnoziPct: number;
  proposedDeveloperPct: number;
  validationUrl: string;
  note?: string;
}): { subject: string; html: string; text: string } {
  const recipient = (params.recipientName || "Partenaire").trim();
  const safeRecipient = escapeEmailHtml(recipient);
  const safeProposer = escapeEmailHtml(params.proposerName);
  const safeProposerEmail = escapeEmailHtml(params.proposerEmail);
  const subject = `Proposition de révision du partage des revenus (${params.proposedTechnoziPct}% / ${params.proposedDeveloperPct}%)`;

  const safeNote = params.note
    ? `<div style="background-color: #f8fafc; border-left: 3px solid #ff7900; padding: 12px 14px; margin: 16px 0; border-radius: 4px;">
        <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; display: block; margin-bottom: 4px;">Note ou motif :</span>
        <p style="margin: 0; font-size: 13px; color: #1e293b; font-style: italic;">« ${escapeEmailHtml(params.note)} »</p>
      </div>`
    : "";

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ff7900; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">
        SuperAdmin • Consensus de Répartition
      </span>
      <h3 style="margin: 0; color: #062653; font-size: 18px; font-weight: 700;">
        Proposition de modification de la clé de répartition
      </h3>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #0f172a;">
      Bonjour <strong>${safeRecipient}</strong>,
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
      <strong>${safeProposer}</strong> (${safeProposerEmail}) vient de soumettre une proposition de révision du partage des revenus entre <strong>TECHNOZI</strong> et le <strong>Développeur</strong>.
    </p>

    <div style="background-color: #f1f5f9; border-radius: 12px; padding: 16px 18px; margin: 18px 0; border: 1px solid #e2e8f0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 1px solid #cbd5e1; text-align: left; color: #64748b;">
            <th style="padding-bottom: 8px; font-weight: 600;">Partie</th>
            <th style="padding-bottom: 8px; font-weight: 600;">Répartition actuelle</th>
            <th style="padding-bottom: 8px; font-weight: 700; color: #062653;">Nouvelle proposition</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; font-weight: 600; color: #062653;">TECHNOZI</td>
            <td style="padding: 10px 0; color: #64748b;">${params.currentTechnoziPct}%</td>
            <td style="padding: 10px 0; font-weight: 700; color: #0284c7; font-size: 15px;">${params.proposedTechnoziPct}%</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: 600; color: #062653;">Développeur</td>
            <td style="padding: 10px 0; color: #64748b;">${params.currentDeveloperPct}%</td>
            <td style="padding: 10px 0; font-weight: 700; color: #ea580c; font-size: 15px;">${params.proposedDeveloperPct}%</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${safeNote}

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
      Conformément aux règles de gestion de la plateforme, cette nouvelle répartition n'entrera en vigueur pour les futurs paiements que lorsque vous aurez cliqué sur <strong>Valider</strong> sur l'espace SuperAdmin.
    </p>

    <div style="background-color: #ecfdf5; border-left: 3px solid #10b981; padding: 10px 14px; margin: 16px 0; border-radius: 4px; font-size: 12px; color: #065f46;">
      <strong>Sécurité & Non-rétroactivité :</strong> Les commissions sur les transactions déjà encaissées restent inchangées.
    </div>
  `;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: `Proposition de répartition : TECHNOZI ${params.proposedTechnoziPct}% / Développeur ${params.proposedDeveloperPct}%`,
    bodyHtml,
    ctaLabel: "Accéder et Valider la répartition",
    ctaUrl: params.validationUrl,
    footerText: "Notification de sécurité RKonekte • Gestion du partage des revenus.",
  });

  const text = [
    "PROPOSITION DE RÉVISION DU PARTAGE DES REVENUS RKONEKTE",
    "",
    `Bonjour ${recipient},`,
    "",
    `${params.proposerName} (${params.proposerEmail}) a proposé une modification de la clé de répartition des revenus :`,
    `- Actuel : TECHNOZI ${params.currentTechnoziPct}% / Développeur ${params.currentDeveloperPct}%`,
    `- Proposé : TECHNOZI ${params.proposedTechnoziPct}% / Développeur ${params.proposedDeveloperPct}%`,
    ...(params.note ? [`Note : ${params.note}`] : []),
    "",
    `Pour examiner et valider cette modification, ouvrez ce lien :`,
    params.validationUrl,
    "",
    "Note de sécurité : Les transactions passées restent inchangées. La nouvelle clé s'appliquera uniquement aux prochains abonnements validés.",
  ].join("\n");

  return { subject, html, text };
}

export function generateRevenueSharingApprovedEmail(params: {
  validatorName: string;
  validatorEmail: string;
  newTechnoziPct: number;
  newDeveloperPct: number;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Confirmation : Nouvelle clé de répartition activée (${params.newTechnoziPct}% TECHNOZI / ${params.newDeveloperPct}% Développeur)`;

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #10b981; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">
        Partage des Revenus • Activé
      </span>
      <h3 style="margin: 0; color: #062653; font-size: 18px; font-weight: 700;">
        Nouvelle clé de répartition validée avec succès
      </h3>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #0f172a;">
      Bonjour,
    </p>

    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
      La proposition de révision du partage des revenus a été formellement validée par <strong>${escapeEmailHtml(params.validatorName)}</strong> (${escapeEmailHtml(params.validatorEmail)}).
    </p>

    <div style="background-color: #f0fdf4; border-radius: 12px; padding: 16px 18px; margin: 18px 0; border: 1px solid #bbf7d0; text-align: center;">
      <div style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 8px;">
        Nouvelle Clé Active
      </div>
      <div style="font-size: 24px; font-weight: 800; color: #062653;">
        TECHNOZI : <span style="color: #0284c7;">${params.newTechnoziPct}%</span> &nbsp;|&nbsp; Développeur : <span style="color: #ea580c;">${params.newDeveloperPct}%</span>
      </div>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 13px; line-height: 1.6; color: #475569;">
      Cette clé est immédiatement prise en compte pour tous les nouveaux paiements confirmés sur la plateforme.
    </p>
  `;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: subject,
    bodyHtml,
    ctaLabel: "Ouvrir le Tableau de Bord SuperAdmin",
    ctaUrl: params.dashboardUrl,
    footerText: "Notification de sécurité RKonekte • Gestion du partage des revenus.",
  });

  const text = [
    "CONFIRMATION : NOUVELLE CLÉ DE RÉPARTITION ACTIVÉE",
    "",
    `La proposition a été validée par ${params.validatorName} (${params.validatorEmail}).`,
    "",
    `Nouvelle répartition active :`,
    `- TECHNOZI : ${params.newTechnoziPct}%`,
    `- Développeur : ${params.newDeveloperPct}%`,
    "",
    `Accéder au tableau de bord : ${params.dashboardUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function generateAdministrativeDocumentNotificationEmail(params: {
  recipientName: string;
  senderName: string;
  companyName: string;
  documentNames: string[];
  transmissionDate: string;
  viewUrl: string;
}): { subject: string; html: string; text: string } {
  const recipient = (params.recipientName || "Administrateur").trim();
  const sender = (params.senderName || "Un administrateur").trim();
  const company = (params.companyName || "Votre entreprise").trim();
  const docCount = params.documentNames.length;
  const isMultiple = docCount > 1;

  const subject = `[${company}] ${sender} vous a transmis ${
    isMultiple ? `${docCount} documents administratifs` : `un document administratif`
  }`;

  const docListHtml = params.documentNames
    .map(
      (name) =>
        `<li style="padding: 6px 0; font-size: 13px; color: #062653; font-weight: 600;">
          📄 ${escapeEmailHtml(name)}
        </li>`
    )
    .join("");

  const bodyHtml = `
    <div style="margin-bottom: 16px;">
      <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #ff7900; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">
        Échanges Administratifs • Transmission Sécurisée
      </span>
      <h3 style="margin: 0; color: #062653; font-size: 16px; font-weight: 700;">
        Nouveau${isMultiple ? "x documents administratifs reçus" : " document administratif reçu"}
      </h3>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #0f172a;">
      Bonjour <strong>${escapeEmailHtml(recipient)}</strong>,
    </p>

    <p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.6; color: #334155;">
      <strong>${escapeEmailHtml(sender)}</strong> vous a transmis ${
        isMultiple ? `les ${docCount} documents administratifs suivants` : `le document administratif suivant`
      } au sein de votre espace <strong>${escapeEmailHtml(company)}</strong> :
    </p>

    <div style="border-radius: 10px; padding: 14px 18px; margin: 16px 0; border: 1px solid #e2e8f0;">
      <ul style="margin: 0; padding-left: 18px; list-style-type: none;">
        ${docListHtml}
      </ul>
      <div style="margin-top: 10px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        Date de transmission : <strong>${escapeEmailHtml(params.transmissionDate)}</strong>
      </div>
    </div>

    <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.5; color: #475569;">
      Cliquez sur le bouton ci-dessous pour accéder directement à votre espace et consulter le document :
    </p>
  `;

  const html = renderTransactionalEmailLayout({
    title: subject,
    preheader: `${sender} vous a transmis un document sur RKonekte.`,
    bodyHtml,
    ctaLabel: "Consulter le document sur RKonekte",
    ctaUrl: params.viewUrl,
    footerText: `Transmission administrative interne réservée aux administrateurs de ${company}.`,
  });

  const text = [
    `TRANSMISSION DE DOCUMENT ADMINISTRATIF — ${company}`,
    "",
    `Bonjour ${recipient},`,
    "",
    `${sender} vous a transmis le(s) document(s) suivant(s) :`,
    ...params.documentNames.map((name) => `- ${name}`),
    "",
    `Date de transmission : ${params.transmissionDate}`,
    "",
    `Consulter le document sur RKonekte : ${params.viewUrl}`,
  ].join("\n");

  return { subject, html, text };
}
