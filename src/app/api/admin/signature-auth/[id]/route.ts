import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/auth/guard";
import {
  updateSignatureAuthRequest,
  deleteSignatureAuthRequest,
} from "@/lib/services/signature-auth";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await requireAuth();
    const roleLower = (session.role || "").toLowerCase();
    if (
      roleLower.includes("employ") ||
      roleLower.includes("collab") ||
      roleLower.includes("caissier") ||
      roleLower.includes("cashier")
    ) {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs." },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams?.id ? decodeURIComponent(resolvedParams.id) : "";
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }
    const body = await req.json();

    const updates: any = {};
    if (body.status) {
      updates.status = body.status;
    }
    if (body.authorizedBy) {
      updates.authorizedBy = body.authorizedBy;
    } else if (body.status === "APPROVED") {
      updates.authorizedBy = session.name || "Direction Générale";
    }
    if (body.authorizedRole) {
      updates.authorizedRole = body.authorizedRole;
    } else if (body.status === "APPROVED") {
      updates.authorizedRole = session.role || "Direction Générale";
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
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await requireAuth();
    const roleLower = (session.role || "").toLowerCase();
    if (
      roleLower.includes("employ") ||
      roleLower.includes("collab") ||
      roleLower.includes("caissier") ||
      roleLower.includes("cashier")
    ) {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs." },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams?.id ? decodeURIComponent(resolvedParams.id) : "";

    if (id) {
      await deleteSignatureAuthRequest(id);
    }

    return NextResponse.json({ success: true, message: "Demande supprimée avec succès." });
  } catch (err) {
    return handleApiError(err);
  }
}
