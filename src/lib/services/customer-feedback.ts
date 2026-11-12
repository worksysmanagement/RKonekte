import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { listBranches, getBranchById } from "@/lib/services/branches";
import { getOrganizationById } from "@/lib/services/organizations";
import { branches as branchesTable, organizations as organizationsTable } from "@/db/schema";
import {
  customerFeedbackQr,
  customerFeedback,
} from "@/lib/services/customer-feedback-schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const FEEDBACK_CATEGORIES = [
  "Expérience de livraison",
  "Accueil et service client",
  "Temps d'attente",
  "Personnel",
  "Autre",
] as const;

export interface CustomerFeedbackQrModel {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCity: string;
  uniqueToken: string;
  publicUrl: string;
  isActive: boolean;
  feedbackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerFeedbackModel {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCity: string;
  qrCodeId: string | null;
  customerName: string | null;
  category: string | null;
  comment: string;
  isFavorite: boolean;
  createdAt: number;
}

export interface CustomerFeedbackStats {
  totalCount: number;
  currentMonthCount: number;
  favoritesCount: number;
}

export interface CustomerFeedbackFilters {
  year?: number | null;
  month?: number | null; // 1-12
  branchId?: string | null;
  favoritesOnly?: boolean;
  search?: string | null;
}

export interface PublicQrResolution {
  found: boolean;
  active: boolean;
  qrCodeId?: string;
  organizationId?: string;
  organizationName?: string;
  organizationLogo?: string | null;
  branchId?: string;
  branchName?: string;
  branchCity?: string;
}

export class QrAlreadyExistsError extends Error {
  existingQr: CustomerFeedbackQrModel;
  constructor(existingQr: CustomerFeedbackQrModel) {
    super(
      "Cette succursale possède déjà un QR Code unique. Impossible d'en générer un deuxième."
    );
    this.name = "QrAlreadyExistsError";
    this.existingQr = existingQr;
  }
}

export class CustomerFeedbackDomainError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "CustomerFeedbackDomainError";
    this.statusCode = statusCode;
  }
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildPublicUrl(token: string, origin?: string): string {
  const cleanOrigin = (origin || "").trim().replace(/\/+$/, "");
  return cleanOrigin ? `${cleanOrigin}/avis/${token}` : `/avis/${token}`;
}

export async function ensureCustomerFeedbackSqliteTables(db: any) {
  await db
    .run(sql`
      CREATE TABLE IF NOT EXISTS customer_feedback_qr (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL UNIQUE,
        unique_token TEXT NOT NULL UNIQUE,
        public_url TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    .catch(() => {});

  await db
    .run(sql`
      CREATE TABLE IF NOT EXISTS customer_feedback (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        qr_code_id TEXT,
        customer_name TEXT,
        category TEXT,
        comment TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)
    .catch(() => {});

  await db
    .run(sql`CREATE UNIQUE INDEX IF NOT EXISTS cf_qr_branch_uidx ON customer_feedback_qr(branch_id)`)
    .catch(() => {});
  await db
    .run(sql`CREATE UNIQUE INDEX IF NOT EXISTS cf_qr_token_uidx ON customer_feedback_qr(unique_token)`)
    .catch(() => {});
}

function mapQrRow(
  row: any,
  branchMap: Map<string, { name: string; city: string }>,
  countMap: Map<string, number>
): CustomerFeedbackQrModel {
  const bId = row.branch_id ?? row.branchId;
  const branchInfo = branchMap.get(bId);
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId,
    branchId: bId,
    branchName: branchInfo?.name || "Succursale",
    branchCity: branchInfo?.city || "",
    uniqueToken: row.unique_token ?? row.uniqueToken,
    publicUrl: row.public_url ?? row.publicUrl,
    isActive: Boolean(row.is_active ?? row.isActive ?? true),
    feedbackCount: countMap.get(row.id) || 0,
    createdAt: Number(row.created_at ?? row.createdAt ?? Date.now()),
    updatedAt: Number(row.updated_at ?? row.updatedAt ?? Date.now()),
  };
}

