import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/auth/guard";
import { requireCustomerSpacePermission } from "@/lib/services/customer-feedback-auth";
import {
  listCustomerQrCodes,
  generateBranchQrCode,
  QrAlreadyExistsError,
  CustomerFeedbackDomainError,
} from "@/lib/services/customer-feedback";
import { listBranches } from "@/lib/services/branches";
import { getOrganizationById } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

function resolveOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");
  if (host) {
    const protoHeader = req.headers.get("x-forwarded-proto");
    const proto =
      protoHeader ||
      (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function GET() {
  try {
    const { organizationId, permission } = await requireCustomerSpacePermission("view");

    const [qrCodes, branchesList, org] = await Promise.all([
      listCustomerQrCodes(organizationId),
      listBranches(organizationId),
      getOrganizationById(organizationId),
    ]);

    return NextResponse.json({
      qrCodes,
      branches: branchesList.map((b) => ({
        id: b.id,
        name: b.name,
        city: b.city,
        status: b.status,
      })),
      organizationName: org?.name || "e-biznis",
      permission,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await requireCustomerSpacePermission("create");
    const body = await req.json().catch(() => ({}));

    const branchId = typeof body?.branchId === "string" ? body.branchId.trim() : "";
    if (!branchId) {
      return NextResponse.json(
        { error: "Veuillez sélectionner une succursale." },
        { status: 400 }
      );
    }

    const origin = resolveOrigin(req);
    const qrCode = await generateBranchQrCode(organizationId, branchId, origin);

    return NextResponse.json({ success: true, qrCode }, { status: 201 });
  } catch (err: any) {
    if (err instanceof QrAlreadyExistsError) {
      return NextResponse.json(
        { error: err.message, existingQr: err.existingQr },
        { status: 409 }
      );
    }
    if (err instanceof CustomerFeedbackDomainError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return handleApiError(err);
  }
}
