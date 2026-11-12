import fs from "fs";
import path from "path";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { companyEvents, Employee, Branch } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { listEmployees } from "@/lib/services/employees";
import { listBranches } from "@/lib/services/branches";
import { getOrganizationById } from "@/lib/services/organizations";
import { sendEmail, generateCompanyEventEmail } from "@/lib/notifications/email";

export type EventType =
  | "MEETING"
  | "TRAINING"
  | "HOLIDAY"
  | "ANNOUNCEMENT"
  | "WORKSHOP"
  | "PERSONAL";

export type AudienceType =
  | "ALL_EMPLOYEES"
  | "DEPARTMENT"
  | "BRANCH"
  | "CUSTOM";

export interface CompanyEvent {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  type: EventType;
  personalCategory?: string;
  location: string;
  audienceType?: AudienceType;
  audienceTargetName?: string;
  audienceBranchId?: string;
  targetEmployeeIds?: string[];
  notifyImmediate: boolean;
  reminder24h: boolean;
  isPersonal: boolean;
  creatorUserId?: string;
  creatorEmployeeId?: string;
  creatorEmployeeNumber?: string;
  creatorName?: string;
  recipientsCount?: number;
  emailsSentCount?: number;
  emailsFailedCount?: number;
  createdAt: string;
}

export interface CreateCompanyEventInput {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: EventType;
  personalCategory?: string;
  location?: string;
  audienceType?: AudienceType;
  audienceTargetName?: string;
  audienceBranchId?: string;
  targetEmployeeIds?: string[];
  notifyImmediate?: boolean;
  reminder24h?: boolean;
  isPersonal?: boolean;
}

export interface EventUserContext {
  userId: string;
  role: string;
  name: string;
  email: string;
  employeeId?: string | null;
  employeeNumber?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  department?: string | null;
}

export interface EventEmailStats {
  totalTargeted: number;
  withEmail: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
}

const EVENT_TYPE_LABELS_FR: Record<EventType, string> = {
  MEETING: "Réunion",
  TRAINING: "Formation",
  HOLIDAY: "Férié / Congé",
  ANNOUNCEMENT: "Annonce générale",
  WORKSHOP: "Atelier de travail",
  PERSONAL: "Personnel",
};

const DATA_DIR = path.join(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "company-events.json");

export function isEmployeeRole(role?: string | null): boolean {
  if (!role) return true;
  const r = role.toLowerCase();
  return (
    role === "EMPLOYEE" ||
    role === "COLLABORATEUR" ||
    role === "CASHIER" ||
    role === "CAISSIER" ||
    r.includes("employ") ||
    r.includes("collab") ||
    r.includes("caissier") ||
    r.includes("cashier") ||
    r.includes("operat")
  );
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

function parseTargetIds(raw: any): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : undefined;
    } catch (_) {
      return undefined;
    }
  }
  return undefined;
}

function mapRowToEvent(row: any): CompanyEvent {
  const createdMs = Number(row.created_at ?? row.createdAt ?? Date.now());
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.organizationId,
    title: row.title,
    description: row.description || "",
    date: row.event_date ?? row.date,
    startTime: row.start_time ?? row.startTime ?? "09:00",
    endTime: row.end_time ?? row.endTime ?? "10:00",
    type: (row.event_type ?? row.type ?? "MEETING") as EventType,
    personalCategory: row.personal_category ?? row.personalCategory ?? undefined,
    location: row.location || "",
    audienceType: (row.audience_type ?? row.audienceType ?? undefined) as AudienceType | undefined,
    audienceTargetName: row.audience_target_name ?? row.audienceTargetName ?? undefined,
    audienceBranchId: row.audience_branch_id ?? row.audienceBranchId ?? undefined,
    targetEmployeeIds: parseTargetIds(row.target_employee_ids ?? row.targetEmployeeIds),
    notifyImmediate: Boolean(row.notify_immediate ?? row.notifyImmediate ?? true),
    reminder24h: Boolean(row.reminder_24h ?? row.reminder24h ?? true),
    isPersonal: Boolean(row.is_personal ?? row.isPersonal ?? false),
    creatorUserId: row.creator_user_id ?? row.creatorUserId ?? undefined,
    creatorEmployeeId: row.creator_employee_id ?? row.creatorEmployeeId ?? undefined,
    creatorEmployeeNumber: row.creator_employee_number ?? row.creatorEmployeeNumber ?? undefined,
    creatorName: row.creator_name ?? row.creatorName ?? undefined,
    recipientsCount: Number(row.recipients_count ?? row.recipientsCount ?? 0),
    emailsSentCount: Number(row.emails_sent_count ?? row.emailsSentCount ?? 0),
    emailsFailedCount: Number(row.emails_failed_count ?? row.emailsFailedCount ?? 0),
    createdAt: Number.isFinite(createdMs)
      ? new Date(createdMs).toISOString()
      : String(row.createdAt || new Date().toISOString()),
  };
}