function mapFeedbackRow(
  row: any,
  branchMap: Map<string, { name: string; city: string }>
): CustomerFeedbackModel {
  const bId = row.branch_id ?? row.branchId;
  const branchInfo = branchMap.get(bId);
  const rawName = row.customer_name ?? row.customerName ?? null;
  const cleanName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
  const rawCategory = row.category ?? null;
  const cleanCategory =
    typeof rawCategory === "string" && rawCategory.trim() ? rawCategory.trim() : null;

  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId,
    branchId: bId,
    branchName: branchInfo?.name || "Succursale",
    branchCity: branchInfo?.city || "",
    qrCodeId: row.qr_code_id ?? row.qrCodeId ?? null,
    customerName: cleanName,
    category: cleanCategory,
    comment: String(row.comment ?? ""),
    isFavorite: Boolean(row.is_favorite ?? row.isFavorite ?? false),
    createdAt: Number(row.created_at ?? row.createdAt ?? Date.now()),
  };
}

async function getBranchLookupMap(
  organizationId: string,
  dbInstance?: any
): Promise<Map<string, { name: string; city: string }>> {
  const branchesList = await listBranches(organizationId, dbInstance);
  const map = new Map<string, { name: string; city: string }>();
  for (const b of branchesList) {
    map.set(b.id, { name: b.name, city: b.city || "" });
  }
  return map;
}

// ====================================================
// QR CODES MANAGEMENT (CMS)
// ====================================================

export async function listCustomerQrCodes(
  organizationId: string,
  dbInstance?: any
): Promise<CustomerFeedbackQrModel[]> {
  const branchMap = await getBranchLookupMap(organizationId, dbInstance);
  const feedbackCountMap = new Map<string, number>();

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const [{ data: qrRows, error: qrErr }, { data: fbRows, error: fbErr }] =
      await Promise.all([
        supabase
          .from("customer_feedback_qr")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_feedback")
          .select("qr_code_id")
          .eq("organization_id", organizationId),
      ]);

    if (qrErr) {
      throw new Error(`Supabase error (customer_feedback_qr): ${qrErr.message}`);
    }
    if (!fbErr && Array.isArray(fbRows)) {
      for (const r of fbRows) {
        if (r.qr_code_id) {
          feedbackCountMap.set(
            r.qr_code_id,
            (feedbackCountMap.get(r.qr_code_id) || 0) + 1
          );
        }
      }
    }

    return (qrRows || []).map((row: any) =>
      mapQrRow(row, branchMap, feedbackCountMap)
    );
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);
  const [qrRows, fbRows] = await Promise.all([
    db
      .select()
      .from(customerFeedbackQr)
      .where(eq(customerFeedbackQr.organizationId, organizationId))
      .orderBy(desc(customerFeedbackQr.createdAt)),
    db
      .select({ qrCodeId: customerFeedback.qrCodeId })
      .from(customerFeedback)
      .where(eq(customerFeedback.organizationId, organizationId)),
  ]);

  for (const r of fbRows) {
    if (r.qrCodeId) {
      feedbackCountMap.set(r.qrCodeId, (feedbackCountMap.get(r.qrCodeId) || 0) + 1);
    }
  }

  return qrRows.map((row: any) => mapQrRow(row, branchMap, feedbackCountMap));
}

