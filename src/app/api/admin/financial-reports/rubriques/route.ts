import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listRubriques,
  createRubrique,
  resetRubriquesToDefault,
} from "@/lib/services/cash-registers";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const rubriques = await listRubriques(organizationId);
    return NextResponse.json({ rubriques });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();

    // Only Admin roles can configure rubriques
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

    if (body.action === "RESET_DEFAULTS") {
      const reset = await resetRubriquesToDefault(organizationId);
      return NextResponse.json({ success: true, rubriques: reset });
    }

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "Le nom de la rubrique est obligatoire." },
        { status: 400 }
      );
    }

    const currency = body.currency === "USD" ? "USD" : "HTG";
    const created = await createRubrique(organizationId, {
      name: body.name.trim(),
      currency,
    });

    return NextResponse.json({ success: true, rubrique: created });
  } catch (err) {
    return handleApiError(err);
  }
}
