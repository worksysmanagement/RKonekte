import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { validateRevenueSharingProposal } from "@/lib/services/revenue-sharing";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json();

    const { proposalId, action, token, rejectionReason } = body;

    if (!proposalId) {
      return NextResponse.json(
        { error: "Identifiant de la proposition requis." },
        { status: 400 }
      );
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: "Action invalide. Utilisez APPROVE ou REJECT." },
        { status: 400 }
      );
    }

    const originUrl = req.nextUrl?.origin;

    const result = await validateRevenueSharingProposal(
      {
        proposalId,
        action,
        token,
        rejectionReason,
        originUrl,
      },
      {
        id: session.id,
        name: session.name || "Super Administrateur",
        email: session.email || "",
      }
    );

    const message =
      action === "APPROVE"
        ? `La nouvelle répartition (${result.proposedTechnoziPct}% TECHNOZI / ${result.proposedDeveloperPct}% Développeur) a été validée avec succès et entre immédiatement en vigueur !`
        : "La proposition de révision a été rejetée.";

    return NextResponse.json({
      success: true,
      message,
      proposal: result,
    });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Impossible de traiter la validation." },
      { status: 400 }
    );
  }
}
