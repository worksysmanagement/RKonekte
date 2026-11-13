import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import {
  createLeaveRequest,
  getLeaveRequestById,
  approveLeaveRequest,
  rejectLeaveRequest,
  deleteLeaveRequest,
} from "../src/lib/services/leave-requests";
import { organizations, users, auditLogs } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";

describe("Leave Request Lifecycle & Workflow Tests", () => {
  let db: any;
  const orgId = "org-test-workflow";

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);

    const now = Date.now();
    await db.insert(organizations).values({
      id: orgId,
      name: "Test Workflow Org",
      slug: "test-org",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const pwd = await hashPassword("Test1234!");
    await db.insert(users).values({
      id: "usr-sec",
      organizationId: orgId,
      name: "Secretary User",
      email: "sec@test.local",
      passwordHash: pwd,
      role: "SECRETARY",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  });

  it("Generates structured CONG-YYYY-XXXX request numbers sequentially", async () => {
    const res1 = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    const res2 = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Bob",
        lastName: "Taylor",
        employeeNumber: "EMP-101",
        department: "Engineering",
        position: "Dev",
        leaveType: "SICK",
        startDate: "2026-10-14",
        endDate: "2026-10-16",
        requestedDays: 3,
        contactPhone: "+22501020305",
      },
      undefined,
      db
    );

    const currentYear = new Date().getFullYear();
    expect(res1.leaveRequest.requestNumber).toBe(`CONG-${currentYear}-0001`);
    expect(res2.leaveRequest.requestNumber).toBe(`CONG-${currentYear}-0002`);
  });

  it("Preserves complete employee information snapshot directly on leave request", async () => {
    // Submit request with full employee details
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Marketing Junior",
        position: "Junior Assistant",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        replacementName: "Paul Koffi",
        contactPhone: "+22501020304",
        contactEmail: "alice.smith@example.com",
      },
      undefined,
      db
    );

    // Verify all employee snapshot details are stored accurately
    const fetchedReq = await getLeaveRequestById(req.leaveRequest.id, orgId, db);
    expect(fetchedReq?.firstName).toBe("Alice");
    expect(fetchedReq?.lastName).toBe("Smith");
    expect(fetchedReq?.employeeNumber).toBe("EMP-100");
    expect(fetchedReq?.department).toBe("Marketing Junior");
    expect(fetchedReq?.position).toBe("Junior Assistant");
    expect(fetchedReq?.replacementName).toBe("Paul Koffi");
    expect(fetchedReq?.contactPhone).toBe("+22501020304");
  });

  it("Performs atomic approval and transitions status to APPROVED", async () => {
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    const approveRes = await approveLeaveRequest(
      req.leaveRequest.id,
      orgId,
      "usr-sec",
      "Accordé sans réserve",
      db
    );

    expect(approveRes.success).toBe(true);
    expect(approveRes.leaveRequest.status).toBe("APPROVED");
    expect(approveRes.leaveRequest.decisionComment).toBe("Accordé sans réserve");
    expect(approveRes.leaveRequest.decidedBy).toBe("usr-sec");

    // Verify Audit Log
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.leaveRequestId, req.leaveRequest.id));
    expect(logs.some((l: any) => l.action === "APPROVED")).toBe(true);
  });

  it("Refusal requires a mandatory rejection reason", async () => {
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    // Rejection without reason throws
    await expect(
      rejectLeaveRequest(req.leaveRequest.id, orgId, "usr-sec", "", undefined, db)
    ).rejects.toThrow("La raison du refus est obligatoire");

    // Rejection with valid reason succeeds
    const rejectRes = await rejectLeaveRequest(
      req.leaveRequest.id,
      orgId,
      "usr-sec",
      "Période de pic d'activité",
      "Voir avec le manager",
      db
    );

    expect(rejectRes.success).toBe(true);
    expect(rejectRes.leaveRequest.status).toBe("REJECTED");
    expect(rejectRes.leaveRequest.rejectionReason).toBe("Période de pic d'activité");
  });

  it("CRITICAL: Prevents double decisions (approved cannot be rejected, rejected cannot be approved)", async () => {
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    // 1. Approve once
    await approveLeaveRequest(req.leaveRequest.id, orgId, "usr-sec", undefined, db);

    // 2. Second approval must fail atomically
    await expect(
      approveLeaveRequest(req.leaveRequest.id, orgId, "usr-sec", undefined, db)
    ).rejects.toThrow("La demande n'est plus en attente ou n'a pas été trouvée");

    // 3. Reject on approved request must fail atomically
    await expect(
      rejectLeaveRequest(req.leaveRequest.id, orgId, "usr-sec", "Changement d'avis", undefined, db)
    ).rejects.toThrow("La demande n'est plus en attente ou n'a pas été trouvée");
  });

  it("Deletion from administration records the request as REJECTED for the employee", async () => {
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    // Admin deletes the request
    const delRes = await deleteLeaveRequest(
      req.leaveRequest.id,
      orgId,
      "usr-sec",
      "Secretary User",
      db
    );

    expect(delRes.success).toBe(true);

    // Request is NOT erased: it is marked as REJECTED with clear reason
    const fetched = await getLeaveRequestById(req.leaveRequest.id, orgId, db);
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe("REJECTED");
    expect(fetched?.rejectionReason).toBe("Demande rejetée et supprimée par l'Administration.");
    expect(fetched?.decidedBy).toBe("usr-sec");
    expect(fetched?.decisionComment).toContain("Supprimée par Secretary User depuis l'Administration");

    // Audit log was recorded
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.leaveRequestId, req.leaveRequest.id));
    expect(logs.length).toBeGreaterThan(0);
    const delLog = logs.find((l: any) => l.action === "REJECTED");
    expect(delLog).toBeDefined();
    expect(delLog?.userId).toBe("usr-sec");
    const meta = JSON.parse(delLog?.metadata || "{}");
    expect(meta.source).toBe("ADMIN_DELETE");
  });

  it("Deleting an APPROVED request from administration archives it for the admin without affecting the employee's approved status", async () => {
    const req = await createLeaveRequest(
      {
        organizationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        employeeNumber: "EMP-100",
        department: "Sales",
        position: "Rep",
        leaveType: "ANNUAL",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        requestedDays: 3,
        contactPhone: "+22501020304",
      },
      undefined,
      db
    );

    // 1. Approve the request
    await approveLeaveRequest(req.leaveRequest.id, orgId, "usr-sec", "Demande validée", db);

    // Verify it is APPROVED
    const beforeDel = await getLeaveRequestById(req.leaveRequest.id, orgId, db);
    expect(beforeDel?.status).toBe("APPROVED");

    // 2. Admin deletes it from their administration to free up space
    const delRes = await deleteLeaveRequest(
      req.leaveRequest.id,
      orgId,
      "usr-sec",
      "Secretary User",
      db
    );

    expect(delRes.success).toBe(true);
    expect(delRes.actionTaken).toBe("ARCHIVED_FOR_ADMIN");

    // 3. For the employee, it is STILL APPROVED! (Never converted to REJECTED)
    const afterDel = await getLeaveRequestById(req.leaveRequest.id, orgId, db);
    expect(afterDel?.status).toBe("APPROVED");
    expect(afterDel?.decisionComment).toContain("[ADMIN_ARCHIVED]");

    // 4. In admin list without includeArchived, it is filtered out to free up space
    const { listLeaveRequests } = await import("../src/lib/services/leave-requests");
    const adminList = await listLeaveRequests(orgId, { includeArchived: false }, db);
    const foundInAdminList = adminList.items.find((r: any) => r.id === req.leaveRequest.id);
    expect(foundInAdminList).toBeUndefined();

    // 5. In employee list (includeArchived: true), it remains accessible
    const employeeList = await listLeaveRequests(orgId, { includeArchived: true }, db);
    const foundInEmpList = employeeList.items.find((r: any) => r.id === req.leaveRequest.id);
    expect(foundInEmpList).toBeDefined();
    expect(foundInEmpList?.status).toBe("APPROVED");
  });
});
