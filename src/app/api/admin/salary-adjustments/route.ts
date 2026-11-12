import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listSalaryAdjustments,
  createSalaryAdjustment,
} from "@/lib/services/salary-adjustments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();

    // Check if user has permission to view salary revisions (Admin/Secretary only by default)
    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isEmployee) {
      return NextResponse.json(
        { error: "Accès non autorisé. La gestion salariale est réservée aux administrateurs." },
        { status: 403 }
      );
    }

    const adjustments = await listSalaryAdjustments(organizationId);
    return NextResponse.json(
      { success: true, adjustments },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
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

    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isEmployee) {
      return NextResponse.json(
        { error: "Action interdite : seuls les administrateurs peuvent attribuer ou réviser un salaire." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.employeeName || !body.employeeNumber) {
      return NextResponse.json(
        { error: "Le nom et le matricule de l'employé sont obligatoires." },
        { status: 400 }
      );
    }

    if (!body.newSalary || !body.newSalary.trim()) {
      return NextResponse.json(
        { error: "Le nouveau montant de salaire est obligatoire." },
        { status: 400 }
      );
    }

    const attributedBy = user.name || "Direction Générale";

    const adjustment = await createSalaryAdjustment(
      organizationId,
      {
        employeeId: body.employeeId,
        employeeName: body.employeeName,
        employeeNumber: body.employeeNumber,
        department: body.department,
        branch: body.branch,
        companyName: body.companyName,
        phone: body.phone,
        email: body.email,
        previousSalary: body.previousSalary || "0",
        newSalary: body.newSalary,
        currency: body.currency || "HTG",
        effectiveDate: body.effectiveDate,
        reason: body.reason,
        signatureDataUrl: body.signatureDataUrl,
        sendWhatsApp: body.sendWhatsApp !== false,
        sendEmail: body.sendEmail !== false,
      },
      attributedBy
    );

    return NextResponse.json({
      success: true,
      adjustment,
      whatsappDirectUrl: adjustment.whatsappDirectUrl,
      whatsappSent: adjustment.whatsappSent,
      emailSent: adjustment.emailSent,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