function loadJsonFallback(organizationId: string): CompanyEvent[] {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return [];
    const raw = fs.readFileSync(EVENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((ev: CompanyEvent) => ev.organizationId === organizationId);
  } catch (_) {
    return [];
  }
}

function saveJsonFallback(allEvents: CompanyEvent[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(allEvents, null, 2), "utf-8");
  } catch (_) {}
}

function loadAllJsonFallback(): CompanyEvent[] {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return [];
    const raw = fs.readFileSync(EVENTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function ensureSqliteTable(db: any) {
  await db
    .run(sql`
      CREATE TABLE IF NOT EXISTS company_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        start_time TEXT NOT NULL DEFAULT '09:00',
        end_time TEXT NOT NULL DEFAULT '10:00',
        event_type TEXT NOT NULL,
        personal_category TEXT,
        location TEXT,
        audience_type TEXT,
        audience_target_name TEXT,
        audience_branch_id TEXT,
        target_employee_ids TEXT,
        notify_immediate INTEGER NOT NULL DEFAULT 1,
        reminder_24h INTEGER NOT NULL DEFAULT 1,
        is_personal INTEGER NOT NULL DEFAULT 0,
        creator_user_id TEXT,
        creator_employee_id TEXT,
        creator_employee_number TEXT,
        creator_name TEXT,
        recipients_count INTEGER NOT NULL DEFAULT 0,
        emails_sent_count INTEGER NOT NULL DEFAULT 0,
        emails_failed_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `)
    .catch(() => {});
}

async function fetchOrganizationEvents(
  organizationId: string,
  dbInstance?: any
): Promise<CompanyEvent[]> {
  if (dbInstance) {
    await ensureSqliteTable(dbInstance);
    const rows = await dbInstance
      .select()
      .from(companyEvents)
      .where(eq(companyEvents.organizationId, organizationId))
      .orderBy(desc(companyEvents.createdAt));
    return rows.map(mapRowToEvent);
  }

  // 1. Primary: Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from("company_events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        return data.map(mapRowToEvent);
      }
    } catch (_) {}
  }

  // 2. Fallback: local SQLite
  try {
    const db = getDb();
    await ensureSqliteTable(db);
    const rows = await db
      .select()
      .from(companyEvents)
      .where(eq(companyEvents.organizationId, organizationId))
      .orderBy(desc(companyEvents.createdAt));
    if (rows.length > 0) {
      return rows.map(mapRowToEvent);
    }
  } catch (_) {}

  // 3. Fallback: local JSON store
  return loadJsonFallback(organizationId);
}

/**
 * Resolves the target employees for an administrative company event.
 */
