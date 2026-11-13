"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Search,
  Filter,
  ExternalLink,
  Calendar,
  TrendingUp,
  FileSignature,
  Building,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";

interface NotificationItem {
  id: string;
  category:
    | "LEAVE"
    | "FINANCIAL"
    | "SALARY_RAISE"
    | "SIGNATURE"
    | "SYSTEM"
    | "ADMIN_ANNOUNCEMENT"
    | "HR_DECISION";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  unread: boolean;
  meta?: string;
}

type FilterTab =
  | "ALL"
  | "UNREAD"
  | "LEAVE"
  | "FINANCIAL"
  | "SYSTEM"
  | "SALARY_RAISE"
  | "SIGNATURE"
  | "ADMIN_ANNOUNCEMENT"
  | "HR_DECISION";

function formatLeaveTypeLabel(type?: string, other?: string): string {
  if (!type) return "Non précisé";
  switch (type.toUpperCase()) {
    case "ANNUAL":
      return "Annuel";
    case "SICK":
      return "Maladie";
    case "UNPAID":
      return "Sans solde";
    case "MATERNITY_PATERNITY":
      return "Maternité / Paternité";
    case "OTHER":
      return other ? `Autre (${other})` : "Autre";
    default:
      return type;
  }
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadNotifications() {
      try {
        setLoading(true);

        // 1. Détection du rôle de l'utilisateur connecté
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        let role = "EMPLOYEE";
        let subscriptionSummary: any = null;
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.user?.role) {
            role = meData.user.role;
          }
          subscriptionSummary = meData?.subscriptionSummary || null;
        }
        if (!isMounted) return;
        setCurrentUserRole(role);

        const isEmp =
          role === "EMPLOYEE" ||
          role === "COLLABORATEUR" ||
          role === "CASHIER" ||
          role === "CAISSIER" ||
          role.toLowerCase().includes("employ") ||
          role.toLowerCase().includes("collab") ||
          role.toLowerCase().includes("caissier") ||
          role.toLowerCase().includes("cashier") ||
          role.toLowerCase().includes("operat");

        // 2. Pour les employés : le flux représente les alertes venant de l'administration
        // (planifications & communications officielles ciblant l'employé, sa succursale ou tous les employés).
        if (isEmp) {
          try {
            const evRes = await fetch("/api/admin/events");
            if (evRes.ok && isMounted) {
              const evData = await evRes.json();
              const readIds = new Set<string>(
                JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
              );
              const alertEvents = (Array.isArray(evData?.events) ? evData.events : []).filter(
                (ev: any) => !ev.isPersonal && ev.notifyImmediate !== false
              );
              const mapped: NotificationItem[] = alertEvents.map((ev: any) => ({
                id: ev.id,
                category: "ADMIN_ANNOUNCEMENT",
                title: ev.title,
                description: `${ev.description ? `${ev.description} — ` : ""}Programmé le ${ev.date} de ${ev.startTime || "09:00"} à ${ev.endTime || "10:00"}${ev.location ? ` (${ev.location})` : ""}.`,
                timestamp: ev.date || (ev.createdAt ? new Date(ev.createdAt).toLocaleDateString("fr-FR") : "Récent"),
                link: "/admin/events",
                unread: !readIds.has(ev.id),
                meta: `${ev.audienceTargetName || "Administration"} • ${ev.creatorName || "Direction"}`,
              }));
              setNotifications(mapped);
              setLoading(false);
              return;
            }
          } catch (_) {}
          if (isMounted) setNotifications([]);
          setLoading(false);
          return;
        }

        // 3. Pour l'administration : demandes de congé, opérations financières et alertes système
        const adminNotifs: NotificationItem[] = [];
        const readIds = new Set<string>(
          JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
        );
        const dismissedIds = new Set<string>(
          JSON.parse(localStorage.getItem("rkonekte_dismissed_notifications") || "[]")
        );

        if (
          role === "ORGANIZATION_ADMIN" &&
          subscriptionSummary?.shouldShowCountdownBanner &&
          !subscriptionSummary?.isExpired &&
          !subscriptionSummary?.isAccessBlocked
        ) {
          const subId = `sub-alert-${subscriptionSummary.subscriptionExpiresAt ?? "exp"}-${subscriptionSummary.daysRemaining ?? "none"}`;
          if (!dismissedIds.has(subId)) {
            const expFormatted = subscriptionSummary.subscriptionExpiresAt
              ? new Date(subscriptionSummary.subscriptionExpiresAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })
              : "—";
            const daysLeft = subscriptionSummary.daysRemaining;
            const title =
              daysLeft === 0
                ? "Votre plan RKonekte se termine aujourd'hui (J-0)"
                : `Votre plan se termine dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""} (J-${daysLeft})`;
            const description = `Votre période d'utilisation expire le ${expFormatted}. Veuillez contacter l'administration RKonekte pour prolonger votre abonnement avant l'expiration.`;
            adminNotifs.push({
              id: subId,
              category: "SYSTEM",
              title,
              description,
              timestamp: `Échéance : ${expFormatted}`,
              unread: !readIds.has(subId),
              meta: `Compte à rebours J-${daysLeft ?? 0} • Rappel d'expiration`,
            });
          }
        }

        // 4. Demandes de congé
        try {
          const res = await fetch("/api/admin/requests?limit=50");
          if (res.ok) {
            const data = await res.json();
            const rawRequests = Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data?.requests)
              ? data.requests
              : [];

            if (isMounted && rawRequests.length > 0) {
              const mapped: NotificationItem[] = rawRequests
                .filter((r: any) => !r.decisionComment?.includes("[ADMIN_ARCHIVED]"))
                .map((r: any) => {
                  const empName =
                    r.employeeName ||
                    `${r.firstName || ""} ${r.lastName || ""}`.trim() ||
                    "Employé";
                  const notifId = `leave-${r.id}`;
                  const isPending = r.status === "PENDING";
                  const daysCount = Number(r.requestedDays ?? r.daysRequested ?? 0);
                  const daysText = daysCount > 1 ? `${daysCount} jours` : `${daysCount} jour`;
                  const leaveTypeLabel = formatLeaveTypeLabel(r.leaveType, r.leaveTypeOther);
                  const formattedDate = r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString("fr-FR")
                    : r.submittedAt
                    ? new Date(r.submittedAt).toLocaleDateString("fr-FR")
                    : "récemment";

                  return {
                    id: notifId,
                    category: "LEAVE",
                    title: `Demande de congé — ${empName}`,
                    description: `Demande de type ${leaveTypeLabel} (${daysText}) soumise le ${formattedDate}. Statut : ${
                      isPending
                        ? "En attente de validation"
                        : r.status === "APPROVED"
                        ? "Approuvée"
                        : "Refusée"
                    }.`,
                    timestamp: formattedDate,
                    link: "/admin/requests",
                    unread: isPending && !readIds.has(notifId),
                    meta: `${r.requestNumber || r.id} • ${r.department || "Non renseigné"}`,
                  };
                })
                .filter((n: NotificationItem) => !dismissedIds.has(n.id));
              adminNotifs.push(...mapped);
            }
          }
        } catch (_) {}

        // 5. Opérations Financières (Dépôts et Retraits bancaires)
        try {
          const txRes = await fetch("/api/admin/financial-operations/transactions?limit=50");
          if (txRes.ok) {
            const txData = await txRes.json();
            const txList = Array.isArray(txData?.transactions) ? txData.transactions : [];
            if (isMounted && txList.length > 0) {
              const mappedTx: NotificationItem[] = txList
                .map((t: any) => {
                  const isDeposit = t.type === "DEPOSIT";
                  const sign = isDeposit ? "+" : "-";
                  const notifId = `tx-${t.id}`;
                  const amountStr = `${sign}${Number(t.amount || 0).toLocaleString("fr-FR")} ${t.currency || "HTG"}`;
                  return {
                    id: notifId,
                    category: "FINANCIAL",
                    title: `${isDeposit ? "Dépôt bancaire" : "Retrait bancaire"} effectué — ${amountStr}`,
                    description: `Transaction ${t.referenceNumber || t.id} enregistrée sur le compte « ${t.accountName || "Principal"} » (${t.bankName || "Banque"}). Motif : ${t.reason || "Sans motif"}. Effectué par : ${t.performedBy || "Direction"}.`,
                    timestamp: t.date
                      ? new Date(t.date).toLocaleDateString("fr-FR")
                      : t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString("fr-FR")
                      : "Récent",
                    link: "/admin/financial-operations",
                    unread: !readIds.has(notifId),
                    meta: `${t.referenceNumber || t.id} • ${t.branch || "Toutes succursales"}`,
                  };
                })
                .filter((n: NotificationItem) => !dismissedIds.has(n.id));
              adminNotifs.push(...mappedTx);
            }
          }
        } catch (_) {}

        // Tri : Non lues en premier
        adminNotifs.sort((a, b) => {
          if (a.unread && !b.unread) return -1;
          if (!a.unread && b.unread) return 1;
          return 0;
        });

        if (isMounted) {
          setNotifications(adminNotifs);
        }
      } catch (err) {
        console.warn("Could not load notifications:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadNotifications();

    const handleUpdate = () => {
      loadNotifications();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("rkonekte_notification_update", handleUpdate);
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("rkonekte_notification_update", handleUpdate);
      }
    };
  }, []);

  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const isEmployee =
    currentUserRole === "EMPLOYEE" ||
    currentUserRole === "COLLABORATEUR" ||
    currentUserRole === "CASHIER" ||
    currentUserRole === "CAISSIER" ||
    currentUserRole?.toLowerCase().includes("employ") ||
    currentUserRole?.toLowerCase().includes("collab") ||
    currentUserRole?.toLowerCase().includes("caissier") ||
    currentUserRole?.toLowerCase().includes("cashier") ||
    currentUserRole?.toLowerCase().includes("operat");

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => n.unread).length;
  }, [notifications]);

  const markAllAsRead = () => {
    try {
      const existing = new Set<string>(
        JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
      );
      notifications.forEach((n) => existing.add(n.id));
      localStorage.setItem("rkonekte_read_event_notifs", JSON.stringify(Array.from(existing)));
    } catch (_) {}
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const markSingleAsRead = (id: string) => {
    try {
      const existing = new Set<string>(
        JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
      );
      existing.add(id);
      localStorage.setItem("rkonekte_read_event_notifs", JSON.stringify(Array.from(existing)));
    } catch (_) {}
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );
  };

  const handleDeleteNotification = async (n: NotificationItem) => {
    const isApprovedLeave =
      n.category === "LEAVE" && n.description.includes("Approuvée");

    const confirmMessage = isApprovedLeave
      ? `Voulez-vous retirer cette notification d'approbation pour libérer votre espace ?\n\nRemarque importante : La demande reste validée et APPROUVÉE pour le collaborateur (elle ne sera pas supprimée de son espace personnel).`
      : `Voulez-vous supprimer cette notification pour libérer votre espace ?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    if (n.category === "LEAVE" && n.id.startsWith("leave-")) {
      const leaveId = n.id.replace("leave-", "");
      try {
        await fetch(`/api/admin/requests/${leaveId}`, { method: "DELETE" });
      } catch (_) {}
    }

    try {
      const dismissed = new Set<string>(
        JSON.parse(localStorage.getItem("rkonekte_dismissed_notifications") || "[]")
      );
      dismissed.add(n.id);
      localStorage.setItem("rkonekte_dismissed_notifications", JSON.stringify(Array.from(dismissed)));
    } catch (_) {}

    setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    showSystemToast(
      isApprovedLeave
        ? "Notification retirée de l'administration (la demande reste approuvée pour l'employé)."
        : "Notification supprimée de votre espace."
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("rkonekte_notification_update"));
    }
  };

  const clearAllNotifications = () => {
    if (
      !confirm(
        "Voulez-vous effacer toutes les alertes affichées pour libérer votre espace ?\n\n(Les demandes déjà approuvées restent valides et certifiées pour vos collaborateurs)."
      )
    ) {
      return;
    }

    try {
      const dismissed = new Set<string>(
        JSON.parse(localStorage.getItem("rkonekte_dismissed_notifications") || "[]")
      );
      notifications.forEach((item) => {
        dismissed.add(item.id);
        if (item.category === "LEAVE" && item.id.startsWith("leave-")) {
          const leaveId = item.id.replace("leave-", "");
          fetch(`/api/admin/requests/${leaveId}`, { method: "DELETE" }).catch(() => {});
        }
      });
      localStorage.setItem("rkonekte_dismissed_notifications", JSON.stringify(Array.from(dismissed)));
    } catch (_) {}

    setNotifications([]);
    showSystemToast("Toutes les notifications ont été effacées pour libérer votre espace.");

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("rkonekte_notification_update"));
    }
  };

  const filteredNotifications = useMemo(() => {
    if (isEmployee) {
      return notifications;
    }
    return notifications.filter((n) => {
      // Tab filter
      if (filterTab === "UNREAD" && !n.unread) return false;
      if (filterTab === "SYSTEM" && n.category !== "SYSTEM") return false;
      if (filterTab === "LEAVE" && n.category !== "LEAVE") return false;
      if (filterTab === "FINANCIAL" && n.category !== "FINANCIAL") return false;
      if (filterTab === "SALARY_RAISE" && n.category !== "SALARY_RAISE") return false;
      if (filterTab === "SIGNATURE" && n.category !== "SIGNATURE") return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          n.title.toLowerCase().includes(query) ||
          n.description.toLowerCase().includes(query) ||
          (n.meta && n.meta.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [notifications, filterTab, searchQuery, isEmployee]);

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Centre de Notifications
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {isEmployee
              ? "Alertes officielles, communications institutionnelles et décisions transmises par la Direction et l'Administration."
              : "Suivi en temps réel des demandes de congé, des arbitrages salariaux et des autorisations de signature."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start flex-wrap">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-3.5 py-2 bg-[#F4F6F9] hover:bg-slate-200/70 text-[#062653] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck className="w-4 h-4 text-[#FF7900]" />
              Tout marquer comme lu ({unreadCount})
            </button>
          )}
          {!isEmployee && notifications.length > 0 && (
            <button
              onClick={clearAllNotifications}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Supprimer toutes les notifications pour libérer l'espace"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              Tout effacer
            </button>
          )}
        </div>
      </div>

      {/* 2. TABS & SEARCH (Administrateur uniquement) */}
      {!isEmployee && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* TAB BUTTONS */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterTab("ALL")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "ALL"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Toutes ({notifications.length})
            </button>

            <button
              onClick={() => setFilterTab("UNREAD")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                filterTab === "UNREAD"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Non lues
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#FF7900]" />
              )}
            </button>

            <button
              onClick={() => setFilterTab("LEAVE")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "LEAVE"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Congés ({notifications.filter((n) => n.category === "LEAVE").length})
            </button>

            <button
              onClick={() => setFilterTab("FINANCIAL")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "FINANCIAL"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Finances ({notifications.filter((n) => n.category === "FINANCIAL").length})
            </button>

            <button
              onClick={() => setFilterTab("SALARY_RAISE")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "SALARY_RAISE"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Augmentations
            </button>

            <button
              onClick={() => setFilterTab("SIGNATURE")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "SIGNATURE"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Signatures
            </button>

            <button
              onClick={() => setFilterTab("SYSTEM")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                filterTab === "SYSTEM"
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:text-[#062653]"
              }`}
            >
              Abonnement & Système
            </button>
          </div>

          {/* SEARCH INPUT */}
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Rechercher une notification..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-3 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder-[#64748B] focus:bg-[#EEF2F6] outline-hidden transition-colors"
            />
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* 3. NOTIFICATIONS LIST */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <div className="w-6 h-6 border-2 border-[#FF7900] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[#64748B]">Chargement des alertes...</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[#FFF4EB] text-[#FF7900] flex items-center justify-center mx-auto mb-1">
                  <Bell className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#062653]">
                    {isEmployee
                      ? "Aucune alerte administrative pour le moment"
                      : "Aucune notification pour le moment"}
                  </h3>
                  <p className="text-xs text-[#64748B] max-w-md mx-auto">
                    {isEmployee
                      ? "Votre flux administratif est parfaitement à jour. Les communications, notes de service et alertes transmises par la Direction apparaîtront ici."
                      : "Votre flux est à jour. Aucune nouvelle demande ne requiert votre attention."}
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                n.unread
                  ? "bg-[#FFF8F2]"
                  : "bg-[#F4F6F9] opacity-95 hover:opacity-100"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* UNREAD INDICATOR */}
                <div className="pt-1 shrink-0">
                  {n.unread ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF7900] block ring-4 ring-[#FFF4EB]" />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200 block" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        n.category === "LEAVE"
                          ? "bg-[#062653] text-white"
                          : n.category === "FINANCIAL"
                          ? n.title.startsWith("Dépôt")
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-800"
                          : n.category === "SALARY_RAISE"
                          ? "bg-[#FFF4EB] text-[#FF7900]"
                          : n.category === "SIGNATURE"
                          ? "bg-emerald-50 text-emerald-800"
                          : n.category === "ADMIN_ANNOUNCEMENT"
                          ? "bg-[#062653] text-[#FF7900]"
                          : n.category === "HR_DECISION"
                          ? "bg-blue-50 text-blue-800"
                          : "bg-[#F4F6F9] text-[#263445]"
                      }`}
                    >
                      {n.category === "LEAVE"
                        ? "Congé"
                        : n.category === "FINANCIAL"
                        ? n.title.startsWith("Dépôt")
                          ? "Dépôt bancaire"
                          : "Retrait bancaire"
                        : n.category === "SALARY_RAISE"
                        ? "Augmentation"
                        : n.category === "SIGNATURE"
                        ? "Signature d'autorisation"
                        : n.category === "ADMIN_ANNOUNCEMENT"
                        ? "Communication officielle"
                        : n.category === "HR_DECISION"
                        ? "Décision RH"
                        : "Système"}
                    </span>
                    <h3 className="text-xs font-bold text-[#062653]">{n.title}</h3>
                    <span className="text-[11px] text-[#64748B]">• {n.timestamp}</span>
                  </div>

                  <p className="text-xs text-[#263445] font-medium leading-relaxed">
                    {n.description}
                  </p>

                  {n.meta && (
                    <div className="text-[11px] text-[#64748B] font-mono">
                      {n.meta}
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION LINKS */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {n.unread && (
                  <button
                    onClick={() => markSingleAsRead(n.id)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-[#64748B] hover:text-[#062653] hover:bg-[#F4F6F9] rounded-lg transition-colors cursor-pointer"
                  >
                    Marquer lu
                  </button>
                )}

                {n.link && (
                  <Link
                    href={n.link}
                    onClick={() => markSingleAsRead(n.id)}
                    className="px-3.5 py-1.5 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <span>Consulter</span>
                    <ExternalLink className="w-3 h-3 text-[#FF7900]" />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => handleDeleteNotification(n)}
                  className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                  title="Supprimer cette alerte pour libérer votre espace"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
