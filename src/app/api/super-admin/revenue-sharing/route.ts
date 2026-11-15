import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import {
  getActiveRevenueSharingConfig,
  updateRevenueSharingParties,
  createRevenueSharingProposal,
  listRevenueSharingProposals,
  getRevenueSharingMetrics,
} from "@/lib/services/revenue-sharing";
import { listSuperAdmins } from "@/lib/services/super-admins";

export async function GET() {
  try {
    await requireSuperAdmin();

    const [config, proposals, metrics, superAdmins] = await Promise.all([
      getActiveRevenueSharingConfig(),
      listRevenueSharingProposals(),
      getRevenueSharingMetrics(),
      listSuperAdmins().catch(() => []),
    ]);

    const pendingProposal = proposals.find((p) => p.status === "PENDING") || null;

    return NextResponse.json({
      config,
      pendingProposal,
      proposals,
      metrics,
      superAdmins: superAdmins.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        status: a.status,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json();

    const { proposedTechnoziPct, proposedDeveloperPct, targetEmail, note } = body;

    const originUrl = req.nextUrl?.origin;

    const proposal = await createRevenueSharingProposal(
      {
        proposedTechnoziPct: Number(proposedTechnoziPct),
        proposedDeveloperPct: Number(proposedDeveloperPct),
        targetEmail,
        note,
        originUrl,
      },
      {
        id: session.id,
        name: session.name || "Super Administrateur",
        email: session.email || "",
      }
    );

    return NextResponse.json({
      success: true,
      message: `Votre proposition (${proposal.proposedTechnoziPct}% TECHNOZI / ${proposal.proposedDeveloperPct}% Développeur) a été enregistrée et transmise par e-mail à ${proposal.targetEmail} pour validation.`,
      proposal,
    }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Impossible de soumettre la proposition." },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json();

    const updatedConfig = await updateRevenueSharingParties(
      {
        directorEmail: body.directorEmail,
        directorName: body.directorName,
        developerEmail: body.developerEmail,
        developerName: body.developerName,
      },
      {
        id: session.id,
        name: session.name || "Super Administrateur",
      }
    );

    return NextResponse.json({
      success: true,
      message: "Coordonnées des parties enregistrées avec succès.",
      config: updatedConfig,
    });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Erreur de mise à jour des parties." },
      { status: 400 }
    );
  }
}
