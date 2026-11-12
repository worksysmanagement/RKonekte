import fs from "fs";
import path from "path";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { cashRubriques, cashierDailyEntries, CashRubrique, CashierDailyEntry, users } from "@/db/schema";
import { eq, and, desc, asc, gte, lte } from "drizzle-orm";

export interface CashRubriqueModel {
  id: string;
  organizationId: string;
  name: string;
  currency: "HTG" | "USD";
  orderIndex: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CashierDailyEntryModel {
  id: string;
  organizationId: string;
  branchId?: string | null;
  cashierId: string;
  cashierName: string;
  cashierMatricule?: string | null;
  entryDate: string; // YYYY-MM-DD
  amounts: Record<string, number>; // rubriqueId -> amount
  totalHtg: number;
  totalUsd: number;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_RUBRIQUES_PRESET: Array<{ name: string; currency: "HTG" | "USD" }> = [
  { name: "PAIEMENT HTG", currency: "HTG" },
  { name: "PAIEMENT USD", currency: "USD" },
  { name: "ZELLE OU CASH APP", currency: "USD" },
  { name: "VIREMENT UB HTG", currency: "HTG" },
  { name: "VIREMENT UB USD", currency: "USD" },
  { name: "VIREMENT SOG HTG", currency: "HTG" },
  { name: "VIREMENT SOG USD", currency: "USD" },
];

// Persistent local JSON file fallback for offline/development resilience
const DATA_DIR = path.join(process.cwd(), "data");
const REGISTERS_FILE = path.join(DATA_DIR, "cash-registers.json");

interface LocalStore {
  rubriques: CashRubriqueModel[];
  entries: CashierDailyEntryModel[];
}

function loadLocalStore(): LocalStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(REGISTERS_FILE)) {
      const content = fs.readFileSync(REGISTERS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not load local cash registers store:", err);
  }
  return { rubriques: [], entries: [] };
}

function saveLocalStore(store: LocalStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REGISTERS_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save local cash registers store:", err);
  }
}

// ----------------------------------------------------
// RUBRIQUES MANAGEMENT
// ----------------------------------------------------

export async function listRubriques(organizationId: string): Promise<CashRubriqueModel[]> {
  const now = Date.now();
  let found: CashRubriqueModel[] = [];

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("cash_rubriques")
      .select("*")
      .eq("organization_id", organizationId)
      .order("order_index", { ascending: true });

    if (!error && data && data.length > 0) {
      found = data.map((r: any) => ({
        id: r.id,
        organizationId: r.organization_id,
        name: r.name,
        currency: r.currency || "HTG",
        orderIndex: Number(r.order_index ?? 0),
        isActive: r.is_active !== false,
        createdAt: Number(r.created_at || now),
        updatedAt: Number(r.updated_at || now),
      }));
    }
  } catch (_) {}

  // 2. Fallback SQLite
  if (found.length === 0) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(cashRubriques)
        .where(eq(cashRubriques.organizationId, organizationId))
        .orderBy(asc(cashRubriques.orderIndex));

      if (rows.length > 0) {
        found = rows.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          name: r.name,
          currency: (r.currency as "HTG" | "USD") || "HTG",
          orderIndex: r.orderIndex,
          isActive: Boolean(r.isActive),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      }
    } catch (_) {}
  }

  // 3. Fallback File Store
  if (found.length === 0) {
    const store = loadLocalStore();
    found = store.rubriques.filter((r) => r.organizationId === organizationId);
    found.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  // 4. If still empty, auto-seed with the 10 standard default rubriques
  if (found.length === 0) {
    found = await resetRubriquesToDefault(organizationId);
  }

  return found;
}

