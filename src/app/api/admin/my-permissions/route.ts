import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireTenantUser } from "@/lib/auth/guard";
import { listOrgRoles, matchOrgRole } from "@/lib/services/roles";
import { getUserById, getUserByEmail } from "@/lib/services/users";
import { ALL_ALLOWED_PERMS, TabPermission, ModuleKey } from "@/lib/types/roles";

export async function GET() {
  try {
    const authSession = await requireAuth();
    let session = authSession;
    if (authSession.role !== "SUPER_ADMIN") {
      const tenant = await requireTenantUser();
      session = tenant.user;
    }

    // Resolve live role from DB
    let liveRole = session.role;
    if (session.id && session.role !== "SUPER_ADMIN") {
      try {
        const liveUser =
          (await getUserById(session.id)) ||
          (session.email ? await getUserByEmail(session.email) : null);
        if (liveUser && liveUser.role) {
          liveRole = liveUser.role;
        }
      } catch (_) {}
    }

    // Super Admin and Organization Admin have full permissions by design
    if (liveRole === "SUPER_ADMIN" || liveRole === "ORGANIZATION_ADMIN") {
      return NextResponse.json({
        role: liveRole,
        roleName: liveRole === "SUPER_ADMIN" ? "Super Administrateur" : "PDG / Propriétaire",
        permissions: ALL_ALLOWED_PERMS,
      });
    }

    // If organization user, find their configured role permissions from DB
    if (session.organizationId) {
      try {
        const roles = await listOrgRoles(session.organizationId);
        const matched = matchOrgRole(roles, liveRole);

        if (matched && matched.permissions) {
          return NextResponse.json({
            role: liveRole,
            roleId: matched.id,
            roleName: matched.name,
            permissions: matched.permissions,
          });
        }
      } catch (_) {}
    }

    // Default permissions for EMPLOYEE when no custom override is set
    const defaultEmployeePermissions: Record<ModuleKey, TabPermission> = {
      dashboard: { view: false, create: false, edit: false, delete: false },
      requests: { view: true, create: true, edit: true, delete: false },
      employees: { view: false, create: false, edit: false, delete: false },
      branches: { view: false, create: false, edit: false, delete: false },
      financial_ops: { view: false, create: false, edit: false, delete: false },
      financial_reports: { view: false, create: false, edit: false, delete: false },
      events: { view: true, create: false, edit: false, delete: false },
      customer_space: { view: false, create: false, edit: false, delete: false },
      users: { view: false, create: false, edit: false, delete: false },
      notifications: { view: true, create: false, edit: false, delete: false },
      configuration: { view: true, create: false, edit: true, delete: false },
    };

    const isCashier = liveRole === "CASHIER" || liveRole === "CAISSIER";
    const defaultCashierPermissions: Record<ModuleKey, TabPermission> = {
      ...defaultEmployeePermissions,
      financial_reports: { view: true, create: true, edit: true, delete: false },
    };

    const isEmpOrCashier =
      liveRole === "EMPLOYEE" ||
      liveRole === "COLLABORATEUR" ||
      isCashier;

    let defaultRoleName = liveRole;
    if (liveRole === "EMPLOYEE") defaultRoleName = "Collaborateur / Employé";
    else if (isCashier) defaultRoleName = "Caissier(e)";

    return NextResponse.json({
      role: liveRole,
      roleName: defaultRoleName,
      permissions: isCashier
        ? defaultCashierPermissions
        : isEmpOrCashier
        ? defaultEmployeePermissions
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
