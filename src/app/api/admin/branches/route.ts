import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { listBranches, createBranch } from "@/lib/services/branches";
import { getOrganizationById } from "@/lib/services/organizations";
import { normalizeMatriculeFormat } from "@/lib/utils/matricule";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const [branchesList, org] = await Promise.all([
      listBranches(organizationId),
      getOrganizationById(organizationId),
    ]);
    return NextResponse.json({
      branches: branchesList,
      organization: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            phone: org.phone,
            address: org.address,
            email: org.email,
            matriculeFormat: normalizeMatriculeFormat(org.matriculeFormat),
            matriculePrefix: org.matriculePrefix || null,
          }
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const body = await req.json();

    if (!body.name || !body.city) {
      return NextResponse.json(
        { error: "Le nom et la ville sont obligatoires." },
        { status: 400 }
      );
    }

    const newBranch = await createBranch(organizationId, body);
    return NextResponse.json({ success: true, branch: newBranch });
  } catch (err) {
    return handleApiError(err);
  }
}
