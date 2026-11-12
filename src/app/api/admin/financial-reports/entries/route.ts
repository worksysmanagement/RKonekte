import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listDailyEntries,
  getDailyEntry,
  saveDailyEntry,
} from "@/lib/services/cash-registers";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const url = new URL(req.url);

    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const date = url.searchParams.get("date") || undefined;
    const cashierIdParam = url.searchParams.get("cashierId") || undefined;
    const branchId = url.searchParams.get("branchId") || undefined;

    const isCashier =
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    // If query requests a single day for a specific cashier (or current cashier)
    if (date && cashierIdParam) {
      const single = await getDailyEntry(organizationId, cashierIdParam, date);
      return NextResponse.json({ entry: single });
    }

    if (date && isCashier && !cashierIdParam) {
      const single = await getDailyEntry(organizationId, user.id, date);
      return NextResponse.json({ entry: single });
    }

    // List entries with filters
    const entries = await listDailyEntries(organizationId, {
      startDate: startDate || date,
      endDate: endDate || date,
      cashierId: isCashier && !cashierIdParam ? user.id : cashierIdParam,
      branchId,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId, branchId } = await requireTenantUser();
    const body = await req.json();

    if (!body.entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)) {
      return NextResponse.json(
        { error: "La date au format YYYY-MM-DD est obligatoire." },
        { status: 400 }
      );
    }

    const isCashier =
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    // Identify cashier
    const targetCashierId = (!isCashier && body.cashierId) ? body.cashierId : user.id;
    const targetCashierName = (!isCashier && body.cashierName) ? body.cashierName : (user.name || "Caissier");
    let targetBranchId = body.branchId || branchId || user.branchId || null;

    let targetCashierMatricule = body.cashierMatricule || null;

    // If branchId or cashierMatricule is not yet resolved, query users & employees table for the cashier
    if ((!targetBranchId || !targetCashierMatricule) && targetCashierId) {
      try {
        const { getSupabaseAdminClient } = await import("@/lib/supabase/server");
        const supabase = getSupabaseAdminClient();
        const { data: uData } = await supabase
          .from("users")
          .select("branch_id, email, name")
          .eq("id", targetCashierId)
          .maybeSingle();
        if (uData?.branch_id && !targetBranchId) {
          targetBranchId = uData.branch_id;
        }

        const lookupEmail = (uData?.email || user.email || "").toLowerCase().trim();
        if (lookupEmail) {
          const { data: empData } = await supabase
            .from("employees")
            .select("branch_id, employee_number")
            .eq("organization_id", organizationId)
            .ilike("email", lookupEmail)
            .maybeSingle();
          if (empData?.branch_id && !targetBranchId) {
            targetBranchId = empData.branch_id;
          }
          if (empData?.employee_number && !targetCashierMatricule) {
            targetCashierMatricule = empData.employee_number;
          }
        }
      } catch (_) {}
    }

    const saved = await saveDailyEntry(organizationId, {
      cashierId: targetCashierId,
      cashierName: targetCashierName,
      cashierMatricule: targetCashierMatricule,
      branchId: targetBranchId,
      entryDate: body.entryDate,
      amounts: body.amounts || {},
      notes: body.notes || null,
    });

    return NextResponse.json({ success: true, entry: saved });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Paramètre id manquant" }, { status: 400 });
    }

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

    const { deleteDailyEntry } = await import("@/lib/services/cash-registers");
    await deleteDailyEntry(organizationId, id);

    return NextResponse.json({
      success: true,
      message: "Journée de caisse supprimée avec succès. Les montants ont été déduits de la base.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