export async function createRubrique(
  organizationId: string,
  input: { name: string; currency: "HTG" | "USD" }
): Promise<CashRubriqueModel> {
  const existing = await listRubriques(organizationId);
  const now = Date.now();
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 1;

  const newRub: CashRubriqueModel = {
    id: `rub-${crypto.randomUUID().slice(0, 8)}`,
    organizationId,
    name: input.name.trim(),
    currency: input.currency === "USD" ? "USD" : "HTG",
    orderIndex: nextOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  // Save to Supabase
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("cash_rubriques").insert({
      id: newRub.id,
      organization_id: newRub.organizationId,
      name: newRub.name,
      currency: newRub.currency,
      order_index: newRub.orderIndex,
      is_active: newRub.isActive,
      created_at: newRub.createdAt,
      updated_at: newRub.updatedAt,
    });
  } catch (_) {}

  // Save to SQLite
  try {
    const db = getDb();
    await db.insert(cashRubriques).values({
      id: newRub.id,
      organizationId: newRub.organizationId,
      name: newRub.name,
      currency: newRub.currency,
      orderIndex: newRub.orderIndex,
      isActive: newRub.isActive,
      createdAt: newRub.createdAt,
      updatedAt: newRub.updatedAt,
    });
  } catch (_) {}

  // Save to local file store
  const store = loadLocalStore();
  store.rubriques.push(newRub);
  saveLocalStore(store);

  return newRub;
}

export async function updateRubrique(
  organizationId: string,
  id: string,
  updates: {
    name?: string;
    currency?: "HTG" | "USD";
    isActive?: boolean;
    orderIndex?: number;
  }
): Promise<CashRubriqueModel | null> {
  const now = Date.now();
  const current = await listRubriques(organizationId);
  const target = current.find((r) => r.id === id);
  if (!target) return null;

  const updated: CashRubriqueModel = {
    ...target,
    name: updates.name !== undefined ? updates.name.trim() : target.name,
    currency: updates.currency !== undefined ? updates.currency : target.currency,
    isActive: updates.isActive !== undefined ? updates.isActive : target.isActive,
    orderIndex: updates.orderIndex !== undefined ? updates.orderIndex : target.orderIndex,
    updatedAt: now,
  };

  // Supabase update
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cash_rubriques")
      .update({
        name: updated.name,
        currency: updated.currency,
        is_active: updated.isActive,
        order_index: updated.orderIndex,
        updated_at: updated.updatedAt,
      })
      .eq("id", id)
      .eq("organization_id", organizationId);
  } catch (_) {}

  // SQLite update
  try {
    const db = getDb();
    await db
      .update(cashRubriques)
      .set({
        name: updated.name,
        currency: updated.currency,
        isActive: updated.isActive,
        orderIndex: updated.orderIndex,
        updatedAt: updated.updatedAt,
      })
      .where(and(eq(cashRubriques.id, id), eq(cashRubriques.organizationId, organizationId)));
  } catch (_) {}

  // Local file store update
  const store = loadLocalStore();
  const idx = store.rubriques.findIndex((r) => r.id === id && r.organizationId === organizationId);
  if (idx !== -1) {
    store.rubriques[idx] = updated;
  } else {
    store.rubriques.push(updated);
  }
  saveLocalStore(store);

  return updated;
}

export async function deleteRubrique(organizationId: string, id: string): Promise<boolean> {
  // Supabase
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cash_rubriques")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
  } catch (_) {}

  // SQLite
  try {
    const db = getDb();
    await db
      .delete(cashRubriques)
      .where(and(eq(cashRubriques.id, id), eq(cashRubriques.organizationId, organizationId)));
  } catch (_) {}

  // Local file store
  const store = loadLocalStore();
  store.rubriques = store.rubriques.filter((r) => !(r.id === id && r.organizationId === organizationId));
  saveLocalStore(store);

  return true;
}

export async function resetRubriquesToDefault(organizationId: string): Promise<CashRubriqueModel[]> {
  const now = Date.now();
  const seeded: CashRubriqueModel[] = DEFAULT_RUBRIQUES_PRESET.map((p, idx) => ({
    id: `rub-preset-${idx + 1}-${crypto.randomUUID().slice(0, 6)}`,
    organizationId,
    name: p.name,
    currency: p.currency,
    orderIndex: idx + 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));

  // Clear existing in Supabase & insert seeded
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("cash_rubriques").delete().eq("organization_id", organizationId);
    await supabase.from("cash_rubriques").insert(
      seeded.map((s) => ({
        id: s.id,
        organization_id: s.organizationId,
        name: s.name,
        currency: s.currency,
        order_index: s.orderIndex,
        is_active: s.isActive,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
      }))
    );
  } catch (_) {}

  // Clear existing in SQLite & insert seeded
  try {
    const db = getDb();
    await db.delete(cashRubriques).where(eq(cashRubriques.organizationId, organizationId));
    for (const s of seeded) {
      await db.insert(cashRubriques).values({
        id: s.id,
        organizationId: s.organizationId,
        name: s.name,
        currency: s.currency,
        orderIndex: s.orderIndex,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      });
    }
  } catch (_) {}

  // Update file store
  const store = loadLocalStore();
  store.rubriques = store.rubriques.filter((r) => r.organizationId !== organizationId).concat(seeded);
  saveLocalStore(store);

  return seeded;
}

