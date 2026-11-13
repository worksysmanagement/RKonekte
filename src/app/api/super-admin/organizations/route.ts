import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import {
  listAllOrganizationsForSuperAdmin,
  createOrganizationWithAdmin,
} from "@/lib/services/organizations";
import { createOrganizationSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db/client";
import { organizations, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  sendEmail,
  resolveAppOrigin,
  generateCompanyActivationEmail,
} from "@/lib/notifications/email";

export async function GET() {
  try {
    await requireSuperAdmin();
    const orgs = await listAllOrganizationsForSuperAdmin();
    return NextResponse.json({ organizations: orgs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();

    // 1. Support for Photo 2 / Registration form structure
    if (body.companyName && !body.adminPassword) {
      const {
        companyName,
        companyEmail,
        phone,
        address,
        employeeRange,
        applicantName,
        applicantRole,
      } = body;

      if (
        !companyName?.trim() ||
        !companyEmail?.trim() ||
        !phone?.trim() ||
        !address?.trim() ||
        !employeeRange?.trim() ||
        !applicantName?.trim() ||
        !applicantRole?.trim()
      ) {
        return NextResponse.json(
          { error: "Veuillez renseigner tous les champs obligatoires du formulaire." },
          { status: 400 }
        );
      }

      const generatedSlug = companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const normalizedSlug = generatedSlug || `org-${Date.now().toString().slice(-6)}`;
      const normalizedCompanyEmail = companyEmail.toLowerCase().trim();
      const now = Date.now();
      const orgId = `org-${normalizedSlug}-${now.toString().slice(-4)}`;
      const userId = `usr-${now.toString().slice(-6)}`;
      const verificationToken = crypto.randomUUID();

      const db = getDb();

      // Check uniqueness in local DB
      const [existingSlug] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, normalizedSlug))
        .limit(1);

      if (existingSlug) {
        return NextResponse.json(
          { error: "Une entreprise avec ce nom ou identifiant est déjà enregistrée." },
          { status: 409 }
        );
      }

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedCompanyEmail))
        .limit(1);

      if (existingUser) {
        return NextResponse.json(
          { error: "Cette adresse email d'entreprise est déjà enregistrée sur la plateforme." },
          { status: 409 }
        );
      }

      const auditMeta = {
        companyName: companyName.trim(),
        companyEmail: normalizedCompanyEmail,
        phone: phone.trim(),
        address: address.trim(),
        employeeRange: employeeRange.trim(),
        applicantName: applicantName.trim(),
        applicantRole: applicantRole.trim(),
        verificationToken,
        tokenCreatedAt: now,
        isRevoked: false,
        emailVerified: false,
        passwordSet: false,
        submittedAt: now,
        createdBy: "SUPER_ADMIN",
      };

      // Try inserting into Supabase if configured
      try {
        const { getSupabaseAdminClient } = await import("@/lib/supabase/server");
        const supabase = getSupabaseAdminClient();
        await supabase.from("organizations").insert({
          id: orgId,
          name: companyName.trim(),
          slug: normalizedSlug,
          email: normalizedCompanyEmail,
          phone: phone.trim(),
          address: address.trim(),
          status: "DISABLED",
          created_at: now,
          updated_at: now,
        });

        await supabase.from("users").insert({
          id: userId,
          organization_id: orgId,
          name: applicantName.trim(),
          email: normalizedCompanyEmail,
          password_hash: "NO_PASSWORD_SET",
          role: "ORGANIZATION_ADMIN",
          status: "DISABLED",
          created_at: now,
          updated_at: now,
        });

        await supabase.from("audit_logs").insert({
          id: `audit-${now}`,
          organization_id: orgId,
          user_id: null,
          action: "SUBMITTED",
          old_status: null,
          new_status: "PENDING_VERIFICATION",
          metadata: JSON.stringify(auditMeta),
          created_at: now,
        });
      } catch (supaErr) {
        // Fallback or test environment
      }

      // Always insert into local SQLite DB
      await db.insert(organizations).values({
        id: orgId,
        name: companyName.trim(),
        slug: normalizedSlug,
        email: normalizedCompanyEmail,
        phone: phone.trim(),
        address: address.trim(),
        status: "DISABLED",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(users).values({
        id: userId,
        organizationId: orgId,
        name: applicantName.trim(),
        email: normalizedCompanyEmail,
        passwordHash: "NO_PASSWORD_SET",
        role: "ORGANIZATION_ADMIN",
        status: "DISABLED",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(auditLogs).values({
        id: `audit-${now}`,
        organizationId: orgId,
        userId: null,
        action: "SUBMITTED",
        oldStatus: null,
        newStatus: "PENDING_VERIFICATION",
        metadata: JSON.stringify(auditMeta),
        createdAt: now,
      });

      // Build verification link & send official activation email
      const origin = resolveAppOrigin(req.headers);
      const verificationLink = `${origin}/verify-company?token=${verificationToken}`;

      let emailSent = false;
      try {
        const { subject, html, text } = generateCompanyActivationEmail({
          recipientName: applicantName.trim(),
          companyName: companyName.trim(),
          email: normalizedCompanyEmail,
          activationUrl: verificationLink,
          isResend: false,
        });

        const emailRes = await sendEmail({
          to: normalizedCompanyEmail,
          subject,
          html,
          text,
        });
        emailSent = !!emailRes?.success;
      } catch (e) {
        console.error("Failed to send activation email:", e);
      }

      return NextResponse.json({
        success: true,
        organizationId: orgId,
        activationUrl: verificationLink,
        emailSent,
      });
    }

    // 2. Legacy schema support (name, slug, adminEmail, adminPassword)
    const parseResult = createOrganizationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Données de l'organisation invalides",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const { organization, adminUser } = await createOrganizationWithAdmin(parseResult.data);
    return NextResponse.json({
      success: true,
      organization,
      adminUser: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes("existe déjà")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return handleApiError(err);
  }
}
