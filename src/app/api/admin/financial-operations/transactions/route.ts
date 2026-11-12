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

    if (!body.referenceNumber || !body.referenceNumber.trim()) {
      return NextResponse.json(
        { error: "Le numéro de bordereau bancaire ou de référence est obligatoire." },
        { status: 400 }
      );
    }

    if (!body.authorMatricule || !body.authorMatricule.trim()) {
      return NextResponse.json(
        { error: "Le matricule / identifiant de l'auteur est obligatoire." },
        { status: 400 }
      );
    }

    const transaction = await createBankTransaction(
      organizationId,
      {
        type: body.type,
        bankAccountId: body.bankAccountId,
        amount,
        referenceNumber: body.referenceNumber,
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
        employeeNumber: body.authorMatricule?.trim() || undefined,
        role: body.authorRole || user.role,
      }
    );

    return NextResponse.json({ success: true, transaction });
  } catch (err) {
    return handleApiError(err);
  }
}
