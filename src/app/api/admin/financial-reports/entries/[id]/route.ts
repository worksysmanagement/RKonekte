import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  deleteDailyEntry,
  updateDailyEntryById,
  listDailyEntries,
} from "@/lib/services/cash-registers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireTenantUser();
    const { id } = await params;

    const entries = await listDailyEntries(organizationId);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return NextResponse.json({ error: "Écriture introuvable" }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const { id } = await params;
    const body = await req.json();

    const isCashier =
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    // Only administrators or the user who owns the entry can edit it
    const entries = await listDailyEntries(organizationId);
    const existing = entries.find((e) => e.id === id);
    if (!existing) {
      return NextResponse.json({ error: "Écriture introuvable" }, { status: 404 });
    }

    if (isCashier && existing.cashierId !== user.id) {
      return NextResponse.json(
        { error: "Vous n'avez pas l'autorisation de modifier cette journée." },
        { status: 403 }
      );
    }

    const updated = await updateDailyEntryById(organizationId, id, {
      amounts: body.amounts,
      notes: body.notes,
      entryDate: body.entryDate,
    });

    return NextResponse.json({ success: true, entry: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const { id } = await params;

    const isCashier =
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    if (isCashier) {
      return NextResponse.json(
        { error: "Seul un administrateur peut supprimer une journée de caisse enregistrée." },
        { status: 403 }
      );
    }

    await deleteDailyEntry(organizationId, id);
    return NextResponse.json({
      success: true,
      message: "Journée de caisse supprimée avec succès. Les montants ont été déduits de la base.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
