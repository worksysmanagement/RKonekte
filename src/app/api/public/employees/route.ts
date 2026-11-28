import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { employees, organizations } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateLimit = checkRateLimit(`public_employees:${ip}`, 45, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez patienter une minute." },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId");

    if (!organizationId || organizationId.length > 100) {
      return NextResponse.json({ employees: [] });
    }

    try {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
      // Verify organization is active
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, status, service_stopped")
        .eq("id", organizationId)
        .maybeSingle();

      if (!orgData || orgData.status !== "ACTIVE" || orgData.service_stopped) {
        return NextResponse.json({ employees: [] });
      }

      const { data: supaEmps } = await supabase
        .from("employees")
        .select("id, employee_number, first_name, last_name, department, position, phone, email")
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

      if (supaEmps && supaEmps.length > 0) {
        const mapped = supaEmps.map((e) => ({
          id: e.id,
          employeeNumber: e.employee_number,
          firstName: e.first_name,
          lastName: e.last_name,
          department: e.department,
          position: e.position,
          phone: e.phone,
          email: e.email,
        }));
        return NextResponse.json({ employees: mapped });
      }
    } catch (_) {}

    const db = getDb();

    // Ensure table exists
    try {
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id),
          employee_number TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          department TEXT NOT NULL,
          position TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    } catch (_) {}

    const empList = await db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        department: employees.department,
        position: employees.position,
        phone: employees.phone,
        email: employees.email,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          eq(employees.status, "ACTIVE")
        )
      )
      .orderBy(asc(employees.lastName), asc(employees.firstName));

    return NextResponse.json({ employees: empList });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
