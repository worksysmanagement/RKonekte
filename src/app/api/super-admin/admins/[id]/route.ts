import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import {
  updateSuperAdminStatus,
  resetSuperAdminPassword,
  deleteSuperAdmin,
} from "@/lib/services/super-admins";

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  try {
    const session = await requireSuperAdmin();
    const resolvedParams = await Promise.resolve(props.params);
    const targetId = resolvedParams.id;
    const body = await req.json();

    // 1. Password reset
    if (body.password) {
      await resetSuperAdminPassword(targetId, body.password);
      return NextResponse.json({
        success: true,
        message: "Le mot de passe du compte Super Administrateur a été réinitialisé avec succès.",
      });
    }

    // 2. Status update (ACTIVE / DISABLED)
    if (body.status) {
      if (body.status !== "ACTIVE" && body.status !== "DISABLED") {
        return NextResponse.json(
          { error: "Statut invalide. Utilisez ACTIVE ou DISABLED." },
          { status: 400 }
        );
      }
      await updateSuperAdminStatus(targetId, body.status, session.id);
      return NextResponse.json({
        success: true,
        message: `Le compte Super Administrateur a été ${
          body.status === "ACTIVE" ? "activé" : "désactivé"
        } avec succès.`,
      });
    }

    return NextResponse.json(
      { error: "Aucune action valide spécifiée (status ou password requis)." },
      { status: 400 }
    );
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Une erreur est survenue lors de la mise à jour." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, props: RouteParams) {
  try {
    const session = await requireSuperAdmin();
    const resolvedParams = await Promise.resolve(props.params);
    const targetId = resolvedParams.id;

    await deleteSuperAdmin(targetId, session.id);

    return NextResponse.json({
      success: true,
      message: "Le compte Super Administrateur a été supprimé avec succès.",
    });
  } catch (err: any) {
    if (err?.statusCode || err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Une erreur est survenue lors de la suppression." },
      { status: 400 }
    );
  }
}
