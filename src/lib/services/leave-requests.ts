import { getDb } from "@/lib/db/client";
import {
  leaveRequests,
  auditLogs,
  organizations,
  LeaveRequest,
  InsertLeaveRequest,
} from "@/db/schema";
import { eq, and, desc, sql, like, or, isNull, notLike } from "drizzle-orm";
import { generateSecureToken, hashToken, generateRequestNumber } from "@/lib/security/tokens";
import { SubmitLeaveRequestInput } from "@/lib/validation/schemas";
import { notifySecretaryNewRequest, notifyEmployeeDecision } from "@/lib/notifications/service";
import { supabaseDb } from "@/lib/supabase/db";
import { isSubscriptionAccessBlocked } from "@/lib/utils/subscription";

export interface CreateLeaveRequestResult {
  leaveRequest: LeaveRequest;
  rawAccessToken: string;
}

export async function createLeaveRequest(
  input: SubmitLeaveRequestInput,
  meta?: { ip?: string; userAgent?: string },
  dbInstance?: any
): Promise<CreateLeaveRequestResult> {
  if (!dbInstance) {
    const res = await supabaseDb.leaveRequests.create(input, meta);
    try {
      await notifySecretaryNewRequest(res.leaveRequest.id, res.rawAccessToken);
    } catch (_) {}
    return res;
  }
  const db = dbInstance || getDb();
  const now = Date.now();

  // 1. Verify organization is active
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, input.organizationId), eq(organizations.status, "ACTIVE")))
    .limit(1);

  if (!org) {
    throw new Error("Organisation introuvable ou inactive");
  }
  if (isSubscriptionAccessBlocked(org)) {
    throw new Error(
      "L'abonnement de cette entreprise a expiré ou le service est suspendu."
    );
  }

  // 2. Count total global requests to generate globally unique request number
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(leaveRequests);
  let sequence = (countResult[0]?.count || 0) + 1;
  let requestNumber = generateRequestNumber(sequence);

  // Ensure unique requestNumber
  let [existing] = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(eq(leaveRequests.requestNumber, requestNumber))
    .limit(1);

  while (existing) {
    sequence += 1;
    requestNumber = generateRequestNumber(sequence);
    [existing] = await db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(eq(leaveRequests.requestNumber, requestNumber))
      .limit(1);
  }

  // 3. Generate random secure access token & calculate SHA-256 hash
  const rawAccessToken = generateSecureToken();
  const tokenHash = await hashToken(rawAccessToken);

  const newRequestId = `req-${crypto.randomUUID()}`;

  const insertData: InsertLeaveRequest = {
    id: newRequestId,
    organizationId: input.organizationId,
    requestNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    employeeNumber: input.employeeNumber,
    department: input.department,
    position: input.position,
    leaveType: input.leaveType,
    leaveTypeOther: input.leaveTypeOther || null,
    startDate: input.startDate,
    endDate: input.endDate,
    requestedDays: input.requestedDays,
    replacementName: input.replacementName || null,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail || null,
    status: "PENDING",
    employeeAccessTokenHash: tokenHash,
    ipAddress: meta?.ip || null,
    userAgent: meta?.userAgent || null,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(leaveRequests).values(insertData);

  // 5. Create Audit Log
  await db.insert(auditLogs).values({
    id: `audit-${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    userId: null, // Submitted by employee
    leaveRequestId: newRequestId,
    action: "SUBMITTED",
    oldStatus: null,
    newStatus: "PENDING",
    metadata: JSON.stringify({
      requestNumber,
      requestedDays: input.requestedDays,
      leaveType: input.leaveType,
      employeeSignature: (input as any).employeeSignature,
      signatureMode: (input as any).signatureMode,
      typedSignatureText: (input as any).typedSignatureText,
      branch: (input as any).branch,
    }),
    createdAt: now,
  });

  // 6. Asynchronously trigger secretary notification
  try {
    await notifySecretaryNewRequest(newRequestId, rawAccessToken, db);
  } catch (err) {
    console.error("Failed to notify secretary for request:", newRequestId, err);
  }

  const [created] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, newRequestId))
    .limit(1);

  return {
    leaveRequest: created,
    rawAccessToken,
  };
}

/**
 * Public portal retrieval: finds leave request by employee raw token hash.
 * Never exposes internal tokens or secrets.
 */
export async function getLeaveRequestByToken(rawToken: string, dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.leaveRequests.getByToken(rawToken);
  }
  const db = dbInstance || getDb();
  const tokenHash = await hashToken(rawToken);

  const [req] = await db
    .select({
      id: leaveRequests.id,
      requestNumber: leaveRequests.requestNumber,
      firstName: leaveRequests.firstName,
      lastName: leaveRequests.lastName,
      department: leaveRequests.department,
      position: leaveRequests.position,
      leaveType: leaveRequests.leaveType,
      leaveTypeOther: leaveRequests.leaveTypeOther,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      requestedDays: leaveRequests.requestedDays,
      replacementName: leaveRequests.replacementName,
      status: leaveRequests.status,
      rejectionReason: leaveRequests.rejectionReason,
      submittedAt: leaveRequests.submittedAt,
      decidedAt: leaveRequests.decidedAt,
      createdAt: leaveRequests.createdAt,
      organizationName: organizations.name,
      organizationLogo: organizations.logoUrl,
    })
    .from(leaveRequests)
    .innerJoin(organizations, eq(leaveRequests.organizationId, organizations.id))
    .where(
      or(
        eq(leaveRequests.employeeAccessTokenHash, tokenHash),
        eq(leaveRequests.employeeAccessTokenHash, rawToken)
      )
    )
    .limit(1);

  if (req && req.status === "APPROVED") {
    const [audit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.leaveRequestId, req.id), eq(auditLogs.action, "APPROVED")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (audit?.metadata) {
      try {
        const meta = typeof audit.metadata === "string" ? JSON.parse(audit.metadata) : audit.metadata;
        (req as any).signatureUrl = meta?.signatureUrl;
        (req as any).signerName = meta?.signerName;
        (req as any).signerRole = meta?.signerRole;
      } catch (_) {}
    }
  }

  if (req) {
    const [submitAudit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.leaveRequestId, req.id), eq(auditLogs.action, "SUBMITTED")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (submitAudit?.metadata) {
      try {
        const meta = typeof submitAudit.metadata === "string" ? JSON.parse(submitAudit.metadata) : submitAudit.metadata;
        (req as any).employeeSignature = meta?.employeeSignature;
        (req as any).signatureMode = meta?.signatureMode;
        (req as any).typedSignatureText = meta?.typedSignatureText;
        (req as any).branch = meta?.branch;
      } catch (_) {}
    }
  }

  return req || null;
}

/**
 * Tenant-scoped query for request details.
 */
export async function getLeaveRequestById(id: string, organizationId: string, dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.leaveRequests.getById(id);
  }
  const db = dbInstance || getDb();
  const [req] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.organizationId, organizationId)))
    .limit(1);

  if (req && req.status === "APPROVED") {
    const [audit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.leaveRequestId, req.id), eq(auditLogs.action, "APPROVED")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (audit?.metadata) {
      try {
        const meta = typeof audit.metadata === "string" ? JSON.parse(audit.metadata) : audit.metadata;
        (req as any).signatureUrl = meta?.signatureUrl;
        (req as any).signerName = meta?.signerName;
        (req as any).signerRole = meta?.signerRole;
      } catch (_) {}
    }
  }

  if (req) {
    const [submitAudit] = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.leaveRequestId, req.id), eq(auditLogs.action, "SUBMITTED")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (submitAudit?.metadata) {
      try {
        const meta = typeof submitAudit.metadata === "string" ? JSON.parse(submitAudit.metadata) : submitAudit.metadata;
        (req as any).employeeSignature = meta?.employeeSignature;
        (req as any).signatureMode = meta?.signatureMode;
        (req as any).typedSignatureText = meta?.typedSignatureText;
        (req as any).branch = meta?.branch;
      } catch (_) {}
    }

    const [org] = await db
      .select({ name: organizations.name, logoUrl: organizations.logoUrl })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (org) {
      (req as any).organizationName = org.name;
      (req as any).organizationLogo = org.logoUrl;
    }
  }

  return req || null;
}

/**
 * Tenant-scoped paginated request list with status and search filters.
 */
export async function listLeaveRequests(
  organizationId: string,
  options: {
    page?: number;
    limit?: number;
    status?: "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    search?: string;
    employeeNumber?: string;
    contactEmail?: string;
    includeArchived?: boolean;
  } = {},
  dbInstance?: any
) {
  if (!dbInstance) {
    const all = await supabaseDb.leaveRequests.list(organizationId, options);
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const offset = (page - 1) * limit;
    const items = all.slice(offset, offset + limit);
    return {
      items,
      pagination: {
        page,
        limit,
        total: all.length,
        totalPages: Math.ceil(all.length / limit),
      },
    };
  }
  const db = dbInstance || getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const offset = (page - 1) * limit;

  const conditions = [eq(leaveRequests.organizationId, organizationId)];

  if (!options.includeArchived) {
    conditions.push(
      or(
        isNull(leaveRequests.decisionComment),
        notLike(leaveRequests.decisionComment, "%[ADMIN_ARCHIVED]%")
      )!
    );
  }

  if (options.status && options.status !== "ALL") {
    conditions.push(eq(leaveRequests.status, options.status));
  }

  if (options.employeeNumber) {
    conditions.push(eq(leaveRequests.employeeNumber, options.employeeNumber));
  }

  if (options.contactEmail) {
    conditions.push(like(leaveRequests.contactEmail, options.contactEmail));
  }

  if (options.search && options.search.trim().length > 0) {
    const q = `%${options.search.trim()}%`;
    conditions.push(
      or(
        like(leaveRequests.firstName, q),
        like(leaveRequests.lastName, q),
        like(leaveRequests.employeeNumber, q),
        like(leaveRequests.requestNumber, q),
        like(leaveRequests.department, q)
      )!
    );
  }

  const whereClause = and(...conditions);

  // Total count
  const [countRes] = await db
    .select({ total: sql<number>`count(*)` })
    .from(leaveRequests)
    .where(whereClause);
  const total = countRes?.total || 0;

  // Items
  const items = await db
    .select()
    .from(leaveRequests)
    .where(whereClause)
    .orderBy(desc(leaveRequests.submittedAt))
    .limit(limit)
    .offset(offset);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Atomic approval with double decision protection.
 */
export async function approveLeaveRequest(
  id: string,
  organizationId: string,
  userId: string,
  comment?: string,
  signatureDataOrDb?: {
    signatureUrl?: string;
    signerName?: string;
    signerRole?: string;
  } | any,
  dbInstance?: any
): Promise<{ success: boolean; leaveRequest: LeaveRequest }> {
  let signatureData: { signatureUrl?: string; signerName?: string; signerRole?: string } | undefined;
  let resolvedDb = dbInstance;

  if (signatureDataOrDb && (typeof signatureDataOrDb.select === "function" || typeof signatureDataOrDb.run === "function")) {
    resolvedDb = signatureDataOrDb;
  } else if (signatureDataOrDb) {
    signatureData = signatureDataOrDb;
  }

  if (!resolvedDb) {
    const updated = await supabaseDb.leaveRequests.approve(id, organizationId, userId, comment, signatureData);
    try {
      await notifyEmployeeDecision(id, updated.employeeAccessTokenHash);
    } catch (_) {}
    return { success: true, leaveRequest: updated };
  }
  const db = resolvedDb;
  const now = Date.now();

  // Strict atomic check: must belong to tenant AND status must be PENDING
  const updateResult = await db
    .update(leaveRequests)
    .set({
      status: "APPROVED",
      decidedAt: now,
      decidedBy: userId,
      decisionComment: comment || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(leaveRequests.id, id),
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.status, "PENDING")
      )
    )
    .returning();

  const updated = updateResult[0];
  if (!updated) {
    throw new Error("La demande n'est plus en attente ou n'a pas été trouvée");
  }

  // Audit log
  await db.insert(auditLogs).values({
    id: `audit-${crypto.randomUUID()}`,
    organizationId,
    userId,
    leaveRequestId: id,
    action: "APPROVED",
    oldStatus: "PENDING",
    newStatus: "APPROVED",
    metadata: JSON.stringify({
      comment,
      signatureUrl: signatureData?.signatureUrl,
      signerName: signatureData?.signerName,
      signerRole: signatureData?.signerRole,
    }),
    createdAt: now,
  });

  // Asynchronous employee notification
  try {
    await notifyEmployeeDecision(id, updated.employeeAccessTokenHash, db);
  } catch (err) {
    console.error("Notification failure after approval:", err);
  }

  return { success: true, leaveRequest: updated };
}

/**
 * Atomic rejection with mandatory reason and double decision protection.
 */
export async function rejectLeaveRequest(
  id: string,
  organizationId: string,
  userId: string,
  rejectionReason: string,
  comment?: string,
  dbInstance?: any
): Promise<{ success: boolean; leaveRequest: LeaveRequest }> {
  if (!rejectionReason || rejectionReason.trim().length < 3) {
    throw new Error("La raison du refus est obligatoire");
  }

  if (!dbInstance) {
    const updated = await supabaseDb.leaveRequests.reject(id, organizationId, userId, rejectionReason, comment);
    try {
      await notifyEmployeeDecision(id, updated.employeeAccessTokenHash);
    } catch (_) {}
    return { success: true, leaveRequest: updated };
  }

  const db = dbInstance || getDb();
  const now = Date.now();

  // Strict atomic check: must belong to tenant AND status must be PENDING
  const updateResult = await db
    .update(leaveRequests)
    .set({
      status: "REJECTED",
      rejectionReason: rejectionReason.trim(),
      decidedAt: now,
      decidedBy: userId,
      decisionComment: comment || null,
      updatedAt: now,
    })
    .where(
      and(
        eq(leaveRequests.id, id),
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.status, "PENDING")
      )
    )
    .returning();

  const updated = updateResult[0];
  if (!updated) {
    throw new Error("La demande n'est plus en attente ou n'a pas été trouvée");
  }

  // Audit log
  await db.insert(auditLogs).values({
    id: `audit-${crypto.randomUUID()}`,
    organizationId,
    userId,
    leaveRequestId: id,
    action: "REJECTED",
    oldStatus: "PENDING",
    newStatus: "REJECTED",
    metadata: JSON.stringify({ rejectionReason, comment }),
    createdAt: now,
  });

  // Asynchronous employee notification
  try {
    await notifyEmployeeDecision(id, updated.employeeAccessTokenHash, db);
  } catch (err) {
    console.error("Notification failure after rejection:", err);
  }

  return { success: true, leaveRequest: updated };
}

export async function deleteLeaveRequest(
  id: string,
  organizationId: string,
  userId?: string,
  userName?: string,
  dbInstance?: any
): Promise<{ success: boolean; leaveRequest?: LeaveRequest; actionTaken?: "REJECTED" | "ARCHIVED_FOR_ADMIN" }> {
  const db = dbInstance || getDb();
  const now = Date.now();

  try {
    const [existing] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.organizationId, organizationId)))
      .limit(1);

    if (existing) {
      // 1. SI LA DEMANDE ÉTAIT DÉJÀ APPROUVÉE :
      // On NE change PAS son statut vers REJECTED ! Elle reste APPROVED pour l'employé.
      // On la marque simplement comme archivée pour libérer l'espace côté administration.
      if (existing.status === "APPROVED") {
        const existingComment = existing.decisionComment || "";
        const updatedComment = existingComment.includes("[ADMIN_ARCHIVED]")
          ? existingComment
          : existingComment
          ? `${existingComment} [ADMIN_ARCHIVED]`
          : "[ADMIN_ARCHIVED]";

        const updateResult = await db
          .update(leaveRequests)
          .set({
            decisionComment: updatedComment,
            updatedAt: now,
          })
          .where(
            and(
              eq(leaveRequests.id, id),
              eq(leaveRequests.organizationId, organizationId)
            )
          )
          .returning();

        try {
          await db.insert(auditLogs).values({
            id: `audit-${crypto.randomUUID()}`,
            organizationId,
            userId: userId || null,
            leaveRequestId: id,
            action: "APPROVED",
            oldStatus: "APPROVED",
            newStatus: "APPROVED",
            metadata: JSON.stringify({ archivedByAdmin: true, source: "ADMIN_ARCHIVE" }),
            createdAt: now,
          });
        } catch (_) {}

        try {
          await supabaseDb.leaveRequests.delete(id, organizationId, userId || "Administration");
        } catch (_) {}

        return {
          success: true,
          leaveRequest: updateResult[0] || existing,
          actionTaken: "ARCHIVED_FOR_ADMIN",
        };
      }

      // 2. SI LA DEMANDE ÉTAIT EN ATTENTE (PENDING) :
      // Elle bascule vers REJECTED avec notification à l'employé et motif explicite
      if (existing.status === "PENDING") {
        const reason = "Demande rejetée et supprimée par l'Administration.";
        const comment = userName
          ? `Supprimée par ${userName} depuis l'Administration [ADMIN_ARCHIVED]`
          : "Supprimée depuis l'Administration [ADMIN_ARCHIVED]";

        const updateResult = await db
          .update(leaveRequests)
          .set({
            status: "REJECTED",
            rejectionReason: reason,
            decidedAt: now,
            decidedBy: userId || null,
            decisionComment: comment,
            updatedAt: now,
          })
          .where(
            and(
              eq(leaveRequests.id, id),
              eq(leaveRequests.organizationId, organizationId)
            )
          )
          .returning();

        const updated = updateResult[0];
        if (updated) {
          try {
            await db.insert(auditLogs).values({
              id: `audit-${crypto.randomUUID()}`,
              organizationId,
              userId: userId || null,
              leaveRequestId: id,
              action: "REJECTED",
              oldStatus: "PENDING",
              newStatus: "REJECTED",
              metadata: JSON.stringify({ rejectionReason: reason, source: "ADMIN_DELETE" }),
              createdAt: now,
            });
          } catch (_) {}

          try {
            await notifyEmployeeDecision(id, updated.employeeAccessTokenHash, db);
          } catch (_) {}

          try {
            await supabaseDb.leaveRequests.delete(id, organizationId, userId || "Administration");
          } catch (_) {}

          return { success: true, leaveRequest: updated, actionTaken: "REJECTED" };
        }
      }

      // 3. SI LA DEMANDE ÉTAIT DÉJÀ REJETÉE OU ANNULÉE :
      const existingComment = existing.decisionComment || "";
      const updatedComment = existingComment.includes("[ADMIN_ARCHIVED]")
        ? existingComment
        : existingComment
        ? `${existingComment} [ADMIN_ARCHIVED]`
        : "[ADMIN_ARCHIVED]";

      const updateResult = await db
        .update(leaveRequests)
        .set({
          decisionComment: updatedComment,
          updatedAt: now,
        })
        .where(
          and(
            eq(leaveRequests.id, id),
            eq(leaveRequests.organizationId, organizationId)
          )
        )
        .returning();

      try {
        await supabaseDb.leaveRequests.delete(id, organizationId, userId || "Administration");
      } catch (_) {}

      return {
        success: true,
        leaveRequest: updateResult[0] || existing,
        actionTaken: "ARCHIVED_FOR_ADMIN",
      };
    }
  } catch (err) {
    console.error("deleteLeaveRequest error:", err);
  }

  try {
    await supabaseDb.leaveRequests.delete(id, organizationId, userId || "Administration");
  } catch (_) {}

  return { success: true };
}
