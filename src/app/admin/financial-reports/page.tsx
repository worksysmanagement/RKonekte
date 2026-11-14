"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  Calendar,
  BarChart3,
  Plus,
  Trash2,
  X,
  RefreshCw,
  DollarSign,
  Building2,
  User,
  AlertCircle,
  Save,
  ChevronDown,
  Layers,
  ArrowRight,
  TrendingUp,
  Edit3,
  Eye,
} from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { CashRubriqueModel, CashierDailyEntryModel } from "@/lib/services/cash-registers";

export default function FinancialReportsPage() {
  const searchParams = useSearchParams();

  // Organization & Current User State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>("e-biznis");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);

  // Rubriques & Entries
  const [rubriques, setRubriques] = useState<CashRubriqueModel[]>([]);
  const [entries, setEntries] = useState<CashierDailyEntryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Active View Tab (For Admins: "reports" or "entry"; For Cashiers: always "entry")
  const [activeTab, setActiveTab] = useState<"reports" | "entry">("reports");

  // Cashier Form State
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [formAmounts, setFormAmounts] = useState<Record<string, number | string>>({});
  const [formNotes, setFormNotes] = useState<string>("");
  const [savingEntry, setSavingEntry] = useState(false);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(true);
  const [originalAmounts, setOriginalAmounts] = useState<Record<string, number | string>>({});
  const [originalNotes, setOriginalNotes] = useState<string>("");

  // Admin Period Filters
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly" | "custom">("daily");
  const [filterDate, setFilterDate] = useState<string>(todayStr);
  const [filterStartDate, setFilterStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
  );
  const [filterEndDate, setFilterEndDate] = useState<string>(todayStr);
  const [selectedCashierId, setSelectedCashierId] = useState<string>("ALL");
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rk_active_branch");
      if (saved && saved !== "all") return saved;
    }
    return "ALL";
  });

  // Rubriques Configuration Modal State
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [newRubName, setNewRubName] = useState("");
  const [newRubCurrency, setNewRubCurrency] = useState<"HTG" | "USD">("HTG");
  const [configSaving, setConfigSaving] = useState(false);

  // Admin Edit Daily Entry Modal State
  const [adminEditModalOpen, setAdminEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashierDailyEntryModel | null>(null);
  const [adminEditAmounts, setAdminEditAmounts] = useState<Record<string, number | string>>({});
  const [adminEditNotes, setAdminEditNotes] = useState<string>("");
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  // 1. Initial Data Load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedName = localStorage.getItem("rk_company_name");
      if (savedName) setCompanyName(savedName);
      const savedLogo = localStorage.getItem("rk_company_logo");
      if (savedLogo) setCompanyLogo(savedLogo);
    }

    async function initPage() {
      setLoading(true);
      try {
        // Fetch current user & organization
        const [meRes, orgRes, rubRes, brRes, usrRes, empRes] = await Promise.all([
          fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/organization").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/financial-reports/rubriques").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/branches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/users").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/admin/employees").then((r) => (r.ok ? r.json() : null)),
        ]);

        if (meRes?.user) {
          setCurrentUser(meRes.user);
          const role = meRes.user.role || "";
          const isCash =
            role === "CASHIER" ||
            role === "CAISSIER" ||
            role.toLowerCase().includes("caissier") ||
            role.toLowerCase().includes("cashier");
          if (isCash) {
            setActiveTab("entry");
          }
        }

        if (orgRes?.organization) {
          if (orgRes.organization.name) setCompanyName(orgRes.organization.name);
          if (orgRes.organization.logoUrl) setCompanyLogo(orgRes.organization.logoUrl);
        }

        if (rubRes?.rubriques) {
          setRubriques(rubRes.rubriques);
        }

        if (brRes?.branches) {
          setBranches(brRes.branches);
        }

        if (usrRes?.users) {
          setUsersList(usrRes.users);
        }

        if (empRes?.employees) {
          setEmployeesList(empRes.employees);
        }
      } catch (err) {
        console.error("Failed to initialize financial reports page:", err);
      } finally {
        setLoading(false);
      }
    }

    initPage();
  }, []);

  const isCashier = useMemo(() => {
    if (!currentUser) return false;
    const role = currentUser.role || "";
    return (
      role === "CASHIER" ||
      role === "CAISSIER" ||
      role.toLowerCase().includes("caissier") ||
      role.toLowerCase().includes("cashier")
    );
  }, [currentUser]);

  const isAdmin = !isCashier;

  // Synchronize activeTab with URL tab parameter (from sidebar sub-tabs) or cashier enforcement
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (isCashier) {
      setActiveTab("entry");
    } else if (tabParam === "entry") {
      setActiveTab("entry");
    } else {
      setActiveTab("reports");
    }
  }, [searchParams, isCashier]);

  // Listen to global branch change event from AdminHeader
  useEffect(() => {
    const handleBranchChange = (e: any) => {
      const bId = e.detail?.branchId;
      if (bId !== undefined) {
        setSelectedBranchId(bId === "all" ? "ALL" : bId);
      }
    };
    window.addEventListener("branchChange", handleBranchChange);
    return () => window.removeEventListener("branchChange", handleBranchChange);
  }, []);

  const handleBranchSelectChange = (newBranchId: string) => {
    setSelectedBranchId(newBranchId);
    const norm = newBranchId === "ALL" ? "all" : newBranchId;
    if (typeof window !== "undefined") {
      localStorage.setItem("rk_active_branch", norm);
      document.cookie = `rk_active_branch=${encodeURIComponent(norm)}; path=/; max-age=31536000`;
      window.dispatchEvent(new CustomEvent("branchChange", { detail: { branchId: norm } }));
    }
  };

  // Filter users to display only cashier accounts in the filter dropdown (adapted to selected branch)
  const cashiersList = useMemo(() => {
    return usersList.filter((u) => {
      const role = (u.role || "").toUpperCase();
      const isCash =
        role === "CASHIER" ||
        role === "CAISSIER" ||
        role.includes("CASHIER") ||
        role.includes("CAISSIER");
      if (!isCash) return false;
      if (selectedBranchId && selectedBranchId !== "ALL") {
        if (u.branchId && u.branchId !== selectedBranchId) {
          return false;
        }
      }
      return true;
    });
  }, [usersList, selectedBranchId]);

  // Active rubriques for input and tables
  const activeRubriques = useMemo(() => {
    return rubriques.filter((r) => r.isActive).sort((a, b) => a.orderIndex - b.orderIndex);
  }, [rubriques]);

  const htgRubriques = useMemo(() => {
    return activeRubriques.filter((r) => r.currency === "HTG");
  }, [activeRubriques]);

  const usdRubriques = useMemo(() => {
    return activeRubriques.filter((r) => r.currency === "USD");
  }, [activeRubriques]);

  // 2. Fetch existing entry when Cashier changes date
  useEffect(() => {
    if (!selectedDate || !currentUser) return;

    let isMounted = true;
    async function fetchDateEntry() {
      try {
        const res = await fetch(`/api/admin/financial-reports/entries?date=${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data?.entry) {
              setExistingEntryId(data.entry.id);
              setFormAmounts(data.entry.amounts || {});
              setFormNotes(data.entry.notes || "");
              setOriginalAmounts(data.entry.amounts || {});
              setOriginalNotes(data.entry.notes || "");
              setIsEditing(false); // Mode consultation verrouillé jusqu'au clic sur "Modifier"
            } else {
              setExistingEntryId(null);
              setFormAmounts({});
              setFormNotes("");
              setOriginalAmounts({});
              setOriginalNotes("");
              setIsEditing(true); // Nouvelle saisie disponible
            }
          }
        }
      } catch (_) {}
    }

    fetchDateEntry();
    return () => {
      isMounted = false;
    };
  }, [selectedDate, currentUser]);

  // 3. Fetch consolidated entries for Admin Reports view
  const fetchReportEntries = async () => {
    setEntriesLoading(true);
    try {
      let start = filterStartDate;
      let end = filterEndDate;

      if (period === "daily") {
        start = filterDate;
        end = filterDate;
      } else if (period === "weekly") {
        const d = new Date(filterDate || todayStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(d.setDate(diff + 6));
        start = monday.toISOString().split("T")[0];
        end = sunday.toISOString().split("T")[0];
      } else if (period === "monthly") {
        const d = new Date(filterDate || todayStr);
        const y = d.getFullYear();
        const m = d.getMonth();
        start = new Date(y, m, 1).toISOString().split("T")[0];
        end = new Date(y, m + 1, 0).toISOString().split("T")[0];
      } else if (period === "yearly") {
        const y = new Date(filterDate || todayStr).getFullYear();
        start = `${y}-01-01`;
        end = `${y}-12-31`;
      }

      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      if (selectedCashierId && selectedCashierId !== "ALL") params.set("cashierId", selectedCashierId);
      if (selectedBranchId && selectedBranchId !== "ALL") params.set("branchId", selectedBranchId);

      const res = await fetch(`/api/admin/financial-reports/entries?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error("Failed to fetch report entries:", err);
    } finally {
      setEntriesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "reports" && currentUser) {
      fetchReportEntries();
    }
  }, [activeTab, period, filterDate, filterStartDate, filterEndDate, selectedCashierId, selectedBranchId, currentUser]);

  // Helper: cleans leading zeros for clean display in inputs
  const getDisplayAmount = (rubId: string) => {
    const val = formAmounts[rubId];
    if (val === undefined || val === null || val === "") return "";
    const s = String(val).trim().replace(/,/g, ".");
    // Strip any leading zero in front of non-zero digits (e.g. "0100" -> "100", "0500" -> "500")
    // Keep decimal formats like "0.50" or single "0" intact
    const stripped = s.replace(/^0+(?=[1-9])/, "");
    if (/^0{2,}(\.|$)/.test(stripped)) {
      return stripped.replace(/^0+/, "0");
    }
    return stripped;
  };

  // Real-time calculated totals for Cashier form
  const formTotalHtg = useMemo(() => {
    let sum = 0;
    for (const rub of htgRubriques) {
      const val = parseFloat(String(formAmounts[rub.id] ?? "0").replace(/,/g, ".")) || 0;
      sum += val;
    }
    return sum;
  }, [formAmounts, htgRubriques]);

  const formTotalUsd = useMemo(() => {
    let sum = 0;
    for (const rub of usdRubriques) {
      const val = parseFloat(String(formAmounts[rub.id] ?? "0").replace(/,/g, ".")) || 0;
      sum += val;
    }
    return sum;
  }, [formAmounts, usdRubriques]);

  // Handle amount change in Cashier form (strips leading 0 immediately and strictly permits only typed digits)
  const handleAmountChange = (rubriqueId: string, valueStr: string) => {
    if (valueStr === "" || valueStr === undefined || valueStr === null) {
      setFormAmounts((prev) => {
        const copy = { ...prev };
        delete copy[rubriqueId];
        return copy;
      });
      return;
    }

    // Convert commas to dots and retain only digits + decimal point
    let clean = valueStr.replace(/,/g, ".");
    clean = clean.replace(/[^0-9.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) {
      clean = parts[0] + "." + parts.slice(1).join("");
    }

    // Strip leading zeros before non-zero digits: "0100" -> "100", "0500" -> "500", "01" -> "1"
    clean = clean.replace(/^0+(?=[1-9])/, "");
    if (/^0{2,}(\.|$)/.test(clean)) {
      clean = clean.replace(/^0+/, "0");
    }

    setFormAmounts((prev) => ({
      ...prev,
      [rubriqueId]: clean,
    }));
  };

  // Cashier action: "Nouvelle saisie"
  const handleNouvelleSaisie = () => {
    if (existingEntryId) {
      showSystemToast("Cette date a déjà été enregistrée ! Utilisez le bouton « Modifier » pour ajuster.", "info");
      return;
    }
    setFormAmounts({});
    setFormNotes("");
    setOriginalAmounts({});
    setOriginalNotes("");
    setIsEditing(true);
    showSystemToast("Prêt pour une nouvelle saisie.", "info");
  };

  // Cashier action: "Modifier"
  const handleModifierClick = () => {
    setIsEditing(true);
    showSystemToast("Mode modification activé. Vous pouvez modifier les montants puis valider.", "info");
  };

  // Cashier action: "Annuler"
  const handleCancelEdit = () => {
    setFormAmounts(originalAmounts);
    setFormNotes(originalNotes);
    setIsEditing(false);
    showSystemToast("Modifications annulées.", "info");
  };

  // Admin action: Open edit modal for an existing submitted day
  const handleOpenEditEntry = (entry: CashierDailyEntryModel) => {
    setEditingEntry(entry);
    setAdminEditAmounts(entry.amounts || {});
    setAdminEditNotes(entry.notes || "");
    setAdminEditModalOpen(true);
  };

  // Admin action: Save modified submitted day
  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;

    setAdminEditSaving(true);
    try {
      const numericAmounts: Record<string, number> = {};
      for (const [key, val] of Object.entries(adminEditAmounts)) {
        const num = Number(val) || 0;
        if (num > 0) numericAmounts[key] = num;
      }

      const res = await fetch(`/api/admin/financial-reports/entries/${editingEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amounts: numericAmounts,
          notes: adminEditNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showSystemToast(err.error || "Erreur lors de la mise à jour de la journée.", "error");
        return;
      }

      showSystemToast("Journée de caisse mise à jour avec succès. Les montants ont été réajustés dans la base.");
      setAdminEditModalOpen(false);
      setEditingEntry(null);
      await fetchReportEntries();
    } catch (_) {
      showSystemToast("Erreur réseau lors de la mise à jour.", "error");
    } finally {
      setAdminEditSaving(false);
    }
  };

  // Admin action: Delete a submitted day (deducts money permanently from database)
  const handleDeleteEntry = async (entry: CashierDailyEntryModel) => {
    if (!isAdmin) return;
    const confirmMsg = `Êtes-vous sûr de vouloir supprimer définitivement la journée du ${entry.entryDate} de ${entry.cashierName} ?\n\nCette action enlèvera l'argent et tous les montants enregistrés pour ce jour dans la base de données.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingEntryId(entry.id);
    try {
      const res = await fetch(`/api/admin/financial-reports/entries/${entry.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        showSystemToast(err.error || "Impossible de supprimer cette journée.", "error");
        return;
      }

      showSystemToast(`Journée du ${entry.entryDate} supprimée. Les montants ont été déduits de la base avec succès.`);
      await fetchReportEntries();
    } catch (_) {
      showSystemToast("Erreur réseau lors de la suppression.", "error");
    } finally {
      setDeletingEntryId(null);
    }
  };

  // Computed live totals for the admin edit modal
  const adminEditTotals = useMemo(() => {
    let htg = 0;
    let usd = 0;
    for (const [key, val] of Object.entries(adminEditAmounts)) {
      const num = Number(val) || 0;
      if (num <= 0) continue;
      const rub = rubriques.find((r) => r.id === key);
      if (rub?.currency === "USD") usd += num;
      else htg += num;
    }
    return { htg, usd };
  }, [adminEditAmounts, rubriques]);

  const resolveMatricule = (entry: CashierDailyEntryModel): string => {
    if (entry.cashierMatricule) return entry.cashierMatricule;
    if (employeesList && employeesList.length > 0) {
      const byId = employeesList.find(
        (e: any) => e.id === entry.cashierId || e.userId === entry.cashierId
      );
      if (byId?.employeeNumber) return byId.employeeNumber;
      const byName = employeesList.find(
        (e: any) =>
          `${e.firstName || ""} ${e.lastName || ""}`.trim().toLowerCase() ===
          (entry.cashierName || "").trim().toLowerCase()
      );
      if (byName?.employeeNumber) return byName.employeeNumber;
      const userMatch = usersList.find((u: any) => u.id === entry.cashierId);
      if (userMatch?.email) {
        const byEmail = employeesList.find(
          (e: any) => e.email?.toLowerCase().trim() === userMatch.email.toLowerCase().trim()
        );
        if (byEmail?.employeeNumber) return byEmail.employeeNumber;
      }
    }
    return "";
  };

  // Excel Export Handler (Filtrage exécuté respecté + Aucun champ concatené 300$ ou 300HTG + Colonne Devise séparée)
  const handleExportExcel = () => {
    if (entries.length === 0) {
      showSystemToast("Aucune écriture à exporter pour les critères de filtrage sélectionnés.", "info");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // ---------------------------------------------------------------
      // FEUILLE 1 : Ventilation Détaillée par Rubrique
      // Règle stricte : Montant = nombre pur, Devise = champ distinct
      // ---------------------------------------------------------------
      const detailedRows: any[][] = [
        [
          "Date",
          "Caissier",
          "Matricule",
          "Succursale",
          "Mode de Règlement",
          "Montant",
          "Devise",
          "Remarques",
        ],
      ];

      for (const entry of entries) {
        const branchName =
          branches.find((b) => b.id === entry.branchId)?.name ||
          (entry.branchId ? entry.branchId : "Non assignée");
        const entryMatricule = resolveMatricule(entry);

        let hasBreakdown = false;
        if (entry.amounts && Object.keys(entry.amounts).length > 0) {
          for (const rub of activeRubriques) {
            const rawVal = entry.amounts[rub.id];
            const num = Number(rawVal) || 0;
            if (num > 0) {
              hasBreakdown = true;
              detailedRows.push([
                entry.entryDate,
                entry.cashierName || "Caissier",
                entryMatricule,
                branchName,
                rub.name,
                num, // Nombre numérique pur (jamais "300$" ou "300HTG")
                rub.currency, // Champ devise séparé ("USD" ou "HTG")
                entry.notes || "",
              ]);
            }
          }
        }

        if (!hasBreakdown) {
          if (entry.totalHtg > 0) {
            detailedRows.push([
              entry.entryDate,
              entry.cashierName || "Caissier",
              entryMatricule,
              branchName,
              "Total Recettes",
              Number(entry.totalHtg),
              "HTG",
              entry.notes || "",
            ]);
          }
          if (entry.totalUsd > 0) {
            detailedRows.push([
              entry.entryDate,
              entry.cashierName || "Caissier",
              entryMatricule,
              branchName,
              "Total Recettes",
              Number(entry.totalUsd),
              "USD",
              entry.notes || "",
            ]);
          }
        }
      }

      const ws1 = XLSX.utils.aoa_to_sheet(detailedRows);
      ws1["!cols"] = [
        { wch: 14 },
        { wch: 24 },
        { wch: 14 },
        { wch: 24 },
        { wch: 26 },
        { wch: 16 },
        { wch: 10 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, ws1, "Ventilation Détaillée");

      // ---------------------------------------------------------------
      // FEUILLE 2 : Synthèse Consolidée
      // Règle stricte : Montants numériques purs, devises en colonnes distinctes
      // ---------------------------------------------------------------
      const matrixHeaders = [
        "Date",
        "Caissier",
        "Matricule",
        "Succursale",
        ...activeRubriques.map((r) => r.name),
        "Total HTG",
        "Devise HTG",
        "Total USD",
        "Devise USD",
        "Remarques",
      ];

      const matrixRows: any[][] = [matrixHeaders];

      for (const entry of entries) {
        const branchName =
          branches.find((b) => b.id === entry.branchId)?.name ||
          (entry.branchId ? entry.branchId : "Non assignée");
        const entryMatricule = resolveMatricule(entry);

        const row = [
          entry.entryDate,
          entry.cashierName || "Caissier",
          entryMatricule,
          branchName,
          ...activeRubriques.map((r) => Number(entry.amounts?.[r.id] || 0)),
          Number(entry.totalHtg || 0),
          "HTG",
          Number(entry.totalUsd || 0),
          "USD",
          entry.notes || "",
        ];
        matrixRows.push(row);
      }

      // Ligne Total Général
      const totalRow = [
        "TOTAL GÉNÉRAL",
        "",
        "",
        "",
        ...activeRubriques.map((r) => Number(consolidatedTotals.columnSums[r.id] || 0)),
        Number(consolidatedTotals.totalHtgSum || 0),
        "HTG",
        Number(consolidatedTotals.totalUsdSum || 0),
        "USD",
        "",
      ];
      matrixRows.push(totalRow);

      const ws2 = XLSX.utils.aoa_to_sheet(matrixRows);
      ws2["!cols"] = [
        { wch: 14 },
        { wch: 24 },
        { wch: 14 },
        { wch: 24 },
        ...activeRubriques.map(() => ({ wch: 18 })),
        { wch: 16 },
        { wch: 12 },
        { wch: 16 },
        { wch: 12 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, "Synthèse Consolidée");

      // Nom de fichier explicite selon les filtres
      let filenamePeriod = "";
      if (period === "daily") {
        filenamePeriod = filterDate || todayStr;
      } else if (period === "weekly") {
        filenamePeriod = `Semaine_${filterDate || todayStr}`;
      } else if (period === "monthly") {
        filenamePeriod = (filterDate || todayStr).slice(0, 7);
      } else if (period === "yearly") {
        filenamePeriod = (filterDate || todayStr).slice(0, 4);
      } else if (period === "custom") {
        filenamePeriod = `${filterStartDate}_au_${filterEndDate}`;
      }

      const branchLabel =
        selectedBranchId !== "ALL"
          ? `_${(branches.find((b) => b.id === selectedBranchId)?.name || "Succursale").replace(/\s+/g, "_")}`
          : "";
      const cashierLabel =
        selectedCashierId !== "ALL"
          ? `_${(cashiersList.find((c) => c.id === selectedCashierId)?.name || "Caissier").replace(/\s+/g, "_")}`
          : "";

      const cleanFilename = `Rapport_Caisse_${period.toUpperCase()}_${filenamePeriod}${branchLabel}${cashierLabel}.xlsx`;

      XLSX.writeFile(wb, cleanFilename);
      showSystemToast(`Export Excel réussi : ${cleanFilename}`, "success");
    } catch (err) {
      console.error("Export Excel error:", err);
      showSystemToast("Erreur lors de la génération du fichier Excel.", "error");
    }
  };

  // Submit Cashier Daily Entry
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) {
      showSystemToast("Veuillez sélectionner une date.", "error");
      return;
    }

    setSavingEntry(true);
    try {
      const wasUpdate = Boolean(existingEntryId);
      // Clean all amounts to clean numbers (removes any leading zeros)
      const cleanedAmounts: Record<string, number> = {};
      for (const [k, v] of Object.entries(formAmounts)) {
        const num = parseFloat(String(v).replace(/,/g, ".")) || 0;
        if (num > 0) {
          cleanedAmounts[k] = num;
        }
      }

      const myEmpNumber = employeesList.find(
        (e: any) =>
          (currentUser?.email && e.email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
          `${e.firstName || ""} ${e.lastName || ""}`.trim().toLowerCase() === (currentUser?.name || "").trim().toLowerCase()
      )?.employeeNumber;

      const res = await fetch("/api/admin/financial-reports/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: selectedDate,
          amounts: cleanedAmounts,
          notes: formNotes,
          branchId: currentUser?.branchId || (selectedBranchId !== "ALL" ? selectedBranchId : null),
          cashierMatricule: myEmpNumber || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Erreur lors de l'enregistrement.", "error");
        return;
      }

      setExistingEntryId(data.entry?.id || "saved");
      setOriginalAmounts(cleanedAmounts);
      setOriginalNotes(formNotes);
      setIsEditing(false); // Bascule en état enregistré / verrouillé
      showSystemToast(
        wasUpdate
          ? "Rentrées de la journée modifiées avec succès !"
          : "Rentrées de la journée enregistrées avec succès !"
      );

      // Refresh admin list if admin
      if (isAdmin) {
        fetchReportEntries();
      }
    } catch (err: any) {
      showSystemToast(err.message || "Erreur réseau.", "error");
    } finally {
      setSavingEntry(false);
    }
  };

  // Rubriques Management Handlers
  const handleAddRubrique = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRubName.trim()) return;

    setConfigSaving(true);
    try {
      const res = await fetch("/api/admin/financial-reports/rubriques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRubName.trim(),
          currency: newRubCurrency,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Erreur lors de l'ajout.", "error");
        return;
      }

      setRubriques((prev) => [...prev, data.rubrique]);
      setNewRubName("");
      showSystemToast(`Rubrique « ${data.rubrique.name} » ajoutée !`);
    } catch (_) {
      showSystemToast("Erreur réseau.", "error");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleToggleRubriqueActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/financial-reports/rubriques/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (res.ok) {
        setRubriques((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isActive: !currentStatus } : r))
        );
        showSystemToast("Rubrique mise à jour !");
      }
    } catch (_) {}
  };

  const handleDeleteRubrique = async (id: string, name: string) => {
    if (!confirm(`Supprimer la rubrique « ${name} » ?`)) return;
    try {
      const res = await fetch(`/api/admin/financial-reports/rubriques/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRubriques((prev) => prev.filter((r) => r.id !== id));
        showSystemToast("Rubrique supprimée !");
      }
    } catch (_) {}
  };

  const handleResetDefaults = async () => {
    if (
      !confirm(
        "Voulez-vous rétablir les rubriques par défaut (Paiement HTG, Paiement USD, Zelle / Cash App, Virements UB, Virements SOG) ?"
      )
    )
      return;

    setConfigSaving(true);
    try {
      const res = await fetch("/api/admin/financial-reports/rubriques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESET_DEFAULTS" }),
      });
      const data = await res.json();
      if (res.ok && data.rubriques) {
        setRubriques(data.rubriques);
        showSystemToast("Les rubriques par défaut ont été rétablies avec succès !");
      }
    } catch (_) {
      showSystemToast("Erreur lors de la réinitialisation.", "error");
    } finally {
      setConfigSaving(false);
    }
  };

  // Consolidated Totals for Admin View
  const consolidatedTotals = useMemo(() => {
    const columnSums: Record<string, number> = {};
    let totalHtgSum = 0;
    let totalUsdSum = 0;

    for (const r of activeRubriques) {
      columnSums[r.id] = 0;
    }

    for (const entry of entries) {
      totalHtgSum += entry.totalHtg || 0;
      totalUsdSum += entry.totalUsd || 0;
      if (entry.amounts) {
        for (const [rId, amt] of Object.entries(entry.amounts)) {
          if (columnSums[rId] !== undefined) {
            columnSums[rId] += Number(amt) || 0;
          }
        }
      }
    }

    return { columnSums, totalHtgSum, totalUsdSum };
  }, [entries, activeRubriques]);

  const uniqueCashiersCount = useMemo(() => {
    const ids = new Set(entries.map((e) => e.cashierId));
    return ids.size;
  }, [entries]);

  // Format currency helpers
  const fmtHtg = (n: number) =>
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " HTG";
  const fmtUsd = (n: number) =>
    "$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USD";

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#64748B]">
        <RefreshCw className="w-6 h-6 animate-spin text-[#062653] mx-auto mb-2" />
        Chargement des modules financiers...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          {isCashier && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Espace Caissier
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight mt-1">
            Rapports Financiers & Saisie de Caisse
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {isCashier
              ? "Enregistrez vos rentrées quotidiennes selon les modes de paiement de l'entreprise."
              : "Suivi consolidé des rentrées par caissier, par période et par mode de règlement."}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Admin Configuration Button */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setConfigModalOpen(true)}
              className="h-10 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl flex items-center gap-2.5 shadow-xs transition-colors cursor-pointer"
              title="Configurer les modes de règlement et rubriques de caisse de l'entreprise"
            >
              <img
                src="/icons/sidebar/config.png"
                alt=""
                aria-hidden="true"
                className="w-6 h-6 object-contain shrink-0"
              />
              <span className="hidden sm:inline">Rubriques de caisse</span>
            </button>
          )}
        </div>
      </div>

      {/* Print Page Setup (Strictly isolate and print ONLY the filtered table in landscape) */}
      <style jsx global>{`
        @media print {
          @page {
            size: landscape !important;
            margin: 6mm !important;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-matrix-table,
          #printable-matrix-table * {
            visibility: visible !important;
          }
          #printable-matrix-table {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>


      {/* ========================================================================= */}
      {/* VIEW A: CASHIER DAILY ENTRY FORM & RECORDED DAYS HISTORY                  */}
      {/* ========================================================================= */}
      {activeTab === "entry" && (
        <div className="space-y-6 print:hidden">
          <form onSubmit={handleSaveEntry} className="space-y-6">
          {/* DATE SELECTOR & STATUS BAR */}
          <div className="bg-white p-5 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#062653]">
                  Date d'enregistrement de la caisse <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-[#64748B]">
                  Choisissez la date exacte pour laquelle vous saisissez les rentrées.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                className="h-10 px-4 bg-black hover:bg-neutral-900 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-black/40 cursor-pointer shadow-xs transition-colors"
              />

              {/* BOUTON VERT SOLIDE ET TEXTE BLANC: NOUVELLE SAISIE */}
              <button
                type="button"
                onClick={handleNouvelleSaisie}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title={existingEntryId ? "Cette date a déjà été enregistrée" : "Commencer une nouvelle saisie"}
              >
                <Plus className="w-4 h-4 text-white stroke-[2.5]" />
                <span>Nouvelle saisie</span>
              </button>

              {/* BOUTON MODIFIER (BLEU SOLIDE AVEC TEXTE BLANC) */}
              {existingEntryId && (
                !isEditing ? (
                  <button
                    type="button"
                    onClick={handleModifierClick}
                    className="h-10 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title="Modifier les montants de cette journée enregistrée"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                    <span>Modifier</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Annuler les modifications"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Annuler</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* DYNAMIC AMOUNTS GRID */}
          <div className="bg-white p-6 rounded-2xl shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                  <span>Ventilation des Rentrées par Mode de Paiement</span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Renseignez les montants encaissés sur chaque rubrique définie pour votre entreprise.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#64748B]">
                {activeRubriques.length} rubrique(s) active(s)
              </span>
            </div>

            {/* SECTIONS: HTG & USD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. GOURDES (HTG) */}
              <div className="space-y-4 bg-emerald-50/50 p-4 sm:p-5 rounded-xl">
                <div className="pb-2 border-b border-emerald-200/60">
                  <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    Modes de Règlement en Gourdes (HTG)
                  </span>
                </div>

                {htgRubriques.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-3 text-center">
                    Aucune rubrique en Gourdes configurée.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {htgRubriques.map((rub) => (
                      <div key={rub.id} className="space-y-1">
                        <div className="text-xs">
                          <label className="font-semibold text-[#062653]">
                            {rub.name}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            disabled={Boolean(existingEntryId && !isEditing)}
                            value={getDisplayAmount(rub.id)}
                            onFocus={(e) => {
                              if (e.target.value === "0" || e.target.value === "0.00") {
                                e.target.select();
                              }
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => handleAmountChange(rub.id, e.target.value)}
                            className={`flex-1 h-10 px-3.5 rounded-xl text-xs font-bold font-mono text-right transition-colors ${
                              existingEntryId && !isEditing
                                ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                : "bg-white text-[#062653] shadow-2xs focus:ring-2 focus:ring-emerald-500/20"
                            }`}
                          />
                          <div className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 min-w-[54px] shadow-xs select-none">
                            HTG
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. DOLLARS (USD) */}
              <div className="space-y-4 bg-blue-50/50 p-4 sm:p-5 rounded-xl">
                <div className="pb-2 border-b border-blue-200/60">
                  <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    Modes de Règlement en Dollars (USD)
                  </span>
                </div>

                {usdRubriques.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-3 text-center">
                    Aucune rubrique en Dollars configurée.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {usdRubriques.map((rub) => (
                      <div key={rub.id} className="space-y-1">
                        <div className="text-xs">
                          <label className="font-semibold text-[#062653]">
                            {rub.name}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            disabled={Boolean(existingEntryId && !isEditing)}
                            value={getDisplayAmount(rub.id)}
                            onFocus={(e) => {
                              if (e.target.value === "0" || e.target.value === "0.00") {
                                e.target.select();
                              }
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            onChange={(e) => handleAmountChange(rub.id, e.target.value)}
                            className={`flex-1 h-10 px-3.5 rounded-xl text-xs font-bold font-mono text-right transition-colors ${
                              existingEntryId && !isEditing
                                ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                : "bg-white text-[#062653] shadow-2xs focus:ring-2 focus:ring-blue-500/20"
                            }`}
                          />
                          <div className="h-10 px-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 min-w-[54px] shadow-xs select-none">
                            USD
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* REMARQUES & NOTES */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-[#062653] mb-1.5">
                Notes / Remarques de caisse (Facultatif)
              </label>
              <textarea
                rows={2}
                disabled={Boolean(existingEntryId && !isEditing)}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Précisions éventuelles sur un écart de caisse, un virement en attente de compensation, etc."
                className={`w-full p-3 rounded-xl text-xs transition-colors ${
                  existingEntryId && !isEditing
                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                    : "bg-[#F4F6F9] text-[#263445] focus:bg-white"
                }`}
              />
            </div>
          </div>

          {/* TOTALS BAR & SAVE BUTTON */}
          <div className="bg-white p-5 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 sm:gap-8">
              <div>
                <span className="text-[10px] uppercase font-bold text-black block">
                  Total Encaissé
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xl font-black text-black font-mono">
                    {formTotalHtg.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-xl bg-emerald-600 text-white shadow-xs select-none">
                    HTG
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
              <div>
                <span className="text-[10px] uppercase font-bold text-black block">
                  Total Encaissé
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xl font-black text-black font-mono">
                    {formTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-xl bg-blue-600 text-white shadow-xs select-none">
                    USD
                  </span>
                </div>
              </div>
            </div>

            {existingEntryId && !isEditing ? (
              <button
                type="button"
                onClick={handleModifierClick}
                className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Edit3 className="w-4 h-4 text-white stroke-[2.5]" />
                <span>Modifier la saisie</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={savingEntry}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                {savingEntry ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enregistrement en cours...
                  </>
                ) : existingEntryId ? (
                  <>
                    <Save className="w-4 h-4" />
                    Enregistrer les modifications
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Enregistrer la caisse journalière
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: ADMIN CONSOLIDATED REPORTS & FILTERS                              */}
      {/* ========================================================================= */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          {/* PERIOD TABS */}
          <div className="bg-white p-3 rounded-2xl shadow-xs flex items-center justify-between flex-wrap gap-2 print:hidden">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "daily", label: "Journalier" },
                { id: "weekly", label: "Hebdomadaire" },
                { id: "monthly", label: "Mensuel" },
                { id: "yearly", label: "Annuel" },
                { id: "custom", label: "Personnalisé" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPeriod(t.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    period === t.id
                      ? "bg-[#062653] text-white shadow-xs"
                      : "bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200/80 hover:text-[#062653]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Quick Date Selectors based on Period & Bouton Excel */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* BOUTON EXCEL (PROCHE DE LA DATE / PARTAGE LA PLACE AVEC LA DATE) */}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={entries.length === 0}
                className="h-9 px-3.5 bg-[#107C41] hover:bg-[#0D6836] active:bg-[#084523] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                title={
                  entries.length === 0
                    ? "Aucune écriture à exporter pour ce filtre"
                    : `Exporter les ${entries.length} écriture(s) filtrée(s) vers Microsoft Excel (.xlsx)`
                }
              >
                <FileSpreadsheet className="w-4 h-4 text-white stroke-[2.2]" />
                <span>Exporter Excel</span>
              </button>

              {period === "daily" && (
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                  className="h-9 px-3 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                />
              )}
              {period === "weekly" && (
                <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                  <span>Semaine du :</span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                    className="h-9 px-3 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                  />
                </div>
              )}
              {period === "monthly" && (
                <input
                  type="month"
                  value={filterDate.slice(0, 7)}
                  onChange={(e) => setFilterDate(`${e.target.value}-01`)}
                  style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                  className="h-9 px-3 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                />
              )}
              {period === "yearly" && (
                <select
                  value={filterDate.slice(0, 4)}
                  onChange={(e) => setFilterDate(`${e.target.value}-01-01`)}
                  style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                  className="h-9 px-3 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y} className="bg-neutral-900 text-white">
                      Année {y}
                    </option>
                  ))}
                </select>
              )}
              {period === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                    className="h-9 px-2.5 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                  />
                  <span className="text-xs text-[#64748B]">au</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    style={{ backgroundColor: "#000000", color: "#ffffff", colorScheme: "dark" }}
                    className="h-9 px-2.5 bg-black hover:bg-neutral-900 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECONDARY FILTERS BAR: CASHIER & BRANCH */}
          <div className="bg-white p-4 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div className="flex flex-wrap items-center gap-4">
              {/* Cashier Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#64748B] flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-[#062653]" />
                  Caissier :
                </span>
                <select
                  value={selectedCashierId}
                  onChange={(e) => setSelectedCashierId(e.target.value)}
                  className="h-9 px-3 bg-[#F4F6F9] rounded-lg text-xs font-semibold text-[#062653] focus:bg-white cursor-pointer"
                >
                  <option value="ALL">Tous les caissiers</option>
                  {cashiersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#64748B] flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#062653]" />
                  Succursale :
                </span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => handleBranchSelectChange(e.target.value)}
                  className="h-9 px-3 bg-[#F4F6F9] rounded-lg text-xs font-semibold text-[#062653] focus:bg-white cursor-pointer"
                >
                  <option value="ALL">Toutes les succursales</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs font-semibold text-[#64748B]">
              {entries.length} écriture(s) trouvée(s)
            </div>
          </div>

          {/* KPI CARDS (SOLID COLORED BOXES EXACTLY LIKE IN DASHBOARD) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print:hidden">
            {/* 1. TOTAL RECETTES HTG - SOLID GREEN #059669 */}
            <div className="relative overflow-hidden bg-[#059669] text-white p-6 rounded-2xl sm:rounded-3xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-100/90">
                    Total Recettes HTG
                  </span>
                  <DollarSign className="w-6 h-6 text-emerald-200/80 shrink-0" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-[34px] font-black tracking-tight text-white font-mono">
                    {consolidatedTotals.totalHtgSum.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-bold text-emerald-200 uppercase">
                    HTG
                  </span>
                </div>
              </div>
              <div className="mt-4 text-xs font-semibold text-emerald-100/90">
                Période sélectionnée
              </div>
            </div>

            {/* 2. TOTAL RECETTES USD - SOLID BLUE #062653 */}
            <div className="relative overflow-hidden bg-[#062653] text-white p-6 rounded-2xl sm:rounded-3xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-100/90">
                    Total Recettes USD
                  </span>
                  <DollarSign className="w-6 h-6 text-blue-200/80 shrink-0" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-[34px] font-black tracking-tight text-white font-mono">
                    {consolidatedTotals.totalUsdSum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-bold text-blue-200 uppercase">
                    USD
                  </span>
                </div>
              </div>
              <div className="mt-4 text-xs font-semibold text-blue-100/90">
                Période sélectionnée
              </div>
            </div>

            {/* 3. CAISSIERS ACTIFS - SOLID ORANGE #FF7900 */}
            <div className="relative overflow-hidden bg-[#FF7900] text-white p-6 rounded-2xl sm:rounded-3xl shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-100/95">
                    Caissiers Actifs
                  </span>
                  <User className="w-6 h-6 text-amber-200/80 shrink-0" />
                </div>
                <div className="mt-3 text-3xl sm:text-[34px] font-black tracking-tight text-white font-mono">
                  {uniqueCashiersCount}
                </div>
              </div>
              <div className="mt-4 text-xs font-semibold text-amber-100/95">
                Sur la période
              </div>
            </div>
          </div>

          {/* CONSOLIDATED TABLE WITH ALL RUBRIQUES COLUMNS */}
          <div className="bg-white rounded-2xl shadow-xs overflow-hidden print:shadow-none print:rounded-none">
            {entriesLoading ? (
              <div className="p-12 text-center text-xs text-[#64748B]">
                <RefreshCw className="w-5 h-5 animate-spin text-[#062653] mx-auto mb-2" />
                Actualisation des écritures...
              </div>
            ) : entries.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#64748B] space-y-2">
                <p className="font-semibold text-[#062653]">
                  Aucune rentrée enregistrée sur cette période.
                </p>
                <p className="text-[11px]">
                  Les caissiers peuvent saisir leurs rentrées depuis l'onglet « Saisie de Caisse ».
                </p>
              </div>
            ) : (
              <div id="printable-matrix-table" className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left text-xs border-collapse print:text-[11px] print:w-full">
                  <thead className="bg-[#062653] text-white text-[11px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-3.5 py-3 border-r border-white/10 shrink-0">Date</th>
                      <th className="px-3.5 py-3 border-r border-white/10 shrink-0">Caissier</th>
                      {/* Active Rubriques Columns */}
                      {activeRubriques.map((rub) => (
                        <th
                          key={rub.id}
                          className="px-3 py-3 border-r border-white/10 text-right whitespace-nowrap"
                        >
                          {rub.name}
                          <span
                            className={`ml-1 text-[9px] px-1 py-0.2 rounded font-black ${
                              rub.currency === "USD"
                                ? "bg-blue-600 text-white"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {rub.currency}
                          </span>
                        </th>
                      ))}
                      <th className="px-3.5 py-3 border-r border-white/20 text-right bg-emerald-600 text-white font-black whitespace-nowrap shadow-inner">
                        Total HTG
                      </th>
                      <th className="px-3.5 py-3 text-right bg-blue-600 text-white font-black whitespace-nowrap shadow-inner">
                        Total USD
                      </th>
                      {isAdmin && (
                        <th className="px-3.5 py-3 text-center bg-[#062653] text-white font-black whitespace-nowrap border-l border-white/20 print:hidden">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE2EA] text-[#263445]">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-3 font-mono font-bold text-[#062653] border-r border-[#DCE2EA] whitespace-nowrap">
                          {entry.entryDate}
                        </td>
                        <td className="px-3.5 py-3 border-r border-[#DCE2EA] whitespace-nowrap">
                          <span className="font-semibold block text-[#062653]">
                            {entry.cashierName}
                          </span>
                          {resolveMatricule(entry) && (
                            <span className="text-[10px] text-slate-500 font-mono font-medium block">
                              {resolveMatricule(entry)}
                            </span>
                          )}
                        </td>
                        {activeRubriques.map((rub) => {
                          const val = entry.amounts ? entry.amounts[rub.id] : 0;
                          return (
                            <td
                              key={rub.id}
                              className="px-3 py-3 text-right font-mono text-[11px] border-r border-[#DCE2EA] whitespace-nowrap"
                            >
                              {val && val > 0 ? (
                                <span className="font-bold text-[#062653]">
                                  {val.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3.5 py-3 text-right font-mono font-bold text-white bg-emerald-600 border-r border-emerald-700/30 whitespace-nowrap">
                          {entry.totalHtg > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{entry.totalHtg.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[10px] font-bold text-white tracking-wide">
                                HTG
                              </span>
                            </div>
                          ) : (
                            <span className="text-emerald-200">-</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono font-bold text-white bg-blue-600 whitespace-nowrap">
                          {entry.totalUsd > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{entry.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[10px] font-bold text-white tracking-wide">
                                USD
                              </span>
                            </div>
                          ) : (
                            <span className="text-blue-200">-</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2 text-center border-l border-[#DCE2EA] whitespace-nowrap print:hidden">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditEntry(entry)}
                                className="w-8 h-8 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                                title="Modifier"
                              >
                                <Edit3 className="w-4 h-4 text-white shrink-0" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry)}
                                disabled={deletingEntryId === entry.id}
                                className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                title="Supprimer"
                              >
                                {deletingEntryId === entry.id ? (
                                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-white shrink-0" />
                                )}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {/* FOOTER ROW: TOTAL GÉNÉRAL */}
                  <tfoot className="bg-[#F4F6F9] font-black text-xs border-t border-[#DCE2EA]">
                    <tr>
                      <td colSpan={2} className="px-3.5 py-3 text-[#062653] uppercase border-r border-[#DCE2EA]">
                        TOTAL GÉNÉRAL
                      </td>
                      {activeRubriques.map((rub) => (
                        <td
                          key={rub.id}
                          className="px-3 py-3 text-right font-mono border-r border-[#DCE2EA] text-[#062653] whitespace-nowrap"
                        >
                          {(consolidatedTotals.columnSums[rub.id] || 0) > 0
                            ? (consolidatedTotals.columnSums[rub.id] || 0).toLocaleString("fr-FR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "-"}
                        </td>
                      ))}
                      <td className="px-3.5 py-3 text-right font-mono text-white bg-emerald-600 border-r border-white/20 whitespace-nowrap font-black shadow-inner">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{consolidatedTotals.totalHtgSum.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] font-bold text-white tracking-wide">
                            HTG
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-white bg-blue-600 whitespace-nowrap font-black shadow-inner">
                        <div className="flex items-center justify-end gap-1.5">
                          <span>{consolidatedTotals.totalUsdSum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] font-bold text-white tracking-wide">
                            USD
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-3.5 py-3 border-l border-[#DCE2EA] bg-[#F4F6F9] print:hidden"></td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADMIN EDIT DAILY ENTRY (MODIFIER UNE JOURNÉE COMPTABILISÉE)         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={adminEditModalOpen && Boolean(editingEntry)}
        onClose={() => {
          if (!adminEditSaving) {
            setAdminEditModalOpen(false);
            setEditingEntry(null);
          }
        }}
        title={`Modifier la Journée de Caisse — ${editingEntry?.entryDate || ""}`}
        maxWidth="2xl"
      >
        {editingEntry && (
          <form onSubmit={handleSaveAdminEdit} className="space-y-5">
            <div className="bg-[#F4F6F9] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Caissier</span>
                <span className="font-bold text-[#062653] text-sm">{editingEntry.cashierName}</span>
                {resolveMatricule(editingEntry) && (
                  <span className="ml-2 font-mono text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded shadow-2xs font-semibold">
                    {resolveMatricule(editingEntry)}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Date comptabilisée</span>
                <span className="font-mono font-bold text-[#062653]">{editingEntry.entryDate}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Succursale</span>
                <span className="font-semibold text-slate-700">
                  {branches.find((b) => b.id === editingEntry.branchId)?.name || (editingEntry.branchId ? editingEntry.branchId : "Non assignée")}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#062653] mb-2 uppercase tracking-wide">
                Montants par Rubrique de Caisse
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                {activeRubriques.map((rub) => (
                  <div key={rub.id} className="bg-[#F4F6F9] focus-within:bg-white rounded-xl p-3 focus-within:ring-2 focus-within:ring-[#062653]/15 transition-all">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-[#062653] truncate">{rub.name}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${rub.currency === "USD" ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"}`}>
                        {rub.currency}
                      </span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={adminEditAmounts[rub.id] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdminEditAmounts((prev) => ({
                          ...prev,
                          [rub.id]: val === "" ? "" : Number(val),
                        }));
                      }}
                      placeholder="0.00"
                      className="w-full text-sm font-mono font-bold text-[#062653] focus:outline-hidden bg-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Remarques / Justificatif de modification
              </label>
              <textarea
                rows={2}
                value={adminEditNotes}
                onChange={(e) => setAdminEditNotes(e.target.value)}
                placeholder="Explication de la modification ou régularisation..."
                className="w-full p-2.5 rounded-xl text-xs text-[#062653] bg-[#F4F6F9] focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* LIVE PREVIEW OF RECALCULATED TOTALS */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#F4F6F9]">
              <div className="bg-emerald-600 text-white p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-100 block">Nouveau Total HTG</span>
                  <span className="text-lg font-black font-mono">
                    {adminEditTotals.htg.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="text-xs font-bold text-white">HTG</span>
              </div>
              <div className="bg-blue-600 text-white p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-100 block">Nouveau Total USD</span>
                  <span className="text-lg font-black font-mono">
                    {adminEditTotals.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="text-xs font-bold text-white">USD</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setAdminEditModalOpen(false);
                  setEditingEntry(null);
                }}
                disabled={adminEditSaving}
                className="px-4 py-2 bg-[#F4F6F9] hover:bg-slate-200/70 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={adminEditSaving}
                className="px-5 py-2 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {adminEditSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Enregistrer les modifications</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* SLIDE-OVER: RUBRIQUES CONFIGURATION (SORTANT DE LA DROITE)                 */}
      {/* ========================================================================= */}
      <SlideOver
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title="Configuration des Rubriques de Caisse"
        subtitle="Personnalisez les modes de paiement et libellés de rentrées pour votre entreprise."
        icon={
          <img
            src="/icons/sidebar/config-red.png"
            alt=""
            className="w-6 h-6 object-contain shrink-0"
          />
        }
        width="xl"
      >
        <div className="space-y-6">
          {/* ADD NEW RUBRIQUE FORM */}
          <form onSubmit={handleAddRubrique} className="p-4 bg-[#F4F6F9] rounded-xl space-y-3">
            <span className="text-xs font-bold text-[#062653] block uppercase tracking-wide">
              + Ajouter un mode de paiement / rubrique
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Nom de la rubrique <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CHEQUE HTG, NATCASH, POS CARTE..."
                  value={newRubName}
                  onChange={(e) => setNewRubName(e.target.value)}
                  className="w-full h-10 px-3 bg-white shadow-2xs rounded-xl text-xs text-[#062653] font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                  Devise
                </label>
                <select
                  value={newRubCurrency}
                  onChange={(e) => setNewRubCurrency(e.target.value as any)}
                  className="w-full h-10 px-3 bg-white shadow-2xs rounded-xl text-xs font-bold text-[#062653] cursor-pointer"
                >
                  <option value="HTG">HTG (Gourdes)</option>
                  <option value="USD">USD (Dollars)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={configSaving || !newRubName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span>Ajouter la rubrique</span>
              </button>
            </div>
          </form>

          {/* LIST OF CURRENT RUBRIQUES */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#062653] border-b border-slate-100 pb-2">
              <span>Rubriques de caisse existantes ({rubriques.length})</span>
              <button
                type="button"
                onClick={handleResetDefaults}
                disabled={configSaving}
                className="text-[11px] text-[#FF7900] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <RefreshCw className="w-3 h-3" />
                Rétablir les rubriques par défaut
              </button>
            </div>

            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {rubriques.map((rub, idx) => (
                <div
                  key={rub.id}
                  className={`p-3 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors ${
                    rub.isActive ? "bg-[#F4F6F9] hover:bg-slate-200/60" : "bg-slate-100 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 text-center font-mono font-bold text-[#64748B] text-[11px]">
                      {idx + 1}.
                    </span>
                    <span className="font-bold text-[#062653]">{rub.name}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded text-white ${
                        rub.currency === "USD"
                          ? "bg-blue-600"
                          : "bg-emerald-600"
                      }`}
                    >
                      {rub.currency}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleRubriqueActive(rub.id, rub.isActive)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-colors ${
                        rub.isActive
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      }`}
                    >
                      {rub.isActive ? "Actif" : "Désactivé"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRubrique(rub.id, rub.name)}
                      className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4 text-white shrink-0" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SLIDEOVER FOOTER */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-[#64748B]">
              {rubriques.filter((r) => r.isActive).length} rubrique(s) active(s) sur {rubriques.length}
            </span>
            <button
              type="button"
              onClick={() => setConfigModalOpen(false)}
              className="px-5 py-2.5 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl cursor-pointer transition"
            >
              Fermer
            </button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
