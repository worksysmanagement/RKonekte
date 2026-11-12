import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { deleteCompanyEvent } from "@/lib/services/events";
import { listEmployees } from "@/lib/services/employees";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const { id } = await context.params;

    let employeeId: string | null = null;
    let employeeNumber: string | null = null;
    try {
      const emps = await listEmployees(organizationId);
      const norm = (user.email || "").toLowerCase().trim();
      const matched = norm
        ? emps.find((e) => (e.email || "").toLowerCase().trim() === norm)
        : undefined;
      if (matched) {
        employeeId = matched.id;
        employeeNumber = matched.employeeNumber;
      }
    } catch (_) {}

    const res = await deleteCompanyEvent(organizationId, id, {
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      employeeId,
      employeeNumber,
      branchId: user.branchId || null,
    });

    if (!res.deleted) {
      return NextResponse.json(
        { error: res.error || "Impossible de supprimer cet événement." },
        { status: res.error?.includes("autorisé") ? 403 : 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
