import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { auditLogs, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const HEARTBEAT_THROTTLE_MS = 45 * 1000; // Avoid excessive writes during frequent polls

const lastHeartbeatMemoryMap = new Map<string, number>();

export function isUserOnlineNow(
  lastSeenAt: number | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = ONLINE_WINDOW_MS
): boolean {
  if (lastSeenAt == null || !Number.isFinite(lastSeenAt)) return false;
  return nowMs - lastSeenAt <= windowMs && lastSeenAt <= nowMs + 60_000;
}

export interface RecordUserLoginParams {
  userId: string;
  organizationId?: string | null;
  role?: string | null;
  email?: string | null;
  nowMs?: number;
  source?: "LOGIN" | "ACTIVATION" | "RESET_PASSWORD";
  skipAuditLog?: boolean;
  dbInstance?: any;
}

/**
 * Persists a real user login (sets last_login_at and last_seen_at on `users`
 * and adds a historical USER_LOGIN event in `audit_logs` for tenant users).
 * Fails safely if columns are not yet present on unmigrated environments.
 */
export async function recordUserLoginActivity(params: RecordUserLoginParams): Promise<void> {
  const now = params.nowMs ?? Date.now();
  const { userId, organizationId, role, email, source = "LOGIN", skipAuditLog = false, dbInstance } = params;

  if (!userId) return;

  if (!dbInstance) {
    lastHeartbeatMemoryMap.set(userId, now);

    // 1. Update Supabase users table
    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from("users")
        .update({
          last_login_at: now,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", userId);

      if (organizationId && !skipAuditLog) {
        await supabase.from("audit_logs").insert({
          id: `audit-login-${now}-${crypto.randomUUID().slice(0, 8)}`,
          organization_id: organizationId,
          user_id: userId,
          action: "USER_LOGIN",
          old_status: null,
          new_status: "LOGGED_IN",
          metadata: JSON.stringify({
            role: role || null,
            email: email || null,
            source,
            loginAt: now,
          }),
          created_at: now,
        });
      }
    } catch (_) {}
  }

  // 2. Update local Drizzle SQLite (either explicit test db or best-effort mirror)
  try {
    const db = dbInstance || getDb();
    await db
      .update(users)
      .set({
        lastLoginAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    if (organizationId && !skipAuditLog) {
      await db.insert(auditLogs).values({
        id: `audit-login-${now}-${crypto.randomUUID().slice(0, 8)}`,
        organizationId,
        userId,
        action: "USER_LOGIN",
        oldStatus: null,
        newStatus: "LOGGED_IN",
        metadata: JSON.stringify({
          role: role || null,
          email: email || null,
          source,
          loginAt: now,
        }),
        createdAt: now,
      });
    }
  } catch (_) {}
}

export interface RecordHeartbeatParams {
  userId: string;
  nowMs?: number;
  minIntervalMs?: number;
  dbInstance?: any;
}

/**
 * Updates `last_seen_at` for an active authenticated session (throttled in-memory).
 */
export async function recordUserHeartbeat(params: RecordHeartbeatParams): Promise<void> {
  const now = params.nowMs ?? Date.now();
  const minInterval = params.minIntervalMs ?? HEARTBEAT_THROTTLE_MS;
  const { userId, dbInstance } = params;

  if (!userId) return;

  if (!dbInstance) {
    const prev = lastHeartbeatMemoryMap.get(userId);
    if (prev && now - prev < minInterval) {
      return;
    }
    lastHeartbeatMemoryMap.set(userId, now);

    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from("users")
        .update({ last_seen_at: now })
        .eq("id", userId);
    } catch (_) {}
    return;
  }

  try {
    await dbInstance
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, userId));
  } catch (_) {}
}