export async function generateBranchQrCode(
  organizationId: string,
  branchId: string,
  origin?: string,
  dbInstance?: any
): Promise<CustomerFeedbackQrModel> {
  const cleanBranchId = (branchId || "").trim();
  if (!cleanBranchId) {
    throw new CustomerFeedbackDomainError(
      "Veuillez sélectionner une succursale.",
      400
    );
  }

  // 1. Verify branch exists AND belongs to this organization
  const orgBranches = await listBranches(organizationId, dbInstance);
  const targetBranch =
    orgBranches.find((b) => b.id === cleanBranchId) ||
    (await getBranchById(organizationId, cleanBranchId, dbInstance));

  if (!targetBranch || targetBranch.organizationId !== organizationId) {
    throw new CustomerFeedbackDomainError(
      "Succursale introuvable pour cette entreprise.",
      404
    );
  }

  // 2. Enforce 1 BRANCH = 1 QR CODE strictly before insertion
  const existingList = await listCustomerQrCodes(organizationId, dbInstance);
  const existingForBranch = existingList.find((q) => q.branchId === cleanBranchId);
  if (existingForBranch) {
    throw new QrAlreadyExistsError(existingForBranch);
  }

  const now = Date.now();
  const id = `qr-${now}-${crypto.randomUUID().slice(0, 8)}`;
  const uniqueToken = generateQrToken();
  const publicUrl = buildPublicUrl(uniqueToken, origin);

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customer_feedback_qr")
      .insert({
        id,
        organization_id: organizationId,
        branch_id: cleanBranchId,
        unique_token: uniqueToken,
        public_url: publicUrl,
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      // Unique constraint violation (23505) on concurrent insert
      if (
        error.code === "23505" ||
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.toLowerCase().includes("unique")
      ) {
        const refreshed = await listCustomerQrCodes(organizationId, dbInstance);
        const found = refreshed.find((q) => q.branchId === cleanBranchId);
        if (found) throw new QrAlreadyExistsError(found);
      }
      throw new Error(`Supabase error creating QR code: ${error.message}`);
    }

    const branchMap = new Map([[targetBranch.id, { name: targetBranch.name, city: targetBranch.city || "" }]]);
    return mapQrRow(data, branchMap, new Map());
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);
  try {
    await db.insert(customerFeedbackQr).values({
      id,
      organizationId,
      branchId: cleanBranchId,
      uniqueToken,
      publicUrl,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (
      String(err?.message || "")
        .toLowerCase()
        .includes("unique") ||
      String(err?.code || "").includes("SQLITE_CONSTRAINT")
    ) {
      const refreshed = await listCustomerQrCodes(organizationId, dbInstance);
      const found = refreshed.find((q) => q.branchId === cleanBranchId);
      if (found) throw new QrAlreadyExistsError(found);
    }
    throw err;
  }

  return {
    id,
    organizationId,
    branchId: cleanBranchId,
    branchName: targetBranch.name,
    branchCity: targetBranch.city || "",
    uniqueToken,
    publicUrl,
    isActive: true,
    feedbackCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function toggleCustomerQrStatus(
  organizationId: string,
  qrId: string,
  isActive: boolean,
  dbInstance?: any
): Promise<CustomerFeedbackQrModel> {
  const now = Date.now();

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customer_feedback_qr")
      .update({
        is_active: isActive,
        updated_at: now,
      })
      .eq("id", qrId)
      .eq("organization_id", organizationId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(`Supabase error updating QR code: ${error.message}`);
    }
    if (!data) {
      throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
    }

    const list = await listCustomerQrCodes(organizationId, dbInstance);
    const updated = list.find((q) => q.id === qrId);
    if (!updated) {
      throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
    }
    return updated;
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);
  const [existing] = await db
    .select()
    .from(customerFeedbackQr)
    .where(
      and(
        eq(customerFeedbackQr.id, qrId),
        eq(customerFeedbackQr.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
  }

  await db
    .update(customerFeedbackQr)
    .set({ isActive, updatedAt: now })
    .where(
      and(
        eq(customerFeedbackQr.id, qrId),
        eq(customerFeedbackQr.organizationId, organizationId)
      )
    );

  const list = await listCustomerQrCodes(organizationId, dbInstance);
  const updated = list.find((q) => q.id === qrId);
  if (!updated) {
    throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
  }
  return updated;
}

export async function deleteCustomerQrCode(
  organizationId: string,
  qrId: string,
  dbInstance?: any
): Promise<{ deleted: true }> {
  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("customer_feedback_qr")
      .select("id, is_active")
      .eq("id", qrId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`Supabase error fetching QR code: ${fetchErr.message}`);
    }
    if (!existing) {
      throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
    }
    if (Boolean(existing.is_active)) {
      throw new CustomerFeedbackDomainError(
        "Impossible de supprimer un QR Code actif. Désactivez-le d'abord.",
        409
      );
    }

    // Preserve existing customer feedback for the branch by unlinking qr_code_id before deletion
    const { error: unlinkErr } = await supabase
      .from("customer_feedback")
      .update({ qr_code_id: null })
      .eq("qr_code_id", qrId)
      .eq("organization_id", organizationId);

    if (unlinkErr) {
      throw new Error(`Supabase error unlinking feedback: ${unlinkErr.message}`);
    }

    const { error: delErr } = await supabase
      .from("customer_feedback_qr")
      .delete()
      .eq("id", qrId)
      .eq("organization_id", organizationId);

    if (delErr) {
      throw new Error(`Supabase error deleting QR code: ${delErr.message}`);
    }

    return { deleted: true };
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);

  const [existing] = await db
    .select()
    .from(customerFeedbackQr)
    .where(
      and(
        eq(customerFeedbackQr.id, qrId),
        eq(customerFeedbackQr.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new CustomerFeedbackDomainError("QR Code introuvable.", 404);
  }
  if (Boolean(existing.isActive)) {
    throw new CustomerFeedbackDomainError(
      "Impossible de supprimer un QR Code actif. Désactivez-le d'abord.",
      409
    );
  }

  await db
    .update(customerFeedback)
    .set({ qrCodeId: null })
    .where(
      and(
        eq(customerFeedback.qrCodeId, qrId),
        eq(customerFeedback.organizationId, organizationId)
      )
    );

  await db
    .delete(customerFeedbackQr)
    .where(
      and(
        eq(customerFeedbackQr.id, qrId),
        eq(customerFeedbackQr.organizationId, organizationId)
      )
    );

  return { deleted: true };
}

// ====================================================
// PUBLIC ROUTE RESOLUTION & SUBMISSION (/avis/[token])
// ====================================================

export async function resolvePublicQrByToken(
  token: string,
  dbInstance?: any
): Promise<PublicQrResolution> {
  const cleanToken = (token || "").trim();
  if (!cleanToken || cleanToken.length < 8 || cleanToken.length > 128) {
    return { found: false, active: false };
  }

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data: qrRow, error } = await supabase
      .from("customer_feedback_qr")
      .select("id, organization_id, branch_id, unique_token, is_active")
      .eq("unique_token", cleanToken)
      .maybeSingle();

    if (error || !qrRow) {
      return { found: false, active: false };
    }

    const [{ data: branchRow }, { data: orgRow }] = await Promise.all([
      supabase
        .from("branches")
        .select("id, name, city")
        .eq("id", qrRow.branch_id)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("id, name, logo_url, status")
        .eq("id", qrRow.organization_id)
        .maybeSingle(),
    ]);

    const isOrgActive = orgRow ? orgRow.status === "ACTIVE" : true;

    return {
      found: true,
      active: Boolean(qrRow.is_active) && isOrgActive,
      qrCodeId: qrRow.id,
      organizationId: qrRow.organization_id,
      organizationName: orgRow?.name || "Notre entreprise",
      organizationLogo: orgRow?.logo_url ?? null,
      branchId: qrRow.branch_id,
      branchName: branchRow?.name || "Succursale",
      branchCity: branchRow?.city || "",
    };
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);

  const [qrRow] = await db
    .select()
    .from(customerFeedbackQr)
    .where(eq(customerFeedbackQr.uniqueToken, cleanToken))
    .limit(1);

  if (!qrRow) {
    return { found: false, active: false };
  }

  const [branchRow] = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.id, qrRow.branchId))
    .limit(1);

  const [orgRow] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, qrRow.organizationId))
    .limit(1);

  const fallbackOrg = orgRow || (await getOrganizationById(qrRow.organizationId, db));
  const isOrgActive = fallbackOrg ? fallbackOrg.status === "ACTIVE" : true;

  return {
    found: true,
    active: Boolean(qrRow.isActive) && isOrgActive,
    qrCodeId: qrRow.id,
    organizationId: qrRow.organizationId,
    organizationName: fallbackOrg?.name || "Notre entreprise",
    organizationLogo: fallbackOrg?.logoUrl ?? null,
    branchId: qrRow.branchId,
    branchName: branchRow?.name || "Succursale",
    branchCity: branchRow?.city || "",
  };
}

