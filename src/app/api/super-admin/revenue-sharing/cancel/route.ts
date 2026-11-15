import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { cancelRevenueSharingProposal } from "@/lib/services/revenue-sharing";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json();

    const { proposalId } = body;
    if (!proposalId) {
      return NextResponse.json(
        { error: "Identifiant de la proposition requis." },
        { status: 400 }
      );
    }

    await cancelRevenueSharingProposal(proposalId, session.id);

    return NextResponse.json({
      success: true,
      message: "La proposition a été annulée.",
    });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Impossible d'annuler la proposition." },
      { status: 400 }
    );
  }
}
