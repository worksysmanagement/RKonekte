import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mockState = vi.hoisted(() => ({
  session: null as any,
  organizations: [] as any[],
  users: [] as any[],
  auditLogs: [] as any[],
  failOrgUpdate: false,
  failUserUpdate: false,
  failAuditUpdate: false,
  throwSupabase: false,
  setSessionCookie: vi.fn(async () => "mock-token"),
  clearStoppedNoticeCookie: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
}));

function buildMockSupabase() {
  if (mockState.throwSupabase) {
    throw new Error("Simulated Supabase connection error");
  }

  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      const ilikeFilters: Record<string, string> = {};
      let pendingUpdate: any = null;
      let pendingInsert: any = null;

      const matchRow = (row: any) => {
        for (const [k, v] of Object.entries(filters)) {
          if (row[k] !== v) return false;
        }
        for (const [k, v] of Object.entries(ilikeFilters)) {
          if (String(row[k] || "").toLowerCase() !== String(v).toLowerCase()) return false;
        }
        return true;
      };

      const executeQuery = (singleMode: "list" | "maybeSingle") => {
        if (pendingInsert) {
          if (table === "audit_logs") {
            mockState.auditLogs.push({ ...pendingInsert });
          }
          return Promise.resolve({ data: pendingInsert, error: null });
        }

        if (pendingUpdate) {
          if (table === "organizations") {
            if (mockState.failOrgUpdate && pendingUpdate.status === "ACTIVE") {
              return Promise.resolve({
                data: null,
                error: { message: "Failed to update organization" },
              });
            }
            const idx = mockState.organizations.findIndex(matchRow);
            if (idx === -1) return Promise.resolve({ data: null, error: null });
            mockState.organizations[idx] = { ...mockState.organizations[idx], ...pendingUpdate };
            return Promise.resolve({ data: mockState.organizations[idx], error: null });
          }
          if (table === "users") {
            if (mockState.failUserUpdate && pendingUpdate.status === "ACTIVE") {
              return Promise.resolve({
                data: null,
                error: { message: "Failed to update user" },
              });
            }
            const idx = mockState.users.findIndex(matchRow);
            if (idx === -1) return Promise.resolve({ data: null, error: null });
            mockState.users[idx] = { ...mockState.users[idx], ...pendingUpdate };
            return Promise.resolve({ data: mockState.users[idx], error: null });
          }
          if (table === "audit_logs") {
            if (mockState.failAuditUpdate) {
              return Promise.resolve({
                data: null,
                error: { message: "Failed to update audit log" },
              });
            }
            const idx = mockState.auditLogs.findIndex(matchRow);
            if (idx === -1) return Promise.resolve({ data: null, error: null });
            mockState.auditLogs[idx] = { ...mockState.auditLogs[idx], ...pendingUpdate };
            return Promise.resolve({ data: mockState.auditLogs[idx], error: null });
          }
        }

        const source =
          table === "organizations"
            ? mockState.organizations
            : table === "users"
            ? mockState.users
            : mockState.auditLogs;
        const rows = source.filter(matchRow);
        if (singleMode === "maybeSingle") {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
        return Promise.resolve({ data: rows, error: null });
      };

      const builder: any = {
        select() {
          return builder;
        },
        update(payload: any) {
          pendingUpdate = payload;
          return builder;
        },
        insert(payload: any) {
          pendingInsert = payload;
          return executeQuery("maybeSingle");
        },
        eq(col: string, val: any) {
          filters[col] = val;
          return builder;
        },
        ilike(col: string, val: string) {
          ilikeFilters[col] = val;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return executeQuery("maybeSingle");
        },
        then(resolve: any, reject: any) {
          return executeQuery("list").then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: () => buildMockSupabase(),
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/auth/session")>(
    "../src/lib/auth/session"
  );
  return {
    ...actual,
    getSession: vi.fn(async () => mockState.session),
    setSessionCookie: mockState.setSessionCookie,
    clearStoppedNoticeCookie: mockState.clearStoppedNoticeCookie,
  };
});

vi.mock("@/lib/services/subscriptions", () => ({
  addCalendarMonths: (ts: number, months: number) => ts + months * 30 * 86400000,
  getPlatformSubscriptionSettings: vi.fn(async () => ({ trialMonths: 1 })),
  sendSubscriptionActivationWelcomeEmail: mockState.sendWelcomeEmail,
}));

import { POST as verifyCompanyPost } from "../src/app/api/public/verify-company/route";
import { requireTenantUser, handleApiError } from "../src/lib/auth/guard";

describe("Company Activation Atomicity & Disabled Tenant Guards", () => {
  beforeEach(() => {
    const now = Date.now();
    mockState.session = null;
    mockState.failOrgUpdate = false;
    mockState.failUserUpdate = false;
    mockState.failAuditUpdate = false;
    mockState.throwSupabase = false;
    mockState.setSessionCookie.mockClear();
    mockState.clearStoppedNoticeCookie.mockClear();
    mockState.sendWelcomeEmail.mockClear();

    mockState.organizations = [
      {
        id: "org-jeff-test",
        name: "Jeff Int",
        slug: "jeff-int",
        email: "despeinesjeff13@gmail.com",
        status: "DISABLED",
        activated_at: null,
        subscription_expires_at: null,
        service_stopped: false,
        service_stopped_at: null,
        created_at: now,
        updated_at: now,
      },
    ];
    mockState.users = [
      {
        id: "usr-jeff-admin",
        organization_id: "org-jeff-test",
        branch_id: null,
        name: "Rodjensky Emmanuel Piton",
        email: "despeinesjeff13@gmail.com",
        password_hash: "NO_PASSWORD_SET",
        role: "ORGANIZATION_ADMIN",
        status: "DISABLED",
        created_at: now,
        updated_at: now,
      },
    ];
    mockState.auditLogs = [
      {
        id: "audit-jeff-1",
        organization_id: "org-jeff-test",
        action: "SUBMITTED",
        new_status: "PENDING_VERIFICATION",
        metadata: JSON.stringify({
          companyName: "Jeff Int",
          companyEmail: "despeinesjeff13@gmail.com",
          applicantName: "Rodjensky Emmanuel Piton",
          verificationToken: "tok-jeff-123",
          isRevoked: false,
          emailVerified: false,
          passwordSet: false,
        }),
        created_at: now,
      },
    ];
  });

  it("never sets session cookie or leaves half-activated DB when organization activation fails", async () => {
    mockState.failOrgUpdate = true;

    const req = new NextRequest("http://localhost:3000/api/public/verify-company", {
      method: "POST",
      body: JSON.stringify({ token: "tok-jeff-123", password: "StrongPassword@1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await verifyCompanyPost(req);
    expect(res.status).toBe(500);
    expect(mockState.setSessionCookie).not.toHaveBeenCalled();
    expect(mockState.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(mockState.organizations[0].status).toBe("DISABLED");
    expect(mockState.users[0].status).toBe("DISABLED");
    expect(mockState.users[0].password_hash).toBe("NO_PASSWORD_SET");
  });

  it("rolls back organization status to DISABLED when user password update fails", async () => {
    mockState.failUserUpdate = true;

    const req = new NextRequest("http://localhost:3000/api/public/verify-company", {
      method: "POST",
      body: JSON.stringify({ token: "tok-jeff-123", password: "StrongPassword@1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await verifyCompanyPost(req);
    expect(res.status).toBe(500);
    expect(mockState.setSessionCookie).not.toHaveBeenCalled();
    expect(mockState.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(mockState.organizations[0].status).toBe("DISABLED");
    expect(mockState.organizations[0].activated_at).toBeNull();
    expect(mockState.users[0].status).toBe("DISABLED");
  });

  it("activates org, admin user, and audit log atomically before establishing session cookie", async () => {
    const req = new NextRequest("http://localhost:3000/api/public/verify-company", {
      method: "POST",
      body: JSON.stringify({ token: "tok-jeff-123", password: "StrongPassword@1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await verifyCompanyPost(req);
    expect(res.status).toBe(200);
    expect(mockState.organizations[0].status).toBe("ACTIVE");
    expect(mockState.organizations[0].activated_at).toBeTruthy();
    expect(mockState.users[0].status).toBe("ACTIVE");
    expect(mockState.users[0].password_hash).not.toBe("NO_PASSWORD_SET");

    const updatedMeta = JSON.parse(mockState.auditLogs[0].metadata);
    expect(updatedMeta.passwordSet).toBe(true);
    expect(updatedMeta.emailVerified).toBe(true);
    expect(mockState.clearStoppedNoticeCookie).toHaveBeenCalledTimes(1);
    expect(mockState.setSessionCookie).toHaveBeenCalledTimes(1);
    expect(mockState.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects API access and clears lm_session cookie when org or user is DISABLED / NO_PASSWORD_SET", async () => {
    mockState.session = {
      id: "usr-jeff-admin",
      name: "Rodjensky Emmanuel Piton",
      email: "despeinesjeff13@gmail.com",
      role: "ORGANIZATION_ADMIN",
      organizationId: "org-jeff-test",
    };

    // Case 1: Disabled org + NO_PASSWORD_SET
    let caught: unknown;
    try {
      await requireTenantUser();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    const resDisabled = handleApiError(caught);
    expect(resDisabled.status).toBe(403);
    expect(resDisabled.cookies.get("lm_session")?.value).toBe("");

    // Case 2: Org active, but user still DISABLED / NO_PASSWORD_SET
    mockState.organizations[0].status = "ACTIVE";
    caught = undefined;
    try {
      await requireTenantUser();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    const resUserDisabled = handleApiError(caught);
    expect(resUserDisabled.status).toBe(403);
    expect(resUserDisabled.cookies.get("lm_session")?.value).toBe("");

    // Case 3: Both ACTIVE + real password -> allowed
    mockState.users[0].status = "ACTIVE";
    mockState.users[0].password_hash = "pbkdf2:100000:abc:def";
    const ctx = await requireTenantUser();
    expect(ctx.organizationId).toBe("org-jeff-test");

    // Case 4: Service stopped -> 403 SERVICE_STOPPED + clears cookie
    mockState.organizations[0].service_stopped = true;
    caught = undefined;
    try {
      await requireTenantUser();
    } catch (e) {
      caught = e;
    }
    const resStopped = handleApiError(caught);
    expect(resStopped.status).toBe(403);
    const body = await resStopped.json();
    expect(body.code).toBe("SERVICE_STOPPED");
    expect(resStopped.cookies.get("lm_session")?.value).toBe("");

    // Case 5: Expired subscription (even with service_stopped = false) -> 403 SERVICE_STOPPED + clears cookie
    mockState.organizations[0].service_stopped = false;
    mockState.organizations[0].subscription_expires_at = Date.now() - 2 * 86400000;
    caught = undefined;
    try {
      await requireTenantUser();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    const resExpired = handleApiError(caught);
    expect(resExpired.status).toBe(403);
    const expiredBody = await resExpired.json();
    expect(expiredBody.code).toBe("SERVICE_STOPPED");
    expect(resExpired.cookies.get("lm_session")?.value).toBe("");

    // Case 6: SuperAdmin renews expiration to future date -> access restored immediately
    mockState.organizations[0].subscription_expires_at = Date.now() + 30 * 86400000;
    const restoredCtx = await requireTenantUser();
    expect(restoredCtx.organizationId).toBe("org-jeff-test");
  });
});
