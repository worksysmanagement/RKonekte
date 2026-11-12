/**
 * WhatsApp utilities supporting both:
 * 1. Direct 1-Click WhatsApp Links (https://wa.me/) - 100% free, zero Meta setup needed, opens native app
 * 2. WhatsApp Business Cloud API (Optional background automated sending)
 */

export function formatWhatsAppPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/**
 * Generates a direct WhatsApp link (wa.me) with pre-filled encoded text.
 * Opens WhatsApp Mobile or WhatsApp Web directly on the user's device.
 */
export function generateWhatsAppDirectLink(phone: string, text: string): string {
  const cleanedPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${cleanedPhone}?text=${encodedText}`;
}

export function buildWhatsAppApprovalMessage(params: {
  employeeFirstName: string;
  requestNumber: string;
  startDate: string;
  endDate: string;
  viewUrl: string;
}): string {
  return `Bonjour ${params.employeeFirstName},

Votre demande de congé ${params.requestNumber} a été APPROUVÉE.

Date de début :
${params.startDate}

Date de fin :
${params.endDate}

Consulter votre demande :
${params.viewUrl}`;
}

export function buildWhatsAppRejectionMessage(params: {
  employeeFirstName: string;
  requestNumber: string;
  rejectionReason: string;
  viewUrl: string;
}): string {
  return `Bonjour ${params.employeeFirstName},

Votre demande de congé ${params.requestNumber} a été REFUSÉE.

Motif :
${params.rejectionReason}

Consulter votre demande :
${params.viewUrl}`;
}

export function buildWhatsAppNewSubmissionMessage(params: {
  employeeName: string;
  requestNumber: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  leaveType: string;
  viewUrl: string;
}): string {
  return `Bonjour,

Nouvelle demande de congé soumise :
- Numéro : ${params.requestNumber}
- Employé : ${params.employeeName}
- Type : ${params.leaveType}
- Période : Du ${params.startDate} au ${params.endDate} (${params.requestedDays} jour(s))

Lien de consultation :
${params.viewUrl}`;
}

export function buildWhatsAppSalaryRevisionMessage(params: {
  employeeFirstName: string;
  reference: string;
  previousSalary: string;
  newSalary: string;
  currency: string;
  effectiveDate: string;
  reason?: string;
  companyName?: string;
  branchName?: string;
}): string {
  const company = params.companyName || "e-biznis";
  return `Bonjour ${params.employeeFirstName},

Excellente nouvelle ! Votre rémunération au sein de l'entreprise *${company}* a été revalorisée par la direction.

Détails de la revalorisation (${params.reference}) :
• Entreprise : ${company}${params.branchName ? `\n• Succursale : ${params.branchName}` : ""}
• Ancien salaire : ${params.previousSalary} ${params.currency}
• Nouveau salaire : ${params.newSalary} ${params.currency}
• Date d'effet : ${params.effectiveDate}${params.reason ? `\n• Motif : ${params.reason}` : ""}

📄 Votre document officiel signé (Notification de Revalorisation Salariale) émis par la Direction de ${company} a été enregistré dans votre dossier.

Félicitations et merci pour votre dévouement et votre engagement au quotidien au sein de l'équipe ${company} !`;
}

/**
 * Optional Cloud API sender (if configured)
 */
export async function sendWhatsAppMessage({
  toPhone,
  messageText,
}: {
  toPhone: string;
  messageText: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId || accessToken.startsWith("EAAG...")) {
    // Cloud API not configured, fallback to simulation mode
    console.log(`[WHATSAPP LINK READY] To: ${toPhone}\nBody:\n${messageText}`);
    return { success: true, messageId: `link-wa-${Date.now()}` };
  }

  const recipient = formatWhatsAppPhone(toPhone);

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: {
          preview_url: true,
          body: messageText,
        },
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || `WhatsApp API error (${res.status})`,
      };
    }

    return { success: true, messageId: data?.messages?.[0]?.id || `wa-${Date.now()}` };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur réseau WhatsApp" };
  }
}
