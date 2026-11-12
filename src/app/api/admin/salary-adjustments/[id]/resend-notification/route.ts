import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { resendSalaryNotification } from "@/lib/services/salary-adjustments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isEmployee) {
      return NextResponse.json(
        { error: "Action non autorisée." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const channel = (body.channel as "whatsapp" | "email" | "both") || "both";

    const res = await resendSalaryNotification(organizationId, id, channel);
    if (!res.success) {
      return NextResponse.json({ error: res.error || "Échec de renvoi." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      whatsappSent: res.whatsappSent,
      emailSent: res.emailSent,
      whatsappDirectUrl: res.whatsappDirectUrl,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
