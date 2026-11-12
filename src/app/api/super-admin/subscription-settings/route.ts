import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSuperAdmin } from "@/lib/auth/guard";
import {
  getPlatformSubscriptionSettings,
  updatePlatformSubscriptionSettings,
} from "@/lib/services/subscriptions";
import { buildSubscriptionPlans } from "@/lib/utils/subscription";

export async function GET() {
  try {
    await requireSuperAdmin();
    const settings = await getPlatformSubscriptionSettings();
    const plans = buildSubscriptionPlans(settings);
    return NextResponse.json({ settings, plans });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const settings = await updatePlatformSubscriptionSettings({
      trialMonths: body.trialMonths,
      currency: body.currency,
      priceMonthly: body.priceMonthly,
      priceQuarterly: body.priceQuarterly,
      priceSemiannual: body.priceSemiannual,
      priceAnnual: body.priceAnnual,
      discountQuarterlyPct: body.discountQuarterlyPct,
      discountSemiannualPct: body.discountSemiannualPct,
      discountAnnualPct: body.discountAnnualPct,
      paymentAccounts: body.paymentAccounts,
      autoMessageTitle: body.autoMessageTitle,
      autoMessageBody: body.autoMessageBody,
      superAdminAlertEmail: body.superAdminAlertEmail,
    });
    const plans = buildSubscriptionPlans(settings);
    return NextResponse.json({
      success: true,
      message: "Paramètres d'abonnement et comptes de paiement enregistrés.",
      settings,
      plans,
    });
  } catch (err: any) {
    if (err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Impossible de sauvegarder les paramètres." },
      { status: 400 }
    );
  }
}
