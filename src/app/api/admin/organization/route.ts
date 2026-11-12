import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { getOrganizationById, updateOrganizationPreferences } from "@/lib/services/organizations";
import { normalizeMatriculeFormat } from "@/lib/utils/matricule";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const org = await getOrganizationById(organizationId);

    if (!org) {
      return NextResponse.json(
        { error: "Organisation introuvable." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        address: org.address,
        logoUrl: org.logoUrl,
        status: org.status,
        matriculeFormat: normalizeMatriculeFormat(org.matriculeFormat),
        matriculePrefix: org.matriculePrefix || null,
        primaryCurrency: org.primaryCurrency || "HTG",
        dateFormat: org.dateFormat || "DD/MM/YYYY",
        language: org.language || "fr",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { organizationId } = await requireTenantUser();
    const body = await req.json();

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json(
        { error: "Le nom officiel de l'organisation ne peut pas être vide." },
        { status: 400 }
      );
    }

    const updated = await updateOrganizationPreferences(organizationId, {
      name: body.name ? String(body.name).trim() : undefined,
      logoUrl: body.logoUrl !== undefined ? (body.logoUrl ? String(body.logoUrl) : null) : undefined,
      matriculeFormat: body.matriculeFormat ? String(body.matriculeFormat).trim() : undefined,
      matriculePrefix:
        body.matriculePrefix !== undefined
          ? body.matriculePrefix
            ? String(body.matriculePrefix).trim().toUpperCase()
            : null
          : undefined,
      primaryCurrency: body.primaryCurrency ? String(body.primaryCurrency).trim() : undefined,
      dateFormat: body.dateFormat ? String(body.dateFormat).trim() : undefined,
      language: body.language ? String(body.language).trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Préférences de l'organisation mises à jour avec succès.",
      organization: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        logoUrl: updated.logoUrl || null,
        matriculeFormat: normalizeMatriculeFormat(updated.matriculeFormat),
        matriculePrefix: updated.matriculePrefix || null,
        primaryCurrency: updated.primaryCurrency || "HTG",
        dateFormat: updated.dateFormat || "DD/MM/YYYY",
        language: updated.language || "fr",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