// ----------------------------------------------------
// DAILY CASH ENTRIES MANAGEMENT
// ----------------------------------------------------

async function resolveCashierBranchMap(organizationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const supabase = getSupabaseAdminClient();
    const { data: usersData } = await supabase
      .from("users")
      .select("id, branch_id")
      .eq("organization_id", organizationId);
    if (usersData) {
      for (const u of usersData) {
        if (u.id && u.branch_id) {
          map.set(u.id, u.branch_id);
        }
      }
    }
    const { data: empData } = await supabase
      .from("employees")
      .select("user_id, branch_id")
      .eq("organization_id", organizationId);
    if (empData) {
      for (const emp of empData) {
        if (emp.user_id && emp.branch_id) {
          map.set(emp.user_id, emp.branch_id);
        }
      }
    }
  } catch (_) {}

  // Fallback SQLite
  if (map.size === 0) {
    try {
      const db = getDb();
      const dbUsers = await db
        .select({ id: users.id, branchId: users.branchId })
        .from(users)
        .where(eq(users.organizationId, organizationId));
      for (const u of dbUsers) {
        if (u.id && u.branchId) {
          map.set(u.id, u.branchId);
        }
      }
    } catch (_) {}
  }

  return map;
}

async function resolveCashierMatriculeMap(organizationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const supabase = getSupabaseAdminClient();
    const { data: empsData } = await supabase
      .from("employees")
      .select("id, email, first_name, last_name, employee_number")
      .eq("organization_id", organizationId);

    const { data: usersData } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("organization_id", organizationId);

    if (empsData) {
      for (const emp of empsData) {
        if (emp.employee_number) {
          map.set(emp.id, emp.employee_number);
          if (emp.email) map.set(emp.email.toLowerCase().trim(), emp.employee_number);
          const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim().toLowerCase();
          if (fullName) map.set(fullName, emp.employee_number);
        }
      }
    }

    if (usersData && empsData) {
      for (const u of usersData) {
        const uEmail = (u.email || "").toLowerCase().trim();
        const uName = (u.name || "").toLowerCase().trim();
        const matched = empsData.find(
          (e: any) =>
            (e.email && e.email.toLowerCase().trim() === uEmail) ||
            `${e.first_name || ""} ${e.last_name || ""}`.trim().toLowerCase() === uName
        );
        if (matched?.employee_number) {
          map.set(u.id, matched.employee_number);
          if (u.name) map.set(u.name.toLowerCase().trim(), matched.employee_number);
        }
      }
    }
  } catch (_) {}

  // Fallback SQLite
  try {
    const db = getDb();
    const { employees: dbEmployees } = await import("@/db/schema");
    const emps = await db.select().from(dbEmployees).where(eq(dbEmployees.organizationId, organizationId));
    for (const emp of emps) {
      if (emp.employeeNumber) {
        map.set(emp.id, emp.employeeNumber);
        if (emp.email) map.set(emp.email.toLowerCase().trim(), emp.employeeNumber);
        const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase();
        if (fullName) map.set(fullName, emp.employeeNumber);
      }
    }
  } catch (_) {}

  return map;
}