export interface SubmitPublicFeedbackInput {
  customerName?: string | null;
  category?: string | null;
  comment: string;
  website?: string; // Honeypot field
}

export async function submitPublicFeedback(
  token: string,
  input: SubmitPublicFeedbackInput,
  dbInstance?: any
): Promise<{
  feedback: CustomerFeedbackModel;
  organizationName: string;
  branchName: string;
}> {
  // Honeypot anti-spam check
  if (typeof input.website === "string" && input.website.trim().length > 0) {
    throw new CustomerFeedbackDomainError(
      "Soumission refusée par le filtre anti-spam.",
      400
    );
  }

  // Server-side verification of token & active status
  const resolved = await resolvePublicQrByToken(token, dbInstance);
  if (!resolved.found || !resolved.qrCodeId || !resolved.organizationId || !resolved.branchId) {
    throw new CustomerFeedbackDomainError(
      "Ce QR Code est invalide ou introuvable.",
      404
    );
  }
  if (!resolved.active) {
    throw new CustomerFeedbackDomainError(
      "Ce QR Code est actuellement désactivé et n'accepte plus d'avis.",
      403
    );
  }

  const rawComment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (rawComment.length < 3) {
    throw new CustomerFeedbackDomainError(
      "Veuillez saisir un commentaire d'au moins 3 caractères.",
      400
    );
  }
  if (rawComment.length > 2000) {
    throw new CustomerFeedbackDomainError(
      "Le commentaire ne doit pas dépasser 2000 caractères.",
      400
    );
  }

  const cleanName =
    typeof input.customerName === "string" && input.customerName.trim().length > 0
      ? input.customerName.trim().slice(0, 100)
      : null;

  let cleanCategory: string | null = null;
  if (typeof input.category === "string" && input.category.trim().length > 0) {
    const trimmedCat = input.category.trim().slice(0, 80);
    cleanCategory = trimmedCat;
  }

  const now = Date.now();
  const id = `fb-${now}-${crypto.randomUUID().slice(0, 8)}`;

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customer_feedback")
      .insert({
        id,
        organization_id: resolved.organizationId,
        branch_id: resolved.branchId,
        qr_code_id: resolved.qrCodeId,
        customer_name: cleanName,
        category: cleanCategory,
        comment: rawComment,
        is_favorite: false,
        created_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Supabase error inserting feedback: ${error.message}`);
    }

    const branchMap = new Map([
      [
        resolved.branchId,
        {
          name: resolved.branchName || "Succursale",
          city: resolved.branchCity || "",
        },
      ],
    ]);

    return {
      feedback: mapFeedbackRow(data, branchMap),
      organizationName: resolved.organizationName || "Notre entreprise",
      branchName: resolved.branchName || "Succursale",
    };
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);
  await db.insert(customerFeedback).values({
    id,
    organizationId: resolved.organizationId,
    branchId: resolved.branchId,
    qrCodeId: resolved.qrCodeId,
    customerName: cleanName,
    category: cleanCategory,
    comment: rawComment,
    isFavorite: false,
    createdAt: now,
  });

  return {
    feedback: {
      id,
      organizationId: resolved.organizationId,
      branchId: resolved.branchId,
      branchName: resolved.branchName || "Succursale",
      branchCity: resolved.branchCity || "",
      qrCodeId: resolved.qrCodeId,
      customerName: cleanName,
      category: cleanCategory,
      comment: rawComment,
      isFavorite: false,
      createdAt: now,
    },
    organizationName: resolved.organizationName || "Notre entreprise",
    branchName: resolved.branchName || "Succursale",
  };
}

// ====================================================
// FEEDBACK CONSULTATION, FAVORITES & DELETION (CMS)
// ====================================================

export async function listCustomerFeedback(
  organizationId: string,
  filters?: CustomerFeedbackFilters,
  dbInstance?: any
): Promise<{
  feedback: CustomerFeedbackModel[];
  stats: CustomerFeedbackStats;
  availableYears: number[];
  availableMonths: number[];
}> {
  const branchMap = await getBranchLookupMap(organizationId, dbInstance);

  let allRows: CustomerFeedbackModel[] = [];

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("customer_feedback")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Supabase error fetching customer_feedback: ${error.message}`);
    }
    allRows = (data || []).map((r: any) => mapFeedbackRow(r, branchMap));
  } else {
    const db = dbInstance || getDb();
    await ensureCustomerFeedbackSqliteTables(db);
    const rows = await db
      .select()
      .from(customerFeedback)
      .where(eq(customerFeedback.organizationId, organizationId))
      .orderBy(desc(customerFeedback.createdAt));

    allRows = rows.map((r: any) => mapFeedbackRow(r, branchMap));
  }

  // Real database statistics across the organization
  const nowDate = new Date();
  const currentYear = nowDate.getFullYear();
  const currentMonth = nowDate.getMonth() + 1;

  let currentMonthCount = 0;
  let favoritesCount = 0;
  const yearsSet = new Set<number>();
  const monthsSet = new Set<number>();

  for (const item of allRows) {
    const d = new Date(item.createdAt);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;

    yearsSet.add(y);
    if (!filters?.year || y === filters.year) {
      monthsSet.add(m);
    }

    if (y === currentYear && m === currentMonth) {
      currentMonthCount += 1;
    }
    if (item.isFavorite) {
      favoritesCount += 1;
    }
  }

  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
  const availableMonths = Array.from(monthsSet).sort((a, b) => a - b);

  // Apply requested filters
  const searchNorm = (filters?.search || "").trim().toLowerCase();

  const filtered = allRows.filter((item) => {
    const d = new Date(item.createdAt);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;

    if (filters?.year && y !== filters.year) return false;
    if (filters?.month && m !== filters.month) return false;
    if (filters?.branchId && filters.branchId !== "ALL" && item.branchId !== filters.branchId) {
      return false;
    }
    if (filters?.favoritesOnly && !item.isFavorite) return false;

    if (searchNorm) {
      const displayName = (item.customerName || "Client anonyme").toLowerCase();
      const commentLower = item.comment.toLowerCase();
      if (!displayName.includes(searchNorm) && !commentLower.includes(searchNorm)) {
        return false;
      }
    }

    return true;
  });

  return {
    feedback: filtered,
    stats: {
      totalCount: allRows.length,
      currentMonthCount,
      favoritesCount,
    },
    availableYears,
    availableMonths,
  };
}

