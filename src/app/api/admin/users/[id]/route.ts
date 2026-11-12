import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { setSessionCookie } from "@/lib/auth/session";
import { getUserById, updateUserRole } from "@/lib/services/users";
import { listOrgRoles, matchOrgRole } from "@/lib/services/roles";
import { SYSTEM_USER_ROLES, updateUserRoleSchema } from "@/lib/validation/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: sessionUser, organizationId } = await requireTenantUser();
    const { id } = await params;

    // 1. Resolve live acting user & verify active status
    const liveActingUser = await getUserById(sessionUser.id);
    if (liveActingUser && liveActingUser.organizationId !== organizationId) {
      return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
    }
    if (liveActingUser && liveActingUser.status === "DISABLED") {
      return NextResponse.json({ error: "Votre compte est désactivé." }, { status: 403 });
    }

    const liveActingRole = liveActingUser?.role || sessionUser.role;
    const isOwnerAdmin = liveActingRole === "ORGANIZATION_ADMIN";

    // 2. Load organization roles & check users.edit authorization
    const orgRoles = await listOrgRoles(organizationId);
    if (!isOwnerAdmin) {
      const actingRoleModel = matchOrgRole(orgRoles, liveActingRole);
      const canEditUsers = Boolean(
        actingRoleModel?.permissions?.users?.view &&
          actingRoleModel?.permissions?.users?.edit
      );
      if (!canEditUsers) {
        return NextResponse.json(
          { error: "Action réservée aux administrateurs habilités à modifier les accès." },
          { status: 403 }
        );
      }
    }

    // 3. Strictly parse body: ONLY { role } is accepted
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corps de requête invalide." },
        { status: 400 }
      );
    }

    const parseResult = updateUserRoleSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Seule la modification du rôle système est autorisée.",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    let requestedRole = parseResult.data.role.trim();
    if (requestedRole.toUpperCase() === "CAISSIER") {
      requestedRole = "CASHIER";
    }

    if (requestedRole.toUpperCase() === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Attribution du rôle Super Administrateur interdite." },
        { status: 403 }
      );
    }

    // 4. Validate requested role against system roles or organization custom roles
    let resolvedRole = "";
    const matchedSystemRole = SYSTEM_USER_ROLES.find(
      (r) => r.toUpperCase() === requestedRole.toUpperCase()
    );
    if (matchedSystemRole) {
      resolvedRole = matchedSystemRole;
    } else {
      const matchedCustomRole = orgRoles.find(
        (r) =>
          !r.isSystem &&
          (r.id.toLowerCase() === requestedRole.toLowerCase() ||
            r.name.toLowerCase() === requestedRole.toLowerCase())
      );
      if (matchedCustomRole) {
        resolvedRole = matchedCustomRole.name;
      }
    }

    if (!resolvedRole) {
      return NextResponse.json(
        { error: "Rôle système invalide ou introuvable dans cette entreprise." },
        { status: 400 }
      );
    }

    // 5. Inspect target user and enforce strict privilege escalation guards
    const targetUser = await getUserById(id);
    if (!targetUser || targetUser.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Utilisateur introuvable dans cette entreprise." },
        { status: 404 }
      );
    }
    if (targetUser.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Impossible de modifier le rôle d'un Super Administrateur." },
        { status: 403 }
      );
    }
    if (
      !isOwnerAdmin &&
      (targetUser.role === "ORGANIZATION_ADMIN" || resolvedRole === "ORGANIZATION_ADMIN")
    ) {
      return NextResponse.json(
        {
          error:
            "Seul un PDG / Propriétaire peut attribuer ou modifier le rôle PDG / Propriétaire.",
        },
        { status: 403 }
      );
    }

    // 6. Persist updated system role
    const updatedUser = await updateUserRole(organizationId, id, resolvedRole);

    // Synchronize session cookie immediately if the acting user updated their own role
    if (id === sessionUser.id && updatedUser.role !== sessionUser.role) {
      try {
        await setSessionCookie({
          ...sessionUser,
          role: updatedUser.role,
        });
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: "Rôle système mis à jour avec succès.",
    });
  } catch (err: any) {
    if (err?.message?.includes("introuvable")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (
      err?.message?.includes("Impossible") ||
      err?.message?.includes("interdite") ||
      err?.message?.includes("obligatoire")
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleApiError(err);
  }
}
