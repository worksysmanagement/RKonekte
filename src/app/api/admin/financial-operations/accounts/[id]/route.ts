import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  updateBankAccount,
  deleteBankAccount,
} from "@/lib/services/bank-operations";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    const body = await req.json();
    const updated = await updateBankAccount(organizationId, id, body);

    if (!updated) {
      return NextResponse.json({ error: "Compte bancaire introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true, account: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    const success = await deleteBankAccount(organizationId, id);
    if (!success) {
      return NextResponse.json({ error: "Compte bancaire introuvable." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Compte bancaire supprimé." });
  } catch (err) {
    return handleApiError(err);
  }
}
