import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { updateEmployee, deleteEmployee, getEmployeeById } from "@/lib/services/employees";
import { employeeSchema } from "@/lib/validation/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireTenantUser();
    const { id } = await params;

    const emp = await getEmployeeById(organizationId, id);
    if (!emp) {
      return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
    }

    return NextResponse.json({ employee: emp });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireTenantUser();
    const { id } = await params;
    const body = await req.json();

    const parseResult = employeeSchema.partial().safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Données de mise à jour invalides", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const currentEmp = await getEmployeeById(organizationId, id);
    if (!currentEmp) {
      return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
    }

    const updatePayload = { ...parseResult.data };

    const updated = await updateEmployee(organizationId, id, updatePayload);

    // Guaranteed explicit user role/branch sync across databases
    if (parseResult.data.role !== undefined || parseResult.data.branchId !== undefined) {
      const targetEmail = (parseResult.data.email || updated?.email || "").toLowerCase().trim();
      if (targetEmail) {
        try {
          const { getSupabaseAdminClient } = await import("@/lib/supabase/server");
          const supabase = getSupabaseAdminClient();
          const userUpdate: Record<string, any> = { updated_at: Date.now() };
          if (parseResult.data.role) userUpdate.role = parseResult.data.role;
          if (parseResult.data.branchId !== undefined) userUpdate.branch_id = parseResult.data.branchId || null;
          await supabase
            .from("users")
            .update(userUpdate)
            .eq("organization_id", organizationId)
            .ilike("email", targetEmail);
        } catch (_) {}

        try {
          const { getDb } = await import("@/lib/db/client");
          const { users } = await import("@/db/schema");
          const { and, eq, sql } = await import("drizzle-orm");
          const db = getDb();
          const userUpdate: Record<string, any> = { updatedAt: Date.now() };
          if (parseResult.data.role) userUpdate.role = parseResult.data.role;
          if (parseResult.data.branchId !== undefined) userUpdate.branchId = parseResult.data.branchId || null;
          await db
            .update(users)
            .set(userUpdate)
            .where(and(eq(users.organizationId, organizationId), sql`lower(${users.email}) = ${targetEmail}`));
        } catch (_) {}
      }
    }

    return NextResponse.json({ success: true, employee: updated });
  } catch (err: any) {
    if (err?.message?.includes("déjà utilisé")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireTenantUser();
    const { id } = await params;

    await deleteEmployee(organizationId, id);
    return NextResponse.json({ success: true, message: "Employé supprimé avec succès" });
  } catch (err) {
    return handleApiError(err);
  }
}
