import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listBankTransactions,
  createBankTransaction,
} from "@/lib/services/bank-operations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json(
        { error: "Accès non autorisé. Module réservé à l'administration." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as "DEPOSIT" | "WITHDRAWAL" | "ALL" | null;
    const bankAccountId = searchParams.get("bankAccountId") || undefined;
    const branchId = searchParams.get("branchId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const transactions = await listBankTransactions(organizationId, {
      type: type || undefined,
      bankAccountId,
      branchId,
      startDate,
      endDate,
    });

    return NextResponse.json(
      { success: true, transactions },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json(
        { error: "Action non autorisée. Réservé à l'administration." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.type || (body.type !== "DEPOSIT" && body.type !== "WITHDRAWAL")) {
      return NextResponse.json(
        { error: "Le type d'opération (DEPOSIT ou WITHDRAWAL) est obligatoire." },
        { status: 400 }
      );
    }

    if (!body.bankAccountId) {
      return NextResponse.json(
        { error: "Veuillez sélectionner le compte bancaire concerné." },
        { status: 400 }
      );
    }

    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Le montant doit être un nombre supérieur à 0." },
        { status: 400 }
      );
    }

    let resolvedAuthorMatricule =
      typeof body.authorMatricule === "string" ? body.authorMatricule.trim() : "";

    if (!resolvedAuthorMatricule) {
      const targetAuthorName =
        typeof body.authorName === "string" && body.authorName.trim()
          ? body.authorName.trim().toLowerCase()
          : (user.name || "").trim().toLowerCase();
      const targetEmail = (user.email || "").trim().toLowerCase();

      // 1. Try Supabase employees lookup
      try {
        const { getSupabaseAdminClient } = await import("@/lib/supabase/server");
        const supabase = getSupabaseAdminClient();
        const { data: orgEmps } = await supabase
          .from("employees")
          .select("employee_number, email, first_name, last_name")
          .eq("organization_id", organizationId);
        if (Array.isArray(orgEmps)) {
          const matchedByEmail = targetEmail
            ? orgEmps.find(
                (e: any) =>
                  e.email && e.email.toLowerCase().trim() === targetEmail
              )
            : null;
          const matchedByName = !matchedByEmail && targetAuthorName
            ? orgEmps.find(
                (e: any) =>
                  `${e.first_name || ""} ${e.last_name || ""}`
                    .trim()
                    .toLowerCase() === targetAuthorName
              )
            : null;
          const hit = matchedByEmail || matchedByName;
          if (hit?.employee_number) {
            resolvedAuthorMatricule = hit.employee_number;
          }
        }
      } catch (_) {}

      // 2. Fallback SQLite employees lookup
      if (!resolvedAuthorMatricule) {
        try {
          const { getDb } = await import("@/lib/db/client");
          const { employees } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");
          const db = getDb();
          const orgEmps = await db
            .select()
            .from(employees)
            .where(eq(employees.organizationId, organizationId));
          const matchedByEmail = targetEmail
            ? orgEmps.find(
                (e) => e.email && e.email.toLowerCase().trim() === targetEmail
              )
            : null;
          const matchedByName = !matchedByEmail && targetAuthorName
            ? orgEmps.find(
                (e) =>
                  `${e.firstName || ""} ${e.lastName || ""}`
                    .trim()
                    .toLowerCase() === targetAuthorName
              )
            : null;
          const hit = matchedByEmail || matchedByName;
          if (hit?.employeeNumber) {
            resolvedAuthorMatricule = hit.employeeNumber;
          }
        } catch (_) {}
      }

      // 3. Deterministic fallback identifier by role for admins/managers without employee fiche
      if (!resolvedAuthorMatricule) {
        const role = (user.role || "").toUpperCase();
        if (role === "ORGANIZATION_ADMIN" || role === "SUPER_ADMIN") {
          resolvedAuthorMatricule = "ADM-001";
        } else if (role === "FINANCIAL_MANAGER") {
          resolvedAuthorMatricule = "FIN-001";
        } else if (role === "BRANCH_MANAGER") {
          resolvedAuthorMatricule = "MGR-001";
        } else if (role === "SECRETARY") {
          resolvedAuthorMatricule = "SEC-001";
        } else {
          resolvedAuthorMatricule = "USR-001";
        }
      }
    }

    const transaction = await createBankTransaction(
      organizationId,
      {
        type: body.type,
        bankAccountId: body.bankAccountId,
        amount,
        referenceNumber:
          typeof body.referenceNumber === "string"
            ? body.referenceNumber.trim()
            : "",
        date: body.date,
        reason: body.reason,
        delegateName:
          typeof body.delegateName === "string"
            ? body.delegateName.trim() || undefined
            : undefined,
        branchId: body.branchId,
        branchName: body.branchName,
        receiptDataUrl: body.receiptDataUrl,
      },
      {
        id: body.authorId || user.id,
        name: body.authorName?.trim() || user.name || "Administrateur",
        employeeNumber: resolvedAuthorMatricule || undefined,
        role: body.authorRole || user.role,
      }
    );

    return NextResponse.json({ success: true, transaction });
  } catch (err) {
    return handleApiError(err);
  }
}
