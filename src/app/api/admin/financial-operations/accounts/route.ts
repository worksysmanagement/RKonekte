import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listBankAccounts,
  createBankAccount,
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

    const accounts = await listBankAccounts(organizationId);
    return NextResponse.json(
      { success: true, accounts },
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

    if (!body.bankName || !body.bankName.trim()) {
      return NextResponse.json(
        { error: "Le nom de la banque est obligatoire." },
        { status: 400 }
      );
    }

    if (!body.accountNumber || !body.accountNumber.trim()) {
      return NextResponse.json(
        { error: "Le numéro de compte est obligatoire." },
        { status: 400 }
      );
    }

    const account = await createBankAccount(organizationId, {
      bankName: body.bankName,
      accountName: body.accountName || body.bankName,
      accountNumber: body.accountNumber,
      currency: body.currency || "HTG",
      initialBalance: Number(body.initialBalance) || 0,
      initialBalanceDate: body.initialBalanceDate || new Date().toISOString().split("T")[0],
      branchId: body.branchId,
      branchName: body.branchName,
    });

    return NextResponse.json({ success: true, account });
  } catch (err) {
    return handleApiError(err);
  }
}
