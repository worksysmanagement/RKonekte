import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import {
  getDocumentFileBuffer,
  isUserAdminRole,
} from "@/lib/services/administrative-exchanges";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();

    if (!isUserAdminRole(user.role)) {
      return NextResponse.json(
        { error: "Ce module est exclusivement réservé aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "download";

    const { buffer, fileName, fileType, fileSize } = await getDocumentFileBuffer(
      id,
      user.id,
      organizationId,
      { isViewAction: action === "preview" }
    );

    const disposition = action === "preview" ? "inline" : "attachment";
    const encodedFileName = encodeURIComponent(fileName);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": fileType || "application/octet-stream",
        "Content-Length": fileSize.toString(),
        "Content-Disposition": `${disposition}; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return NextResponse.json(
      { error: error?.message || "Erreur lors de l'accès au document." },
      { status: 400 }
    );
  }
}
