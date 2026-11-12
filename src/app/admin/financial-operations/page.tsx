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
  Download,
  Printer,
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
import * as XLSX from "xlsx";
import { showSystemToast } from "@/components/ui/SystemToast";
import { SlideOver } from "@/components/ui/SlideOver";
import { BankAccount, BankTransaction } from "@/lib/services/bank-operations";

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
function getBankBadgeStyle(bankName: string): { bg: string; text: string; border: string } {
  const name = (bankName || "").toLowerCase().trim();
  if (name.includes("soge") || name.startsWith("sog")) {
    return { bg: "bg-[#DC2626]", text: "text-white", border: "border-red-700/40" };
  }
  if (name.includes("uni")) {
    return { bg: "bg-[#062653]", text: "text-white", border: "border-slate-900/50" };
  }
  if (name.includes("bnc") || name.includes("nationale") || name.includes("crédit") || name.includes("credit") || name.startsWith("bn")) {
    return { bg: "bg-[#EA580C]", text: "text-white", border: "border-orange-700/40" };
  }
  if (name.includes("capital")) {
    return { bg: "bg-[#059669]", text: "text-white", border: "border-emerald-700/40" };
  }
  if (name.includes("buh") || name.includes("union")) {
    return { bg: "bg-[#7C3AED]", text: "text-white", border: "border-purple-700/40" };
  }
  return { bg: "bg-[#062653]", text: "text-white", border: "border-slate-900/50" };
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
    border: "border-slate-300 hover:border-slate-400",
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
  const [accFormCurrency, setAccFormCurrency] = useState<"HTG" | "USD">("HTG");
  const [accFormInitialBalance, setAccFormInitialBalance] = useState<number | string>(0);
  const [accFormInitialBalanceDate, setAccFormInitialBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [accFormBranchId, setAccFormBranchId] = useState("");
  const [accFormIsActive, setAccFormIsActive] = useState(true);

  // 1. Initial Load & Listeners
  useEffect(() => {
    async function initUserAndBranches() {
      try {
        const [meRes, orgRes, brRes] = await Promise.all([
          fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/organization").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/branches").then((r) => (r.ok ? r.json() : null)),
        ]);

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
          setTxFormAuthorMatricule(meRes.user.employeeNumber || "");
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

  // 2. Fetch Accounts, Transactions & Stats
  const fetchData = async () => {
    if (isRestricted) return;
    setLoading(true);
    try {
      const branchQuery = selectedBranchId && selectedBranchId !== "ALL" ? `?branchId=${selectedBranchId}` : "";

      const [accRes, txRes, statsRes] = await Promise.all([
        fetch("/api/admin/financial-operations/accounts"),
        fetch(`/api/admin/financial-operations/transactions${branchQuery}`),
        fetch(`/api/admin/financial-operations/stats${branchQuery}`),
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

  // Active accounts only for dropdowns
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

  // Dynamic ledger stats from currently filtered list
  const filteredLedgerStats = useMemo(() => {
    let depHtg = 0;
    let depUsd = 0;
    let retHtg = 0;
    let retUsd = 0;

    for (const t of filteredTransactions) {
      if (t.type === "DEPOSIT") {
        if (t.currency === "USD") depUsd += t.amount;
        else depHtg += t.amount;
      } else {
        if (t.currency === "USD") retUsd += t.amount;
        else retHtg += t.amount;
      }
    }

    return {
      depHtg,
      depUsd,
      retHtg,
      retUsd,
      netHtg: depHtg - retHtg,
      netUsd: depUsd - retUsd,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  // Cumulative bank accounts total balances
  const totalAccountBalances = useMemo(() => {
    let htg = 0;
    let usd = 0;
    for (const acc of accounts) {
      if (acc.isActive) {
        if (acc.currency === "USD") usd += acc.currentBalance || 0;
        else htg += acc.currentBalance || 0;
      }
    }
    return { htg, usd };
  }, [accounts]);

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
      setTxFormAuthorName(currentUser.name || "Administrateur");
      setTxFormAuthorMatricule(currentUser.employeeNumber || "");
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
      setAccFormCurrency(accToEdit.currency === "USD" ? "USD" : "HTG");
      setAccFormInitialBalance(accToEdit.initialBalance);
      setAccFormInitialBalanceDate(
        accToEdit.initialBalanceDate ||
        (accToEdit.createdAt ? accToEdit.createdAt.split("T")[0] : new Date().toISOString().split("T")[0])
      );
      setAccFormBranchId(accToEdit.branchId || "");
      setAccFormIsActive(accToEdit.isActive);
    } else {
      setEditingAccount(null);
      setAccFormBankName("");
      setAccFormAccountName("");
      setAccFormAccountNumber("");
      setAccFormCurrency("HTG");
      setAccFormInitialBalance(0);
      setAccFormInitialBalanceDate(new Date().toISOString().split("T")[0]);
      setAccFormBranchId(selectedBranchId !== "ALL" ? selectedBranchId : "");
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

    if (!txFormRef.trim()) {
      showSystemToast(
        type === "DEPOSIT"
          ? "Veuillez renseigner le N° de bordereau de dépôt."
          : "Veuillez renseigner le N° de référence / chèque.",
        "info"
      );
      return;
    }

    if (!txFormAuthorName.trim()) {
      showSystemToast("Le nom de l'auteur de l'opération est obligatoire.", "info");
      return;
    }

    if (!txFormAuthorMatricule.trim()) {
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
          branchId: txFormBranchId || selectedAcc?.branchId || null,
          branchName: branchObj?.name || selectedAcc?.branchName || "Toutes les succursales",
          authorName: txFormAuthorName.trim() || currentUser?.name || "Administrateur",
          authorMatricule: txFormAuthorMatricule.trim() || currentUser?.employeeNumber || undefined,
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
      const branchObj = branches.find((b) => b.id === accFormBranchId);

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
            branchId: accFormBranchId || null,
            branchName: branchObj?.name || "Toutes les succursales",
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
            branchId: accFormBranchId || null,
            branchName: branchObj?.name || "Toutes les succursales",
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

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) {
      showSystemToast("Aucune transaction à exporter pour les filtres actuels.", "info");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      const rows: any[][] = [
        [
          "RÉFÉRENCE",
          "TYPE",
          "DATE",
          "HEURE",
          "BANQUE",
          "INTITULÉ DU COMPTE",
          "N° DE COMPTE",
          "MONTANT",
          "DEVISE",
          "N° BORDEREAU / CHÈQUE",
          "AUTEUR",
          "MATRICULE",
          "DÉLÉGUÉ DE DÉPÔT",
          "SUCCURSALE",
          "MOTIF",
          "JUSTIFICATIF",
        ],
      ];

      for (const t of filteredTransactions) {
        rows.push([
          t.id,
          t.type === "DEPOSIT" ? "Dépôt (Versement)" : "Retrait (Décaissement)",
          t.date,
          t.time || "N/A",
          t.bankName,
          t.accountName,
          t.accountNumber,
          t.amount,
          t.currency,
          t.referenceNumber,
          t.authorName,
          t.authorMatricule || "N/A",
          t.delegateName || "N/A",
          t.branchName || "Toutes les succursales",
          t.reason,
          t.receiptDataUrl ? "Bordereau joint" : "Aucun",
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Opérations Bancaires");

      const todayStr = new Date().toISOString().split("T")[0];
      const filename = `Operations_Bancaires_${companyName.replace(/\s+/g, "_")}_${todayStr}.xlsx`;
      XLSX.writeFile(wb, filename);

      showSystemToast(`Export Excel généré : ${filename}`, "success");
    } catch (err) {
      console.error("Export error:", err);
      showSystemToast("Erreur lors de la génération du fichier Excel.", "error");
    }
  };

  // Print Report Handler
  const handlePrintReport = () => {
    window.print();
  };

  // ----------------------------------------------------
  // RESTRICTED VIEW FOR CAISSIER / EMPLOYEE
  // ----------------------------------------------------
  if (isRestricted) {
    return (
      <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-xs p-12 text-center max-w-lg mx-auto my-12">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-600">
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
      {/* ----------------------------------------------------
          PRINT STYLES SETUP
      ---------------------------------------------------- */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-financial-report,
          #printable-financial-report * {
            visibility: visible;
          }
          #printable-financial-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 16px;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>


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
              className="p-2 bg-white border border-[#DCE2EA] rounded-xl hover:bg-slate-50 text-[#64748B] transition-colors cursor-pointer"
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] p-6 sm:p-8 lg:p-10 shadow-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveAccount();
              }}
              className="space-y-8"
            >
              {/* STATUS TOGGLE */}
              <div className="p-4 sm:p-5 bg-slate-50 border border-[#DCE2EA] rounded-xl flex items-center justify-between">
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>
                </div>
              </div>

              {/* 2. PARAMÈTRES MONÉTAIRES & DISPONIBILITÉ */}
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                    <span>2. Paramètres Monétaires & Affectation</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Devise du compte <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={accFormCurrency}
                      onChange={(e) => setAccFormCurrency(e.target.value as any)}
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    >
                      <option value="HTG">HTG (Gourdes)</option>
                      <option value="USD">USD (Dollars Américains)</option>
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden focus:border-[#062653] disabled:bg-slate-100 disabled:text-slate-400"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Date de référence du solde de départ.
                    </span>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Succursale de rattachement
                    </label>
                    <select
                      value={accFormBranchId}
                      onChange={(e) => setAccFormBranchId(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    >
                      <option value="">Toutes les succursales</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="pt-6 border-t border-[#DCE2EA] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountModalOpen(false);
                    setEditingAccount(null);
                  }}
                  className="px-5 py-2.5 rounded-xl border border-[#DCE2EA] text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition cursor-pointer"
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
              className="p-2 bg-white border border-[#DCE2EA] rounded-xl hover:bg-slate-50 text-[#64748B] transition-colors cursor-pointer"
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] p-6 sm:p-8 lg:p-10 shadow-xs">
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
                        className="w-full h-11 px-3.5 bg-slate-100 border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] flex items-center justify-between gap-2 cursor-not-allowed select-none"
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
                        className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-black text-emerald-700 focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      N° Bordereau de Dépôt <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormRef}
                      onChange={(e) => setTxFormRef(e.target.value)}
                      placeholder="Ex: BOR-889410"
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Auteur de l'Opération (Nom) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorName}
                      onChange={(e) => setTxFormAuthorName(e.target.value)}
                      placeholder="Nom du responsable ou coursier"
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Matricule / Identifiant <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorMatricule}
                      onChange={(e) => setTxFormAuthorMatricule(e.target.value)}
                      placeholder="Ex: ADM-001"
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-mono font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Succursale Concernée <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <select
                      value={txFormBranchId}
                      onChange={(e) => setTxFormBranchId(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    >
                      <option value="">Toutes les succursales</option>
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

                <div className="p-6 bg-slate-50 border border-dashed border-[#DCE2EA] rounded-2xl">
                  {txFormReceiptDataUrl ? (
                    <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3">
                        <img
                          src={txFormReceiptDataUrl}
                          alt="Scan bordereau"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
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
                        className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 font-semibold cursor-pointer border border-rose-200 transition"
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
                        className="w-full py-8 px-4 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-[#64748B] hover:bg-white hover:border-[#062653] transition cursor-pointer bg-white"
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
              <div className="pt-6 border-t border-[#DCE2EA] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#DCE2EA] text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition cursor-pointer"
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
              className="p-2 bg-white border border-[#DCE2EA] rounded-xl hover:bg-slate-50 text-[#64748B] transition-colors cursor-pointer"
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] p-6 sm:p-8 lg:p-10 shadow-xs">
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
                        className="w-full h-11 px-3.5 bg-slate-100 border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] flex items-center justify-between gap-2 cursor-not-allowed select-none"
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
                        className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-black text-rose-700 focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-mono font-bold text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Auteur de l'Opération (Nom) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorName}
                      onChange={(e) => setTxFormAuthorName(e.target.value)}
                      placeholder="Nom du responsable ou bénéficiaire"
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Matricule / Identifiant <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={txFormAuthorMatricule}
                      onChange={(e) => setTxFormAuthorMatricule(e.target.value)}
                      placeholder="Ex: ADM-001"
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-mono font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
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
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#263445] mb-1.5">
                      Succursale Concernée <span className="text-slate-400 font-normal">(Facultatif)</span>
                    </label>
                    <select
                      value={txFormBranchId}
                      onChange={(e) => setTxFormBranchId(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-medium text-[#062653] focus:outline-hidden focus:border-[#062653]"
                    >
                      <option value="">Toutes les succursales</option>
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

                <div className="p-6 bg-slate-50 border border-dashed border-[#DCE2EA] rounded-2xl">
                  {txFormReceiptDataUrl ? (
                    <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3">
                        <img
                          src={txFormReceiptDataUrl}
                          alt="Scan reçu"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 shrink-0"
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
                        className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 font-semibold cursor-pointer border border-rose-200 transition"
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
                        className="w-full py-8 px-4 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-[#64748B] hover:bg-white hover:border-[#062653] transition cursor-pointer bg-white"
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
              <div className="pt-6 border-t border-[#DCE2EA] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsWithdrawalModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#DCE2EA] text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition cursor-pointer"
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#062653] bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                      Comptes & Trésorerie
                    </span>
                    {selectedBranchId !== "ALL" && (
                      <span className="text-[10px] font-semibold text-[#062653] bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
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
                    Gestion des comptes bancaires actifs et inactifs, soldes disponibles et rattachement aux succursales.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={fetchData}
                    title="Rafraîchir les données"
                    className="p-2.5 rounded-xl border border-[#DCE2EA] bg-white text-[#64748B] hover:bg-slate-50 transition cursor-pointer"
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

              {/* Grille de cartes des comptes actifs - Style Cartes Bancaires Électroniques Dégradé Gris */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {accounts.map((acc) => {
                  const theme = getBankCardTheme(acc.bankName);

                  return (
                    <div
                      key={acc.id}
                      className={`relative overflow-hidden rounded-xl p-3.5 sm:p-4 shadow-xs border ${theme.border} ${theme.gradient} flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group min-h-[175px]`}
                    >
                      {/* Reflets métalliques de carte bancaire argentée / platine */}
                      <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/80 blur-xl pointer-events-none" />
                      <div className="absolute -left-10 -bottom-10 w-36 h-36 rounded-full bg-slate-400/20 blur-xl pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/35 to-white/60 pointer-events-none" />

                      {/* Haut de la carte : Nom de la banque & Sans Contact */}
                      <div className="flex items-start justify-between gap-2 relative z-10">
                        <div className="overflow-hidden">
                          <h4 className="text-xs sm:text-sm font-black text-[#062653] tracking-tight truncate" title={acc.bankName}>
                            {acc.bankName}
                          </h4>
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

                      {/* Bas de la carte : Succursale & Boutons d'actions */}
                      <div className="mt-2.5 pt-2 border-t border-slate-300/80 flex items-center justify-between gap-1.5 relative z-10">
                        <span className="text-[10px] text-slate-500 font-medium truncate max-w-[110px]" title={acc.branchName || "Toutes succursales"}>
                          {acc.branchName || "Toutes succursales"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Bouton Voir : détails complets du compte */}
                          <button
                            type="button"
                            onClick={() => setViewingAccount(acc)}
                            className="px-2 py-1 rounded-md bg-white hover:bg-slate-50 text-[#062653] font-bold text-[10px] border border-slate-300 shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
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
                            className="p-1 rounded-md bg-white/80 hover:bg-white text-slate-700 border border-slate-300/60 shadow-2xs transition-colors cursor-pointer"
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
                <div className="bg-white rounded-2xl border border-dashed border-[#DCE2EA] p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto text-[#64748B]">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7900] bg-[#FFF4EB] px-2.5 py-0.5 rounded-md border border-[#FF7900]/20">
                  Journal Consolidé
                </span>
                {selectedBranchId !== "ALL" && (
                  <span className="text-[10px] font-semibold text-[#062653] bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#FF7900]" />
                    {branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-[#062653] tracking-tight mt-1 flex items-center gap-2">
                <Receipt className="w-6 h-6 text-[#062653]" />
                Rapport des Transactions Bancaires
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Vue comptable générale de l'ensemble des flux (dépôts & retraits) avec options d'export Excel et impression PDF.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <button
                type="button"
                onClick={fetchData}
                title="Rafraîchir les données"
                className="p-2.5 rounded-xl border border-[#DCE2EA] bg-white text-[#64748B] hover:bg-slate-50 transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF7900]" : ""}`} />
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs cursor-pointer"
                title="Exporter vers Microsoft Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exporter Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#062653] bg-slate-100 hover:bg-slate-200 transition border border-slate-200 cursor-pointer"
                title="Imprimer ou enregistrer en PDF"
              >
                <Printer className="w-3.5 h-3.5 text-[#062653]" />
                <span>Imprimer / PDF</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200">
              <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
                <span>Total Versements (Dépôts)</span>
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg font-black text-emerald-900">
                {formatCurrency(filteredLedgerStats.depHtg, "HTG")}
              </div>
              {filteredLedgerStats.depUsd > 0 && (
                <div className="text-xs font-bold text-emerald-700 mt-0.5">
                  + {formatCurrency(filteredLedgerStats.depUsd, "USD")}
                </div>
              )}
              <span className="text-[10px] text-emerald-600 block mt-1">
                Période sélectionnée
              </span>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
              <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
                <span>Total Retraits (Décaissements)</span>
                <ArrowUpRight className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-lg font-black text-amber-900">
                {formatCurrency(filteredLedgerStats.retHtg, "HTG")}
              </div>
              {filteredLedgerStats.retUsd > 0 && (
                <div className="text-xs font-bold text-amber-700 mt-0.5">
                  + {formatCurrency(filteredLedgerStats.retUsd, "USD")}
                </div>
              )}
              <span className="text-[10px] text-amber-600 block mt-1">
                Période sélectionnée
              </span>
            </div>

            <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200">
              <div className="flex items-center justify-between text-blue-800 text-xs font-semibold mb-1">
                <span>Solde Net des Flux</span>
                <Wallet className="w-4 h-4 text-blue-600" />
              </div>
              <div
                className={`text-lg font-black ${
                  filteredLedgerStats.netHtg >= 0 ? "text-blue-900" : "text-rose-600"
                }`}
              >
                {formatCurrency(filteredLedgerStats.netHtg, "HTG")}
              </div>
              <div className="text-xs font-bold text-blue-700 mt-0.5">
                Net USD : {formatCurrency(filteredLedgerStats.netUsd, "USD")}
              </div>
              <span className="text-[10px] text-blue-600 block mt-1">
                Dépôts moins retraits
              </span>
            </div>

            <div className="bg-[#062653] text-white p-4 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-white/80 text-xs font-semibold mb-1">
                <span>Disponibilité Bancaire Globale</span>
                <Landmark className="w-4 h-4 text-[#FF7900]" />
              </div>
              <div className="text-lg font-black text-white">
                {formatCurrency(totalAccountBalances.htg, "HTG")}
              </div>
              <div className="text-xs font-bold text-emerald-400 mt-0.5">
                {formatCurrency(totalAccountBalances.usd, "USD")}
              </div>
              <span className="text-[10px] text-white/60 block mt-1">
                Comptes bancaires actifs
              </span>
            </div>
          </div>

          {/* Filtres Avancés Rapport */}
          <div className="bg-white p-3.5 rounded-2xl border border-[#DCE2EA] shadow-xs flex items-center justify-between gap-3 flex-wrap no-print">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par référence, n° bordereau, auteur, délégué, motif, compte..."
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-[#DCE2EA] text-xs focus:outline-hidden focus:border-[#062653]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-[#DCE2EA] text-xs bg-white text-[#062653] font-medium focus:outline-hidden"
              >
                <option value="ALL">Dépôts & Retraits (Tous)</option>
                <option value="DEPOSIT">Dépôts uniquement</option>
                <option value="WITHDRAWAL">Retraits uniquement</option>
              </select>

              <select
                value={filterAccountId}
                onChange={(e) => setFilterAccountId(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#DCE2EA] text-xs bg-white text-[#062653] font-medium focus:outline-hidden"
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
                className="px-2.5 py-1.5 rounded-xl border border-[#DCE2EA] text-xs bg-white text-[#062653] font-medium focus:outline-hidden"
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
                    className="px-2 py-1 rounded-lg border border-[#DCE2EA] text-xs bg-white"
                  />
                  <span className="text-slate-400">à</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-[#DCE2EA] text-xs bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tableau Consolidé (Imprimable) */}
          <div
            id="printable-financial-report"
            className="bg-white rounded-2xl border border-[#DCE2EA] shadow-xs overflow-hidden"
          >
            {/* Printable Header */}
            <div className="p-6 border-b border-[#DCE2EA]">
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
                      ? "Toutes les succursales (Consolidé)"
                      : branches.find((b) => b.id === selectedBranchId)?.name || selectedBranchId}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <span>
                    <strong>{filteredTransactions.length}</strong> transaction(s) listée(s)
                  </span>
                  <span className="text-emerald-700">
                    Dépôts : <strong>{formatCurrency(filteredLedgerStats.depHtg, "HTG")}</strong>
                    {filteredLedgerStats.depUsd > 0 && ` / ${formatCurrency(filteredLedgerStats.depUsd, "USD")}`}
                  </span>
                  <span className="text-amber-700">
                    Retraits : <strong>{formatCurrency(filteredLedgerStats.retHtg, "HTG")}</strong>
                    {filteredLedgerStats.retUsd > 0 && ` / ${formatCurrency(filteredLedgerStats.retUsd, "USD")}`}
                  </span>
                </div>
                <div className="font-bold text-[#062653]">
                  Solde Net : {formatCurrency(filteredLedgerStats.netHtg, "HTG")}
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
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isDeposit
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
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
                            {tx.referenceNumber}
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
                            {tx.branchName || "Toutes les succursales"}
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
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition cursor-pointer"
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#DCE2EA] flex items-center justify-between">
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
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
            <div className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-300 ${getBankCardTheme(viewingAccount.bankName).gradient} flex flex-col justify-between min-h-[175px]`}>
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
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${viewingAccount.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
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
            <div className="bg-white rounded-2xl border border-[#DCE2EA] p-4 space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#062653]" />
                Coordonnées & Caractéristiques
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Institution Bancaire</span>
                  <span className="text-xs font-bold text-[#062653] block">{viewingAccount.bankName}</span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Intitulé / Nom du Compte</span>
                  <span className="text-xs font-bold text-[#062653] block">{viewingAccount.accountName}</span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1 sm:col-span-2">
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

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Devise de Tenue</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${viewingAccount.currency === "USD" ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"}`}>
                      {viewingAccount.currency}
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      {viewingAccount.currency === "USD" ? "Dollars américains" : "Gourdes haïtiennes"}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Succursale de Rattachement</span>
                  <div className="flex items-center gap-1 text-[#062653] font-semibold">
                    <MapPin className="w-3 h-3 text-[#64748B] shrink-0" />
                    <span className="text-xs truncate">{viewingAccount.branchName || "Toutes les succursales"}</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
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

                <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-0.5">
                  <span className="text-[10px] font-semibold text-amber-800 block">Date d'initialisation du solde</span>
                  <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs">
                    <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      {new Date((viewingAccount.initialBalanceDate || viewingAccount.createdAt).includes("T") ? (viewingAccount.initialBalanceDate || viewingAccount.createdAt) : `${viewingAccount.initialBalanceDate || viewingAccount.createdAt}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200/80 space-y-0.5">
                  <span className="text-[10px] font-semibold text-emerald-800 block">Solde Actuel Disponible</span>
                  <span className="text-sm font-black text-emerald-900 block">
                    {formatCurrency(viewingAccount.currentBalance, viewingAccount.currency)}
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Statut du Compte</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${viewingAccount.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                    <span className="text-xs font-bold text-[#062653]">
                      {viewingAccount.isActive ? "Actif (Opérations autorisées)" : "Inactif"}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#64748B] block">Date d'enregistrement</span>
                  <div className="flex items-center gap-1 text-[#062653]">
                    <Clock className="w-3 h-3 text-[#64748B]" />
                    <span className="text-xs">{viewingAccount.createdAt ? new Date(viewingAccount.createdAt).toLocaleDateString("fr-FR") : "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions rapides */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
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
                  className="px-3 py-1.5 text-xs font-bold text-[#062653] bg-white border border-[#DCE2EA] rounded-xl hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer transition"
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
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 flex items-center gap-1.5 cursor-pointer transition"
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
          <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
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
