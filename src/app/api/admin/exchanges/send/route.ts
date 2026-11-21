import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import {
  transmitAdministrativeDocuments,
  isUserAdminRole,
  FilePayload,
} from "@/lib/services/administrative-exchanges";
import { resolveAppOrigin } from "@/lib/notifications/email";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();

    if (!isUserAdminRole(user.role)) {
      return NextResponse.json(
        { error: "Ce module est exclusivement réservé aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const recipientIdsRaw = formData.getAll("recipientIds");
    const recipientIds: string[] = recipientIdsRaw
      .map((r) => String(r).trim())
      .filter((r) => r.length > 0);

    const filesRaw = formData.getAll("files");
    if (!filesRaw || filesRaw.length === 0) {
      return NextResponse.json(
        { error: "Veuillez joindre au moins un fichier à transmettre." },
        { status: 400 }
      );
    }

    const files: FilePayload[] = [];
    for (const item of filesRaw) {
      if (item && typeof item === "object" && "arrayBuffer" in item) {
        const fileObj = item as File;
        const arrayBuf = await fileObj.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        files.push({
          originalName: fileObj.name,
          mimeType: fileObj.type || "application/octet-stream",
          buffer,
        });
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier valide n'a pu être traité." },
        { status: 400 }
      );
    }

    const appOrigin = resolveAppOrigin(req.headers);
    const result = await transmitAdministrativeDocuments({
      organizationId,
      senderUser: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      recipientIds,
      files,
      companyName: "RKonekte",
      appOrigin,
    });

    return NextResponse.json({
      success: true,
      message: `${result.count} document(s) administratif(s) transmis avec succès.`,
      batchId: result.batchId,
      count: result.count,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    console.error("Transmitting administrative documents error:", error);
    return NextResponse.json(
      { error: error?.message || "Une erreur est survenue lors de la transmission." },
      { status: 400 }
    );
  }
}
