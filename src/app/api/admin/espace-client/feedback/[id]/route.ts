import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/auth/guard";
import { requireCustomerSpacePermission } from "@/lib/services/customer-feedback-auth";
import {
  toggleCustomerFeedbackFavorite,
  deleteCustomerFeedback,
  CustomerFeedbackDomainError,
} from "@/lib/services/customer-feedback";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireCustomerSpacePermission("edit");
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const isFavorite =
      typeof body?.isFavorite === "boolean" ? body.isFavorite : undefined;

    const feedback = await toggleCustomerFeedbackFavorite(
      organizationId,
      id,
      isFavorite
    );

    return NextResponse.json({ success: true, feedback });
  } catch (err: any) {
    if (err instanceof CustomerFeedbackDomainError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireCustomerSpacePermission("delete");
    const { id } = await context.params;

    await deleteCustomerFeedback(organizationId, id);
    return NextResponse.json({ success: true, deleted: true });
  } catch (err: any) {
    if (err instanceof CustomerFeedbackDomainError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return handleApiError(err);
  }
}
