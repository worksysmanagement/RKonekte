"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Landmark,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  PlusCircle,
  FolderOpen,
  Search,
  Filter,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit,
  Eye,
  X,
  ShieldAlert,
  Wallet,
  Receipt,
  Upload,
  RefreshCw,
  Clock,
  User,
  MapPin,
  ExternalLink,
  Wifi,
  Copy,
  Lock,
} from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";
import { SlideOver } from "@/components/ui/SlideOver";
import { BankAccount, BankTransaction } from "@/lib/services/bank-operations";

// Supported currencies for corporate bank accounts
const SUPPORTED_CURRENCIES: Array<{ code: string; label: string }> = [
  { code: "HTG", label: "HTG (Gourdes haïtiennes)" },
  { code: "USD", label: "USD (Dollars américains)" },
  { code: "EUR", label: "EUR (Euros)" },
  { code: "CAD", label: "CAD (Dollars canadiens)" },
  { code: "DOP", label: "DOP (Pesos dominicains)" },
  { code: "GBP", label: "GBP (Livres sterling)" },
  { code: "CHF", label: "CHF (Francs suisses)" },
  { code: "XOF", label: "XOF (Francs CFA BCEAO)" },
  { code: "XAF", label: "XAF (Francs CFA BEAC)" },
  { code: "BRL", label: "BRL (Réals brésiliens)" },
  { code: "MXN", label: "MXN (Pesos mexicains)" },
  { code: "CLP", label: "CLP (Pesos chiliens)" },
  { code: "JPY", label: "JPY (Yens japonais)" },
];

const CURRENCY_ORDER = SUPPORTED_CURRENCIES.map((c) => c.code);

function getCurrencyName(code: string): string {
  const norm = (code || "HTG").trim().toUpperCase();
  const match = SUPPORTED_CURRENCIES.find((c) => c.code === norm);
  if (!match) return norm;
  const openIdx = match.label.indexOf("(");
  const closeIdx = match.label.lastIndexOf(")");
  if (openIdx !== -1 && closeIdx > openIdx) {
    return match.label.slice(openIdx + 1, closeIdx);
  }
  return norm;
}

function sortCurrencyEntries(
  map: Map<string, number>
): Array<{ currency: string; amount: number }> {
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const idxA = CURRENCY_ORDER.indexOf(a);
      const idxB = CURRENCY_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([currency, amount]) => ({ currency, amount }));
}

// Helper to format currency numbers cleanly (e.g. 150 000,00 HTG)
function formatCurrency(amount: number, currency = "HTG"): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return `${formatted} ${currency}`;
}

// Generate universal 2-3 letters bank monogram
function getBankMonogram(name: string): string {
  if (!name) return "BK";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes("soge") || lower.startsWith("sog")) return "SOG";
  if (lower.includes("uni") || lower.startsWith("uni")) return "UNI";
  if (lower.includes("bnc") || lower.includes("nationale") || lower.includes("crédit") || lower.includes("credit") || lower.startsWith("bn")) return "BN";
  if (lower.includes("capital")) return "CAP";
  if (lower.includes("buh") || lower.includes("union")) return "BUH";

  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.substring(0, 3).toUpperCase();
}

// Generate solid brand styling for bank monogram badges
function getBankBadgeStyle(bankName: string): { bg: string; text: string } {
  const name = (bankName || "").toLowerCase().trim();
  if (name.includes("soge") || name.startsWith("sog")) {
    return { bg: "bg-[#DC2626]", text: "text-white" };
  }
  if (name.includes("uni")) {
    return { bg: "bg-[#062653]", text: "text-white" };
  }
  if (name.includes("bnc") || name.includes("nationale") || name.includes("crédit") || name.includes("credit") || name.startsWith("bn")) {
    return { bg: "bg-[#EA580C]", text: "text-white" };
  }
  if (name.includes("capital")) {
    return { bg: "bg-[#059669]", text: "text-white" };
  }
  if (name.includes("buh") || name.includes("union")) {
    return { bg: "bg-[#7C3AED]", text: "text-white" };
  }
  return { bg: "bg-[#062653]", text: "text-white" };
}

// Mask account number for confidentiality (e.g. •••• 4920)
function maskAccountNumber(accNum: string): string {
  if (!accNum) return "••••";
  const cleaned = accNum.trim();
  if (cleaned.length <= 4) return cleaned;
  const last4 = cleaned.slice(-4);
  return `•••• •••• ${last4}`;
}

// Format account number as electronic card 4-by-4 groups (e.g. •••• •••• •••• 4920)
function formatCardNumber(accNum: string): string {
  if (!accNum) return "••••  ••••  ••••  ••••";
  const cleaned = accNum.trim().replace(/\D/g, "");
  const last4 = cleaned.length >= 4 ? cleaned.slice(-4) : accNum.trim().slice(-4).padStart(4, "0");
  return `••••  ••••  ••••  ${last4}`;
}

// Helper to get electronic bank card theme per bank (Refined Silver / Gray Gradient)
function getBankCardTheme(bankName: string) {
  return {
    gradient: "bg-gradient-to-br from-[#FFFFFF] via-[#F1F5F9] to-[#CBD5E1]",
    border: "",
  };
}

