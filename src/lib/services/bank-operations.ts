import fs from "fs";
import path from "path";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export interface BankAccount {
  id: string;
  organizationId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: "HTG" | "USD" | string;
  initialBalance: number;
  initialBalanceDate?: string | null;
  currentBalance: number;
  branchId?: string | null;
  branchName?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransaction {
  id: string; // e.g. "DEP-2026-001" or "RET-2026-001"
  organizationId: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  bankAccountId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  currency: string;
  referenceNumber: string; // N° Bordereau, N° Chèque, N° Virement
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  authorId?: string;
  authorName: string;
  authorMatricule?: string;
  authorRole?: string;
  delegateName?: string;
  branchId?: string | null;
  branchName?: string | null;
  reason: string;
  receiptDataUrl?: string; // Scan/photo facultatif du bordereau
  createdAt: string;
}

export interface CreateBankAccountInput {
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: "HTG" | "USD" | string;
  initialBalance?: number;
  initialBalanceDate?: string | null;
  branchId?: string | null;
  branchName?: string | null;
}

export interface CreateBankTransactionInput {
  type: "DEPOSIT" | "WITHDRAWAL";
  bankAccountId: string;
  amount: number;
  currency?: string;
  referenceNumber: string;
  date?: string;
  reason: string;
  delegateName?: string;
  branchId?: string | null;
  branchName?: string | null;
  receiptDataUrl?: string;
}

interface BankStore {
  accounts: BankAccount[];
  transactions: BankTransaction[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "bank-operations.json");

let memoryStore: BankStore | null = null;

function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}


// Initial sample accounts for demonstration if file/database doesn't exist
const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "acc-demo-htg-01",
    organizationId: "default",
    bankName: "Unibank",
    accountName: "Compte Opérations Courantes",
    accountNumber: "102-1021-884920",
    currency: "HTG",
    initialBalance: 150000,
    initialBalanceDate: "2026-01-01",
    currentBalance: 150000,
    branchName: "Toutes les succursales",
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "acc-demo-usd-01",
    organizationId: "default",
    bankName: "Sogebank",
    accountName: "Compte Trésorerie USD",
    accountNumber: "210-9941-445812",
    currency: "USD",
    initialBalance: 3500,
    initialBalanceDate: "2026-01-01",
    currentBalance: 3500,
    branchName: "Toutes les succursales",
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

// Helper to map Supabase snake_case row to BankAccount
function mapBankAccount(r: any): BankAccount {
  return {
    id: r.id,
    organizationId: r.organization_id,
    bankName: r.bank_name,
    accountName: r.account_name,
    accountNumber: r.account_number,
    currency: r.currency || "HTG",
    initialBalance: Number(r.initial_balance ?? 0),
    initialBalanceDate:
      r.initial_balance_date ||
      r.initialBalanceDate ||
      (r.created_at
        ? typeof r.created_at === "number"
          ? new Date(r.created_at).toISOString().split("T")[0]
          : String(r.created_at).split("T")[0]
        : null),
    currentBalance: Number(r.current_balance ?? 0),
    branchId: r.branch_id ?? null,
    branchName: r.branch_name ?? null,
    isActive: r.is_active !== false,
    createdAt:
      typeof r.created_at === "number"
        ? new Date(r.created_at).toISOString().split("T")[0]
        : String(r.created_at || ""),
    updatedAt:
      typeof r.updated_at === "number"
        ? new Date(r.updated_at).toISOString().split("T")[0]
        : String(r.updated_at || ""),
  };
}

// Helper to map Supabase snake_case row to BankTransaction
function mapBankTransaction(r: any): BankTransaction {
  return {
    id: r.id,
    organizationId: r.organization_id,
    type: r.type,
    bankAccountId: r.bank_account_id,
    bankName: r.bank_name,
    accountName: r.account_name,
    accountNumber: r.account_number,
    amount: Number(r.amount ?? 0),
    currency: r.currency || "HTG",
    referenceNumber: r.reference_number || "N/A",
    date: r.date,
    time: r.time ?? undefined,
    authorId: r.author_id ?? undefined,
    authorName: r.author_name,
    authorMatricule: r.author_matricule ?? undefined,
    authorRole: r.author_role ?? undefined,
    delegateName: r.delegate_name || r.delegateName || undefined,
    branchId: r.branch_id ?? null,
    branchName: r.branch_name ?? null,
    reason: r.reason,
    receiptDataUrl: r.receipt_data_url ?? undefined,
    createdAt:
      typeof r.created_at === "number"
        ? new Date(r.created_at).toISOString()
        : String(r.created_at || ""),
  };
}

function loadStore(): BankStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts)) {
          memoryStore = {
            accounts: parsed.accounts,
            transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          };
          return memoryStore;
        }
      }
    }

    // Initialize defaults if file doesn't exist
    const initial: BankStore = {
      accounts: [...DEFAULT_BANK_ACCOUNTS],
      transactions: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
    memoryStore = initial;
    return memoryStore;
  } catch (err) {
    console.error("Failed to read/write bank-operations file:", err);
    if (!memoryStore) {
      memoryStore = { accounts: [], transactions: [] };
    }
    return memoryStore;
  }
}

