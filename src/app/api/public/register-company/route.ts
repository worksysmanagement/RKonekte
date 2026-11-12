import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { organizations, users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import {
  sendEmail,
  resolveAppOrigin,
  generateCompanyActivationEmail,
} from "@/lib/notifications/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyName,
      companyEmail,
      phone,
      address,
      employeeRange,
      applicantName,
      applicantRole,
      // Anti-robot / Anti-hacking Honeypot Fields
      hp_website,
      hp_phone_trap,
      formLoadTime,
    } = body;

    // 1. Anti-Bot / Anti-Hacking Check
    if (hp_website || hp_phone_trap) {
      console.warn("[ANTI-BOT TRIGGERED] Honeypot field filled by bot.");
      return NextResponse.json(
        { error: "Requête refusée par la protection anti-robot." },
        { status: 400 }
      );
    }

    if (formLoadTime && typeof formLoadTime === "number") {
      const elapsedMs = Date.now() - formLoadTime;
      if (elapsedMs < 1200) {
        console.warn(`[ANTI-BOT TRIGGERED] Submission too fast (${elapsedMs}ms). Automated bot detected.`);
        return NextResponse.json(
          { error: "Soumission automatique suspecte détectée." },
          { status: 400 }
        );
      }
    }

    // 2. Validate Required Fields
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

    // Generate clean slug from company name
    const generatedSlug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const normalizedSlug = generatedSlug || `org-${Date.now().toString().slice(-6)}`;
    const normalizedCompanyEmail = companyEmail.toLowerCase().trim();

    const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();

    // Check if organization slug or email already registered
    const { data: existingOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (existingOrg) {
      return NextResponse.json(
        { error: "Une entreprise avec ce nom ou identifiant est déjà enregistrée." },
        { status: 409 }
      );
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedCompanyEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: "Cette adresse email d'entreprise est déjà enregistrée sur la plateforme." },
        { status: 409 }
      );
    }

    const now = Date.now();
    const orgId = `org-${normalizedSlug}-${now.toString().slice(-4)}`;

    // Secure email verification token
    const verificationToken = crypto.randomUUID();

    // Insert Organization in Supabase (Status DISABLED until verified and activated)
    const { error: orgInsertErr } = await supabase.from("organizations").insert({
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

    if (orgInsertErr) {
      throw new Error(`Impossible d'enregistrer l'entreprise : ${orgInsertErr.message}`);
    }

    // Create Initial Admin User in Supabase (Status DISABLED, no password set yet)
    const userId = `usr-${now.toString().slice(-6)}`;
    const { error: userInsertErr } = await supabase.from("users").insert({
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

    if (userInsertErr) {
      await supabase.from("organizations").delete().eq("id", orgId);
      throw new Error(`Impossible de créer le compte administrateur : ${userInsertErr.message}`);
    }

    // Store Submission Audit Log in Supabase with Complete Metadata & Token tracking
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
    };

    const { error: auditInsertErr } = await supabase.from("audit_logs").insert({
      id: `audit-${now}`,
      organization_id: orgId,
      user_id: null,
      action: "SUBMITTED",
      old_status: null,
      new_status: "PENDING_VERIFICATION",
      metadata: JSON.stringify(auditMeta),
      created_at: now,
    });

    if (auditInsertErr) {
      await supabase.from("users").delete().eq("id", userId);
      await supabase.from("organizations").delete().eq("id", orgId);
      throw new Error(`Impossible d'enregistrer la demande d'activation : ${auditInsertErr.message}`);
    }

    // Also mirror to local db if available (non-blocking)
    try {
      const db = getDb();
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
    } catch (_) {}

    // Deduce Origin for Email Validation Link
    const origin = resolveAppOrigin(req.headers);
    const verificationLink = `${origin}/verify-company?token=${verificationToken}`;

    // Send Activation Email Directly to the Company Email
    const {
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    } = generateCompanyActivationEmail({
      recipientName: applicantName.trim(),
      companyName: companyName.trim(),
      email: normalizedCompanyEmail,
      activationUrl: verificationLink,
      isResend: false,
    });

    const emailResult = await sendEmail({
      to: normalizedCompanyEmail,
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    });

    return NextResponse.json({
      success: true,
      emailSent: emailResult.success,
      message: `Votre compte a été enregistré. Un email pour définir votre mot de passe a été envoyé à ${normalizedCompanyEmail}.`,
      companyName,
      companyEmail: normalizedCompanyEmail,
      verificationLink,
      organizationId: orgId,
    });
  } catch (err: any) {
    console.error("Register company error:", err);
    return NextResponse.json(
      { error: `Erreur lors de l'enregistrement: ${err?.message || "Veuillez réessayer"}` },
      { status: 500 }
    );
  }
}