export default function FinancialOperationsPage() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");

  // Tabs: accounts (par défaut), deposits, withdrawals, report
  const [activeTab, setActiveTab] = useState<"accounts" | "report">(
    urlTab === "report" ? "report" : "accounts"
  );

  // Sync tab with URL
  useEffect(() => {
    if (urlTab === "report") {
      setActiveTab("report");
    } else if (urlTab === "accounts" || urlTab === "deposits" || urlTab === "withdrawals" || !urlTab) {
      setActiveTab("accounts");
    }
  }, [urlTab]);

  // Current session & auth
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRestricted, setIsRestricted] = useState(false);
  const [companyName, setCompanyName] = useState("RKonekte");
  const [companyLogo, setCompanyLogo] = useState("");

  // Branch context
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rk_active_branch");
      if (saved && saved !== "all") return saved;
    }
    return "ALL";
  });

  // Data states
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("ALL");
  const [filterType, setFilterType] = useState<"ALL" | "DEPOSIT" | "WITHDRAWAL">("ALL");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "today" | "7days" | "month" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Modals state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [viewingAccount, setViewingAccount] = useState<BankAccount | null>(null);
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<BankTransaction | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<BankAccount | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  // Form states for transaction (Deposit or Withdrawal)
  const [txFormAccountId, setTxFormAccountId] = useState("");
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [txFormAmount, setTxFormAmount] = useState<number | string>("");
  const [txFormRef, setTxFormRef] = useState("");
  const [txFormDate, setTxFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [txFormReason, setTxFormReason] = useState("");
  const [txFormBranchId, setTxFormBranchId] = useState("");
  const [txFormAuthorName, setTxFormAuthorName] = useState("");
  const [txFormAuthorMatricule, setTxFormAuthorMatricule] = useState("");
  const [txFormDelegateName, setTxFormDelegateName] = useState("");
  const [txFormReceiptDataUrl, setTxFormReceiptDataUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states for Account creation/editing
  const [accFormBankName, setAccFormBankName] = useState("");
  const [accFormAccountName, setAccFormAccountName] = useState("");
  const [accFormAccountNumber, setAccFormAccountNumber] = useState("");
  const [accFormCurrency, setAccFormCurrency] = useState<string>("HTG");
  const [accFormInitialBalance, setAccFormInitialBalance] = useState<number | string>(0);
  const [accFormInitialBalanceDate, setAccFormInitialBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [accFormIsActive, setAccFormIsActive] = useState(true);

  // KPI currency expand states (max 3 currencies shown by default + "Voir plus")
  const [showAllDepositsCurrencies, setShowAllDepositsCurrencies] = useState(false);
  const [showAllWithdrawalsCurrencies, setShowAllWithdrawalsCurrencies] = useState(false);
  const [showAllNetCurrencies, setShowAllNetCurrencies] = useState(false);
  const [showAllBalanceCurrencies, setShowAllBalanceCurrencies] = useState(false);

  // Helper to automatically resolve actor's matricule / identifier
  const resolveActorMatricule = (
    userObj: any,
    emps: any[],
    authorNameOverride?: string
  ): string => {
    const cleanOverride = (authorNameOverride || "").trim().toLowerCase();
    const userFullName = (userObj?.name || "").trim().toLowerCase();
    const userEmail = (userObj?.email || "").trim().toLowerCase();

    if (Array.isArray(emps) && emps.length > 0) {
      if (cleanOverride) {
        const byTypedName = emps.find(
          (emp: any) =>
            `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase() ===
              cleanOverride && Boolean(emp.employeeNumber)
        );
        if (byTypedName?.employeeNumber) {
          return byTypedName.employeeNumber;
        }
      }

      if (!cleanOverride || cleanOverride === userFullName) {
        if (userObj?.employeeNumber) return userObj.employeeNumber;
        if (userEmail) {
          const byEmail = emps.find(
            (emp: any) =>
              emp.email &&
              emp.email.toLowerCase().trim() === userEmail &&
              Boolean(emp.employeeNumber)
          );
          if (byEmail?.employeeNumber) return byEmail.employeeNumber;
        }
        if (userFullName) {
          const byUserName = emps.find(
            (emp: any) =>
              `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase() ===
                userFullName && Boolean(emp.employeeNumber)
          );
          if (byUserName?.employeeNumber) return byUserName.employeeNumber;
        }
      }
    }

    if ((!cleanOverride || cleanOverride === userFullName) && userObj?.employeeNumber) {
      return userObj.employeeNumber;
    }

    // Fallback identifier by role for admins/managers without an employee record
    if ((!cleanOverride || cleanOverride === userFullName) && userObj) {
      const role = String(userObj.role || "").toUpperCase();
      if (role === "ORGANIZATION_ADMIN" || role === "SUPER_ADMIN") return "ADM-001";
      if (role === "FINANCIAL_MANAGER") return "FIN-001";
      if (role === "BRANCH_MANAGER") return "MGR-001";
      if (role === "SECRETARY") return "SEC-001";
      return "USR-001";
    }

    return "";
  };

  // 1. Initial Load & Listeners
  useEffect(() => {
    async function initUserAndBranches() {
      try {
        const [meRes, orgRes, brRes, empRes] = await Promise.all([
          fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/organization").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/branches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/employees").then((r) => (r.ok ? r.json() : null)),
        ]);

        const fetchedEmps = Array.isArray(empRes?.employees) ? empRes.employees : [];
        setEmployeesList(fetchedEmps);

        if (meRes?.user) {
          setCurrentUser(meRes.user);
          const role = meRes.user.role || "";
          const isRestr =
            role === "EMPLOYEE" ||
            role === "COLLABORATEUR" ||
            role === "CASHIER" ||
            role === "CAISSIER" ||
            role.toLowerCase().includes("employ") ||
            role.toLowerCase().includes("caissier") ||
            role.toLowerCase().includes("cashier");

          if (isRestr) {
            setIsRestricted(true);
            setLoading(false);
            return;
          }

          setTxFormAuthorName(meRes.user.name || "");
          setTxFormAuthorMatricule(
            resolveActorMatricule(meRes.user, fetchedEmps, meRes.user.name)
          );
        }

        if (orgRes?.organization) {
          if (orgRes.organization.name) setCompanyName(orgRes.organization.name);
          if (orgRes.organization.logoUrl) setCompanyLogo(orgRes.organization.logoUrl);
        }

        if (brRes?.branches && Array.isArray(brRes.branches)) {
          setBranches(brRes.branches);
        }
      } catch (err) {
        console.error("Failed to load initial context:", err);
      }
    }

    initUserAndBranches();

    // Listen to global branch change event from AdminHeader
    const handleBranchChange = (e: any) => {
      const bId = e.detail?.branchId;
      if (bId !== undefined) {
        setSelectedBranchId(bId === "all" ? "ALL" : bId);
      }
    };
    window.addEventListener("branchChange", handleBranchChange);
    return () => window.removeEventListener("branchChange", handleBranchChange);
  }, []);

  // Keep actor matricule auto-synced if user/employees load while a modal is open
  useEffect(() => {
    if ((isDepositModalOpen || isWithdrawalModalOpen) && currentUser && !txFormAuthorMatricule.trim()) {
      const resolved = resolveActorMatricule(currentUser, employeesList, txFormAuthorName || currentUser.name);
      if (resolved) {
        setTxFormAuthorMatricule(resolved);
      }
    }
  }, [isDepositModalOpen, isWithdrawalModalOpen, currentUser, employeesList]);

  // 2. Fetch Accounts, Transactions & Stats
  const fetchData = async () => {
    if (isRestricted) return;
    setLoading(true);
    try {
      const branchQuery = selectedBranchId && selectedBranchId !== "ALL" ? `?branchId=${selectedBranchId}` : "";

      const [accRes, txRes, statsRes] = await Promise.all([
        fetch("/api/admin/financial-operations/accounts", { cache: "no-store" }),
        fetch(`/api/admin/financial-operations/transactions${branchQuery}`, { cache: "no-store" }),
        fetch(`/api/admin/financial-operations/stats${branchQuery}`, { cache: "no-store" }),
      ]);

      if (accRes.status === 403 || txRes.status === 403) {
        setIsRestricted(true);
        setLoading(false);
        return;
      }

      const accData = await accRes.json();
      const txData = await txRes.json();
      const statsData = await statsRes.json();

      if (accData.success) {
        setAccounts(accData.accounts || []);
      }
      if (txData.success) {
        setTransactions(txData.transactions || []);
      }
      if (statsData.success) {
        setStats(statsData.stats);
      }
    } catch (err) {
      console.error("Failed to fetch bank data:", err);
      showSystemToast("Erreur de chargement des opérations financières", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranchId, isRestricted]);

  // Active company accounts for dropdowns & availability
  const activeAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.isActive);
  }, [accounts]);

  const selectedTxAccount = useMemo(() => {
    return accounts.find((acc) => acc.id === txFormAccountId) || null;
  }, [accounts, txFormAccountId]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    // Search query (ref, reason, bordereau, author, bank)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.referenceNumber.toLowerCase().includes(q) ||
          t.reason.toLowerCase().includes(q) ||
          t.bankName.toLowerCase().includes(q) ||
          t.accountName.toLowerCase().includes(q) ||
          t.authorName.toLowerCase().includes(q) ||
          (t.authorMatricule && t.authorMatricule.toLowerCase().includes(q)) ||
          (t.delegateName && t.delegateName.toLowerCase().includes(q))
      );
    }

    // Account filter
    if (filterAccountId !== "ALL") {
      list = list.filter((t) => t.bankAccountId === filterAccountId);
    }

    // Type filter (only in report tab)
    if (filterType !== "ALL") {
      list = list.filter((t) => t.type === filterType);
    }

    // Period filter
    const today = new Date().toISOString().split("T")[0];
    if (filterPeriod === "today") {
      list = list.filter((t) => t.date === today);
    } else if (filterPeriod === "7days") {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().split("T")[0];
      list = list.filter((t) => t.date >= d7Str);
    } else if (filterPeriod === "month") {
      const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      list = list.filter((t) => t.date >= mStart);
    } else if (filterPeriod === "custom") {
      if (customStartDate) list = list.filter((t) => t.date >= customStartDate);
      if (customEndDate) list = list.filter((t) => t.date <= customEndDate);
    }

    return list;
  }, [transactions, searchTerm, filterAccountId, filterType, filterPeriod, customStartDate, customEndDate]);

  // Dynamic ledger stats from currently filtered list (multi-currency)
  const filteredLedgerStats = useMemo(() => {
    const depMap = new Map<string, number>();
    const retMap = new Map<string, number>();
    const allCurrencies = new Set<string>();

    for (const t of filteredTransactions) {
      const currency = (t.currency || "HTG").trim().toUpperCase();
      const amt = Number(t.amount) || 0;
      allCurrencies.add(currency);
      if (t.type === "DEPOSIT") {
        depMap.set(currency, (depMap.get(currency) || 0) + amt);
      } else {
        retMap.set(currency, (retMap.get(currency) || 0) + amt);
      }
    }

    const netMap = new Map<string, number>();
    for (const currency of allCurrencies) {
      netMap.set(currency, (depMap.get(currency) || 0) - (retMap.get(currency) || 0));
    }

    const deposits = sortCurrencyEntries(depMap);
    const withdrawals = sortCurrencyEntries(retMap);
    const net = sortCurrencyEntries(netMap);

    return {
      deposits: deposits.length > 0 ? deposits : [{ currency: "HTG", amount: 0 }],
      withdrawals: withdrawals.length > 0 ? withdrawals : [{ currency: "HTG", amount: 0 }],
      net: net.length > 0 ? net : [{ currency: "HTG", amount: 0 }],
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  // Cumulative company bank accounts total balances across all currencies
  const totalAccountBalances = useMemo(() => {
    const byCurrencyMap = new Map<string, number>();
    let activeCount = 0;
    let inactiveCount = 0;

    for (const acc of accounts) {
      if (filterAccountId !== "ALL" && acc.id !== filterAccountId) continue;

      if (acc.isActive) {
        activeCount += 1;
        const balance = Number(acc.currentBalance) || 0;
        const currency = (acc.currency || "HTG").trim().toUpperCase();
        byCurrencyMap.set(currency, (byCurrencyMap.get(currency) || 0) + balance);
      } else {
        inactiveCount += 1;
      }
    }

    const byCurrency = sortCurrencyEntries(byCurrencyMap);

    return {
      byCurrency: byCurrency.length > 0 ? byCurrency : [{ currency: "HTG", amount: 0 }],
      activeCount,
      inactiveCount,
    };
  }, [accounts, filterAccountId]);

  const handleAuthorNameChange = (newName: string) => {
    setTxFormAuthorName(newName);
    const resolved = resolveActorMatricule(currentUser, employeesList, newName);
    if (resolved) {
      setTxFormAuthorMatricule(resolved);
    }
  };

  // Reset Transaction Modal
  const openTransactionModal = (type: "DEPOSIT" | "WITHDRAWAL", preselectedAccountId?: string) => {
    const accId = preselectedAccountId || (activeAccounts.length > 0 ? activeAccounts[0].id : "");
    setTxFormAccountId(accId);
    setIsAccountLocked(Boolean(preselectedAccountId));
    setTxFormAmount("");
    setTxFormRef("");
    setTxFormDate(new Date().toISOString().split("T")[0]);
    setTxFormReason(type === "DEPOSIT" ? "Versement de recettes en banque" : "Retrait / Approvisionnement");
    setTxFormBranchId(selectedBranchId !== "ALL" ? selectedBranchId : "");
    setTxFormDelegateName("");
    setTxFormReceiptDataUrl(undefined);
    if (currentUser) {
      const defaultAuthor = currentUser.name || "Administrateur";
      setTxFormAuthorName(defaultAuthor);
      setTxFormAuthorMatricule(
        resolveActorMatricule(currentUser, employeesList, defaultAuthor)
      );
    }

    if (type === "DEPOSIT") {
      setIsDepositModalOpen(true);
    } else {
      setIsWithdrawalModalOpen(true);
    }
  };

  // Open Account Modal (Create or Edit)
  const openAccountModal = (accToEdit?: BankAccount) => {
    if (accToEdit) {
      setEditingAccount(accToEdit);
      setAccFormBankName(accToEdit.bankName);
      setAccFormAccountName(accToEdit.accountName);
      setAccFormAccountNumber(accToEdit.accountNumber);
      setAccFormCurrency((accToEdit.currency || "HTG").trim().toUpperCase());
      setAccFormInitialBalance(accToEdit.initialBalance);
      setAccFormInitialBalanceDate(
        accToEdit.initialBalanceDate ||
        (accToEdit.createdAt ? accToEdit.createdAt.split("T")[0] : new Date().toISOString().split("T")[0])
      );
      setAccFormIsActive(accToEdit.isActive);
    } else {
      setEditingAccount(null);
      setAccFormBankName("");
      setAccFormAccountName("");
      setAccFormAccountNumber("");
      setAccFormCurrency("HTG");
      setAccFormInitialBalance(0);
      setAccFormInitialBalanceDate(new Date().toISOString().split("T")[0]);
      setAccFormIsActive(true);
    }
    setIsAccountModalOpen(true);
  };

  // Handle Receipt Upload (facultatif)
  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showSystemToast("Le fichier ne doit pas dépasser 5 Mo.", "info");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTxFormReceiptDataUrl(event.target?.result as string);
      showSystemToast("Bordereau / justificatif chargé.", "success");
    };
    reader.readAsDataURL(file);
  };

  // Save Transaction (Deposit or Withdrawal)
  const handleSaveTransaction = async (type: "DEPOSIT" | "WITHDRAWAL") => {
    if (!txFormAccountId) {
      showSystemToast("Veuillez sélectionner un compte bancaire actif.", "info");
      return;
    }

    const amt = Number(txFormAmount);
    if (!amt || amt <= 0) {
      showSystemToast("Le montant doit être un nombre valide supérieur à 0.", "info");
      return;
    }

    if (type === "WITHDRAWAL" && !txFormRef.trim()) {
      showSystemToast("Veuillez renseigner le N° de référence / chèque.", "info");
      return;
    }

    if (!txFormAuthorName.trim()) {
      showSystemToast("Le nom de l'auteur de l'opération est obligatoire.", "info");
      return;
    }

    const effectiveMatricule =
      txFormAuthorMatricule.trim() ||
      resolveActorMatricule(currentUser, employeesList, txFormAuthorName);

    if (!effectiveMatricule) {
      showSystemToast(
        "Le matricule / identifiant de l'auteur est obligatoire.",
        "info"
      );
      return;
    }

    setSavingAction(true);
    try {
      const selectedAcc = accounts.find((a) => a.id === txFormAccountId);
      const branchObj = branches.find((b) => b.id === txFormBranchId);

      const res = await fetch("/api/admin/financial-operations/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          bankAccountId: txFormAccountId,
          amount: amt,
          currency: selectedAcc?.currency || "HTG",
          referenceNumber: txFormRef.trim(),
          date: txFormDate,
          reason: txFormReason.trim(),
          branchId: txFormBranchId || null,
          branchName: branchObj?.name || null,
          authorName: txFormAuthorName.trim() || currentUser?.name || "Administrateur",
          authorMatricule: effectiveMatricule,
          authorRole: currentUser?.role || "ADMIN",
          delegateName:
            type === "DEPOSIT" ? txFormDelegateName.trim() || undefined : undefined,
          receiptDataUrl: txFormReceiptDataUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible d'enregistrer l'opération bancaire.");
      }

      showSystemToast(
        type === "DEPOSIT"
          ? `Versement de ${formatCurrency(amt, selectedAcc?.currency)} enregistré avec succès !`
          : `Retrait de ${formatCurrency(amt, selectedAcc?.currency)} enregistré avec succès !`,
        "success"
      );

      setIsDepositModalOpen(false);
      setIsWithdrawalModalOpen(false);
      fetchData();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("rkonekte_notification_update"));
      }
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de l'enregistrement", "error");
    } finally {
      setSavingAction(false);
    }
  };

  // Save Account (Create or Edit)
  const handleSaveAccount = async () => {
    if (!accFormBankName.trim()) {
      showSystemToast("Le nom de la banque est requis (ex: Sogebank, Unibank, BNP...).", "info");
      return;
    }
    if (!accFormAccountNumber.trim()) {
      showSystemToast("Le numéro de compte est obligatoire.", "info");
      return;
    }

    setSavingAction(true);
    try {
      if (editingAccount) {
        const res = await fetch(`/api/admin/financial-operations/accounts/${editingAccount.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankName: accFormBankName.trim(),
            accountName: accFormAccountName.trim() || accFormBankName.trim(),
            accountNumber: accFormAccountNumber.trim(),
            currency: accFormCurrency,
            initialBalanceDate: accFormInitialBalanceDate || undefined,
            branchId: null,
            branchName: companyName || "Compte de l'entreprise",
            isActive: accFormIsActive,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Erreur de mise à jour");
        showSystemToast("Compte bancaire mis à jour avec succès !", "success");
      } else {
        const res = await fetch("/api/admin/financial-operations/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankName: accFormBankName.trim(),
            accountName: accFormAccountName.trim() || accFormBankName.trim(),
            accountNumber: accFormAccountNumber.trim(),
            currency: accFormCurrency,
            initialBalance: Number(accFormInitialBalance) || 0,
            initialBalanceDate: accFormInitialBalanceDate || new Date().toISOString().split("T")[0],
            branchId: null,
            branchName: companyName || "Compte de l'entreprise",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Erreur de création");
        showSystemToast("Nouveau compte bancaire ajouté avec succès !", "success");
      }

      setIsAccountModalOpen(false);
      fetchData();
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de l'enregistrement du compte", "error");
    } finally {
      setSavingAction(false);
    }
  };

  // Delete Transaction with balance reversal
  const handleConfirmDeleteTx = async () => {
    if (!deletingTx) return;
    setSavingAction(true);
    try {
      const res = await fetch(`/api/admin/financial-operations/transactions/${deletingTx.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de supprimer la transaction");
      }

      showSystemToast(
        `Transaction ${deletingTx.id} supprimée. Le solde du compte a été réajusté.`,
        "success"
      );
      setDeletingTx(null);
      fetchData();
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSavingAction(false);
    }
  };

  // Delete Account
  const handleConfirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    setSavingAction(true);
    try {
      const res = await fetch(`/api/admin/financial-operations/accounts/${deletingAccount.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Impossible de supprimer le compte bancaire");
      }

      showSystemToast("Compte bancaire supprimé.", "success");
      setDeletingAccount(null);
      fetchData();
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSavingAction(false);
    }
  };

  // ----------------------------------------------------
  // RESTRICTED VIEW FOR CAISSIER / EMPLOYEE
  // ----------------------------------------------------
  if (isRestricted) {
    return (
      <div className="bg-white rounded-2xl shadow-xs p-12 text-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4 text-amber-600">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-[#062653] mb-2">Accès Restreint</h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">
          Le module des <strong>Opérations Financières</strong> est strictement réservé à la
          direction générale, à l'administration et à la gestion de la trésorerie.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <datalist id="financial-op-employees">
        {employeesList.map((emp) => {
          const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim();
          if (!fullName) return null;
          return (
            <option key={emp.id} value={fullName}>
              {emp.employeeNumber ? `${emp.employeeNumber} — ${fullName}` : fullName}
            </option>
          );
        })}
      </datalist>

      {/* ----------------------------------------------------
          1. VUE LARGE : AJOUTER / MODIFIER COMPTE BANCAIRE (STYLE NOUVEL EMPLOYÉ)
      ---------------------------------------------------- */}
      {isAccountModalOpen && (
        <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-6 pb-8 animate-fadeIn no-print">
          {/* HEADER */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setIsAccountModalOpen(false);
                setEditingAccount(null);
              }}
              className="p-2 bg-[#F4F6F9] rounded-xl hover:bg-slate-200 text-[#64748B] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                {editingAccount ? "Modifier le compte bancaire" : "Ajouter un compte bancaire"}
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                {editingAccount
                  ? "Mise à jour des coordonnées et paramètres du compte bancaire de l'entreprise."
                  : "Renseignez les coordonnées bancaires officielles de l'entreprise. Le compte sera immédiatement actif pour les opérations."}
              </p>
            </div>
          </div>

          {/* MAIN CARD */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveAccount();
              }}
              className="space-y-8"
            >
              {/* STATUS TOGGLE */}
              <div className="p-4 sm:p-5 bg-[#F4F6F9] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#062653] block">
                    Compte bancaire actif
                  </span>
                  <span className="text-[11px] text-[#64748B] block mt-0.5">
                    Si activé, ce compte sera disponible pour les enregistrements de versements et de retraits.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={accFormIsActive}
                    onChange={(e) => setAccFormIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* 1. INFORMATIONS BANCAIRES */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>1. Coordonnées de l'Institution Bancaire</span>
                  </h3>
                  <span className="text-[11px] text-red-600 font-semibold">* Champs requis</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Nom de la Banque <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={accFormBankName}
                      onChange={(e) => setAccFormBankName(e.target.value)}
                      placeholder="Ex: Sogebank, Unibank, BNP Paribas, Chase..."
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Intitulé / Nom du Compte <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={accFormAccountName}
                      onChange={(e) => setAccFormAccountName(e.target.value)}
                      placeholder="Ex: Compte Opérations Courantes, Trésorerie USD..."
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Numéro de Compte <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={accFormAccountNumber}
                      onChange={(e) => setAccFormAccountNumber(e.target.value)}
                      placeholder="Ex: 102-1021-884920"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* 2. PARAMÈTRES MONÉTAIRES */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>2. Paramètres Monétaires</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Devise du compte <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={accFormCurrency}
                      onChange={(e) => setAccFormCurrency(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden"
                    >
                      {SUPPORTED_CURRENCIES.map((cur) => (
                        <option key={cur.code} value={cur.code}>
                          {cur.label}
                        </option>
                      ))}
                      {!SUPPORTED_CURRENCIES.some((c) => c.code === accFormCurrency) && (
                        <option value={accFormCurrency}>{accFormCurrency}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Solde initial ({accFormCurrency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!!editingAccount}
                      value={accFormInitialBalance}
                      onChange={(e) => setAccFormInitialBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    {editingAccount && (
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Le montant initial n'est fixé qu'à la création.
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#062653]" />
                      Date d'initialisation du solde <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={accFormInitialBalanceDate}
                      onChange={(e) => setAccFormInitialBalanceDate(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Date de référence du solde de départ.
                    </span>
                  </div>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountModalOpen(false);
                    setEditingAccount(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-[#64748B] transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>
                    {savingAction
                      ? "Enregistrement..."
                      : editingAccount
                      ? "Sauvegarder les modifications"
                      : "Créer le compte bancaire"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          2. VUE LARGE : ENREGISTRER UN VERSEMENT BANCAIRE (STYLE NOUVEL EMPLOYÉ)
      ---------------------------------------------------- */}
      {isDepositModalOpen && (
        <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-6 pb-8 animate-fadeIn no-print">
          {/* HEADER */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsDepositModalOpen(false)}
              className="p-2 bg-[#F4F6F9] rounded-xl hover:bg-slate-200 text-[#64748B] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                Enregistrer un Versement Bancaire (Dépôt)
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Renseignez les détails du versement. Le solde du compte sélectionné sera automatiquement crédité.
              </p>
            </div>
          </div>

          {/* MAIN CARD */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveTransaction("DEPOSIT");
              }}
              className="space-y-8"
            >
              {/* 1. COORDONNÉES DU VERSEMENT */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>1. Coordonnées Financières du Versement</span>
                  </h3>
                  <span className="text-[11px] text-red-600 font-semibold">* Champs requis</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Compte Bancaire Destinataire <span className="text-rose-500">*</span>
                    </label>
                    {isAccountLocked && selectedTxAccount ? (
                      <div
                        title={`${selectedTxAccount.bankName} - ${selectedTxAccount.accountName} (${maskAccountNumber(selectedTxAccount.accountNumber)}) — Solde : ${formatCurrency(selectedTxAccount.currentBalance, selectedTxAccount.currency)}`}
                        className="w-full h-11 px-3.5 bg-slate-100 rounded-xl text-xs font-bold text-[#062653] flex items-center justify-between gap-2 cursor-not-allowed select-none"
                      >
                        <span className="truncate">
                          {selectedTxAccount.bankName} - {selectedTxAccount.accountName} ({maskAccountNumber(selectedTxAccount.accountNumber)}) — {formatCurrency(selectedTxAccount.currentBalance, selectedTxAccount.currency)}
                        </span>
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                    ) : (
                      <select
                        value={txFormAccountId}
                        onChange={(e) => setTxFormAccountId(e.target.value)}
                        required
                        className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden"
                      >
                        <option value="">Sélectionner un compte bancaire...</option>
                        {activeAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bankName} - {acc.accountName} ({maskAccountNumber(acc.accountNumber)}) — Solde : {formatCurrency(acc.currentBalance, acc.currency)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Montant du Versement <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={txFormAmount}
                      onChange={(e) => setTxFormAmount(e.target.value)}
                      placeholder="Ex: 50000"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-black text-emerald-700 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      N° Bordereau de Dépôt{" "}
                      <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <input
                      type="text"
                      value={txFormRef}
                      onChange={(e) => setTxFormRef(e.target.value)}
                      placeholder="Ex: BOR-889410"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* 2. DÉTAILS DE L'OPÉRATION & TRAÇABILITÉ */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>2. Détails de l'Opération & Traçabilité</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Date du Versement <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={txFormDate}
                      onChange={(e) => setTxFormDate(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Auteur de l'Opération (Nom) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      list="financial-op-employees"
                      value={txFormAuthorName}
                      onChange={(e) => handleAuthorNameChange(e.target.value)}
                      placeholder="Nom du responsable ou coursier"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-[#263445] mb-1.5">
                      <span>
                        Matricule / Identifiant <span className="text-rose-500">*</span>
                      </span>
                      {txFormAuthorMatricule && (
                        <span className="text-[10px] font-medium text-emerald-700">
                          Auto-reconnu
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorMatricule}
                      onChange={(e) => setTxFormAuthorMatricule(e.target.value)}
                      placeholder="Ex: ADM-001"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Motif / Justification du Versement <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormReason}
                      onChange={(e) => setTxFormReason(e.target.value)}
                      placeholder="Ex: Versement recettes caisse du week-end"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Délégué de dépôt <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <input
                      type="text"
                      value={txFormDelegateName}
                      onChange={(e) => setTxFormDelegateName(e.target.value)}
                      placeholder="Nom de la personne qui va faire le dépôt"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Succursale Concernée <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <select
                      value={txFormBranchId}
                      onChange={(e) => setTxFormBranchId(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    >
                      <option value="">-- Sélectionner une succursale --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 3. JUSTIFICATIF / BORDEREAU */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>3. Justificatif / Bordereau Bancaire</span>
                  </h3>
                </div>

                <div className="p-6 bg-[#F4F6F9] rounded-2xl">
                  {txFormReceiptDataUrl ? (
                    <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-xl shadow-xs">
                      <div className="flex items-center gap-3">
                        <img
                          src={txFormReceiptDataUrl}
                          alt="Scan bordereau"
                          className="w-16 h-16 object-cover rounded-lg shrink-0"
                        />
                        <div>
                          <span className="text-xs font-bold text-[#062653] block">
                            Bordereau / Scan attaché
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewReceiptUrl(txFormReceiptDataUrl)}
                            className="text-xs text-blue-600 hover:underline font-semibold mt-0.5 block cursor-pointer"
                          >
                            Visualiser en plein écran →
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTxFormReceiptDataUrl(undefined)}
                        className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1 font-semibold cursor-pointer transition"
                      >
                        <Trash2 className="w-4 h-4" />
                        Retirer le fichier
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleReceiptUpload}
                        className="hidden"
                        id="tx-receipt-upload-large"
                      />
                      <label
                        htmlFor="tx-receipt-upload-large"
                        className="w-full py-8 px-4 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-[#64748B] hover:bg-slate-50 transition cursor-pointer bg-white shadow-2xs"
                      >
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="font-semibold text-[#062653]">
                          Cliquer ou glisser-déposer pour joindre le scan ou photo du bordereau bancaire
                        </span>
                        <span className="text-[11px] text-slate-400">
                          PNG, JPG, PDF jusqu'à 5 Mo (Facultatif)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* ACTIONS */}
              <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-[#64748B] transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                  <span>{savingAction ? "Enregistrement..." : "Valider le versement"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          3. VUE LARGE : ENREGISTRER UN RETRAIT BANCAIRE (STYLE NOUVEL EMPLOYÉ)
      ---------------------------------------------------- */}
      {isWithdrawalModalOpen && (
        <div className="max-w-5xl xl:max-w-6xl mx-auto space-y-6 pb-8 animate-fadeIn no-print">
          {/* HEADER */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsWithdrawalModalOpen(false)}
              className="p-2 bg-[#F4F6F9] rounded-xl hover:bg-slate-200 text-[#64748B] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
                Enregistrer un Retrait Bancaire (Décaissement)
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Renseignez les détails du retrait ou chèque émis. Le solde du compte sélectionné sera automatiquement débité.
              </p>
            </div>
          </div>

          {/* MAIN CARD */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveTransaction("WITHDRAWAL");
              }}
              className="space-y-8"
            >
              {/* 1. COORDONNÉES DU DÉCAISSEMENT */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>1. Coordonnées Financières du Retrait</span>
                  </h3>
                  <span className="text-[11px] text-red-600 font-semibold">* Champs requis</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Compte Bancaire Source <span className="text-rose-500">*</span>
                    </label>
                    {isAccountLocked && selectedTxAccount ? (
                      <div
                        title={`${selectedTxAccount.bankName} - ${selectedTxAccount.accountName} (${maskAccountNumber(selectedTxAccount.accountNumber)}) — Solde : ${formatCurrency(selectedTxAccount.currentBalance, selectedTxAccount.currency)}`}
                        className="w-full h-11 px-3.5 bg-slate-100 rounded-xl text-xs font-bold text-[#062653] flex items-center justify-between gap-2 cursor-not-allowed select-none"
                      >
                        <span className="truncate">
                          {selectedTxAccount.bankName} - {selectedTxAccount.accountName} ({maskAccountNumber(selectedTxAccount.accountNumber)}) — {formatCurrency(selectedTxAccount.currentBalance, selectedTxAccount.currency)}
                        </span>
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                    ) : (
                      <select
                        value={txFormAccountId}
                        onChange={(e) => setTxFormAccountId(e.target.value)}
                        required
                        className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden"
                      >
                        <option value="">Sélectionner un compte bancaire...</option>
                        {activeAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bankName} - {acc.accountName} ({maskAccountNumber(acc.accountNumber)}) — Solde : {formatCurrency(acc.currentBalance, acc.currency)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Montant du Retrait <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={txFormAmount}
                      onChange={(e) => setTxFormAmount(e.target.value)}
                      placeholder="Ex: 25000"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-black text-rose-700 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      N° de Chèque / Réf <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormRef}
                      onChange={(e) => setTxFormRef(e.target.value)}
                      placeholder="Ex: CHQ-002491"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* 2. DÉTAILS DE L'OPÉRATION & TRAÇABILITÉ */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>2. Détails du Décaissement & Motif</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Date du Retrait <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={txFormDate}
                      onChange={(e) => setTxFormDate(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Auteur de l'Opération (Nom) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      list="financial-op-employees"
                      value={txFormAuthorName}
                      onChange={(e) => handleAuthorNameChange(e.target.value)}
                      placeholder="Nom du responsable ou bénéficiaire"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-[#263445] mb-1.5">
                      <span>
                        Matricule / Identifiant <span className="text-rose-500">*</span>
                      </span>
                      {txFormAuthorMatricule && (
                        <span className="text-[10px] font-medium text-emerald-700">
                          Auto-reconnu
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorMatricule}
                      onChange={(e) => setTxFormAuthorMatricule(e.target.value)}
                      placeholder="Ex: ADM-001"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Motif / Justification du Décaissement <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormReason}
                      onChange={(e) => setTxFormReason(e.target.value)}
                      placeholder="Ex: Approvisionnement caisse succursale Jérémie"
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Succursale Concernée <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <select
                      value={txFormBranchId}
                      onChange={(e) => setTxFormBranchId(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden"
                    >
                      <option value="">-- Sélectionner une succursale --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 3. JUSTIFICATIF / CHÈQUE */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>3. Justificatif / Scan du Chèque ou Reçu</span>
                  </h3>
                </div>

                <div className="p-6 bg-[#F4F6F9] rounded-2xl">
                  {txFormReceiptDataUrl ? (
                    <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-xl shadow-xs">
                      <div className="flex items-center gap-3">
                        <img
                          src={txFormReceiptDataUrl}
                          alt="Scan reçu"
                          className="w-16 h-16 object-cover rounded-lg shrink-0"
                        />
                        <div>
                          <span className="text-xs font-bold text-[#062653] block">
                            Pièce jointe / Reçu attaché
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewReceiptUrl(txFormReceiptDataUrl)}
                            className="text-xs text-blue-600 hover:underline font-semibold mt-0.5 block cursor-pointer"
                          >
                            Visualiser en plein écran →
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTxFormReceiptDataUrl(undefined)}
                        className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1 font-semibold cursor-pointer transition"
                      >
                        <Trash2 className="w-4 h-4" />
                        Retirer le fichier
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleReceiptUpload}
                        className="hidden"
                        id="tx-receipt-upload-large-withdrawal"
                      />
                      <label
                        htmlFor="tx-receipt-upload-large-withdrawal"
                        className="w-full py-8 px-4 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-[#64748B] hover:bg-slate-50 transition cursor-pointer bg-white shadow-2xs"
                      >
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="font-semibold text-[#062653]">
                          Cliquer ou glisser-déposer pour joindre le scan ou photo du chèque / reçu de retrait
                        </span>
                        <span className="text-[11px] text-slate-400">
                          PNG, JPG, PDF jusqu'à 5 Mo (Facultatif)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* ACTIONS */}
              <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsWithdrawalModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-[#64748B] transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                  <span>{savingAction ? "Enregistrement..." : "Valider le retrait"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          TABLEAUX DES SOUS-ONGLETS (QUAND AUCUN FORMULAIRE N'EST OUVERT)
      ---------------------------------------------------- */}
      {!isAccountModalOpen && !isDepositModalOpen && !isWithdrawalModalOpen && (
        <>
          {/* ----------------------------------------------------
              SOUS-ONGLET 1 : COMPTES BANCAIRES (ACCOUNTS ONLY)
          ---------------------------------------------------- */}
          {activeTab === "accounts" && (
            <div className="space-y-5 no-print">
              {/* Header contextuel Comptes */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#062653] bg-slate-100 px-2.5 py-0.5 rounded-md">
                      Comptes & Trésorerie
                    </span>
                    {selectedBranchId !== "ALL" && (
                      <span className="text-[10px] font-semibold text-[#062653] bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#FF7900]" />
                        {branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-[#062653] tracking-tight mt-1 flex items-center gap-2">
                    <Landmark className="w-6 h-6 text-[#FF7900]" />
                    Comptes Bancaires de l'Entreprise
                  </h1>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Gestion des comptes bancaires de l'entreprise, statuts et soldes disponibles.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={fetchData}
                    title="Rafraîchir les données"
                    className="p-2.5 rounded-xl bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF7900]" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountModal()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Compte Bancaire</span>
                  </button>
                </div>
              </div>

              {/* Grille de cartes des comptes - Style Cartes Bancaires Électroniques Dégradé Gris */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {accounts.map((acc) => {
                  const theme = getBankCardTheme(acc.bankName);

                  return (
                    <div
                      key={acc.id}
                      className={`relative overflow-hidden rounded-xl p-3.5 sm:p-4 shadow-xs ${theme.gradient} flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group min-h-[175px] ${!acc.isActive ? "opacity-70" : ""}`}
                    >
                      {/* Reflets métalliques de carte bancaire argentée / platine */}
                      <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/80 blur-xl pointer-events-none" />
                      <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full bg-slate-400/20 blur-xl pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/35 to-white/60 pointer-events-none" />

                      {/* Haut de la carte : Nom de la banque & Sans Contact */}
                      <div className="flex items-start justify-between gap-2 relative z-10">
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs sm:text-sm font-black text-[#062653] tracking-tight truncate" title={acc.bankName}>
                              {acc.bankName}
                            </h4>
                            {!acc.isActive && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 shrink-0">
                                Inactif
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate tracking-wide font-medium mt-0.5" title={acc.accountName}>
                            {acc.accountName}
                          </p>
                        </div>

                        {/* Symbole de paiement sans contact NFC */}
                        <div className="flex items-center shrink-0 opacity-80" title="Carte bancaire électronique sans contact">
                          <Wifi className="w-4 h-4 rotate-90 text-slate-500" />
                        </div>
                      </div>

                      {/* Milieu de la carte : Puce électronique EMV dorée compacte & Numéro masqué 4x4 */}
                      <div className="my-2 flex items-center justify-between gap-2 relative z-10">
                        {/* Puce électronique EMV dorée compacte avec microcircuits */}
                        <div className="relative w-8 h-6 rounded-sm bg-gradient-to-br from-[#FFE29F] via-[#FFB74D] to-[#D4AF37] p-[1px] shadow-2xs shrink-0">
                          <div className="w-full h-full rounded-[2px] bg-gradient-to-br from-[#FAD961] to-[#F76B1C]/60 relative overflow-hidden flex flex-col justify-between p-0.5 border border-amber-950/20">
                            <div className="w-full h-[0.5px] bg-amber-950/40 mt-0.5" />
                            <div className="flex justify-between items-center w-full">
                              <div className="w-1.5 h-[0.5px] bg-amber-950/40" />
                              <div className="w-2 h-2 rounded-full border border-amber-950/40" />
                              <div className="w-1.5 h-[0.5px] bg-amber-950/40" />
                            </div>
                            <div className="w-full h-[0.5px] bg-amber-950/40 mb-0.5" />
                          </div>
                        </div>

                        {/* Numéro de carte en relief 4x4 */}
                        <div className="font-mono text-[11px] sm:text-xs tracking-[0.16em] text-[#062653] font-bold text-right">
                          {formatCardNumber(acc.accountNumber)}
                        </div>
                      </div>

                      {/* Solde actuel & date d'initialisation de la carte */}
                      <div className="relative z-10 flex items-baseline justify-between">
                        <div>
                          <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">
                            Solde actuel
                          </span>
                          <span className="text-sm sm:text-base font-black text-[#062653] tracking-tight">
                            {formatCurrency(acc.currentBalance, acc.currency)}
                          </span>
                        </div>
                        {(acc.initialBalanceDate || acc.createdAt) && (
                          <div className="text-right">
                            <span className="text-[8px] uppercase font-semibold text-slate-400 block">
                              Init. le
                            </span>
                            <span className="text-[10px] font-bold text-slate-600">
                              {new Date((acc.initialBalanceDate || acc.createdAt).includes("T") ? (acc.initialBalanceDate || acc.createdAt) : `${acc.initialBalanceDate || acc.createdAt}T12:00:00`).toLocaleDateString("fr-FR")}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bas de la carte : Entreprise titulaire & Boutons d'actions */}
                      <div className="mt-2.5 pt-2 border-t border-slate-300/80 flex items-center justify-between gap-1.5 relative z-10">
                        <span className="text-[10px] text-[#062653]/80 font-semibold truncate max-w-[110px]" title={`Compte de l'entreprise (${companyName})`}>
                          {companyName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Bouton Voir : détails complets du compte */}
                          <button
                            type="button"
                            onClick={() => setViewingAccount(acc)}
                            className="px-2 py-1 rounded-md bg-white/95 hover:bg-white text-[#062653] font-bold text-[10px] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                            title="Voir les informations complètes du compte"
                          >
                            <Eye className="w-3 h-3 text-[#062653]" />
                            <span>Voir</span>
                          </button>

                          {/* Bouton Dépôt : Solide jaune abricot (#FF7900), texte noir */}
                          <button
                            type="button"
                            onClick={() => openTransactionModal("DEPOSIT", acc.id)}
                            className="px-2.5 py-1 rounded-md bg-[#FF7900] hover:bg-[#E66D00] text-black font-extrabold text-[10px] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-0.5"
                            title="Faire un versement sur ce compte"
                          >
                            <span>+ Dépôt</span>
                          </button>

                          {/* Bouton Retrait : Rouge solide, texte blanc */}
                          <button
                            type="button"
                            onClick={() => openTransactionModal("WITHDRAWAL", acc.id)}
                            className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-0.5"
                            title="Faire un retrait sur ce compte"
                          >
                            <span>- Retrait</span>
                          </button>

                          {/* Bouton Modifier */}
                          <button
                            type="button"
                            onClick={() => openAccountModal(acc)}
                            className="p-1 rounded-md bg-white/90 hover:bg-white text-slate-700 shadow-xs transition-colors cursor-pointer"
                            title="Modifier le compte"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message si aucun compte */}
              {accounts.length === 0 && (
                <div className="bg-white rounded-2xl shadow-xs p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#F4F6F9] flex items-center justify-center mx-auto text-[#64748B]">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-[#062653]">Aucun compte bancaire enregistré</h4>
                  <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                    Ajoutez vos comptes bancaires pour commencer à enregistrer les versements et décaissements.
                  </p>
                  <button
                    type="button"
                    onClick={() => openAccountModal()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Ajouter un compte</span>
                  </button>
                </div>
              )}
            </div>
          )}

      {/* ----------------------------------------------------
          4. SOUS-ONGLET 3 : RAPPORT DES TRANSACTIONS (REPORT ONLY)
      ---------------------------------------------------- */}
      {activeTab === "report" && (
        <div className="space-y-5">
          {/* Header contextuel Rapport */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              {selectedBranchId !== "ALL" && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-[#062653] bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#FF7900]" />
                    {branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </span>
                </div>
              )}
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight flex items-center gap-2">
                <Receipt className="w-6 h-6 text-[#062653]" />
                Rapport des Transactions Bancaires
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Vue comptable générale de l'ensemble des flux bancaires (dépôts & retraits).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <button
                type="button"
                onClick={fetchData}
                title="Rafraîchir les données"
                className="p-2.5 rounded-xl bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200 transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF7900]" : ""}`} />
              </button>
            </div>
          </div>

          {/* KPI Summary Cards (Couleurs solides façon Tableau de Bord) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Box 1: Total Versements */}
            <div className="bg-[#059669] text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-emerald-100/95 text-xs font-bold mb-1.5">
                  <span>Total Versements (Dépôts)</span>
                  <ArrowDownLeft className="w-4 h-4 text-white/90" />
                </div>
                <div className="space-y-0.5">
                  {(showAllDepositsCurrencies
                    ? filteredLedgerStats.deposits
                    : filteredLedgerStats.deposits.slice(0, 3)
                  ).map((entry, idx) => (
                    <div
                      key={entry.currency}
                      className={`text-lg font-black tracking-tight ${
                        idx === 0 ? "text-white" : "text-emerald-100"
                      }`}
                    >
                      {formatCurrency(entry.amount, entry.currency)}
                    </div>
                  ))}
                </div>
                {filteredLedgerStats.deposits.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllDepositsCurrencies((v) => !v)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-white/95 hover:text-white underline underline-offset-2 cursor-pointer"
                  >
                    {showAllDepositsCurrencies
                      ? "Voir moins"
                      : `Voir plus (+${filteredLedgerStats.deposits.length - 3})`}
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-emerald-100/85 block mt-3">
                Période sélectionnée
              </span>
            </div>

            {/* Box 2: Total Retraits */}
            <div className="bg-[#FF7900] text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-amber-50 text-xs font-bold mb-1.5">
                  <span>Total Retraits (Décaissements)</span>
                  <ArrowUpRight className="w-4 h-4 text-white/90" />
                </div>
                <div className="space-y-0.5">
                  {(showAllWithdrawalsCurrencies
                    ? filteredLedgerStats.withdrawals
                    : filteredLedgerStats.withdrawals.slice(0, 3)
                  ).map((entry, idx) => (
                    <div
                      key={entry.currency}
                      className={`text-lg font-black tracking-tight ${
                        idx === 0 ? "text-white" : "text-amber-50"
                      }`}
                    >
                      {formatCurrency(entry.amount, entry.currency)}
                    </div>
                  ))}
                </div>
                {filteredLedgerStats.withdrawals.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllWithdrawalsCurrencies((v) => !v)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-white/95 hover:text-white underline underline-offset-2 cursor-pointer"
                  >
                    {showAllWithdrawalsCurrencies
                      ? "Voir moins"
                      : `Voir plus (+${filteredLedgerStats.withdrawals.length - 3})`}
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-amber-100/90 block mt-3">
                Période sélectionnée
              </span>
            </div>

            {/* Box 3: Solde Net */}
            <div className="bg-[#2563EB] text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-blue-100/95 text-xs font-bold mb-1.5">
                  <span>Solde Net des Flux</span>
                  <Wallet className="w-4 h-4 text-white/90" />
                </div>
                <div className="space-y-0.5">
                  {(showAllNetCurrencies
                    ? filteredLedgerStats.net
                    : filteredLedgerStats.net.slice(0, 3)
                  ).map((entry, idx) => (
                    <div
                      key={entry.currency}
                      className={`text-lg font-black tracking-tight ${
                        idx === 0 ? "text-white" : "text-blue-100"
                      }`}
                    >
                      {formatCurrency(entry.amount, entry.currency)}
                    </div>
                  ))}
                </div>
                {filteredLedgerStats.net.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllNetCurrencies((v) => !v)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-white/95 hover:text-white underline underline-offset-2 cursor-pointer"
                  >
                    {showAllNetCurrencies
                      ? "Voir moins"
                      : `Voir plus (+${filteredLedgerStats.net.length - 3})`}
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-blue-100/85 block mt-3">
                Dépôts moins retraits
              </span>
            </div>

            {/* Box 4: Disponibilité Bancaire Globale (Noir solide + max 3 devises + Voir plus) */}
            <div className="bg-black text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-white/85 text-xs font-bold mb-1.5">
                  <span>
                    {filterAccountId !== "ALL"
                      ? "Disponibilité du Compte"
                      : "Disponibilité Bancaire Globale"}
                  </span>
                  <Landmark className="w-4 h-4 text-[#FF7900]" />
                </div>
                <div className="space-y-0.5">
                  {(showAllBalanceCurrencies
                    ? totalAccountBalances.byCurrency
                    : totalAccountBalances.byCurrency.slice(0, 3)
                  ).map((entry, idx) => (
                    <div
                      key={entry.currency}
                      className={`text-lg font-black tracking-tight ${
                        idx === 0 ? "text-white" : "text-emerald-400"
                      }`}
                    >
                      {formatCurrency(entry.amount, entry.currency)}
                    </div>
                  ))}
                </div>
                {totalAccountBalances.byCurrency.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllBalanceCurrencies((v) => !v)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#FF7900] hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                  >
                    {showAllBalanceCurrencies
                      ? "Voir moins"
                      : `Voir plus (+${totalAccountBalances.byCurrency.length - 3})`}
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-white/75 block mt-3">
                {totalAccountBalances.activeCount > 1
                  ? `${totalAccountBalances.activeCount} comptes bancaires actifs`
                  : totalAccountBalances.activeCount === 1
                  ? "1 compte bancaire actif"
                  : "Aucun compte actif"}
                {totalAccountBalances.inactiveCount > 0
                  ? ` (${totalAccountBalances.inactiveCount} inactif${totalAccountBalances.inactiveCount > 1 ? "s" : ""})`
                  : ""}
              </span>
            </div>
          </div>

          {/* Filtres Avancés Rapport */}
          <div className="bg-white p-3.5 rounded-2xl shadow-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par référence, n° bordereau, auteur, délégué, motif, compte..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#F4F6F9] text-xs focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-3 py-2 rounded-xl text-xs bg-[#F4F6F9] text-[#062653] font-medium focus:outline-hidden"
              >
                <option value="ALL">Dépôts & Retraits (Tous)</option>
                <option value="DEPOSIT">Dépôts uniquement</option>
                <option value="WITHDRAWAL">Retraits uniquement</option>
              </select>

              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs bg-[#F4F6F9] text-[#062653] font-medium focus:outline-hidden"
              >
                <option value="ALL">Tous les comptes</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bankName} - {acc.accountName} ({acc.currency})
                  </option>
                ))}
              </select>

              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value as any)}
                className="px-3 py-2 rounded-xl text-xs bg-[#F4F6F9] text-[#062653] font-medium focus:outline-hidden"
              >
                <option value="all">Toutes les dates</option>
                <option value="today">Aujourd'hui</option>
                <option value="7days">7 derniers jours</option>
                <option value="month">Ce mois-ci</option>
                <option value="custom">Dates personnalisées...</option>
              </select>

              {filterPeriod === "custom" && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-[#F4F6F9]"
                  />
                  <span className="text-slate-400">à</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-[#F4F6F9]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tableau Consolidé (Imprimable) */}
          <div
            id="printable-financial-report"
            className="bg-white rounded-2xl shadow-xs overflow-hidden"
          >
            {/* Printable Header */}
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-lg text-[#062653] tracking-tight">
                      {companyName}
                    </span>
                    <span className="text-xs text-[#64748B]">
                      • Rapport Consolidé des Opérations Bancaires
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#062653]">
                    Journal Général des Dépôts et Retraits Bancaires
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Édité le {new Date().toLocaleDateString("fr-FR")} à{" "}
                    {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    {currentUser?.name ? ` par ${currentUser.name}` : ""}
                  </p>
                </div>

                <div className="text-right text-xs">
                  <span className="text-[#64748B] block">Succursale :</span>
                  <span className="font-bold text-[#062653]">
                    {selectedBranchId === "ALL"
                      ? `${companyName} (Consolidé)`
                      : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <span>
                    <strong>{filteredTransactions.length}</strong> transaction(s) listée(s)
                  </span>
                  <span className="text-emerald-700">
                    Dépôts :{" "}
                    <strong>
                      {filteredLedgerStats.deposits
                        .map((e) => formatCurrency(e.amount, e.currency))
                        .join(" / ")}
                    </strong>
                  </span>
                  <span className="text-amber-700">
                    Retraits :{" "}
                    <strong>
                      {filteredLedgerStats.withdrawals
                        .map((e) => formatCurrency(e.amount, e.currency))
                        .join(" / ")}
                    </strong>
                  </span>
                </div>
                <div className="font-bold text-[#062653]">
                  Solde Net :{" "}
                  {filteredLedgerStats.net
                    .map((e) => formatCurrency(e.amount, e.currency))
                    .join(" / ")}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#DCE2EA] text-[#64748B] font-bold">
                    <th className="px-4 py-3">Réf & Date</th>
                    <th className="px-4 py-3">Opération</th>
                    <th className="px-4 py-3">Compte Bancaire</th>
                    <th className="px-4 py-3">N° Bordereau / Chèque</th>
                    <th className="px-4 py-3">Auteur / Délégué</th>
                    <th className="px-4 py-3">Succursale</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 no-print text-center">Justificatif</th>
                    <th className="px-4 py-3 no-print text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2EA]">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-[#64748B]">
                        Aucune transaction trouvée pour ces filtres.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const isDeposit = tx.type === "DEPOSIT";
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-4 py-3">
                            <div className="font-mono font-bold text-[#062653]">{tx.id}</div>
                            <div className="text-[11px] text-[#64748B]">
                              {tx.date} {tx.time ? `• ${tx.time}` : ""}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${
                                isDeposit
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {isDeposit ? (
                                <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3 text-amber-600" />
                              )}
                              {isDeposit ? "Dépôt" : "Retrait"}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-bold text-[#062653]">{tx.bankName}</div>
                            <div className="text-[11px] text-[#64748B] font-mono">
                              {tx.accountName} ({maskAccountNumber(tx.accountNumber)})
                            </div>
                          </td>

                          <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                            {tx.referenceNumber && tx.referenceNumber !== "N/A"
                              ? tx.referenceNumber
                              : "—"}
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#062653]">{tx.authorName}</div>
                            {tx.authorMatricule && (
                              <div className="text-[10px] text-[#64748B] font-mono">
                                {tx.authorMatricule}
                              </div>
                            )}
                            {tx.delegateName && (
                              <div className="text-[10px] text-[#062653] mt-0.5 font-medium">
                                <span className="text-[#64748B] font-normal">Délégué :</span>{" "}
                                {tx.delegateName}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-[#64748B]">
                            {tx.branchName && tx.branchName !== "Toutes les succursales"
                              ? tx.branchName
                              : companyName}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-black ${
                                isDeposit ? "text-emerald-700" : "text-amber-700"
                              }`}
                            >
                              {isDeposit ? "+" : "-"} {formatCurrency(tx.amount, tx.currency)}
                            </span>
                          </td>

                          <td className="px-4 py-3 no-print text-center">
                            {tx.receiptDataUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewReceiptUrl(tx.receiptDataUrl!)}
                                className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Aperçu</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Aucun</span>
                            )}
                          </td>

                          <td className="px-4 py-3 no-print text-right">
                            <button
                              type="button"
                              onClick={() => setDeletingTx(tx)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                              title="Supprimer la transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

        </>
      )}

      {/* ----------------------------------------------------
          MODAL: APERÇU DU JUSTIFICATIF / BORDEREAU
      ---------------------------------------------------- */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#062653] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FF7900]" />
                Justificatif Bancaire (Bordereau / Reçu)
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={viewReceiptUrl}
                  download="bordereau_bancaire.png"
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => setViewReceiptUrl(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-slate-100 flex-1 min-h-[300px]">
              <img
                src={viewReceiptUrl}
                alt="Scan du bordereau bancaire"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODAL: CONFIRMATION SUPPRESSION TRANSACTION
      ---------------------------------------------------- */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-sm font-bold text-[#062653]">
                Supprimer la transaction {deletingTx.id} ?
              </h3>
              <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                Cette action supprimera définitivement cette écriture.{" "}
                <strong className="text-rose-600">
                  Le solde du compte {deletingTx.bankName} sera automatiquement réajusté
                </strong>{" "}
                de {formatCurrency(deletingTx.amount, deletingTx.currency)}.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                className="px-4 py-2 rounded-xl font-semibold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingAction}
                onClick={handleConfirmDeleteTx}
                className="px-4 py-2 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {savingAction ? "Suppression..." : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          SLIDE-OVER : INFORMATIONS DU COMPTE BANCAIRE
      ---------------------------------------------------- */}
      <SlideOver
        isOpen={!!viewingAccount}
        onClose={() => setViewingAccount(null)}
        title={viewingAccount?.bankName || "Détails du Compte"}
        subtitle={viewingAccount?.accountName || "Fiche d'informations du compte bancaire"}
        icon={<Landmark className="w-5 h-5 text-[#062653]" />}
        width="lg"
      >
        {viewingAccount && (
          <div className="space-y-5">
            {/* Aperçu Carte Électronique */}
            <div className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 shadow-sm ${getBankCardTheme(viewingAccount.bankName).gradient} flex flex-col justify-between min-h-[175px]`}>
              <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/80 blur-xl pointer-events-none" />
              <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full bg-slate-400/20 blur-xl pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/35 to-white/60 pointer-events-none" />

              <div className="flex items-start justify-between gap-2 relative z-10">
                <div>
                  <h4 className="text-sm font-black text-[#062653] tracking-tight">
                    {viewingAccount.bankName}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {viewingAccount.accountName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${viewingAccount.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                    {viewingAccount.isActive ? "Actif" : "Inactif"}
                  </span>
                  <Wifi className="w-4 h-4 rotate-90 text-slate-500" />
                </div>
              </div>

              <div className="my-2.5 flex items-center justify-between gap-3 relative z-10">
                <div className="relative w-8 h-6 rounded-sm bg-gradient-to-br from-[#FFE29F] via-[#FFB74D] to-[#D4AF37] p-[1px] shadow-2xs shrink-0">
                  <div className="w-full h-full rounded-[2px] bg-gradient-to-br from-[#FAD961] to-[#F76B1C]/60 relative overflow-hidden flex flex-col justify-between p-0.5 border border-amber-950/20">
                    <div className="w-full h-[0.5px] bg-amber-950/40 mt-0.5" />
                    <div className="flex justify-between items-center w-full">
                      <div className="w-1.5 h-[0.5px] bg-amber-950/40" />
                      <div className="w-2 h-2 rounded-full border border-amber-950/40" />
                      <div className="w-1.5 h-[0.5px] bg-amber-950/40" />
                    </div>
                    <div className="w-full h-[0.5px] bg-amber-950/40 mb-0.5" />
                  </div>
                </div>

                <div className="font-mono text-xs sm:text-sm tracking-[0.18em] text-[#062653] font-black text-right">
                  {formatCardNumber(viewingAccount.accountNumber)}
                </div>
              </div>

              <div className="flex items-baseline justify-between relative z-10 pt-2 border-t border-slate-300/70">
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">
                    Solde actuel disponible
                  </span>
                  <span className="text-lg font-black text-[#062653] tracking-tight">
                    {formatCurrency(viewingAccount.currentBalance, viewingAccount.currency)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">
                    Solde initialisé le
                  </span>
                  <span className="text-xs font-bold text-[#062653]">
                    {new Date((viewingAccount.initialBalanceDate || viewingAccount.createdAt).includes("T") ? (viewingAccount.initialBalanceDate || viewingAccount.createdAt) : `${viewingAccount.initialBalanceDate || viewingAccount.createdAt}T12:00:00`).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>

            {/* Grille détaillée des informations */}
            <div className="bg-white rounded-2xl shadow-xs p-4 space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#062653]" />
                Coordonnées & Caractéristiques
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Institution Bancaire</span>
                  <span className="text-xs font-bold text-[#062653] block">{viewingAccount.bankName}</span>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Intitulé / Nom du Compte</span>
                  <span className="text-xs font-bold text-[#062653] block">{viewingAccount.accountName}</span>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#64748B]">Numéro de Compte Complet</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          navigator.clipboard.writeText(viewingAccount.accountNumber);
                          showSystemToast(
                            `Numéro ${viewingAccount.accountNumber} copié dans le presse-papiers.`,
                            "success",
                            "Copié !"
                          );
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copier le numéro</span>
                    </button>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#062653] tracking-wider block">
                    {viewingAccount.accountNumber}
                  </span>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Devise de Tenue</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${viewingAccount.currency === "USD" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {viewingAccount.currency}
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {getCurrencyName(viewingAccount.currency)}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Compte de l'Entreprise</span>
                  <div className="flex items-center gap-1 text-[#062653] font-semibold">
                    <Building2 className="w-3 h-3 text-[#64748B] shrink-0" />
                    <span className="text-xs truncate">{companyName}</span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-1">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Solde Initial à l'Ouverture</span>
                  <span className="text-xs font-bold text-slate-700 block">
                    {formatCurrency(viewingAccount.initialBalance, viewingAccount.currency)}
                  </span>
                  <div className="pt-1 mt-1 border-t border-slate-200/80 flex items-center gap-1.5 text-[10px] text-amber-800 font-semibold">
                    <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>
                      Initialisé le {new Date((viewingAccount.initialBalanceDate || viewingAccount.createdAt).includes("T") ? (viewingAccount.initialBalanceDate || viewingAccount.createdAt) : `${viewingAccount.initialBalanceDate || viewingAccount.createdAt}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50/70 rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-amber-800 block">Date d'initialisation du solde</span>
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs">
                    <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      {new Date((viewingAccount.initialBalanceDate || viewingAccount.createdAt).includes("T") ? (viewingAccount.initialBalanceDate || viewingAccount.createdAt) : `${viewingAccount.initialBalanceDate || viewingAccount.createdAt}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50/70 rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-emerald-800 block">Solde Actuel Disponible</span>
                  <span className="text-sm font-black text-emerald-900 block">
                    {formatCurrency(viewingAccount.currentBalance, viewingAccount.currency)}
                  </span>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Statut du Compte</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${viewingAccount.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                    <span className="text-xs font-bold text-[#062653]">
                      {viewingAccount.isActive ? "Actif (Opérations autorisées)" : "Inactif"}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-[#F4F6F9] rounded-xl space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Date d'enregistrement</span>
                  <div className="flex items-center gap-1 text-[#062653]">
                    <Clock className="w-3 h-3 text-[#64748B]" />
                    <span className="text-xs">{viewingAccount.createdAt ? new Date(viewingAccount.createdAt).toLocaleDateString("fr-FR") : "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions rapides */}
            <div className="p-3.5 bg-[#F4F6F9] rounded-2xl space-y-2.5">
              <span className="text-[11px] font-bold text-[#062653] uppercase tracking-wide block">
                Actions directes
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const accId = viewingAccount.id;
                    setViewingAccount(null);
                    openTransactionModal("DEPOSIT", accId);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#FF7900] hover:bg-[#E66D00] text-black font-extrabold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Nouveau Dépôt</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const accId = viewingAccount.id;
                    setViewingAccount(null);
                    openTransactionModal("WITHDRAWAL", accId);
                  }}
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Nouveau Retrait</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const accToEdit = viewingAccount;
                    setViewingAccount(null);
                    openAccountModal(accToEdit);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-[#062653] bg-white rounded-xl hover:bg-slate-100 shadow-2xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Edit className="w-3.5 h-3.5 text-[#062653]" />
                  <span>Modifier</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const accToDelete = viewingAccount;
                    setViewingAccount(null);
                    setDeletingAccount(accToDelete);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingAccount(null)}
                className="px-5 py-2 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl cursor-pointer transition"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </SlideOver>

      {/* ----------------------------------------------------
          MODAL: CONFIRMATION SUPPRESSION COMPTE BANCAIRE
      ---------------------------------------------------- */}
      {deletingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-sm font-bold text-[#062653]">
                Supprimer le compte {deletingAccount.bankName} ?
              </h3>
              <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                Êtes-vous sûr de vouloir supprimer ce compte ({deletingAccount.accountName} -{" "}
                {deletingAccount.accountNumber}) ?
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeletingAccount(null)}
                className="px-4 py-2 rounded-xl font-semibold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingAction}
                onClick={handleConfirmDeleteAccount}
                className="px-4 py-2 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {savingAction ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