export async function listDailyEntries(
  organizationId: string,
  filter?: {
    startDate?: string;
    endDate?: string;
    cashierId?: string;
    branchId?: string;
  }
): Promise<CashierDailyEntryModel[]> {
  const now = Date.now();
  let found: CashierDailyEntryModel[] = [];

  // 1. Try Supabase
  try {
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from("cashier_daily_entries")
      .select("*")
      .eq("organization_id", organizationId)
      .order("entry_date", { ascending: false });

    if (filter?.startDate) query = query.gte("entry_date", filter.startDate);
    if (filter?.endDate) query = query.lte("entry_date", filter.endDate);
    if (filter?.cashierId && filter.cashierId !== "ALL") query = query.eq("cashier_id", filter.cashierId);

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      found = data.map((d: any) => {
        let parsedAmounts: Record<string, number> = {};
        try {
          parsedAmounts = typeof d.amounts === "string" ? JSON.parse(d.amounts) : d.amounts;
        } catch (_) {}
        return {
          id: d.id,
          organizationId: d.organization_id,
          branchId: d.branch_id || null,
          cashierId: d.cashier_id,
          cashierName: d.cashier_name,
          cashierMatricule: d.cashier_matricule || null,
          entryDate: d.entry_date,
          amounts: parsedAmounts,
          totalHtg: Number(d.total_htg || 0),
          totalUsd: Number(d.total_usd || 0),
          notes: d.notes || null,
          createdAt: Number(d.created_at || now),
          updatedAt: Number(d.updated_at || now),
        };
      });
    }
  } catch (_) {}

  // 2. Fallback SQLite
  if (found.length === 0) {
    try {
      const db = getDb();
      let rows = await db
        .select()
        .from(cashierDailyEntries)
        .where(eq(cashierDailyEntries.organizationId, organizationId))
        .orderBy(desc(cashierDailyEntries.entryDate));

      if (rows.length > 0) {
        found = rows.map((r) => {
          let parsedAmounts = {};
          try {
            parsedAmounts = JSON.parse(r.amounts);
          } catch (_) {}
          return {
            id: r.id,
            organizationId: r.organizationId,
            branchId: r.branchId,
            cashierId: r.cashierId,
            cashierName: r.cashierName,
            cashierMatricule: r.cashierMatricule,
            entryDate: r.entryDate,
            amounts: parsedAmounts as Record<string, number>,
            totalHtg: r.totalHtg,
            totalUsd: r.totalUsd,
            notes: r.notes,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          };
        });
      }
    } catch (_) {}
  }

  // 3. Fallback File Store
  if (found.length === 0) {
    const store = loadLocalStore();
    found = store.entries.filter((e) => e.organizationId === organizationId);
  }

  // Auto-resolve branchId and cashierMatricule for entries where it was missing
  const branchMap = await resolveCashierBranchMap(organizationId);
  const matriculeMap = await resolveCashierMatriculeMap(organizationId);
  let storeNeedsSave = false;
  const store = loadLocalStore();

  for (const item of found) {
    if (!item.branchId && item.cashierId && branchMap.has(item.cashierId)) {
      item.branchId = branchMap.get(item.cashierId)!;
    }
    if (!item.cashierMatricule) {
      const mat =
        (item.cashierId && matriculeMap.get(item.cashierId)) ||
        (item.cashierName && matriculeMap.get(item.cashierName.toLowerCase().trim()));
      if (mat) {
        item.cashierMatricule = mat;
      }
    }
  }

  // Also heal local store entries so they are persisted with the correct branchId and matricule
  for (const se of store.entries) {
    if (!se.branchId && se.cashierId && branchMap.has(se.cashierId)) {
      se.branchId = branchMap.get(se.cashierId)!;
      storeNeedsSave = true;
    }
    if (!se.cashierMatricule) {
      const mat =
        (se.cashierId && matriculeMap.get(se.cashierId)) ||
        (se.cashierName && matriculeMap.get(se.cashierName.toLowerCase().trim()));
      if (mat) {
        se.cashierMatricule = mat;
        storeNeedsSave = true;
      }
    }
  }
  if (storeNeedsSave) {
    saveLocalStore(store);
  }

  // Apply in-memory filters (ensures exactness across all storage backends)
  if (filter?.startDate) {
    found = found.filter((e) => e.entryDate >= filter.startDate!);
  }
  if (filter?.endDate) {
    found = found.filter((e) => e.entryDate <= filter.endDate!);
  }
  if (filter?.cashierId && filter.cashierId !== "ALL") {
    found = found.filter((e) => e.cashierId === filter.cashierId);
  }
  if (filter?.branchId && filter.branchId !== "ALL") {
    found = found.filter((e) => e.branchId === filter.branchId);
  }

  found.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  return found;
}

