"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  PlusCircle,
  RefreshCw,
  RotateCw,
  Search,
  UserCheck,
  Users,
  Wifi,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";
import { formatFrDate, formatMoney } from "@/lib/utils/subscription";
import { getHaitiDateParts, PeriodMode } from "@/lib/utils/period-filter";
import type {
  SuperAdminOrganizationDetailsResult,
  SuperAdminOverviewOrgRow,
  SuperAdminOverviewResult,
} from "@/lib/services/super-admin-overview";

type KpiModalType =
  | "ORGS"
  | "NO_PASSWORD"
  | "CONNECTED"
  | "EXPIRING_J7"
  | "USERS_EMPLOYEES"
  | null;

type TableQuickFilter =
  | "ALL"
  | "NO_PASSWORD"
  | "CONNECTED"
  | "ONLINE"
  | "EXPIRING_J7"
  | "EXPIRED_OR_STOPPED";

const FRENCH_MONTH_OPTIONS = [
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Août" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
];

function formatFrDateTime(timestampMs?: number | null): string {
  if (!timestampMs) return "Jamais";
  try {
    return new Date(timestampMs).toLocaleString("fr-FR", {
      timeZone: "America/Port-au-Prince",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return new Date(timestampMs).toLocaleString("fr-FR");
  }
}

function getRoleBadgeLabel(role?: string | null): string {
  if (!role) return "Aucun compte";
  if (role === "ORGANIZATION_ADMIN") return "PDG / Admin";
  if (role === "SECRETARY") return "Secrétaire";
  if (role === "FINANCIAL_MANAGER") return "Resp. Financier";
  if (role === "BRANCH_MANAGER") return "Chef Succursale";
  if (role === "CASHIER" || role === "CAISSIER") return "Caissier(ère)";
  if (role === "EMPLOYEE" || role === "COLLABORATEUR") return "Employé";
  return role;
}

export default function SuperAdminOverviewPage() {
  const initialToday = useMemo(() => getHaitiDateParts(Date.now()), []);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [selectedDate, setSelectedDate] = useState<string>(initialToday.ymd);
  const [selectedMonthNum, setSelectedMonthNum] = useState<string>(initialToday.month);
  const [selectedYear, setSelectedYear] = useState<string>(initialToday.year);

  const [stats, setStats] = useState<SuperAdminOverviewResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Organizations table search & filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tableFilter, setTableFilter] = useState<TableQuickFilter>("ALL");
  const [restrictTableToPeriod, setRestrictTableToPeriod] = useState<boolean>(false);

  // KPI Drilldown modal state
  const [kpiModal, setKpiModal] = useState<KpiModalType>(null);
  const [connectedModalTab, setConnectedModalTab] = useState<"CONNECTED" | "ONLINE">("CONNECTED");
  const [expiryModalTab, setExpiryModalTab] = useState<"J7" | "EXPIRED">("J7");
  const [noPwdModalTab, setNoPwdModalTab] = useState<"PERIOD" | "ALL">("PERIOD");

  // Organization detail (Eye) modal state
  const [inspectOrgSummary, setInspectOrgSummary] = useState<SuperAdminOverviewOrgRow | null>(null);
  const [inspectDetails, setInspectDetails] = useState<SuperAdminOrganizationDetailsResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [inspectTab, setInspectTab] = useState<"USERS" | "EMPLOYEES" | "SUBSCRIPTION">("USERS");
  const [inspectSearch, setInspectSearch] = useState<string>("");
  const [resendingOrgId, setResendingOrgId] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const baseYear = Number(initialToday.year) || 2026;
    const years: string[] = [];
    for (let y = baseYear - 3; y <= baseYear + 2; y++) {
      years.push(String(y));
    }
    return years.reverse();
  }, [initialToday.year]);

  const loadStats = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("period", periodMode);
        if (periodMode === "day") {
          params.set("date", selectedDate);
        } else if (periodMode === "month") {
          params.set("month", `${selectedYear}-${selectedMonthNum}`);
        } else if (periodMode === "year") {
          params.set("year", selectedYear);
        }

        const res = await fetch(`/api/super-admin/stats?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.stats) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error("Failed to load SuperAdmin overview stats:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [periodMode, selectedDate, selectedMonthNum, selectedYear]
  );

  useEffect(() => {
    loadStats(stats !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, selectedDate, selectedMonthNum, selectedYear]);

  const handleOpenInspectOrg = async (org: SuperAdminOverviewOrgRow) => {
    setInspectOrgSummary(org);
    setInspectDetails(null);
    setInspectTab("USERS");
    setInspectSearch("");
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org.id}/overview`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setInspectDetails(json);
      }
    } catch (err) {
      console.error("Failed to load org details:", err);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleResendActivation = async (org: SuperAdminOverviewOrgRow) => {
    setResendingOrgId(org.id);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org.id}/resend-activation`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showSystemToast(
          data?.error || "Impossible de renvoyer le lien d'activation.",
          "error"
        );
        return;
      }
      showSystemToast(
        data?.message ||
          `Nouveau lien d'activation envoyé à ${org.adminEmail || org.email || org.name}.`
      );
      await loadStats(true);
    } catch (_) {
      showSystemToast("Erreur réseau lors du renvoi du lien d'activation.", "error");
    } finally {
      setResendingOrgId(null);
    }
  };

  const resetFilters = () => {
    const today = getHaitiDateParts(Date.now());
    setPeriodMode("all");
    setSelectedDate(today.ymd);
    setSelectedMonthNum(today.month);
    setSelectedYear(today.year);
    setRestrictTableToPeriod(false);
  };

  const kpis = stats?.kpis;
  const lists = stats?.lists;
  const allOrganizations = stats?.organizations || [];

  const filteredTableOrganizations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allOrganizations.filter((org) => {
      if (periodMode !== "all" && restrictTableToPeriod && !org.matchesPeriodActivity) {
        return false;
      }

      if (tableFilter === "NO_PASSWORD" && org.hasAdminPassword) return false;
      if (tableFilter === "CONNECTED") {
        if (periodMode === "all") {
          if (!org.hasConnectedEver) return false;
        } else if (!org.hasConnectedInPeriod) {
          return false;
        }
      }
      if (tableFilter === "ONLINE" && !org.isOnlineNow) return false;
      if (
        tableFilter === "EXPIRING_J7" &&
        org.subscriptionState.phase !== "EXPIRING_SOON"
      ) {
        return false;
      }
      if (
        tableFilter === "EXPIRED_OR_STOPPED" &&
        org.subscriptionState.phase !== "EXPIRED" &&
        org.subscriptionState.phase !== "SERVICE_STOPPED"
      ) {
        return false;
      }

      if (q) {
        const haystack = [
          org.name,
          org.slug,
          org.email || "",
          org.adminEmail || "",
          org.adminName || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    allOrganizations,
    periodMode,
    restrictTableToPeriod,
    tableFilter,
    searchQuery,
  ]);

  const filteredInspectUsers = useMemo(() => {
    const list = inspectDetails?.users || [];
    const q = inspectSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      `${u.name} ${u.email} ${u.role} ${u.branchName || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [inspectDetails, inspectSearch]);

  const filteredInspectEmployees = useMemo(() => {
    const list = inspectDetails?.employees || [];
    const q = inspectSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) =>
      `${e.employeeNumber} ${e.firstName} ${e.lastName} ${e.department || ""} ${e.position || ""} ${e.email || ""} ${e.branchName || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [inspectDetails, inspectSearch]);

  const renderSubscriptionBadge = (org: SuperAdminOverviewOrgRow) => {
    const sub = org.subscriptionState;
    if (sub.phase === "SERVICE_STOPPED") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
          Service arrêté
        </span>
      );
    }
    if (sub.phase === "EXPIRED") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          {sub.countdownLabel}
        </span>
      );
    }
    if (sub.phase === "EXPIRING_SOON") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900] whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
          <span>{org.badgeJLabel || "J-7"}</span>
          <span>• {sub.countdownLabel}</span>
        </span>
      );
    }
    if (sub.phase === "PENDING_ACTIVATION") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 whitespace-nowrap">
          En attente d&apos;activation
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        {sub.countdownLabel}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Vue d&apos;ensemble de la plateforme
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Supervision complète : entreprises sans mot de passe, connexions, utilisateurs, employés et échéances J-7.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadStats(true)}
            disabled={refreshing}
            className="h-9 px-3.5 bg-white border border-[#DCE2EA] hover:bg-slate-50 text-xs font-semibold text-[#062653] rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>
          <Link
            href="/super-admin/organizations"
            className="h-9 px-3.5 bg-white border border-[#DCE2EA] hover:bg-slate-50 text-xs font-semibold text-[#263445] rounded-xl shadow-2xs transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span>Entreprises clientes</span>
          </Link>
          <Link
            href="/super-admin/organizations/new"
            className="h-9 px-4 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Ajouter une entreprise</span>
          </Link>
        </div>
      </div>

      {/* 2. TEMPORAL FILTER BAR (ALL / DAY / MONTH / YEAR) */}
      <div className="bg-white border border-[#DCE2EA] rounded-2xl p-4 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#062653] mr-1">
            <Calendar className="w-4 h-4 text-[#FF7900]" />
            <span>Filtrage :</span>
          </div>

          {(
            [
              { id: "all", label: "Tout" },
              { id: "day", label: "Par jour" },
              { id: "month", label: "Par mois" },
              { id: "year", label: "Par année" },
            ] as Array<{ id: PeriodMode; label: string }>
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setPeriodMode(mode.id);
                if (mode.id !== "all") {
                  setRestrictTableToPeriod(true);
                } else {
                  setRestrictTableToPeriod(false);
                }
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                periodMode === mode.id
                  ? "bg-[#062653] text-white shadow-2xs"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653] hover:bg-slate-200/70"
              }`}
            >
              {mode.label}
            </button>
          ))}

          {periodMode === "day" && (
            <div className="flex flex-wrap items-center gap-2 ml-1">
              <input
                type="date"
                aria-label="Sélectionner un jour"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-semibold text-[#062653] focus:border-[#062653] outline-none"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(getHaitiDateParts(Date.now()).ymd)}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Aujourd&apos;hui
              </button>
            </div>
          )}

          {periodMode === "month" && (
            <div className="flex flex-wrap items-center gap-2 ml-1">
              <select
                aria-label="Sélectionner un mois"
                value={selectedMonthNum}
                onChange={(e) => setSelectedMonthNum(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-semibold text-[#062653] focus:border-[#062653] outline-none"
              >
                {FRENCH_MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sélectionner une année"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-semibold text-[#062653] focus:border-[#062653] outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const nowParts = getHaitiDateParts(Date.now());
                  setSelectedMonthNum(nowParts.month);
                  setSelectedYear(nowParts.year);
                }}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Ce mois
              </button>
            </div>
          )}

          {periodMode === "year" && (
            <div className="flex flex-wrap items-center gap-2 ml-1">
              <select
                aria-label="Sélectionner une année"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#DCE2EA] rounded-xl text-xs font-semibold text-[#062653] focus:border-[#062653] outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedYear(getHaitiDateParts(Date.now()).year)}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Cette année
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#F4F6F9] border border-[#DCE2EA] text-[11px] font-bold text-[#062653]">
            Période : {stats?.filter?.label || "Toutes les périodes"}
          </span>
          {periodMode !== "all" && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1 text-[11px] font-semibold text-[#FF7900] hover:underline cursor-pointer"
            >
              Tout afficher
            </button>
          )}
        </div>
      </div>

      {/* 3. COMPLETE KPI CARDS WITH EYE BUTTONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        {/* CARD 1: ENTREPRISES SANS MOT DE PASSE */}
        <div className="xl:col-span-2 bg-white p-5 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#FF7900]" />
                Inscrites sans mot de passe
              </span>
              <button
                type="button"
                onClick={() => {
                  setNoPwdModalTab(periodMode === "all" ? "ALL" : "PERIOD");
                  setKpiModal("NO_PASSWORD");
                }}
                aria-label="Voir les entreprises inscrites sans mot de passe"
                title="Voir le détail des entreprises sans mot de passe"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#DCE2EA] text-[11px] font-bold text-[#062653] hover:bg-[#062653] hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Voir</span>
              </button>
            </div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="text-3xl font-bold text-[#062653]">
                {loading ? "..." : kpis?.withoutPasswordOrgsCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-[#64748B]">
                entreprise{(kpis?.withoutPasswordOrgsCount ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-[#64748B] flex flex-wrap items-center justify-between gap-1">
            <span>
              {periodMode !== "all"
                ? `Total en attente : ${kpis?.withoutPasswordOrgsAllCount ?? 0}`
                : "En attente de configuration"}
            </span>
            {(kpis?.usersWithoutPasswordAllCount ?? 0) > 0 && (
              <span className="text-amber-700 font-semibold">
                {kpis?.usersWithoutPasswordAllCount} compte(s) sans MDP
              </span>
            )}
          </div>
        </div>

        {/* CARD 2: INSCRITS & CONNECTES + EN LIGNE MAINTENANT */}
        <div className="xl:col-span-2 bg-white p-5 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                Inscrits &amp; connectés
              </span>
              <button
                type="button"
                onClick={() => {
                  setConnectedModalTab("CONNECTED");
                  setKpiModal("CONNECTED");
                }}
                aria-label="Voir les entreprises et comptes inscrits et connectés"
                title="Voir les connexions et sessions en ligne"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#DCE2EA] text-[11px] font-bold text-[#062653] hover:bg-[#062653] hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Voir</span>
              </button>
            </div>
            <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl font-bold text-[#062653]">
                {loading ? "..." : kpis?.connectedOrgsCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-[#64748B]">
                entreprise{(kpis?.connectedOrgsCount ?? 0) > 1 ? "s" : ""} •{" "}
                <strong className="text-[#062653]">{kpis?.connectedUsersCount ?? 0}</strong> compte
                {(kpis?.connectedUsersCount ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {kpis?.onlineUsersNowCount ?? 0} en ligne maintenant (5 min)
            </span>
            {periodMode !== "all" && (
              <span className="text-[#64748B]">
                Déjà connectées : {kpis?.connectedOrgsAllCount ?? 0}
              </span>
            )}
          </div>
        </div>

        {/* CARD 3: ABONNEMENTS FIN PROCHE DES J-7 */}
        <div className="xl:col-span-2 bg-white p-5 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#FF7900]" />
                Fin d&apos;abonnement (J-7)
              </span>
              <button
                type="button"
                onClick={() => {
                  setExpiryModalTab("J7");
                  setKpiModal("EXPIRING_J7");
                }}
                aria-label="Voir les entreprises dont l'abonnement arrive à échéance (J-7)"
                title="Voir les entreprises J-7 et expirées"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#DCE2EA] text-[11px] font-bold text-[#062653] hover:bg-[#062653] hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Voir</span>
              </button>
            </div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="text-3xl font-bold text-[#062653]">
                {loading ? "..." : kpis?.expiringSoonOrgsCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-[#64748B]">
                entreprise{(kpis?.expiringSoonOrgsCount ?? 0) > 1 ? "s" : ""} (J-7 à J-0)
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs flex flex-wrap items-center justify-between gap-1">
            <span
              className={
                (kpis?.expiredOrStoppedOrgsCount ?? 0) > 0
                  ? "text-rose-700 font-bold"
                  : "text-[#64748B]"
              }
            >
              {kpis?.expiredOrStoppedOrgsCount ?? 0} expirée(s) / arrêtée(s)
            </span>
            {(kpis?.pendingRenewalsCount ?? 0) > 0 && (
              <span className="text-[#FF7900] font-bold">
                {kpis?.pendingRenewalsCount} preuve(s) à valider
              </span>
            )}
            {periodMode !== "all" && (
              <span className="text-[#062653] font-semibold">
                {kpis?.expiringSoonInPeriodCount ?? 0} échéance(s) sur la période
              </span>
            )}
          </div>
        </div>

        {/* CARD 4: UTILISATEURS & EMPLOYES */}
        <div className="xl:col-span-3 bg-white p-5 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#062653]" />
                Utilisateurs &amp; Employés
              </span>
              <button
                type="button"
                onClick={() => setKpiModal("USERS_EMPLOYEES")}
                aria-label="Voir le nombre d'utilisateurs et d'employés par entreprise"
                title="Voir les effectifs par entreprise"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#DCE2EA] text-[11px] font-bold text-[#062653] hover:bg-[#062653] hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Voir</span>
              </button>
            </div>
            <div className="mt-3 flex items-baseline gap-4 flex-wrap">
              <div>
                <span className="text-3xl font-bold text-[#062653]">
                  {loading ? "..." : kpis?.totalUsersAll ?? 0}
                </span>
                <span className="text-xs font-semibold text-[#64748B] ml-1.5">
                  utilisateurs
                </span>
              </div>
              <span className="text-slate-300">•</span>
              <div>
                <span className="text-3xl font-bold text-[#062653]">
                  {loading ? "..." : kpis?.totalEmployeesAll ?? 0}
                </span>
                <span className="text-xs font-semibold text-[#64748B] ml-1.5">
                  employés
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-[#64748B] flex flex-wrap items-center justify-between gap-1">
            <span>
              {kpis?.activeEmployeesAll ?? 0} employés actifs
            </span>
            {periodMode !== "all" && (
              <span className="text-[#062653] font-semibold">
                +{kpis?.usersInPeriodCount ?? 0} util. / +{kpis?.employeesInPeriodCount ?? 0} empl. (période)
              </span>
            )}
          </div>
        </div>

        {/* CARD 5: ENTREPRISES CLIENTES */}
        <div className="md:col-span-2 xl:col-span-3 bg-white p-5 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#062653]" />
                Entreprises inscrites
              </span>
              <button
                type="button"
                onClick={() => setKpiModal("ORGS")}
                aria-label="Voir la liste des entreprises inscrites"
                title="Voir les entreprises de la période"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#DCE2EA] text-[11px] font-bold text-[#062653] hover:bg-[#062653] hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Voir</span>
              </button>
            </div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="text-3xl font-bold text-[#062653]">
                {loading ? "..." : kpis?.totalOrganizations ?? 0}
              </span>
              {periodMode !== "all" && (
                <span className="text-xs text-[#64748B]">
                  / {kpis?.totalOrganizationsAll ?? 0} au total
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-emerald-700 font-semibold">
                {kpis?.activeOrganizations ?? 0} actives
              </span>
              <span>•</span>
              <span className="text-[#64748B]">
                {kpis?.disabledOrganizations ?? 0} en attente
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              Système opérationnel
            </span>
          </div>
        </div>
      </div>

      {/* 4. DETAILED PER-COMPANY OVERVIEW TABLE (USERS, EMPLOYEES, PASSWORD, LOGINS, J-7) */}
      <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-xs overflow-hidden">
        <div className="p-5 border-b border-[#DCE2EA] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#062653]">
                Détail par entreprise : Utilisateurs, Employés, Connexions &amp; Abonnements
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Cliquez sur le bouton œil d&apos;une entreprise pour consulter ses utilisateurs, employés, connexions et état d&apos;abonnement.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {periodMode !== "all" && (
                <button
                  type="button"
                  onClick={() => setRestrictTableToPeriod(!restrictTableToPeriod)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    restrictTableToPeriod
                      ? "bg-[#FFF4EB] border-[#FF7900] text-[#062653]"
                      : "bg-white border-[#DCE2EA] text-[#64748B]"
                  }`}
                >
                  {restrictTableToPeriod
                    ? "Activité de la période uniquement"
                    : "Toutes les entreprises"}
                </button>
              )}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher entreprise, email..."
                  className="pl-8 pr-3 py-1.5 w-60 bg-[#F4F6F9] border border-[#DCE2EA] rounded-xl text-xs text-[#263445] focus:bg-white focus:border-[#062653] outline-none"
                />
              </div>
            </div>
          </div>

          {/* QUICK SEGMENT PILLS */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "ALL", label: `Toutes (${allOrganizations.length})` },
                {
                  id: "NO_PASSWORD",
                  label: `Sans mot de passe (${kpis?.withoutPasswordOrgsAllCount ?? 0})`,
                },
                {
                  id: "CONNECTED",
                  label: `Connectées (${
                    periodMode === "all"
                      ? kpis?.connectedOrgsAllCount ?? 0
                      : kpis?.connectedOrgsCount ?? 0
                  })`,
                },
                {
                  id: "ONLINE",
                  label: `En ligne (${kpis?.onlineOrgsNowCount ?? 0})`,
                },
                {
                  id: "EXPIRING_J7",
                  label: `Fin proche J-7 (${kpis?.expiringSoonOrgsCount ?? 0})`,
                },
                {
                  id: "EXPIRED_OR_STOPPED",
                  label: `Expirées / Arrêtées (${kpis?.expiredOrStoppedOrgsCount ?? 0})`,
                },
              ] as Array<{ id: TableQuickFilter; label: string }>
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTableFilter(pill.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  tableFilter === pill.id
                    ? "bg-[#062653] text-white"
                    : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-[#64748B]">
            Chargement de la vue d&apos;ensemble...
          </div>
        ) : filteredTableOrganizations.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#64748B] space-y-2">
            <p>Aucune entreprise ne correspond aux filtres sélectionnés.</p>
            {(periodMode !== "all" && restrictTableToPeriod) || tableFilter !== "ALL" || searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setRestrictTableToPeriod(false);
                  setTableFilter("ALL");
                  setSearchQuery("");
                }}
                className="px-3 py-1.5 bg-[#062653] text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Réinitialiser l&apos;affichage du tableau
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Entreprise</th>
                  <th className="px-3 py-3 whitespace-nowrap">Mot de passe &amp; Statut</th>
                  <th className="px-3 py-3 whitespace-nowrap">Connexion &amp; Présence</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Utilisateurs</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Employés</th>
                  <th className="px-3 py-3 whitespace-nowrap">Abonnement</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EA]">
                {filteredTableOrganizations.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* ENTREPRISE */}
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[#062653] text-sm">{org.name}</div>
                      <div className="text-[11px] text-[#64748B]">
                        {org.adminEmail || org.email || "Sans e-mail"}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span className="font-mono">{org.slug}</span>
                        <span>•</span>
                        <span>Inscrite le {formatFrDate(org.createdAt)}</span>
                      </div>
                    </td>

                    {/* MOT DE PASSE & STATUT */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {!org.hasAdminPassword ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900] whitespace-nowrap">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            Sans mot de passe
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 whitespace-nowrap">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Mot de passe défini
                          </span>
                        )}
                        <span className="text-[11px] text-[#64748B]">
                          Statut compte :{" "}
                          <strong>{org.status === "ACTIVE" ? "Actif" : "En attente"}</strong>
                        </span>
                      </div>
                    </td>

                    {/* CONNEXION & PRESENCE */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {org.isOnlineNow ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                            En ligne ({org.onlineUserCount})
                          </span>
                        ) : org.hasConnectedEver ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#062653] whitespace-nowrap">
                            <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            Connecté(e)
                          </span>
                        ) : (
                          <span className="text-xs text-[#64748B] whitespace-nowrap">
                            Jamais connecté
                          </span>
                        )}
                        <span className="text-[11px] text-[#64748B]">
                          Dernière co. : {formatFrDateTime(org.lastLoginAt)}
                        </span>
                      </div>
                    </td>

                    {/* UTILISATEURS */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="text-sm font-bold text-[#062653]">
                        {org.userCount}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {org.connectedUserCount} co.
                        {org.noPasswordUserCount > 0 && (
                          <span className="text-amber-700 font-semibold">
                            {" "}
                            • {org.noPasswordUserCount} sans MDP
                          </span>
                        )}
                      </div>
                    </td>

                    {/* EMPLOYES */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="text-sm font-bold text-[#062653]">
                        {org.employeeCount}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {org.activeEmployeeCount} actif{org.activeEmployeeCount > 1 ? "s" : ""}
                      </div>
                    </td>

                    {/* ABONNEMENT */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        {renderSubscriptionBadge(org)}
                        <span className="text-[10px] text-[#64748B]">
                          Échéance : {formatFrDate(org.subscriptionExpiresAt)}
                        </span>
                      </div>
                    </td>

                    {/* ACTION EYE BUTTON */}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenInspectOrg(org)}
                        aria-label={`Voir les détails de ${org.name}`}
                        title={`Voir utilisateurs, employés et abonnement de ${org.name}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                        <span>Voir</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL A: KPI CARD EYE DRILLDOWN MODALS                            */}
      {/* ================================================================= */}
      <Modal
        isOpen={kpiModal !== null}
        onClose={() => setKpiModal(null)}
        title={
          kpiModal === "NO_PASSWORD"
            ? "Entreprises inscrites sans mot de passe"
            : kpiModal === "CONNECTED"
            ? "Entreprises & comptes inscrits et connectés"
            : kpiModal === "EXPIRING_J7"
            ? "Abonnements en fin de période (J-7 à J-0) & expirés"
            : kpiModal === "USERS_EMPLOYEES"
            ? "Utilisateurs & Employés par entreprise"
            : `Entreprises inscrites (${stats?.filter?.label || ""})`
        }
        maxWidth="3xl"
      >
        {/* 1. SANS MOT DE PASSE */}
        {kpiModal === "NO_PASSWORD" && (
          <div className="space-y-4">
            {periodMode !== "all" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNoPwdModalTab("PERIOD")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    noPwdModalTab === "PERIOD"
                      ? "bg-[#062653] text-white"
                      : "bg-[#F4F6F9] text-[#64748B]"
                  }`}
                >
                  Sur la période ({lists?.withoutPasswordOrgs?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setNoPwdModalTab("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    noPwdModalTab === "ALL"
                      ? "bg-[#062653] text-white"
                      : "bg-[#F4F6F9] text-[#64748B]"
                  }`}
                >
                  Tout le backlog ({lists?.withoutPasswordOrgsAll?.length ?? 0})
                </button>
              </div>
            )}

            {(() => {
              const items =
                noPwdModalTab === "ALL" || periodMode === "all"
                  ? lists?.withoutPasswordOrgsAll || []
                  : lists?.withoutPasswordOrgs || [];
              if (items.length === 0) {
                return (
                  <div className="p-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                    Aucune entreprise sans mot de passe configuré pour cette sélection.
                  </div>
                );
              }
              return (
                <div className="space-y-2.5">
                  {items.map((org) => (
                    <div
                      key={org.id}
                      className="p-3.5 rounded-xl border border-[#DCE2EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-bold text-sm text-[#062653]">{org.name}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF7900]">
                            <Lock className="w-3 h-3" />
                            Sans mot de passe
                          </span>
                        </div>
                        <div className="text-xs text-[#64748B] mt-1">
                          Responsable : <strong>{org.adminName}</strong> ({org.adminEmail || org.email || "—"})
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Inscrite le {formatFrDateTime(org.createdAt)} • Tél : {org.phone || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setKpiModal(null);
                            handleOpenInspectOrg(org);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#DCE2EA] text-xs font-bold text-[#062653] hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Détails
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResendActivation(org)}
                          disabled={resendingOrgId === org.id}
                          className="px-3 py-1.5 rounded-lg bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {resendingOrgId === org.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                          <span>Renvoyer le lien</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* 2. INSCRITS & CONNECTES / EN LIGNE */}
        {kpiModal === "CONNECTED" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConnectedModalTab("CONNECTED")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  connectedModalTab === "CONNECTED"
                    ? "bg-[#062653] text-white"
                    : "bg-[#F4F6F9] text-[#64748B]"
                }`}
              >
                Connexions sur la période ({lists?.connectedOrgs?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setConnectedModalTab("ONLINE")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                  connectedModalTab === "ONLINE"
                    ? "bg-emerald-600 text-white"
                    : "bg-[#F4F6F9] text-[#64748B]"
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                En ligne maintenant ({lists?.onlineOrgsNow?.length ?? 0})
              </button>
            </div>

            {(() => {
              const items =
                connectedModalTab === "ONLINE"
                  ? lists?.onlineOrgsNow || []
                  : lists?.connectedOrgs || [];
              if (items.length === 0) {
                return (
                  <div className="p-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                    {connectedModalTab === "ONLINE"
                      ? "Aucun utilisateur d'entreprise n'est actuellement actif dans les 5 dernières minutes."
                      : "Aucune connexion enregistrée sur cette période."}
                  </div>
                );
              }
              return (
                <div className="space-y-2.5">
                  {items.map((org) => (
                    <div
                      key={org.id}
                      className="p-3.5 rounded-xl border border-[#DCE2EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-bold text-sm text-[#062653]">{org.name}</span>
                          {org.isOnlineNow && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                              {org.onlineUserCount} en ligne
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#64748B] mt-1">
                          {org.connectedUserCount} / {org.userCount} utilisateur(s) connecté(s) •{" "}
                          {org.employeeCount} employé(s)
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Dernière connexion : <strong>{formatFrDateTime(org.lastLoginAt)}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setKpiModal(null);
                          handleOpenInspectOrg(org);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                        Voir les comptes
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* 3. ABONNEMENTS J-7 ET EXPIRES */}
        {kpiModal === "EXPIRING_J7" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExpiryModalTab("J7")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  expiryModalTab === "J7"
                    ? "bg-[#FF7900] text-white"
                    : "bg-[#F4F6F9] text-[#64748B]"
                }`}
              >
                Fin proche J-7 à J-0 ({lists?.expiringSoonOrgs?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setExpiryModalTab("EXPIRED")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  expiryModalTab === "EXPIRED"
                    ? "bg-rose-600 text-white"
                    : "bg-[#F4F6F9] text-[#64748B]"
                }`}
              >
                Expirées / Coupées ({lists?.expiredOrStoppedOrgs?.length ?? 0})
              </button>
            </div>

            {(() => {
              const items =
                expiryModalTab === "EXPIRED"
                  ? lists?.expiredOrStoppedOrgs || []
                  : lists?.expiringSoonOrgs || [];
              if (items.length === 0) {
                return (
                  <div className="p-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                    {expiryModalTab === "EXPIRED"
                      ? "Aucune entreprise n'est actuellement expirée ou coupée."
                      : "Aucune entreprise n'est actuellement dans la fenêtre d'alerte J-7 à J-0."}
                  </div>
                );
              }
              return (
                <div className="space-y-2.5">
                  {items.map((org) => (
                    <div
                      key={org.id}
                      className="p-3.5 rounded-xl border border-[#DCE2EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[#062653]">{org.name}</span>
                          {renderSubscriptionBadge(org)}
                        </div>
                        <div className="text-xs text-[#64748B]">
                          Échéance : <strong>{formatFrDate(org.subscriptionExpiresAt)}</strong> •{" "}
                          Admin : {org.adminEmail || org.email || "—"}
                        </div>
                        {org.pendingRenewal && (
                          <div className="text-[11px] font-bold text-[#FF7900]">
                            Preuve de paiement soumise : {org.pendingRenewal.durationMonths} mois (
                            {org.pendingRenewal.paymentMethod})
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setKpiModal(null);
                            handleOpenInspectOrg(org);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#DCE2EA] text-xs font-bold text-[#062653] hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Détails
                        </button>
                        <Link
                          href="/super-admin/organizations"
                          onClick={() => setKpiModal(null)}
                          className="px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold flex items-center gap-1"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-[#FF7900]" />
                          Renouveler
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* 4. UTILISATEURS & EMPLOYES PAR ENTREPRISE */}
        {kpiModal === "USERS_EMPLOYEES" && (
          <div className="space-y-3">
            {allOrganizations.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                Aucune entreprise enregistrée.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#DCE2EA] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                    <tr>
                      <th className="px-4 py-2.5">Entreprise</th>
                      <th className="px-4 py-2.5 text-center">Utilisateurs</th>
                      <th className="px-4 py-2.5 text-center">Employés</th>
                      <th className="px-4 py-2.5 text-center">En ligne</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE2EA]">
                    {allOrganizations.map((org) => (
                      <tr key={org.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-[#062653]">{org.name}</div>
                          <div className="text-[10px] text-[#64748B]">{org.adminEmail || org.email}</div>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#062653]">
                          {org.userCount}
                          {org.noPasswordUserCount > 0 && (
                            <span className="block text-[10px] text-amber-700 font-normal">
                              ({org.noPasswordUserCount} sans MDP)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#062653]">
                          {org.employeeCount}
                          <span className="block text-[10px] text-[#64748B] font-normal">
                            ({org.activeEmployeeCount} actifs)
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {org.onlineUserCount > 0 ? (
                            <span className="text-emerald-700 font-bold">{org.onlineUserCount}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setKpiModal(null);
                              handleOpenInspectOrg(org);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#062653] text-white text-[11px] font-bold cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-[#FF7900]" />
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. ENTREPRISES INSCRITES */}
        {kpiModal === "ORGS" && (
          <div className="space-y-2.5">
            {(lists?.organizationsInPeriod || []).length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                Aucune entreprise inscrite sur cette période.
              </div>
            ) : (
              (lists?.organizationsInPeriod || []).map((org) => (
                <div
                  key={org.id}
                  className="p-3.5 rounded-xl border border-[#DCE2EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-sm text-[#062653]">{org.name}</span>
                      {!org.hasAdminPassword ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF7900]">
                          <Lock className="w-3 h-3" />
                          Sans mot de passe
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Activée
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#64748B] mt-1">
                      Inscrite le {formatFrDateTime(org.createdAt)} • {org.userCount} util. •{" "}
                      {org.employeeCount} empl.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setKpiModal(null);
                      handleOpenInspectOrg(org);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#062653] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                    Voir
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* MODAL B: PER-ORGANIZATION EYE INSPECTION MODAL                    */}
      {/* ================================================================= */}
      <Modal
        isOpen={inspectOrgSummary !== null}
        onClose={() => {
          setInspectOrgSummary(null);
          setInspectDetails(null);
        }}
        title={
          inspectOrgSummary
            ? `Inspection — ${inspectOrgSummary.name}`
            : "Détails de l'entreprise"
        }
        maxWidth="4xl"
      >
        {inspectOrgSummary && (
          <div className="space-y-5">
            {/* Summary banner */}
            <div className="p-4 rounded-xl bg-white border border-[#DCE2EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-base font-bold text-[#062653]">
                    {inspectOrgSummary.name}
                  </span>
                  {renderSubscriptionBadge(inspectOrgSummary)}
                  {!inspectOrgSummary.hasAdminPassword && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF7900]">
                      <Lock className="w-3 h-3" />
                      Sans mot de passe
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#64748B] mt-1">
                  Slug : <span className="font-mono">{inspectOrgSummary.slug}</span> • Email :{" "}
                  <strong>{inspectOrgSummary.adminEmail || inspectOrgSummary.email || "—"}</strong>{" "}
                  • Tél : {inspectOrgSummary.phone || "—"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                {!inspectOrgSummary.hasAdminPassword && (
                  <button
                    type="button"
                    onClick={() => handleResendActivation(inspectOrgSummary)}
                    disabled={resendingOrgId === inspectOrgSummary.id}
                    className="px-3 py-1.5 rounded-lg bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {resendingOrgId === inspectOrgSummary.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    <span>Renvoyer le lien</span>
                  </button>
                )}
                <Link
                  href="/super-admin/organizations"
                  onClick={() => setInspectOrgSummary(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold whitespace-nowrap"
                >
                  Gérer l&apos;abonnement
                </Link>
              </div>
            </div>

            {/* 4 mini counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-[#DCE2EA] bg-white">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Utilisateurs</div>
                <div className="text-xl font-bold text-[#062653] mt-1">
                  {inspectOrgSummary.userCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[#DCE2EA] bg-white">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">
                  Connectés / En ligne
                </div>
                <div className="text-xl font-bold text-emerald-700 mt-1">
                  {inspectOrgSummary.connectedUserCount}
                  <span className="text-xs text-[#64748B] font-semibold ml-1">
                    ({inspectOrgSummary.onlineUserCount} en ligne)
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[#DCE2EA] bg-white">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Sans mot de passe</div>
                <div className="text-xl font-bold text-amber-700 mt-1">
                  {inspectOrgSummary.noPasswordUserCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[#DCE2EA] bg-white">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Employés</div>
                <div className="text-xl font-bold text-[#062653] mt-1">
                  {inspectOrgSummary.employeeCount}
                </div>
              </div>
            </div>

            {/* Tabs + inline search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE2EA] pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectTab("USERS")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    inspectTab === "USERS"
                      ? "bg-[#062653] text-white"
                      : "bg-[#F4F6F9] text-[#64748B]"
                  }`}
                >
                  Utilisateurs ({inspectDetails?.users.length ?? inspectOrgSummary.userCount})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab("EMPLOYEES")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    inspectTab === "EMPLOYEES"
                      ? "bg-[#062653] text-white"
                      : "bg-[#F4F6F9] text-[#64748B]"
                  }`}
                >
                  Employés ({inspectDetails?.employees.length ?? inspectOrgSummary.employeeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab("SUBSCRIPTION")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    inspectTab === "SUBSCRIPTION"
                      ? "bg-[#062653] text-white"
                      : "bg-[#F4F6F9] text-[#64748B]"
                  }`}
                >
                  Abonnement &amp; Infos
                </button>
              </div>

              {inspectTab !== "SUBSCRIPTION" && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inspectSearch}
                    onChange={(e) => setInspectSearch(e.target.value)}
                    placeholder="Filtrer dans cette liste..."
                    className="pl-8 pr-3 py-1.5 w-full sm:w-52 bg-[#F4F6F9] border border-[#DCE2EA] rounded-lg text-xs outline-none focus:bg-white focus:border-[#062653]"
                  />
                </div>
              )}
            </div>

            {inspectLoading ? (
              <div className="py-10 text-center text-xs text-[#64748B]">
                Chargement des utilisateurs et employés...
              </div>
            ) : inspectTab === "USERS" ? (
              filteredInspectUsers.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                  Aucun utilisateur trouvé pour cette entreprise.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#DCE2EA] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4F6F9] text-[10px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                      <tr>
                        <th className="px-4 py-2.5">Utilisateur</th>
                        <th className="px-4 py-2.5">Rôle &amp; Succursale</th>
                        <th className="px-4 py-2.5">Mot de passe</th>
                        <th className="px-4 py-2.5">Connexion / Présence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2EA]">
                      {filteredInspectUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-[#062653]">{u.name}</div>
                            <div className="text-[11px] text-[#64748B]">{u.email}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-[#263445]">
                              {getRoleBadgeLabel(u.role)}
                            </div>
                            <div className="text-[10px] text-[#64748B]">
                              {u.branchName || "Toutes / Siège"} •{" "}
                              {u.status === "ACTIVE" ? "Actif" : "Désactivé"}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {u.hasPassword ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Configuré
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF7900]">
                                <Lock className="w-3.5 h-3.5" />
                                Non défini
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {u.isOnlineNow && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 mr-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                                En ligne
                              </span>
                            )}
                            <span className="text-[11px] text-[#64748B] block mt-0.5">
                              {u.lastLoginAt
                                ? `Dernière co. : ${formatFrDateTime(u.lastLoginAt)}`
                                : "Jamais connecté"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : inspectTab === "EMPLOYEES" ? (
              filteredInspectEmployees.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                  Aucun employé enregistré pour cette entreprise.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#DCE2EA] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F4F6F9] text-[10px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                      <tr>
                        <th className="px-4 py-2.5">Matricule &amp; Nom</th>
                        <th className="px-4 py-2.5">Poste &amp; Département</th>
                        <th className="px-4 py-2.5">Contact &amp; Succursale</th>
                        <th className="px-4 py-2.5">Statut &amp; Accès</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE2EA]">
                      {filteredInspectEmployees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-[#062653]">
                              {emp.firstName} {emp.lastName}
                            </div>
                            <div className="text-[10px] font-mono text-[#64748B]">
                              {emp.employeeNumber}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-[#263445]">
                              {emp.position || "—"}
                            </div>
                            <div className="text-[10px] text-[#64748B]">
                              {emp.department || "Non précisé"}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-[11px] text-[#263445]">{emp.phone}</div>
                            <div className="text-[10px] text-[#64748B]">
                              {emp.email || "Sans e-mail"} • {emp.branchName || "Siège"}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs font-bold w-fit ${
                                  emp.status === "ACTIVE"
                                    ? "text-emerald-700"
                                    : "text-slate-500"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    emp.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
                                  }`}
                                />
                                {emp.status === "ACTIVE" ? "Actif" : "Inactif"}
                              </span>
                              <span className="text-[10px] text-[#64748B]">
                                {emp.isOnlineNow
                                  ? "En ligne maintenant"
                                  : emp.hasUserAccount
                                  ? emp.hasPassword
                                    ? emp.lastLoginAt
                                      ? `Co. ${formatFrDateTime(emp.lastLoginAt)}`
                                      : "Compte prêt (jamais co.)"
                                    : "Invitation sans MDP"
                                  : "Sans accès portail"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Date d&apos;inscription</span>
                  <strong className="text-sm text-[#062653]">
                    {formatFrDateTime(inspectOrgSummary.createdAt)}
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Date d&apos;activation</span>
                  <strong className="text-sm text-[#062653]">
                    {inspectOrgSummary.activatedAt
                      ? formatFrDateTime(inspectOrgSummary.activatedAt)
                      : "Non activée"}
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Dernier renouvellement</span>
                  <strong className="text-sm text-[#062653]">
                    {inspectOrgSummary.lastRenewedAt
                      ? formatFrDate(inspectOrgSummary.lastRenewedAt)
                      : "Aucun (1er mois)"}
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Prochaine expiration</span>
                  <strong className="text-sm text-[#062653]">
                    {formatFrDate(inspectOrgSummary.subscriptionExpiresAt)} (
                    {inspectOrgSummary.subscriptionState.countdownLabel})
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Dernière connexion connue</span>
                  <strong className="text-sm text-[#062653]">
                    {formatFrDateTime(inspectOrgSummary.lastLoginAt)}
                  </strong>
                </div>
                <div className="p-3.5 rounded-xl border border-[#DCE2EA]">
                  <span className="text-[11px] text-[#64748B] block">Statut du compte &amp; service</span>
                  <strong className="text-sm text-[#062653]">
                    {inspectOrgSummary.subscriptionState.serviceStopped
                      ? "Service arrêté"
                      : inspectOrgSummary.status === "ACTIVE"
                      ? "Actif"
                      : "En attente d'activation"}
                  </strong>
                </div>
                {inspectOrgSummary.pendingRenewal && (
                  <div className="sm:col-span-2 p-3.5 rounded-xl bg-white border border-[#DCE2EA]">
                    <div className="font-bold text-[#062653]">
                      Référence de renouvellement en attente
                    </div>
                    <div className="text-[#64748B] mt-1">
                      {inspectOrgSummary.pendingRenewal.durationMonths} mois •{" "}
                      {formatMoney(
                        inspectOrgSummary.pendingRenewal.amountExpected,
                        inspectOrgSummary.pendingRenewal.currency
                      )}{" "}
                      • {inspectOrgSummary.pendingRenewal.paymentMethod}
                      {inspectOrgSummary.pendingRenewal.paymentReference
                        ? ` (Réf : ${inspectOrgSummary.pendingRenewal.paymentReference})`
                        : ""}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
