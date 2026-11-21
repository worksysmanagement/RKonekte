import { NextRequest, NextResponse } from "next/server";
import { requireRequestApprover, handleApiError } from "@/lib/auth/guard";
import { approveLeaveRequest, getLeaveRequestById } from "@/lib/services/leave-requests";
import { approveLeaveRequestSchema } from "@/lib/validation/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireRequestApprover();
    const { id } = await params;

    const existingReq = await getLeaveRequestById(id, organizationId);
    if (!existingReq) {
      return NextResponse.json({ error: "Demande de congé introuvable." }, { status: 404 });
    }

    let isOwnRequest = false;
    const reqEmail = (existingReq.contactEmail || "").toLowerCase().trim();
    const userEmail = (user.email || "").toLowerCase().trim();
    const reqEmpNum = (existingReq.employeeNumber || "").toLowerCase().trim();
    const userEmpNum = (user.employeeNumber || "").toLowerCase().trim();

    if (reqEmail && userEmail) {
      isOwnRequest = reqEmail === userEmail;
    } else if (reqEmpNum && userEmpNum) {
      isOwnRequest = reqEmpNum === userEmpNum;
    } else if (user.name) {
      const reqName = `${existingReq.firstName || ""} ${existingReq.lastName || ""}`.trim().toLowerCase();
      const uName = user.name.trim().toLowerCase();
      isOwnRequest = reqName === uName;
    }

    if (isOwnRequest) {
      return NextResponse.json(
        { error: "Action non autorisée : Vous ne pouvez pas approuver votre propre demande de congé." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = approveLeaveRequestSchema.safeParse(body);
    const comment = parseResult.success ? parseResult.data.decisionComment : undefined;
    const signatureUrl = parseResult.success ? parseResult.data.signatureUrl : undefined;

    const result = await approveLeaveRequest(
      id,
      organizationId,
      user.id,
      comment,
      {
        signatureUrl,
        signerName: user.name,
        signerRole: user.role,
      }
    );

    return NextResponse.json({
      success: true,
      leaveRequest: result.leaveRequest,
    });
  } catch (err: any) {
    if (err?.message?.includes("n'est plus en attente")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return handleApiError(err);
  }
}
