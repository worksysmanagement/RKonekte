import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import {
  listEventsForUser,
  createCompanyEvent,
  EventUserContext,
  isEmployeeRole,
} from "@/lib/services/events";
import { listEmployees } from "@/lib/services/employees";
import { listBranches } from "@/lib/services/branches";
import { resolveAppOrigin } from "@/lib/notifications/email";

async function resolveEventUserContext(
  organizationId: string,
  user: {
    id: string;
    role: string;
    name: string;
    email: string;
    branchId?: string | null;
  }
): Promise<EventUserContext> {
  let employeeId: string | null = null;
  let employeeNumber: string | null = null;
  let branchId: string | null = user.branchId || null;
  let branchName: string | null = null;
  let department: string | null = null;

  try {
    const [allEmployees, allBranches] = await Promise.all([
      listEmployees(organizationId),
      listBranches(organizationId),
    ]);
    const normalizedEmail = (user.email || "").toLowerCase().trim();
    const matchedEmployee = normalizedEmail
      ? allEmployees.find(
          (emp) => (emp.email || "").toLowerCase().trim() === normalizedEmail
        )
      : undefined;

    if (matchedEmployee) {
      employeeId = matchedEmployee.id;
      employeeNumber = matchedEmployee.employeeNumber;
      branchId = matchedEmployee.branchId || branchId;
      department = matchedEmployee.department || null;
    }

    if (branchId) {
      const matchedBranch = allBranches.find((b) => b.id === branchId);
      if (matchedBranch) {
        branchName = matchedBranch.name;
      }
    }
  } catch (err) {
    console.warn("Could not enrich event user context:", err);
  }

  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    employeeId,
    employeeNumber,
    branchId,
    branchName,
    department,
  };
}

export async function GET() {
  try {
    const { user, organizationId } = await requireTenantUser();
    const userContext = await resolveEventUserContext(organizationId, user);
    const events = await listEventsForUser(organizationId, userContext);
    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();
    const body = await req.json();

    const userContext = await resolveEventUserContext(organizationId, user);
    const isEmp = isEmployeeRole(user.role);

    if (!isEmp && body.isPersonal === false) {
      // Administrative event validation
      if (!body.title?.trim() || !body.date?.trim()) {
        return NextResponse.json(
          { error: "Le titre et la date de l'événement sont obligatoires." },
          { status: 400 }
        );
      }
    }

    const origin = resolveAppOrigin(req.headers);

    const { event, emailStats } = await createCompanyEvent(
      organizationId,
      {
        title: body.title,
        description: body.description,
        date: body.date,
        startTime: body.startTime,
        endTime: body.endTime,
        type: body.type,
        personalCategory: body.personalCategory,
        location: body.location,
        audienceType: body.audienceType,
        audienceTargetName: body.audienceTargetName,
        audienceBranchId: body.audienceBranchId,
        targetEmployeeIds: body.targetEmployeeIds,
        notifyImmediate: body.notifyImmediate,
        reminder24h: body.reminder24h,
        isPersonal: body.isPersonal,
      },
      userContext,
      { origin }
    );

    return NextResponse.json({
      success: true,
      event,
      emailStats,
    });
  } catch (err: any) {
    if (
      err?.message?.includes("obligatoire") ||
      err?.message?.includes("Veuillez sélectionner") ||
      err?.message?.includes("Aucun employé")
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleApiError(err);
  }
}
