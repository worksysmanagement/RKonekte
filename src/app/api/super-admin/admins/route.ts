import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { listSuperAdmins, createSuperAdmin } from "@/lib/services/super-admins";

export async function GET() {
  try {
    await requireSuperAdmin();
    const admins = await listSuperAdmins();
    return NextResponse.json({ admins });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();

    const { name, email, password } = body;
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Veuillez renseigner le nom, l'e-mail et le mot de passe du super-administrateur." },
        { status: 400 }
      );
    }

    const created = await createSuperAdmin({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Le compte Super Administrateur pour ${created.name} (${created.email}) a été créé avec succès.`,
      admin: created,
    }, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Erreur lors de la création du compte Super Administrateur" },
      { status: 400 }
    );
  }
}