export async function toggleCustomerFeedbackFavorite(
  organizationId: string,
  feedbackId: string,
  isFavorite?: boolean,
  dbInstance?: any
): Promise<CustomerFeedbackModel> {
  const branchMap = await getBranchLookupMap(organizationId, dbInstance);

  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("customer_feedback")
      .select("*")
      .eq("id", feedbackId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`Supabase error fetching feedback: ${fetchErr.message}`);
    }
    if (!existing) {
      throw new CustomerFeedbackDomainError("Commentaire introuvable.", 404);
    }

    const nextValue =
      typeof isFavorite === "boolean" ? isFavorite : !Boolean(existing.is_favorite);

    const { data: updated, error: updateErr } = await supabase
      .from("customer_feedback")
      .update({ is_favorite: nextValue })
      .eq("id", feedbackId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (updateErr) {
      throw new Error(`Supabase error updating favorite: ${updateErr.message}`);
    }

    return mapFeedbackRow(updated, branchMap);
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);

  const [existing] = await db
    .select()
    .from(customerFeedback)
    .where(
      and(
        eq(customerFeedback.id, feedbackId),
        eq(customerFeedback.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new CustomerFeedbackDomainError("Commentaire introuvable.", 404);
  }

  const nextValue =
    typeof isFavorite === "boolean" ? isFavorite : !Boolean(existing.isFavorite);

  await db
    .update(customerFeedback)
    .set({ isFavorite: nextValue })
    .where(
      and(
        eq(customerFeedback.id, feedbackId),
        eq(customerFeedback.organizationId, organizationId)
      )
    );

  return mapFeedbackRow({ ...existing, isFavorite: nextValue }, branchMap);
}

export async function deleteCustomerFeedback(
  organizationId: string,
  feedbackId: string,
  dbInstance?: any
): Promise<{ deleted: true }> {
  if (!dbInstance && isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("customer_feedback")
      .select("id")
      .eq("id", feedbackId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`Supabase error verifying feedback: ${fetchErr.message}`);
    }
    if (!existing) {
      throw new CustomerFeedbackDomainError("Commentaire introuvable.", 404);
    }

    const { error: delErr } = await supabase
      .from("customer_feedback")
      .delete()
      .eq("id", feedbackId)
      .eq("organization_id", organizationId);

    if (delErr) {
      throw new Error(`Supabase error deleting feedback: ${delErr.message}`);
    }

    return { deleted: true };
  }

  const db = dbInstance || getDb();
  await ensureCustomerFeedbackSqliteTables(db);

  const [existing] = await db
    .select()
    .from(customerFeedback)
    .where(
      and(
        eq(customerFeedback.id, feedbackId),
        eq(customerFeedback.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new CustomerFeedbackDomainError("Commentaire introuvable.", 404);
  }

  await db
    .delete(customerFeedback)
    .where(
      and(
        eq(customerFeedback.id, feedbackId),
        eq(customerFeedback.organizationId, organizationId)
      )
    );

  return { deleted: true };
}
