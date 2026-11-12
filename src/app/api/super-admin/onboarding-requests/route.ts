import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import {
  listPendingOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
} from "@/lib/services/organizations";
import { resolveAppOrigin } from "@/lib/notifications/email";

export async function GET() {
  try {
    await requireSuperAdmin();
    const requests = await listPendingOnboardingRequests();
    return NextResponse.json({ requests });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();
    const { organizationId, action, reason } = body;

    if (!organizationId || !action) {
      return NextResponse.json(
        { error: "L'identifiant de l'organisation et l'action sont obligatoires." },
        { status: 400 }
      );
    }

    if (action === "APPROVE") {
      const origin = resolveAppOrigin(req.headers);

      const result = await approveOnboardingRequest(organizationId, origin);
      return NextResponse.json({
        success: true,
        message: "Demande approuvée. L'entreprise est désormais active sur la plateforme.",
        credentials: result.credentials,
      });
    }

    if (action === "REJECT") {
      await rejectOnboardingRequest(organizationId, reason || "Dossier non conforme");
      return NextResponse.json({
        success: true,
        message: "Demande rejetée et supprimée.",
      });
    }

    return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
