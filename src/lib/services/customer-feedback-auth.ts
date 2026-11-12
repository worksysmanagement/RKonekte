import { requireTenantUser, AuthError } from "@/lib/auth/guard";
import { SessionUser } from "@/lib/auth/session";
import { getUserById, getUserByEmail } from "@/lib/services/users";
import { listOrgRoles } from "@/lib/services/roles";
import { ALL_ALLOWED_PERMS, TabPermission } from "@/lib/types/roles";

export type CustomerSpaceAction = "view" | "create" | "edit" | "delete";

function isEmployeeLikeRole(role: string): boolean {
  const lower = (role || "").toLowerCase();
  return (
    role === "EMPLOYEE" ||
    role === "COLLABORATEUR" ||
    role === "CASHIER" ||
    role === "CAISSIER" ||
    lower.includes("employ") ||
    lower.includes("collab") ||
    lower.includes("caissier") ||
    lower.includes("cashier")
  );
}

/**
 * Resolves live role and effective `customer_space` permissions for the current tenant user,
 * using existing E-Biznis RBAC configuration without modifying any shared auth/roles file.
 */
export async function requireCustomerSpacePermission(
  requiredAction: CustomerSpaceAction
): Promise<{
  user: SessionUser;
  organizationId: string;
  branchId: string | null;
  effectiveRole: string;
  permission: TabPermission;
}> {
  const { user, organizationId, branchId } = await requireTenantUser();

  let effectiveRole = user.role;
  try {
    const liveUser =
      (await getUserById(user.id)) ||
      (user.email ? await getUserByEmail(user.email) : null);
    if (liveUser?.role) {
      effectiveRole = liveUser.role;
    }
  } catch (_) {}

  // Organization Admins / Owners always hold full control
  if (effectiveRole === "ORGANIZATION_ADMIN") {
    return {
      user,
      organizationId,
      branchId: branchId || null,
      effectiveRole,
      permission: ALL_ALLOWED_PERMS.customer_space,
    };
  }

  let resolvedPerm: TabPermission | null = null;

  try {
    const roles = await listOrgRoles(organizationId);
    const upperRole = (effectiveRole || "").toUpperCase();

    const matched = roles.find((r) => {
      const rName = r.name.toUpperCase();
      const rId = r.id.toUpperCase();
      if (upperRole === "EMPLOYEE" || upperRole === "COLLABORATEUR") {
        return (
          rId === "ROLE-EMPLOYEE" ||
          rName.includes("COLLABORATEUR") ||
          rName.includes("EMPLOYÉ") ||
          rName.includes("EMPLOYE")
        );
      }
      if (upperRole === "CASHIER" || upperRole === "CAISSIER") {
        return (
          rId === "ROLE-CASHIER" ||
          rName.includes("CAISSIER") ||
          rName.includes("CASHIER")
        );
      }
      if (upperRole === "SECRETARY") {
        return (
          rId === "ROLE-SECRETARY" ||
          rName.includes("SECRÉTAIRE") ||
          rName.includes("SECRETAIRE")
        );
      }
      if (upperRole === "FINANCIAL_MANAGER") {
        return (
          rId === "ROLE-FINANCE" ||
          rName.includes("FINANCIER") ||
          rName.includes("COMPTABLE")
        );
      }
      if (upperRole === "BRANCH_MANAGER") {
        return rId === "ROLE-BRANCH-MGR" || rName.includes("SUCCURSALE");
      }
      return (
        r.id.toLowerCase() === effectiveRole.toLowerCase() ||
        r.name.toLowerCase() === effectiveRole.toLowerCase()
      );
    });

    if (matched?.permissions?.customer_space) {
      resolvedPerm = matched.permissions.customer_space;
    }
  } catch (_) {}

  if (!resolvedPerm) {
    if (isEmployeeLikeRole(effectiveRole) || effectiveRole === "FINANCIAL_MANAGER") {
      resolvedPerm = { view: false, create: false, edit: false, delete: false };
    } else if (effectiveRole === "SECRETARY") {
      resolvedPerm = { view: true, create: false, edit: false, delete: false };
    } else if (effectiveRole === "BRANCH_MANAGER") {
      resolvedPerm = { view: true, create: true, edit: true, delete: false };
    } else {
      resolvedPerm = { view: false, create: false, edit: false, delete: false };
    }
  }

  if (!resolvedPerm[requiredAction]) {
    throw new AuthError(
      "Accès refusé : vous ne disposez pas des droits nécessaires dans le module Espace Client.",
      403
    );
  }

  return {
    user,
    organizationId,
    branchId: branchId || null,
    effectiveRole,
    permission: resolvedPerm,
  };
}
