import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { getLeaveRequestById, deleteLeaveRequest } from "@/lib/services/leave-requests";
import { getAuditLogsForRequest } from "@/lib/services/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireTenantUser();
    const { id } = await params;

    const request = await getLeaveRequestById(id, organizationId);
    if (!request) {
      return NextResponse.json({ error: "Demande de congé introuvable" }, { status: 404 });
    }

    const { auditLogs, notifications } = await getAuditLogsForRequest(id, organizationId);

    return NextResponse.json({
      request,
      auditLogs,
      notifications,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const result = await deleteLeaveRequest(id, organizationId, user.id, user.name);
    return NextResponse.json({
      success: true,
      actionTaken: result.actionTaken,
      message:
        result.actionTaken === "ARCHIVED_FOR_ADMIN"
          ? "Demande retirée de l'espace administration (restée approuvée pour le collaborateur)."
          : "Demande supprimée et enregistrée comme refusée pour le collaborateur.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
