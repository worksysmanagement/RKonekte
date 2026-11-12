import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/auth/guard";
import { requireCustomerSpacePermission } from "@/lib/services/customer-feedback-auth";
import {
  toggleCustomerQrStatus,
  deleteCustomerQrCode,
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

    if (typeof body?.isActive !== "boolean") {
      return NextResponse.json(
        { error: "Le paramètre isActive (booléen) est obligatoire." },
        { status: 400 }
      );
    }

    const qrCode = await toggleCustomerQrStatus(organizationId, id, body.isActive);
    return NextResponse.json({ success: true, qrCode });
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
    const result = await deleteCustomerQrCode(organizationId, id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof CustomerFeedbackDomainError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return handleApiError(err);
  }
}
