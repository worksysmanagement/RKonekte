import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { updateRubrique, deleteRubrique } from "@/lib/services/cash-registers";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const { id } = await context.params;

    const isAdmin =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORGANIZATION_ADMIN" ||
      user.role === "FINANCIAL_MANAGER" ||
      user.role?.toLowerCase().includes("admin") ||
      user.role?.toLowerCase().includes("directeur") ||
      user.role?.toLowerCase().includes("propriétaire") ||
      user.role?.toLowerCase().includes("pdg");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updated = await updateRubrique(organizationId, id, {
      name: body.name,
      currency: body.currency,
      isActive: body.isActive,
      orderIndex: body.orderIndex,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Rubrique introuvable." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, rubrique: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const { id } = await context.params;

    const isAdmin =
      user.role === "SUPER_ADMIN" ||
      user.role === "ORGANIZATION_ADMIN" ||
      user.role === "FINANCIAL_MANAGER" ||
      user.role?.toLowerCase().includes("admin") ||
      user.role?.toLowerCase().includes("directeur") ||
      user.role?.toLowerCase().includes("propriétaire") ||
      user.role?.toLowerCase().includes("pdg");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const deleted = await deleteRubrique(organizationId, id);
    return NextResponse.json({ success: deleted });
  } catch (err) {
    return handleApiError(err);
  }
}
