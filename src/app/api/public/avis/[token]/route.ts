import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  resolvePublicQrByToken,
  submitPublicFeedback,
  CustomerFeedbackDomainError,
} from "@/lib/services/customer-feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0].trim() || "127.0.0.1";
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const resolved = await resolvePublicQrByToken(token);

    if (!resolved.found) {
      return NextResponse.json(
        {
          valid: false,
          active: false,
          error: "QR Code introuvable ou invalide.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      active: resolved.active,
      organizationName: resolved.organizationName,
      organizationLogo: resolved.organizationLogo,
      branchName: resolved.branchName,
      branchCity: resolved.branchCity,
    });
  } catch (err) {
    console.error("Public QR resolution error:", err);
    return NextResponse.json(
      { error: "Impossible de vérifier ce QR Code pour le moment." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const ip = getClientIp(req);

    // Rate limiting anti-spam protection (allows normal customer usage, throttles floods)
    const tokenLimit = checkRateLimit(`avis_submit:${ip}:${token}`, 5, 300);
    const ipLimit = checkRateLimit(`avis_global:${ip}`, 15, 300);
    if (!tokenLimit.allowed || !ipLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Trop de soumissions répétées. Veuillez patienter quelques minutes avant de renvoyer un avis.",
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Requête invalide." },
        { status: 400 }
      );
    }

    const result = await submitPublicFeedback(token, {
      customerName: typeof body.customerName === "string" ? body.customerName : null,
      category: typeof body.category === "string" ? body.category : null,
      comment: typeof body.comment === "string" ? body.comment : "",
      website: typeof body.website === "string" ? body.website : "",
    });

    return NextResponse.json(
      {
        success: true,
        organizationName: result.organizationName,
        branchName: result.branchName,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof CustomerFeedbackDomainError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Public feedback submission error:", err);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'enregistrement de votre avis." },
      { status: 500 }
    );
  }
}
