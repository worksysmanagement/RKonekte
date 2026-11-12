import { NextRequest, NextResponse } from "next/server";
import {
  clearStoppedNoticeCookie,
  getStoppedNoticeFromCookies,
} from "@/lib/auth/session";
import { resolveAppOrigin } from "@/lib/notifications/email";
import {
  cancelPendingSubscriptionReference,
  submitSubscriptionPaymentReference,
} from "@/lib/services/subscriptions";
import { buildStoppedClientContext } from "@/lib/services/stopped-context";

export async function POST(req: NextRequest) {
  try {
    const notice = await getStoppedNoticeFromCookies();
    if (!notice || !notice.isAdmin) {
      return NextResponse.json(
        {
          error:
            "Session de paiement expirée ou non autorisée. Veuillez saisir vos identifiants administrateur.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const origin = resolveAppOrigin(req.headers);

    const renewal = await submitSubscriptionPaymentReference({
      organizationId: notice.organizationId,
      durationMonths: Number(body.durationMonths || 1),
      paymentMethod: String(body.paymentMethod || ""),
      paymentReference: body.paymentReference ? String(body.paymentReference) : null,
      payerCompanyName: body.payerCompanyName ? String(body.payerCompanyName) : null,
      payerNote: body.payerNote ? String(body.payerNote) : null,
      proofDataUrl: body.proofDataUrl ? String(body.proofDataUrl) : null,
      proofFileName: body.proofFileName ? String(body.proofFileName) : null,
      userId: notice.userId,
      userName: notice.userName,
      userEmail: notice.userEmail,
      replacePending: Boolean(body.replacePending),
      origin,
    });

    await clearStoppedNoticeCookie();

    return NextResponse.json({
      success: true,
      message:
        "Votre preuve de paiement a bien été envoyée pour vérification. Votre accès sera réactivé dès validation.",
      renewal,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Impossible d'enregistrer votre référence." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    const notice = await getStoppedNoticeFromCookies();
    if (!notice || !notice.isAdmin) {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    await cancelPendingSubscriptionReference(notice.organizationId);
    const stoppedContext = await buildStoppedClientContext(notice);
    return NextResponse.json({ success: true, stoppedContext });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Impossible d'annuler la référence." },
      { status: 400 }
    );
  }
}