export function resolveTargetEmployees(params: {
  activeEmployees: Employee[];
  branches: Branch[];
  audienceType: AudienceType;
  audienceBranchId?: string;
  audienceTargetName?: string;
  targetEmployeeIds?: string[];
}): {
  targetEmployees: Employee[];
  audienceTargetName: string;
  audienceBranchId?: string;
  targetEmployeeIds?: string[];
} {
  const { activeEmployees, branches, audienceType } = params;

  if (audienceType === "ALL_EMPLOYEES") {
    return {
      targetEmployees: activeEmployees,
      audienceTargetName: "Tous les employés",
    };
  }

  if (audienceType === "BRANCH") {
    const branchIdInput = (params.audienceBranchId || "").trim();
    const branchNameInput = (params.audienceTargetName || "").trim();
    const matchedBranch =
      (branchIdInput ? branches.find((b) => b.id === branchIdInput) : undefined) ||
      (branchNameInput
        ? branches.find(
            (b) => b.name.trim().toLowerCase() === branchNameInput.toLowerCase()
          )
        : undefined);

    if (!matchedBranch) {
      throw new Error("Veuillez sélectionner une succursale valide.");
    }

    const branchEmployees = activeEmployees.filter(
      (emp) => emp.branchId === matchedBranch.id
    );

    return {
      targetEmployees: branchEmployees,
      audienceTargetName: matchedBranch.name,
      audienceBranchId: matchedBranch.id,
    };
  }

  if (audienceType === "DEPARTMENT") {
    const dept = (params.audienceTargetName || "").trim();
    if (!dept) {
      throw new Error("Veuillez sélectionner ou renseigner un département.");
    }

    const deptEmployees = activeEmployees.filter(
      (emp) => (emp.department || "").trim().toLowerCase() === dept.toLowerCase()
    );

    return {
      targetEmployees: deptEmployees,
      audienceTargetName: dept,
    };
  }

  // CUSTOM: Groupe d'employés personnalisé
  const uniqueIds = Array.from(
    new Set(
      (params.targetEmployeeIds || [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) {
    throw new Error("Veuillez sélectionner au moins un employé.");
  }

  const selected = activeEmployees.filter((emp) => uniqueIds.includes(emp.id));
  if (selected.length === 0) {
    throw new Error("Aucun employé valide trouvé dans la sélection.");
  }

  const summaryName =
    selected.length <= 2
      ? selected.map((e) => `${e.firstName} ${e.lastName}`.trim()).join(", ")
      : `${selected[0].firstName} ${selected[0].lastName}, ${selected[1].firstName} ${selected[1].lastName} (+${selected.length - 2})`;

  return {
    targetEmployees: selected,
    audienceTargetName: summaryName,
    targetEmployeeIds: selected.map((e) => e.id),
  };
}

/**
 * Checks whether an employee / user is allowed to see a given event.
 */
export function isEventVisibleToUser(
  ev: CompanyEvent,
  user: EventUserContext
): boolean {
  if (ev.isPersonal || ev.type === "PERSONAL") {
    if (ev.creatorUserId && ev.creatorUserId === user.userId) return true;
    if (ev.creatorEmployeeId && user.employeeId && ev.creatorEmployeeId === user.employeeId)
      return true;
    if (
      ev.creatorEmployeeNumber &&
      user.employeeNumber &&
      ev.creatorEmployeeNumber === user.employeeNumber
    )
      return true;
    return false;
  }

  // Official administration event
  if (!isEmployeeRole(user.role)) {
    return true;
  }

  if (!ev.audienceType || ev.audienceType === "ALL_EMPLOYEES") {
    return true;
  }

  if (ev.audienceType === "BRANCH") {
    if (ev.audienceBranchId && user.branchId) {
      return ev.audienceBranchId === user.branchId;
    }
    if (ev.audienceTargetName && user.branchName) {
      return (
        ev.audienceTargetName.trim().toLowerCase() ===
        user.branchName.trim().toLowerCase()
      );
    }
    return false;
  }

  if (ev.audienceType === "DEPARTMENT") {
    if (!ev.audienceTargetName || !user.department) return false;
    return (
      user.department.trim().toLowerCase() ===
      ev.audienceTargetName.trim().toLowerCase()
    );
  }

  if (ev.audienceType === "CUSTOM") {
    if (
      user.employeeId &&
      Array.isArray(ev.targetEmployeeIds) &&
      ev.targetEmployeeIds.includes(user.employeeId)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

export async function listEventsForUser(
  organizationId: string,
  user: EventUserContext,
  dbInstance?: any
): Promise<CompanyEvent[]> {
  const all = await fetchOrganizationEvents(organizationId, dbInstance);
  return all.filter((ev) => isEventVisibleToUser(ev, user));
}

export async function createCompanyEvent(
  organizationId: string,
  input: CreateCompanyEventInput,
  user: EventUserContext,
  options?: {
    origin?: string;
    dbInstance?: any;
    emailSender?: typeof sendEmail;
  }
): Promise<{ event: CompanyEvent; emailStats: EventEmailStats }> {
  const dbInstance = options?.dbInstance;
  const emailSender = options?.emailSender || sendEmail;
  const isEmp = isEmployeeRole(user.role);

  const title = (input.title || "").trim();
  const date = (input.date || "").trim();
  if (!title || !date) {
    throw new Error("Le titre et la date de l'événement sont obligatoires.");
  }

  // Collaborators / cashiers may only create private personal events
  const isPersonal = isEmp ? true : Boolean(input.isPersonal || input.type === "PERSONAL");
  const eventType: EventType = isPersonal
    ? "PERSONAL"
    : (input.type || "MEETING");

  const startTime = (input.startTime || "09:00").trim() || "09:00";
  const endTime = (input.endTime || "10:00").trim() || "10:00";
  const description = (input.description || "").trim();
  const location =
    (input.location || "").trim() ||
    (isPersonal ? "Personnel" : "Bureaux de l'entreprise");

  let audienceType: AudienceType | undefined;
  let audienceTargetName: string | undefined;
  let audienceBranchId: string | undefined;
  let targetEmployeeIds: string[] | undefined;

  let emailStats: EventEmailStats = {
    totalTargeted: 0,
    withEmail: 0,
    sent: 0,
    failed: 0,
    skippedNoEmail: 0,
  };

  let targetEmployees: Employee[] = [];

  if (!isPersonal) {
    audienceType = input.audienceType || "ALL_EMPLOYEES";
    const [allEmployees, orgBranches] = await Promise.all([
      listEmployees(organizationId, undefined, undefined, undefined, dbInstance),
      listBranches(organizationId, dbInstance),
    ]);

    const activeEmployees = allEmployees.filter((e) => e.status !== "INACTIVE");

    const resolved = resolveTargetEmployees({
      activeEmployees,
      branches: orgBranches,
      audienceType,
      audienceBranchId: input.audienceBranchId,
      audienceTargetName: input.audienceTargetName,
      targetEmployeeIds: input.targetEmployeeIds,
    });

    targetEmployees = resolved.targetEmployees;
    audienceTargetName = resolved.audienceTargetName;
    audienceBranchId = resolved.audienceBranchId;
    targetEmployeeIds = resolved.targetEmployeeIds;
    emailStats.totalTargeted = targetEmployees.length;
  }

  const notifyImmediate = isPersonal ? false : input.notifyImmediate !== false;
  const reminder24h = input.reminder24h !== false;

  // Dispatch personalized notification emails to targeted employees
  if (!isPersonal && notifyImmediate && targetEmployees.length > 0) {
    let companyName = "RKonekte";
    try {
      const org = await getOrganizationById(organizationId, dbInstance);
      if (org?.name) companyName = org.name;
    } catch (_) {}

    const baseUrl =
      options?.origin?.replace(/\/+$/, "") ||
      process.env.APP_URL?.replace(/\/+$/, "") ||
      "http://localhost:3000";
    const calendarUrl = `${baseUrl}/admin/events`;

    let dateFormatted = date;
    try {
      dateFormatted = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (_) {}

    const seenEmails = new Set<string>();
    const emailQueue: { email: string; fullName: string }[] = [];

    for (const emp of targetEmployees) {
      const cleanEmail = (emp.email || "").trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        emailStats.skippedNoEmail += 1;
        continue;
      }
      if (seenEmails.has(cleanEmail)) continue;
      seenEmails.add(cleanEmail);
      emailQueue.push({
        email: cleanEmail,
        fullName: `${emp.firstName} ${emp.lastName}`.trim() || "Collaborateur",
      });
    }

    emailStats.withEmail = emailQueue.length;

    const audienceSummary =
      audienceType === "ALL_EMPLOYEES"
        ? `Tous les employés (${companyName})`
        : audienceType === "BRANCH"
        ? `Succursale : ${audienceTargetName}`
        : audienceType === "DEPARTMENT"
        ? `Département : ${audienceTargetName}`
        : `Groupe sélectionné (${emailQueue.length > 0 ? audienceTargetName : targetEmployees.length})`;

    const BATCH_SIZE = 4;
    for (let i = 0; i < emailQueue.length; i += BATCH_SIZE) {
      const batch = emailQueue.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          const { subject, html } = generateCompanyEventEmail({
            companyName,
            employeeName: recipient.fullName,
            eventTitle: title,
            eventTypeLabel: EVENT_TYPE_LABELS_FR[eventType] || eventType,
            dateFormatted,
            eventDate: date,
            startTime,
            endTime,
            location,
            audienceSummary,
            description: description || undefined,
            scheduledBy: user.name || "Administration",
            calendarUrl,
          });
          return emailSender({
            to: recipient.email,
            subject,
            html,
          });
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.success) {
          emailStats.sent += 1;
        } else {
          emailStats.failed += 1;
        }
      }
    }
  }

  const now = Date.now();
  const id = `${isPersonal ? "ev-perso" : "ev"}-${now}-${crypto.randomUUID().slice(0, 6)}`;

  const createdEvent: CompanyEvent = {
    id,
    organizationId,
    title,
    description,
    date,
    startTime,
    endTime,
    type: eventType,
    personalCategory: isPersonal ? input.personalCategory || "RDV" : undefined,
    location,
    audienceType,
    audienceTargetName,
    audienceBranchId,
    targetEmployeeIds,
    notifyImmediate,
    reminder24h,
    isPersonal,
    creatorUserId: user.userId,
    creatorEmployeeId: user.employeeId || undefined,
    creatorEmployeeNumber: user.employeeNumber || undefined,
    creatorName: user.name,
    recipientsCount: emailStats.totalTargeted,
    emailsSentCount: emailStats.sent,
    emailsFailedCount: emailStats.failed,
    createdAt: new Date(now).toISOString(),
  };

  const serializedIds = targetEmployeeIds ? JSON.stringify(targetEmployeeIds) : null;

  if (dbInstance) {
    await ensureSqliteTable(dbInstance);
    await dbInstance.insert(companyEvents).values({
      id,
      organizationId,
      title,
      description: description || null,
      eventDate: date,
      startTime,
      endTime,
      eventType,
      personalCategory: createdEvent.personalCategory || null,
      location,
      audienceType: audienceType || null,
      audienceTargetName: audienceTargetName || null,
      audienceBranchId: audienceBranchId || null,
      targetEmployeeIds: serializedIds,
      notifyImmediate,
      reminder24h,
      isPersonal,
      creatorUserId: user.userId,
      creatorEmployeeId: user.employeeId || null,
      creatorEmployeeNumber: user.employeeNumber || null,
      creatorName: user.name || null,
      recipientsCount: emailStats.totalTargeted,
      emailsSentCount: emailStats.sent,
      emailsFailedCount: emailStats.failed,
      createdAt: now,
    });
    return { event: createdEvent, emailStats };
  }

  let persistedRemote = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.from("company_events").insert({
        id,
        organization_id: organizationId,
        title,
        description: description || null,
        event_date: date,
        start_time: startTime,
        end_time: endTime,
        event_type: eventType,
        personal_category: createdEvent.personalCategory || null,
        location,
        audience_type: audienceType || null,
        audience_target_name: audienceTargetName || null,
        audience_branch_id: audienceBranchId || null,
        target_employee_ids: serializedIds,
        notify_immediate: notifyImmediate,
        reminder_24h: reminder24h,
        is_personal: isPersonal,
        creator_user_id: user.userId,
        creator_employee_id: user.employeeId || null,
        creator_employee_number: user.employeeNumber || null,
        creator_name: user.name || null,
        recipients_count: emailStats.totalTargeted,
        emails_sent_count: emailStats.sent,
        emails_failed_count: emailStats.failed,
        created_at: now,
      });
      if (!error) persistedRemote = true;
      else console.error("Supabase company_events insert error:", error.message);
    } catch (err) {
      console.error("Supabase company_events insert exception:", err);
    }
  }

  if (!persistedRemote) {
    try {
      const db = getDb();
      await ensureSqliteTable(db);
      await db.insert(companyEvents).values({
        id,
        organizationId,
        title,
        description: description || null,
        eventDate: date,
        startTime,
        endTime,
        eventType,
        personalCategory: createdEvent.personalCategory || null,
        location,
        audienceType: audienceType || null,
        audienceTargetName: audienceTargetName || null,
        audienceBranchId: audienceBranchId || null,
        targetEmployeeIds: serializedIds,
        notifyImmediate,
        reminder24h,
        isPersonal,
        creatorUserId: user.userId,
        creatorEmployeeId: user.employeeId || null,
        creatorEmployeeNumber: user.employeeNumber || null,
        creatorName: user.name || null,
        recipientsCount: emailStats.totalTargeted,
        emailsSentCount: emailStats.sent,
        emailsFailedCount: emailStats.failed,
        createdAt: now,
      });
    } catch (_) {
      const all = loadAllJsonFallback();
      saveJsonFallback([createdEvent, ...all]);
    }
  }

  return { event: createdEvent, emailStats };
}

export async function deleteCompanyEvent(
  organizationId: string,
  eventId: string,
  user: EventUserContext,
  dbInstance?: any
): Promise<{ deleted: boolean; error?: string }> {
  const eventsList = await fetchOrganizationEvents(organizationId, dbInstance);
  const target = eventsList.find((ev) => ev.id === eventId);

  if (!target) {
    return { deleted: false, error: "Événement introuvable." };
  }

  const isEmp = isEmployeeRole(user.role);
  const isOwner =
    target.isPersonal &&
    ((target.creatorUserId && target.creatorUserId === user.userId) ||
      (target.creatorEmployeeId &&
        user.employeeId &&
        target.creatorEmployeeId === user.employeeId) ||
      (target.creatorEmployeeNumber &&
        user.employeeNumber &&
        target.creatorEmployeeNumber === user.employeeNumber));

  if (isEmp && !isOwner) {
    return {
      deleted: false,
      error: "Vous n'êtes pas autorisé à supprimer cet événement.",
    };
  }

  if (dbInstance) {
    await dbInstance
      .delete(companyEvents)
      .where(
        and(
          eq(companyEvents.id, eventId),
          eq(companyEvents.organizationId, organizationId)
        )
      );
    return { deleted: true };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase
        .from("company_events")
        .delete()
        .eq("id", eventId)
        .eq("organization_id", organizationId);
      if (!error) return { deleted: true };
    } catch (_) {}
  }

  try {
    const db = getDb();
    await ensureSqliteTable(db);
    await db
      .delete(companyEvents)
      .where(
        and(
          eq(companyEvents.id, eventId),
          eq(companyEvents.organizationId, organizationId)
        )
      );
    return { deleted: true };
  } catch (_) {
    const all = loadAllJsonFallback();
    saveJsonFallback(
      all.filter(
        (e) => !(e.id === eventId && e.organizationId === organizationId)
      )
    );
    return { deleted: true };
  }
}
