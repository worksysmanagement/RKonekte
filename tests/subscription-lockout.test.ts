import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashPassword } from "../src/lib/auth/password";

const mockState = vi.hoisted(() => ({
  session: null as any,
  organizations: [] as any[],
  users: [] as any[],
  renewals: [] as any[],
  setSessionCookie: vi.fn(async () => "mock-token"),
  clearSessionCookie: vi.fn(async () => {}),
  setStoppedNoticeCookie: vi.fn(async () => "stopped-token"),
  clearStoppedNoticeCookie: vi.fn(async () => {}),
}));

function buildMockSupabase() {
  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      const ilikeFilters: Record<string, string> = {};

      const matchRow = (row: any) => {
        for (const [k, v] of Object.entries(filters)) {
          if (row[k] !== v) return false;
        }
        for (const [k, v] of Object.entries(ilikeFilters)) {
          if (String(row[k] || "").toLowerCase() !== String(v).toLowerCase()) return false;
        }
        return true;
      };

      const executeQuery = (singleMode: "list" | "maybeSingle" | "single") => {
        const source =
          table === "organizations"
            ? mockState.organizations
            : table === "users"
            ? mockState.users
            : table === "subscription_renewals"
            ? mockState.renewals
            : [];
        const rows = source.filter(matchRow);
        if (singleMode === "maybeSingle" || singleMode === "single") {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
        return Promise.resolve({ data: rows, error: null });
      };

      const builder: any = {
        select() {
          return builder;
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
        single() {
          return executeQuery("single");
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
    clearSessionCookie: mockState.clearSessionCookie,
    setStoppedNoticeCookie: mockState.setStoppedNoticeCookie,
    clearStoppedNoticeCookie: mockState.clearStoppedNoticeCookie,
  };
});

import { POST as loginPost } from "../src/app/api/auth/login/route";
import { GET as meGet } from "../src/app/api/auth/me/route";
import { GET as myPermissionsGet } from "../src/app/api/admin/my-permissions/route";
import { POST as changePasswordPost } from "../src/app/api/auth/change-password/route";

describe("Strict Expired Subscription Lockout", () => {
  const dayMs = 86400_000;
  let validHash = "";

  beforeEach(async () => {
    const now = Date.now();
    if (!validHash) {
      validHash = await hashPassword("SecretPass#1");
    }

    mockState.session = null;
    mockState.setSessionCookie.mockClear();
    mockState.clearSessionCookie.mockClear();
    mockState.setStoppedNoticeCookie.mockClear();
    mockState.clearStoppedNoticeCookie.mockClear();
    mockState.renewals = [];

    mockState.organizations = [
      {
        id: "org-ebiznis-exp",
        name: "e-biznis",
        slug: "e-biznis",
        email: "rodjensky.piton@esih.edu",
        status: "ACTIVE",
        activated_at: now - 32 * dayMs,
        last_renewed_at: null,
        subscription_expires_at: now - 2 * dayMs, // Expired 2 days ago
        service_stopped: false, // Even WITHOUT manual cutoff, access must be locked!
        service_stopped_at: null,
        created_at: now - 35 * dayMs,
        updated_at: now - 35 * dayMs,
      },
    ];

    mockState.users = [
      {
        id: "usr-ebiz-admin",
        organization_id: "org-ebiznis-exp",
        branch_id: null,
        name: "Rodjensky Emmanuel Piton",
        email: "rodjensky.piton@esih.edu",
        password_hash: validHash,
        role: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        created_at: now - 35 * dayMs,
        updated_at: now - 35 * dayMs,
      },
      {
        id: "usr-ebiz-emp",
        organization_id: "org-ebiznis-exp",
        branch_id: null,
        name: "Jean Employe",
        email: "employe@ebiznis.ht",
        password_hash: validHash,
        role: "EMPLOYEE",
        status: "ACTIVE",
        created_at: now - 20 * dayMs,
        updated_at: now - 20 * dayMs,
      },
    ];
  });

  it("blocks login for org admin & employees when subscription is expired without manual serviceStopped", async () => {
    // 1. Admin login must be rejected with SERVICE_STOPPED_ADMIN and stoppedContext (not session)
    const adminReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.1",
      },
      body: JSON.stringify({
        email: "rodjensky.piton@esih.edu",
        password: "SecretPass#1",
      }),
    });

    const adminRes = await loginPost(adminReq);
    expect(adminRes.status).toBe(403);
    const adminJson = await adminRes.json();
    expect(adminJson.code).toBe("SERVICE_STOPPED_ADMIN");
    expect(adminJson.isAdmin).toBe(true);
    expect(adminJson.stoppedContext?.resumed).toBe(false);
    expect(adminJson.stoppedContext?.state?.isExpired).toBe(true);
    expect(mockState.setSessionCookie).not.toHaveBeenCalled();
    expect(mockState.setStoppedNoticeCookie).toHaveBeenCalledTimes(1);

    // 2. Employee login must be rejected with SERVICE_STOPPED_EMPLOYEE
    const empReq = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.2",
      },
      body: JSON.stringify({
        email: "employe@ebiznis.ht",
        password: "SecretPass#1",
      }),
    });

    const empRes = await loginPost(empReq);
    expect(empRes.status).toBe(403);
    const empJson = await empRes.json();
    expect(empJson.code).toBe("SERVICE_STOPPED_EMPLOYEE");
    expect(empJson.isAdmin).toBe(false);
    expect(empJson.stoppedContext?.message).toMatch(/expiré|administrateur/i);
    expect(mockState.setSessionCookie).not.toHaveBeenCalled();
  });

  it("prioritizes DISABLED org check ahead of subscription lockout on login", async () => {
    mockState.organizations[0].status = "DISABLED";

    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.3",
      },
      body: JSON.stringify({
        email: "rodjensky.piton@esih.edu",
        password: "SecretPass#1",
      }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBeUndefined();
    expect(json.error).toMatch(/désactivée/i);
    expect(mockState.setStoppedNoticeCookie).not.toHaveBeenCalled();
  });

  it("disconnects existing sessions on /api/auth/me, /api/admin/my-permissions, and /api/auth/change-password when expired", async () => {
    mockState.session = {
      id: "usr-ebiz-admin",
      name: "Rodjensky Emmanuel Piton",
      email: "rodjensky.piton@esih.edu",
      role: "ORGANIZATION_ADMIN",
      organizationId: "org-ebiznis-exp",
    };

    // 1. /api/auth/me returns unauthenticated & clears lm_session
    const meReq = new NextRequest("http://localhost:3000/api/auth/me");
    const meRes = await meGet(meReq);
    const meJson = await meRes.json();
    expect(meJson.authenticated).toBe(false);
    expect(meJson.serviceStopped).toBe(true);
    expect(meJson.user).toBeNull();
    expect(mockState.clearSessionCookie).toHaveBeenCalled();
    expect(mockState.setStoppedNoticeCookie).toHaveBeenCalled();

    // 2. /api/admin/my-permissions rejects with 403 SERVICE_STOPPED and expires lm_session cookie
    const permRes = await myPermissionsGet();
    expect(permRes.status).toBe(403);
    const permJson = await permRes.json();
    expect(permJson.code).toBe("SERVICE_STOPPED");
    expect(permRes.cookies.get("lm_session")?.value).toBe("");

    // 3. /api/auth/change-password rejects with 403 SERVICE_STOPPED
    const pwdReq = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "SecretPass#1",
        newPassword: "NewStrongPass#2",
      }),
    });
    const pwdRes = await changePasswordPost(pwdReq);
    expect(pwdRes.status).toBe(403);
    const pwdJson = await pwdRes.json();
    expect(pwdJson.code).toBe("SERVICE_STOPPED");

    // 4. Once SuperAdmin grants a future expiration date, access is immediately restored
    mockState.organizations[0].subscription_expires_at = Date.now() + 30 * dayMs;
    const restoredMeRes = await meGet(meReq);
    const restoredMeJson = await restoredMeRes.json();
    expect(restoredMeJson.authenticated).toBe(true);
    expect(restoredMeJson.serviceStopped).toBe(false);
    expect(restoredMeJson.subscriptionSummary?.isExpired).toBe(false);
    expect(restoredMeJson.subscriptionSummary?.isAccessBlocked).toBe(false);

    const restoredPermRes = await myPermissionsGet();
    expect(restoredPermRes.status).toBe(200);
  });
});
