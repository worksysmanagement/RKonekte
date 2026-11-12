import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  updateSignatureAuthRequest,
  deleteSignatureAuthRequest,
} from "@/lib/services/signature-auth";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireTenantUser();
    const { id } = await context.params;
    const body = await req.json();

    const updates: any = {};
    if (body.status) {
      updates.status = body.status;
    }
    if (body.authorizedBy) {
      updates.authorizedBy = body.authorizedBy;
    } else if (body.status === "APPROVED") {
      updates.authorizedBy = user.name || "Direction Générale";
    }
    if (body.authorizedRole) {
      updates.authorizedRole = body.authorizedRole;
    } else if (body.status === "APPROVED") {
      updates.authorizedRole = user.role || "Direction Générale";
    }
    if (body.authorizedAt) {
      updates.authorizedAt = body.authorizedAt;
    } else if (body.status === "APPROVED") {
      updates.authorizedAt = new Date().toISOString().split("T")[0];
    }
    if (body.signatureUrl) {
      updates.signatureUrl = body.signatureUrl;
    }
    if (body.pdfUrl) {
      updates.pdfUrl = body.pdfUrl;
    }

    const updated = await updateSignatureAuthRequest(id, updates);
    if (!updated) {
      return NextResponse.json(
        { error: "Demande de signature introuvable." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireTenantUser();
    const { id } = await context.params;

    const ok = await deleteSignatureAuthRequest(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Demande de signature introuvable ou déjà supprimée." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Demande supprimée avec succès." });
  } catch (err) {
    return handleApiError(err);
  }
}
