import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listSignatureAuthRequests,
  createSignatureAuthRequest,
} from "@/lib/services/signature-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const employeeNumber = searchParams.get("employeeNumber") || undefined;
    const applicantName = searchParams.get("applicantName") || undefined;
    const scope = searchParams.get("scope");

    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("employ") ||
      user.role?.toLowerCase().includes("collab") ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    const filter: {
      status?: string;
      employeeNumber?: string;
      applicantName?: string;
    } = { status };

    if (scope === "mine" || (isEmployee && !searchParams.has("all"))) {
      if (employeeNumber) {
        filter.employeeNumber = employeeNumber;
      }
      if (applicantName) {
        filter.applicantName = applicantName;
      }
    }

    const requests = await listSignatureAuthRequests(organizationId, filter);

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const body = await req.json();

    if (!body.pdfFileName && !body.pdfUrl) {
      return NextResponse.json(
        { error: "Le document PDF est obligatoire." },
        { status: 400 }
      );
    }

    if (!body.description || !body.description.trim()) {
      return NextResponse.json(
        { error: "Le motif de l'autorisation est obligatoire." },
        { status: 400 }
      );
    }

    // Resolve exact real name and role of applicant
    let resolvedApplicantName = (body.applicantName && body.applicantName.trim() && body.applicantName !== "Collaborateur")
      ? body.applicantName.trim()
      : (user.name || "Collaborateur");

    let resolvedApplicantRole = (body.applicantRole && body.applicantRole.trim() && body.applicantRole !== "Collaborateur")
      ? body.applicantRole.trim()
      : (user.role || "Collaborateur");

    let resolvedEmployeeNumber = body.employeeNumber && body.employeeNumber !== "COLLAB"
      ? body.employeeNumber
      : "";

    let resolvedBranch = body.branch && body.branch !== "Siège"
      ? body.branch
      : (user.branchName || "");

    // Try finding employee in database to ensure full fidelity
    try {
      const supabase = getSupabaseAdminClient();
      const normalizedEmail = user.email?.toLowerCase().trim();
      if (normalizedEmail) {
        const { data: empData } = await supabase
          .from("employees")
          .select("*, branches(name)")
          .eq("organization_id", organizationId)
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (empData) {
          const fullName = `${empData.first_name || ""} ${empData.last_name || ""}`.trim();
          if (fullName) resolvedApplicantName = fullName;
          if (empData.position) resolvedApplicantRole = empData.position;
          if (empData.employee_number) resolvedEmployeeNumber = empData.employee_number;
          if (empData.branches?.name) resolvedBranch = empData.branches.name;
        }
      }
    } catch (_) {}

    const created = await createSignatureAuthRequest({
      organizationId,
      applicantName: resolvedApplicantName,
      applicantRole: resolvedApplicantRole,
      employeeNumber: resolvedEmployeeNumber || "COLLAB",
      branch: resolvedBranch,
      pdfFileName: body.pdfFileName || "Document.pdf",
      pdfFileSize: body.pdfFileSize,
      pdfUrl: body.pdfUrl,
      description: body.description.trim(),
    });

    return NextResponse.json({ success: true, request: created });
  } catch (err) {
    return handleApiError(err);
  }
}