export async function getDailyEntry(
  organizationId: string,
  cashierId: string,
  entryDate: string
): Promise<CashierDailyEntryModel | null> {
  const entries = await listDailyEntries(organizationId, {
    startDate: entryDate,
    endDate: entryDate,
    cashierId,
  });
  return entries.length > 0 ? entries[0] : null;
}

export async function saveDailyEntry(
  organizationId: string,
  input: {
    cashierId: string;
    cashierName: string;
    cashierMatricule?: string | null;
    branchId?: string | null;
    entryDate: string; // YYYY-MM-DD
    amounts: Record<string, number>;
    notes?: string | null;
  }
): Promise<CashierDailyEntryModel> {
  const now = Date.now();
  const rubriques = await listRubriques(organizationId);

  // Compute total HTG and total USD dynamically according to rubriques currency definition
  let totalHtg = 0;
  let totalUsd = 0;

  for (const [rubId, rawVal] of Object.entries(input.amounts || {})) {
    const num = Number(rawVal) || 0;
    if (num <= 0) continue;
    const rub = rubriques.find((r) => r.id === rubId);
    if (rub?.currency === "USD") {
      totalUsd += num;
    } else {
      totalHtg += num;
    }
  }

  // Check if an entry already exists for this (organizationId, cashierId, entryDate) -> Upsert
  const existing = await getDailyEntry(organizationId, input.cashierId, input.entryDate);
  const entryId = existing ? existing.id : `entry-${crypto.randomUUID().slice(0, 8)}`;

  // Resolve effective branchId: explicit input -> cashier active branch -> existing branch -> null
  let effectiveBranchId = input.branchId || null;
  if (!effectiveBranchId && input.cashierId) {
    const branchMap = await resolveCashierBranchMap(organizationId);
    effectiveBranchId = branchMap.get(input.cashierId) || null;
  }
  if (!effectiveBranchId && existing?.branchId) {
    effectiveBranchId = existing.branchId;
  }

  // Resolve effective cashierMatricule: explicit input -> existing matricule -> employees table resolution
  let effectiveMatricule = input.cashierMatricule || existing?.cashierMatricule || null;
  if (!effectiveMatricule) {
    try {
      const matMap = await resolveCashierMatriculeMap(organizationId);
      effectiveMatricule =
        (input.cashierId && matMap.get(input.cashierId)) ||
        (input.cashierName && matMap.get(input.cashierName.toLowerCase().trim())) ||
        null;
    } catch (_) {}
  }

  const entry: CashierDailyEntryModel = {
    id: entryId,
    organizationId,
    branchId: effectiveBranchId,
    cashierId: input.cashierId,
    cashierName: input.cashierName,
    cashierMatricule: effectiveMatricule,
    entryDate: input.entryDate,
    amounts: input.amounts,
    totalHtg: Math.round(totalHtg * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    notes: input.notes !== undefined ? input.notes : (existing?.notes || null),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  // 1. Supabase upsert
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("cashier_daily_entries").upsert({
      id: entry.id,
      organization_id: entry.organizationId,
      branch_id: entry.branchId,
      cashier_id: entry.cashierId,
      cashier_name: entry.cashierName,
      cashier_matricule: entry.cashierMatricule,
      entry_date: entry.entryDate,
      amounts: JSON.stringify(entry.amounts),
      total_htg: entry.totalHtg,
      total_usd: entry.totalUsd,
      notes: entry.notes,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
    });
  } catch (_) {}

  // 2. SQLite upsert
  try {
    const db = getDb();
    if (existing) {
      await db
        .update(cashierDailyEntries)
        .set({
          branchId: entry.branchId,
          cashierName: entry.cashierName,
          cashierMatricule: entry.cashierMatricule,
          amounts: JSON.stringify(entry.amounts),
          totalHtg: entry.totalHtg,
          totalUsd: entry.totalUsd,
          notes: entry.notes,
          updatedAt: entry.updatedAt,
        })
        .where(eq(cashierDailyEntries.id, entry.id));
    } else {
      await db.insert(cashierDailyEntries).values({
        id: entry.id,
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        cashierId: entry.cashierId,
        cashierName: entry.cashierName,
        cashierMatricule: entry.cashierMatricule,
        entryDate: entry.entryDate,
        amounts: JSON.stringify(entry.amounts),
        totalHtg: entry.totalHtg,
        totalUsd: entry.totalUsd,
        notes: entry.notes,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
    }
  } catch (_) {}

  // 3. Local file store
  const store = loadLocalStore();
  const idx = store.entries.findIndex((e) => e.id === entry.id);
  if (idx !== -1) {
    store.entries[idx] = entry;
  } else {
    store.entries.push(entry);
  }
  saveLocalStore(store);

  return entry;
}

export async function deleteDailyEntry(organizationId: string, entryId: string): Promise<boolean> {
  // 1. Supabase delete
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cashier_daily_entries")
      .delete()
      .eq("id", entryId)
      .eq("organization_id", organizationId);
  } catch (_) {}

  // 2. SQLite delete
  try {
    const db = getDb();
    await db
      .delete(cashierDailyEntries)
      .where(and(eq(cashierDailyEntries.id, entryId), eq(cashierDailyEntries.organizationId, organizationId)));
  } catch (_) {}

  // 3. Local file store
  const store = loadLocalStore();
  const initialLen = store.entries.length;
  store.entries = store.entries.filter((e) => !(e.id === entryId && e.organizationId === organizationId));
  if (store.entries.length !== initialLen) {
    saveLocalStore(store);
  }

  return true;
}

export async function updateDailyEntryById(
  organizationId: string,
  entryId: string,
  input: {
    amounts?: Record<string, number>;
    notes?: string | null;
    entryDate?: string;
  }
): Promise<CashierDailyEntryModel | null> {
  const existingList = await listDailyEntries(organizationId);
  const existing = existingList.find((e) => e.id === entryId);
  if (!existing) return null;

  const now = Date.now();
  const rubriques = await listRubriques(organizationId);
  const newAmounts = input.amounts !== undefined ? input.amounts : existing.amounts;
  const newNotes = input.notes !== undefined ? input.notes : existing.notes;
  const newDate = input.entryDate || existing.entryDate;

  let totalHtg = 0;
  let totalUsd = 0;
  for (const [rubId, rawVal] of Object.entries(newAmounts || {})) {
    const num = Number(rawVal) || 0;
    if (num <= 0) continue;
    const rub = rubriques.find((r) => r.id === rubId);
    if (rub?.currency === "USD") {
      totalUsd += num;
    } else {
      totalHtg += num;
    }
  }

  const updated: CashierDailyEntryModel = {
    ...existing,
    entryDate: newDate,
    amounts: newAmounts,
    totalHtg: Math.round(totalHtg * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    notes: newNotes,
    updatedAt: now,
  };

  // 1. Supabase
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cashier_daily_entries")
      .update({
        entry_date: updated.entryDate,
        amounts: JSON.stringify(updated.amounts),
        total_htg: updated.totalHtg,
        total_usd: updated.totalUsd,
        notes: updated.notes,
        updated_at: updated.updatedAt,
      })
      .eq("id", entryId)
      .eq("organization_id", organizationId);
  } catch (_) {}

  // 2. SQLite
  try {
    const db = getDb();
    await db
      .update(cashierDailyEntries)
      .set({
        entryDate: updated.entryDate,
        amounts: JSON.stringify(updated.amounts),
        totalHtg: updated.totalHtg,
        totalUsd: updated.totalUsd,
        notes: updated.notes,
        updatedAt: updated.updatedAt,
      })
      .where(and(eq(cashierDailyEntries.id, entryId), eq(cashierDailyEntries.organizationId, organizationId)));
  } catch (_) {}

  // 3. Local file store
  const store = loadLocalStore();
  const idx = store.entries.findIndex((e) => e.id === entryId && e.organizationId === organizationId);
  if (idx !== -1) {
    store.entries[idx] = updated;
    saveLocalStore(store);
  }

  return updated;
}