function persistStore(store: BankStore) {
  memoryStore = store;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist bank-operations file:", err);
  }
}

// ----------------------------------------------------
// BANK ACCOUNTS
// ----------------------------------------------------

export async function listBankAccounts(organizationId?: string): Promise<BankAccount[]> {
  // 1. Try Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      let query = supabase.from("bank_accounts").select("*");
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map(mapBankAccount);
      }
    } catch (_) {
      // Fallback to local store
    }
  }

  // 2. Fallback to Local Store
  const store = loadStore();
  if (!organizationId) return store.accounts;
  return store.accounts.filter(
    (acc) => !acc.organizationId || acc.organizationId === "default" || acc.organizationId === organizationId
  );
}

export async function createBankAccount(
  organizationId: string,
  input: CreateBankAccountInput
): Promise<BankAccount> {
  const store = loadStore();
  const now = new Date().toISOString().split("T")[0];
  const nowEpoch = Date.now();
  const id = `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const initialBal = Number(input.initialBalance) || 0;
  const initialBalDate = input.initialBalanceDate ? String(input.initialBalanceDate).trim() : now;

  const newAccount: BankAccount = {
    id,
    organizationId,
    bankName: input.bankName.trim(),
    accountName: input.accountName.trim() || input.bankName.trim(),
    accountNumber: input.accountNumber.trim(),
    currency: (input.currency || "HTG").toUpperCase(),
    initialBalance: initialBal,
    initialBalanceDate: initialBalDate,
    currentBalance: initialBal,
    branchId: input.branchId || null,
    branchName: input.branchName || "Toutes les succursales",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  // 1. Save to Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const supabaseAccountPayload: Record<string, any> = {
        id: newAccount.id,
        organization_id: newAccount.organizationId,
        bank_name: newAccount.bankName,
        account_name: newAccount.accountName,
        account_number: newAccount.accountNumber,
        currency: newAccount.currency,
        initial_balance: newAccount.initialBalance,
        initial_balance_date: newAccount.initialBalanceDate,
        current_balance: newAccount.currentBalance,
        branch_id: newAccount.branchId,
        branch_name: newAccount.branchName,
        is_active: newAccount.isActive,
        created_at: nowEpoch,
        updated_at: nowEpoch,
      };
      const { error: accInsertError } = await supabase
        .from("bank_accounts")
        .insert(supabaseAccountPayload);
      if (accInsertError) {
        const { initial_balance_date: _ignored, ...fallbackPayload } = supabaseAccountPayload;
        const { error: retryErr } = await supabase
          .from("bank_accounts")
          .insert(fallbackPayload);
        if (retryErr) {
          console.warn("Supabase bank_account insert error:", retryErr.message);
        }
      }
    } catch (err) {
      console.warn("Supabase bank_account insert fallback to local:", err);
    }
  }

  // 2. Save to Local Store
  store.accounts.push(newAccount);
  persistStore(store);

  return newAccount;
}

export async function updateBankAccount(
  organizationId: string,
  id: string,
  updates: Partial<CreateBankAccountInput> & { isActive?: boolean }
): Promise<BankAccount | null> {
  const store = loadStore();
  const idx = store.accounts.findIndex((acc) => acc.id === id);

  const now = new Date().toISOString().split("T")[0];
  const nowEpoch = Date.now();

  const current = idx !== -1 ? store.accounts[idx] : null;

  const updated: BankAccount = {
    id,
    organizationId: current ? current.organizationId : organizationId,
    bankName: updates.bankName !== undefined ? updates.bankName.trim() : current?.bankName || "",
    accountName: updates.accountName !== undefined ? updates.accountName.trim() : current?.accountName || "",
    accountNumber: updates.accountNumber !== undefined ? updates.accountNumber.trim() : current?.accountNumber || "",
    currency: updates.currency !== undefined ? (updates.currency || "HTG").toUpperCase() : current?.currency || "HTG",
    initialBalance: updates.initialBalance !== undefined ? Number(updates.initialBalance) : (current?.initialBalance || 0),
    initialBalanceDate: updates.initialBalanceDate !== undefined ? (updates.initialBalanceDate ? String(updates.initialBalanceDate).trim() : null) : (current?.initialBalanceDate || current?.createdAt || now),
    currentBalance: current?.currentBalance || 0,
    branchId: updates.branchId !== undefined ? updates.branchId : current?.branchId || null,
    branchName: updates.branchName !== undefined ? updates.branchName : current?.branchName || "Toutes les succursales",
    isActive: updates.isActive !== undefined ? updates.isActive : current?.isActive ?? true,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };

  // 1. Update in Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const supabaseUpdatePayload: Record<string, any> = {
        bank_name: updated.bankName,
        account_name: updated.accountName,
        account_number: updated.accountNumber,
        currency: updated.currency,
        initial_balance_date: updated.initialBalanceDate,
        branch_id: updated.branchId,
        branch_name: updated.branchName,
        is_active: updated.isActive,
        updated_at: nowEpoch,
      };
      const { error: accUpdateError } = await supabase
        .from("bank_accounts")
        .update(supabaseUpdatePayload)
        .eq("id", id);
      if (accUpdateError) {
        const { initial_balance_date: _ignored, ...fallbackPayload } = supabaseUpdatePayload;
        const { error: retryErr } = await supabase
          .from("bank_accounts")
          .update(fallbackPayload)
          .eq("id", id);
        if (retryErr) {
          console.warn("Supabase bank_account update error:", retryErr.message);
        }
      }
    } catch (err) {
      console.warn("Supabase bank_account update fallback to local:", err);
    }
  }

  // 2. Update in Local Store
  if (idx !== -1) {
    store.accounts[idx] = updated;
    persistStore(store);
    return updated;
  }

  return updated;
}

export async function deleteBankAccount(organizationId: string, id: string): Promise<boolean> {
  // 1. Delete from Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from("bank_accounts").delete().eq("id", id);
    } catch (err) {
      console.warn("Supabase bank_account delete fallback to local:", err);
    }
  }

  // 2. Delete from Local Store
  const store = loadStore();
  const initialLen = store.accounts.length;
  store.accounts = store.accounts.filter((acc) => acc.id !== id);
  if (store.accounts.length !== initialLen) {
    persistStore(store);
    return true;
  }
  return true;
}

// ----------------------------------------------------
// BANK TRANSACTIONS (DÉPÔTS & RETRAITS)
// ----------------------------------------------------

export async function listBankTransactions(
  organizationId?: string,
  filters?: {
    type?: "DEPOSIT" | "WITHDRAWAL" | "ALL";
    bankAccountId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<BankTransaction[]> {
  // 1. Try Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      let query = supabase.from("bank_transactions").select("*");

      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      if (filters?.type && filters.type !== "ALL") {
        query = query.eq("type", filters.type);
      }
      if (filters?.bankAccountId && filters.bankAccountId !== "ALL") {
        query = query.eq("bank_account_id", filters.bankAccountId);
      }
      if (filters?.branchId && filters.branchId !== "all" && filters.branchId !== "ALL") {
        query = query.eq("branch_id", filters.branchId);
      }
      if (filters?.startDate) {
        query = query.gte("date", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("date", filters.endDate);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        const store = loadStore();
        const localById = new Map(store.transactions.map((t) => [t.id, t]));
        return data.map((row: any) => {
          const mapped = mapBankTransaction(row);
          if (!mapped.delegateName) {
            const localMatch = localById.get(mapped.id);
            if (localMatch?.delegateName) {
              mapped.delegateName = localMatch.delegateName;
            }
          }
          return mapped;
        });
      }
    } catch (_) {
      // Fallback to local store
    }
  }

  // 2. Fallback to Local Store
  const store = loadStore();
  let list = store.transactions;

  if (organizationId) {
    list = list.filter(
      (tx) => !tx.organizationId || tx.organizationId === "default" || tx.organizationId === organizationId
    );
  }

  if (filters?.type && filters.type !== "ALL") {
    list = list.filter((tx) => tx.type === filters.type);
  }

  if (filters?.bankAccountId && filters.bankAccountId !== "ALL") {
    list = list.filter((tx) => tx.bankAccountId === filters.bankAccountId);
  }

  if (filters?.branchId && filters.branchId !== "all" && filters.branchId !== "ALL") {
    const bId = filters.branchId;
    list = list.filter((tx) => tx.branchId === bId || (tx.branchName ? tx.branchName.includes(bId) : false));
  }

  if (filters?.startDate) {
    list = list.filter((tx) => tx.date >= filters.startDate!);
  }

  if (filters?.endDate) {
    list = list.filter((tx) => tx.date <= filters.endDate!);
  }

  // Sort descending by date & creation
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBankTransaction(
  organizationId: string,
  input: CreateBankTransactionInput,
  author: { id?: string; name: string; employeeNumber?: string; role?: string }
): Promise<BankTransaction> {
  const store = loadStore();

  // Find targeted bank account (prefer latest from Supabase if configured, else local store)
  let accountIdx = store.accounts.findIndex((acc) => acc.id === input.bankAccountId);
  let account = accountIdx !== -1 ? store.accounts[accountIdx] : null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("id", input.bankAccountId)
        .single();
      if (data) {
        account = mapBankAccount(data);
        if (accountIdx !== -1) {
          store.accounts[accountIdx] = account;
        } else {
          store.accounts.push(account);
          accountIdx = store.accounts.length - 1;
        }
      }
    } catch (_) {}
  }

  if (!account) {
    throw new Error("Compte bancaire sélectionné introuvable.");
  }

  const amount = Math.abs(Number(input.amount)) || 0;
  if (amount <= 0) {
    throw new Error("Le montant de l'opération doit être supérieur à zéro.");
  }

  const prefix = input.type === "DEPOSIT" ? "DEP" : "RET";
  const year = new Date().getFullYear();
  const idPattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let maxSeq = 0;

  for (const t of store.transactions) {
    const m = t.id.match(idPattern);
    if (m) {
      maxSeq = Math.max(maxSeq, Number(m[1]));
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: existingIds } = await supabase
        .from("bank_transactions")
        .select("id")
        .like("id", `${prefix}-${year}-%`);
      if (Array.isArray(existingIds)) {
        for (const row of existingIds) {
          const m = String(row.id || "").match(idPattern);
          if (m) {
            maxSeq = Math.max(maxSeq, Number(m[1]));
          }
        }
      }
    } catch (_) {}
  }

  const nextSeq = Math.max(
    maxSeq + 1,
    store.transactions.filter((t) => t.type === input.type).length + 1
  );
  const id = `${prefix}-${year}-${String(nextSeq).padStart(3, "0")}`;

  const todayStr = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toTimeString().split(" ")[0].substring(0, 5); // HH:mm
  const nowEpoch = Date.now();

  // Update account balance
  if (input.type === "DEPOSIT") {
    account.currentBalance = (Number(account.currentBalance) || 0) + amount;
  } else {
    account.currentBalance = (Number(account.currentBalance) || 0) - amount;
  }
  account.updatedAt = todayStr;

  const transaction: BankTransaction = {
    id,
    organizationId,
    type: input.type,
    bankAccountId: account.id,
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    amount,
    currency: account.currency,
    referenceNumber: input.referenceNumber?.trim() || "N/A",
    date: input.date || todayStr,
    time: nowTime,
    authorId: author.id,
    authorName: author.name || "Administrateur",
    authorMatricule: author.employeeNumber,
    authorRole: author.role || "Admin",
    delegateName:
      typeof input.delegateName === "string"
        ? input.delegateName.trim() || undefined
        : undefined,
    branchId: input.branchId || account.branchId || null,
    branchName: input.branchName || account.branchName || "Toutes les succursales",
    reason: input.reason?.trim() || (input.type === "DEPOSIT" ? "Versement bancaire" : "Décaissement bancaire"),
    receiptDataUrl: input.receiptDataUrl,
    createdAt: new Date().toISOString(),
  };

  // 1. Save to Supabase (Transaction + Account balance update)
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      const supabasePayload: Record<string, any> = {
        id: transaction.id,
        organization_id: transaction.organizationId,
        type: transaction.type,
        bank_account_id: transaction.bankAccountId,
        bank_name: transaction.bankName,
        account_name: transaction.accountName,
        account_number: transaction.accountNumber,
        amount: transaction.amount,
        currency: transaction.currency,
        reference_number: transaction.referenceNumber,
        date: transaction.date,
        time: transaction.time,
        author_id: transaction.authorId,
        author_name: transaction.authorName,
        author_matricule: transaction.authorMatricule,
        author_role: transaction.authorRole,
        branch_id: transaction.branchId,
        branch_name: transaction.branchName,
        reason: transaction.reason,
        receipt_data_url: transaction.receiptDataUrl,
        created_at: nowEpoch,
      };
      if (transaction.delegateName) {
        supabasePayload.delegate_name = transaction.delegateName;
      }

      const { error: insertError } = await supabase
        .from("bank_transactions")
        .insert(supabasePayload);

      if (insertError && transaction.delegateName) {
        // Retry without delegate_name in case cloud DB migration hasn't added the column yet
        const { delegate_name: _ignored, ...fallbackPayload } = supabasePayload;
        await supabase.from("bank_transactions").insert(fallbackPayload);
      }

      await supabase
        .from("bank_accounts")
        .update({
          current_balance: account.currentBalance,
          updated_at: nowEpoch,
        })
        .eq("id", account.id);
    } catch (err) {
      console.warn("Supabase bank_transaction insert fallback to local:", err);
    }
  }

  // 2. Save to Local Store
  store.transactions.unshift(transaction);
  persistStore(store);

  return transaction;
}

export async function deleteBankTransaction(
  organizationId: string,
  id: string
): Promise<boolean> {
  const store = loadStore();
  const txIdx = store.transactions.findIndex((t) => t.id === id);
  let tx = txIdx !== -1 ? store.transactions[txIdx] : null;

  // 1. Handle in Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      if (!tx) {
        const { data } = await supabase.from("bank_transactions").select("*").eq("id", id).single();
        if (data) tx = mapBankTransaction(data);
      }

      if (tx) {
        await supabase.from("bank_transactions").delete().eq("id", id);

        // Re-fetch account from Supabase to adjust balance
        const { data: accData } = await supabase.from("bank_accounts").select("*").eq("id", tx.bankAccountId).single();
        if (accData) {
          const curBal = Number(accData.current_balance || 0);
          const newBal = tx.type === "DEPOSIT" ? curBal - tx.amount : curBal + tx.amount;
          await supabase.from("bank_accounts").update({ current_balance: newBal, updated_at: Date.now() }).eq("id", tx.bankAccountId);
        }
      }
    } catch (err) {
      console.warn("Supabase bank_transaction delete fallback to local:", err);
    }
  }

  // 2. Handle in Local Store
  if (txIdx !== -1 && tx) {
    const accountIdx = store.accounts.findIndex((acc) => acc.id === tx!.bankAccountId);
    if (accountIdx !== -1) {
      const account = store.accounts[accountIdx];
      if (tx.type === "DEPOSIT") {
        account.currentBalance = (Number(account.currentBalance) || 0) - tx.amount;
      } else {
        account.currentBalance = (Number(account.currentBalance) || 0) + tx.amount;
      }
      account.updatedAt = new Date().toISOString().split("T")[0];
    }
    store.transactions.splice(txIdx, 1);
    persistStore(store);
    return true;
  }

  return true;
}

export async function getBankSummaryStats(
  organizationId?: string,
  branchId?: string
): Promise<{
  totalDepositsHtg: number;
  totalDepositsUsd: number;
  totalWithdrawalsHtg: number;
  totalWithdrawalsUsd: number;
  netHtg: number;
  netUsd: number;
  transactionsCount: number;
  activeAccountsCount: number;
}> {
  const [accounts, txs] = await Promise.all([
    listBankAccounts(organizationId),
    listBankTransactions(organizationId, branchId ? { branchId } : undefined),
  ]);

  const activeAccounts = accounts.filter((a) => a.isActive);

  let totalDepositsHtg = 0;
  let totalDepositsUsd = 0;
  let totalWithdrawalsHtg = 0;
  let totalWithdrawalsUsd = 0;

  for (const t of txs) {
    if (t.type === "DEPOSIT") {
      if (t.currency === "USD") totalDepositsUsd += t.amount;
      else totalDepositsHtg += t.amount;
    } else if (t.type === "WITHDRAWAL") {
      if (t.currency === "USD") totalWithdrawalsUsd += t.amount;
      else totalWithdrawalsHtg += t.amount;
    }
  }

  return {
    totalDepositsHtg,
    totalDepositsUsd,
    totalWithdrawalsHtg,
    totalWithdrawalsUsd,
    netHtg: totalDepositsHtg - totalWithdrawalsHtg,
    netUsd: totalDepositsUsd - totalWithdrawalsUsd,
    transactionsCount: txs.length,
    activeAccountsCount: activeAccounts.length,
  };
}
