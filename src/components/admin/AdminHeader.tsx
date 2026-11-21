"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Bell, Check, ExternalLink, ChevronDown, X } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { useSidebar, MenuDotsIcon, CloseTicksIcon } from "./SidebarContext";
import { LogoutConfirmModal } from "@/components/ui/LogoutConfirmModal";

interface AdminHeaderProps {
  userName?: string;
  userEmail?: string;
  role?: string;
  organizationName?: string;
  userBranchId?: string | null;
  userBranchName?: string;
}

interface HeaderBranch {
  id: string;
  name: string;
  city: string;
}

export function AdminHeader({
  userName,
  userEmail,
  role,
  organizationName,
  userBranchId,
  userBranchName,
}: AdminHeaderProps) {
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isOrgAdmin =
    role === "ORGANIZATION_ADMIN" ||
    (typeof role === "string" &&
      (role.toLowerCase().includes("admin") ||
        role.toLowerCase().includes("propriétaire") ||
        role.toLowerCase().includes("owner") ||
        role.toLowerCase().includes("direction")));

  // Only organization administrators can switch branch context; SuperAdmin doesn't use tenant branches
  const canChangeBranch = isOrgAdmin;

  const [availableBranches, setAvailableBranches] = useState<HeaderBranch[]>([
    { id: "all", name: "Toutes les succursales", city: "Consolidé" },
    ...(userBranchId && userBranchName
      ? [{ id: userBranchId, name: userBranchName, city: "" }]
      : []),
  ]);
  const [selectedBranch, setSelectedBranch] = useState(
    !canChangeBranch && userBranchId ? userBranchId : "all"
  );
  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Non-admins are locked to their assigned branch
  useEffect(() => {
    if (!isSuperAdmin && !canChangeBranch && userBranchId) {
      setSelectedBranch(userBranchId);
      if (typeof window !== "undefined") {
        localStorage.setItem("rk_active_branch", userBranchId);
        document.cookie = `rk_active_branch=${encodeURIComponent(userBranchId)}; path=/; max-age=31536000`;
        window.dispatchEvent(new CustomEvent("branchChange", { detail: { branchId: userBranchId } }));
      }
    }
  }, [canChangeBranch, userBranchId]);

  // Fetch dynamic branches from organization (tenant accounts only)
  useEffect(() => {
    if (isSuperAdmin) return;
    async function loadBranches() {
      try {
        const res = await fetch("/api/admin/branches");
        if (res.ok) {
          const data = await res.json();
          if (data.branches && Array.isArray(data.branches)) {
            const list: HeaderBranch[] = [
              { id: "all", name: "Toutes les succursales", city: "Consolidé" },
              ...data.branches.map((b: any) => ({
                id: b.id,
                name: b.name,
                city: b.city,
              })),
            ];
            setAvailableBranches(list);

            if (canChangeBranch) {
              // Restore saved branch or default to all for administrators
              const saved = typeof window !== "undefined" ? localStorage.getItem("rk_active_branch") : null;
              if (saved && list.some((b) => b.id === saved)) {
                setSelectedBranch(saved);
              } else {
                setSelectedBranch("all");
                if (typeof window !== "undefined") {
                  localStorage.setItem("rk_active_branch", "all");
                  document.cookie = "rk_active_branch=all; path=/; max-age=31536000";
                  window.dispatchEvent(new CustomEvent("branchChange", { detail: { branchId: "all" } }));
                }
              }
            } else if (userBranchId) {
              // Non-admins are strictly locked to their assigned branch
              setSelectedBranch(userBranchId);
              if (typeof window !== "undefined") {
                localStorage.setItem("rk_active_branch", userBranchId);
                document.cookie = `rk_active_branch=${encodeURIComponent(userBranchId)}; path=/; max-age=31536000`;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load header branches:", err);
      }
    }
    loadBranches();
  }, [canChangeBranch, isSuperAdmin, userBranchId]);

  const handleSelectBranch = (bId: string) => {
    setSelectedBranch(bId);
    setIsBranchOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("rk_active_branch", bId);
      document.cookie = `rk_active_branch=${encodeURIComponent(bId)}; path=/; max-age=31536000`;
      window.dispatchEvent(new CustomEvent("branchChange", { detail: { branchId: bId } }));
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setIsBranchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsBranchOpen(false);
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const currentBranch =
    availableBranches.find((b) => b.id === selectedBranch) ||
    (!canChangeBranch && userBranchName
      ? { id: userBranchId || selectedBranch, name: userBranchName, city: "" }
      : availableBranches[0]);

  interface HeaderNotification {
    id: string;
    title: string;
    time: string;
    type: string;
    link: string;
    unread: boolean;
  }

  // Real dynamic notifications (empty when no pending alerts in the system)
  const [notificationsList, setNotificationsList] = useState<HeaderNotification[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function fetchPendingNotifications() {
      if (isSuperAdmin) {
        if (isMounted) setNotificationsList([]);
        return;
      }

      try {
        const readIds = new Set<string>(
          JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
        );
        const dismissedIds = new Set<string>(
          JSON.parse(localStorage.getItem("rkonekte_dismissed_notifications") || "[]")
        );

        const [reqRes, txRes, evRes, meRes, exchRes] = await Promise.all([
          fetch("/api/admin/requests?limit=15"),
          fetch("/api/admin/financial-operations/transactions?limit=15").catch(() => null),
          fetch("/api/admin/events").catch(() => null),
          fetch("/api/auth/me", { cache: "no-store" }).catch(() => null),
          fetch("/api/admin/exchanges/received?limit=15").catch(() => null),
        ]);

        const combined: HeaderNotification[] = [];

        // Profil de l'utilisateur connecté pour exclure ses propres requêtes de ses notifications
        let currentUserId = "";
        let currentEmail = (userEmail || "").trim().toLowerCase();
        let currentFullName = (userName || "").trim().toLowerCase();
        let currentEmpNum = "";

        if (meRes && meRes.ok) {
          try {
            const meData = await meRes.clone().json();
            if (meData?.user) {
              if (meData.user.id) currentUserId = String(meData.user.id).toLowerCase();
              if (meData.user.email) currentEmail = String(meData.user.email).trim().toLowerCase();
              if (meData.user.name) currentFullName = String(meData.user.name).trim().toLowerCase();
              if (meData.user.employeeNumber) currentEmpNum = String(meData.user.employeeNumber).trim().toLowerCase();
            }
          } catch (_) {}
        }

        const isMyRequest = (r: any): boolean => {
          // 0. Vérification par identifiant
          if (currentUserId) {
            if (r.employeeId && String(r.employeeId).toLowerCase() === currentUserId) return true;
            if (r.userId && String(r.userId).toLowerCase() === currentUserId) return true;
          }

          // 1. Vérification par email (identifiant principal entre comptes)
          const rEmail = (r.contactEmail || "").trim().toLowerCase();
          if (rEmail && currentEmail) {
            return rEmail === currentEmail;
          }

          // 2. Vérification par matricule employé
          const rEmpNum = (r.employeeNumber || "").trim().toLowerCase();
          if (rEmpNum && currentEmpNum) {
            return rEmpNum === currentEmpNum;
          }

          // 3. Fallback uniquement si email et matricule sont absents
          const rFullName = `${r.firstName || ""} ${r.lastName || ""}`.trim().toLowerCase();
          const rEmpName = (r.employeeName || "").trim().toLowerCase();
          if (currentFullName) {
            if (rFullName && rFullName === currentFullName) return true;
            if (rEmpName && rEmpName === currentFullName) return true;
          }

          return false;
        };

        // 1. Alertes d'abonnement (Compte à rebours J-7)
        if (meRes && meRes.ok) {
          try {
            const meData = await meRes.json();
            const summary = meData?.subscriptionSummary;
            if (
              role === "ORGANIZATION_ADMIN" &&
              summary?.shouldShowCountdownBanner &&
              !summary?.isExpired &&
              !summary?.isAccessBlocked
            ) {
              const notifId = `sub-alert-${summary.subscriptionExpiresAt ?? "exp"}-${summary.daysRemaining ?? "none"}`;
              if (!dismissedIds.has(notifId)) {
                const title =
                  summary.daysRemaining === 0
                    ? "Votre plan se termine aujourd'hui (J-0)"
                    : `Votre plan se termine dans ${summary.daysRemaining} jour${summary.daysRemaining > 1 ? "s" : ""} (J-${summary.daysRemaining})`;
                combined.push({
                  id: notifId,
                  title,
                  time: `J-${summary.daysRemaining ?? 0}`,
                  type: "Abonnement",
                  link: "/admin/notifications",
                  unread: !readIds.has(notifId),
                });
              }
            }
          } catch (_) {}
        }

        // 2. Demandes de congé (Nouvelles soumissions & suivi)
        if (reqRes && reqRes.ok) {
          try {
            const data = await reqRes.json();
            const rawRequests = Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data?.requests)
              ? data.requests
              : [];

            rawRequests
              .filter((r: any) => {
                if (r.decisionComment?.includes("[ADMIN_ARCHIVED]")) return false;
                // Exclure les requêtes effectuées par le compte de l'utilisateur connecté
                if (isMyRequest(r)) return false;
                return true;
              })
              .slice(0, 8)
              .forEach((r: any) => {
                const empName =
                  r.employeeName ||
                  `${r.firstName || ""} ${r.lastName || ""}`.trim() ||
                  "Employé";
                const notifId = `leave-${r.id}`;
                if (dismissedIds.has(notifId)) return;
                const isPending = r.status === "PENDING";
                combined.push({
                  id: notifId,
                  title: `Demande de congé — ${empName}`,
                  time: r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString("fr-FR")
                    : r.submittedAt
                    ? new Date(r.submittedAt).toLocaleDateString("fr-FR")
                    : "Récent",
                  type: isPending ? "En attente" : r.status === "APPROVED" ? "Approuvée" : "Refusée",
                  link: "/admin/requests",
                  unread: isPending && !readIds.has(notifId),
                });
              });
          } catch (_) {}
        }

        // 3. Opérations Financières (Chaque dépôt et retrait effectué)
        if (txRes && txRes.ok) {
          try {
            const txData = await txRes.json();
            const txList = Array.isArray(txData?.transactions) ? txData.transactions : [];
            txList.slice(0, 8).forEach((t: any) => {
              const isDeposit = t.type === "DEPOSIT";
              const sign = isDeposit ? "+" : "-";
              const notifId = `tx-${t.id}`;
              if (dismissedIds.has(notifId)) return;
              const amountStr = `${sign}${Number(t.amount || 0).toLocaleString("fr-FR")} ${t.currency || "HTG"}`;
              combined.push({
                id: notifId,
                title: `${isDeposit ? "Dépôt" : "Retrait"} effectué — ${amountStr}`,
                time: t.date
                  ? new Date(t.date).toLocaleDateString("fr-FR")
                  : t.createdAt
                  ? new Date(t.createdAt).toLocaleDateString("fr-FR")
                  : "Récent",
                type: isDeposit ? "Dépôt bancaire" : "Retrait bancaire",
                link: "/admin/financial-operations",
                unread: !readIds.has(notifId),
              });
            });
          } catch (_) {}
        }

        // 4. Événements et planifications officielles
        if (evRes && evRes.ok) {
          try {
            const evData = await evRes.json();
            const alertEvents = (Array.isArray(evData?.events) ? evData.events : [])
              .filter((ev: any) => !ev.isPersonal && ev.notifyImmediate !== false)
              .slice(0, 5);

            alertEvents.forEach((ev: any) => {
              const notifId = `ev-${ev.id}`;
              combined.push({
                id: notifId,
                title: `Planification — ${ev.title}`,
                time: ev.date || "À venir",
                type: ev.audienceTargetName || "Administration",
                link: "/admin/events",
                unread: !readIds.has(notifId),
              });
            });
          } catch (_) {}
        }

        // 5. Échanges administratifs (Documents reçus)
        if (exchRes && exchRes.ok) {
          try {
            const exchData = await exchRes.json();
            const docs = Array.isArray(exchData?.documents) ? exchData.documents : [];
            docs.slice(0, 8).forEach((d: any) => {
              const notifId = `exch-${d.recipientRecordId}`;
              if (dismissedIds.has(notifId)) return;
              const formattedDate = d.createdAt
                ? new Date(d.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Récent";
              const isUnread = d.status !== "VIEWED";
              combined.push({
                id: notifId,
                title: `Document reçu — ${d.fileName}`,
                time: formattedDate,
                type: isUnread ? "Nouveau document" : "Échanges administratifs",
                link: `/admin/exchanges?docId=${d.documentId}`,
                unread: isUnread && !readIds.has(notifId),
              });
            });
          } catch (_) {}
        }

        // Tri : Non lues en priorité
        combined.sort((a, b) => {
          if (a.unread && !b.unread) return -1;
          if (!a.unread && b.unread) return 1;
          return 0;
        });

        if (isMounted) {
          setNotificationsList(combined);
        }
      } catch (err) {
        console.warn("Notifications fetch error:", err);
      }
    }

    fetchPendingNotifications();

    const handleUpdate = () => {
      fetchPendingNotifications();
    };
    window.addEventListener("rkonekte_notification_update", handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("rkonekte_notification_update", handleUpdate);
    };
  }, [role]);

  const unreadCount = notificationsList.filter((n) => n.unread).length;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setShowLogoutConfirm(false);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
      setIsLoggingOut(false);
    }
  };

  const markAllAsRead = () => {
    try {
      const existing = new Set<string>(
        JSON.parse(localStorage.getItem("rkonekte_read_event_notifs") || "[]")
      );
      notificationsList.forEach((n) => existing.add(n.id));
      localStorage.setItem("rkonekte_read_event_notifs", JSON.stringify(Array.from(existing)));
    } catch (_) {}
    setNotificationsList((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-[#DCE2EA] px-6 flex items-center justify-between shrink-0 sticky top-0 z-20 print:hidden">
      {/* 1. LEFT SECTION: Sidebar Toggle Button, System Title & Active Branch Selector */}
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Sidebar Toggle Button (Menu 4-dots / Close 4-ticks + Ctrl+B) */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={isCollapsed ? "Ouvrir la barre latérale (Ctrl+B)" : "Fermer la barre latérale (Ctrl+B)"}
          aria-label={isCollapsed ? "Ouvrir la barre latérale" : "Fermer la barre latérale"}
          className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-full bg-[#F4F6F9] hover:bg-slate-200/80 text-[#263445] transition-all shadow-2xs hover:shadow-xs active:scale-95 group cursor-pointer"
        >
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-xs text-[#062653] group-hover:text-[#FF7900] transition-colors shrink-0">
            {isCollapsed ? (
              <MenuDotsIcon className="w-3.5 h-3.5" />
            ) : (
              <CloseTicksIcon className="w-3.5 h-3.5" />
            )}
          </div>
          <span className="text-xs font-bold text-[#062653] hidden sm:inline">
            {isCollapsed ? "Menu" : "Fermer"}
          </span>
          <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-500 bg-white rounded-md shadow-2xs">
            Ctrl B
          </kbd>
        </button>


        {/* Branch Selector (Hidden for SUPER_ADMIN; Only Org Admin can change branches; read-only for employees/cashiers) */}
        {!isSuperAdmin && (
        <div className="relative flex items-center gap-2" ref={branchRef}>
          <span className="text-xs font-semibold text-[#64748B] hidden md:inline">
            Succursale :
          </span>
          {canChangeBranch ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsBranchOpen(!isBranchOpen)}
                className={`h-9 px-3 bg-[#F4F6F9] hover:bg-slate-200/70 rounded-xl text-xs font-semibold text-[#062653] flex items-center gap-2 transition-all cursor-pointer ${
                  isBranchOpen ? "ring-2 ring-[#062653]/15 bg-white shadow-xs" : ""
                }`}
                title="Changer la succursale active (réservé aux administrateurs)"
              >
                <span>{currentBranch.name} ({currentBranch.city})</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#64748B] transition-transform duration-200 ${isBranchOpen ? "rotate-180" : ""}`} />
              </button>

              {isBranchOpen && (
                <div
                  role="listbox"
                  className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150 overflow-hidden"
                >
                  {availableBranches.map((b) => {
                    const isSelected = selectedBranch === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectBranch(b.id)}
                        className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#062653] text-white font-bold"
                            : "text-[#263445] hover:bg-slate-100 font-medium"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{b.name}</span>
                          <span className={`text-[10px] ${isSelected ? "text-slate-300" : "text-[#64748B]"}`}>
                            {b.city}
                          </span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                  {availableBranches.length <= 1 && (
                    <div className="px-3.5 py-2 text-[11px] text-[#64748B] border-t border-slate-100">
                      Aucune succursale enregistrée
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              className="h-9 px-3 bg-[#F4F6F9] rounded-xl text-xs font-semibold text-[#062653] flex items-center gap-2 select-none cursor-default"
              title="Votre succursale d'affectation (seul un administrateur peut modifier votre affectation)"
            >
              <span>
                {userBranchName
                  ? userBranchName
                  : currentBranch && currentBranch.id !== "all"
                  ? `${currentBranch.name}${currentBranch.city ? ` (${currentBranch.city})` : ""}`
                  : "Aucune succursale"}
              </span>
            </div>
          )}
        </div>
        )}
      </div>

      {/* 2. RIGHT SECTION: Notifications & User Profile */}
      <div className="flex items-center gap-4">
        {/* Notifications Button & Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-[#64748B] hover:text-[#062653] hover:bg-[#F4F6F9] rounded-lg transition-colors relative cursor-pointer"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF7900] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl p-4 z-50 animate-fadeIn border border-[#DCE2EA]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="text-xs font-bold text-[#062653]">
                  Notifications {unreadCount > 0 ? `(${unreadCount} non lue${unreadCount > 1 ? "s" : ""})` : "(0)"}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[11px] font-semibold text-[#FF7900] hover:underline cursor-pointer"
                    >
                      Tout marquer comme lu
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="p-1 text-slate-400 hover:text-[#062653] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    title="Fermer (Échap)"
                    aria-label="Fermer les notifications"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="py-2 space-y-2 max-h-64 overflow-y-auto">
                {notificationsList.length === 0 ? (
                  <div className="py-7 px-3 text-center">
                    <div className="w-10 h-10 mx-auto rounded-full bg-[#F4F6F9] flex items-center justify-center text-[#64748B] mb-2.5">
                      <Bell className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-xs font-bold text-[#062653]">Aucune notification</p>
                    <p className="text-[11px] text-[#64748B] mt-0.5">Toutes vos alertes sont à jour.</p>
                  </div>
                ) : (
                  notificationsList.map((n) => (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => setShowNotifications(false)}
                      className={`block p-2.5 rounded-lg transition-colors ${
                        n.unread
                          ? "bg-[#FFF4EB] hover:bg-[#FFEADA]"
                          : "bg-[#F4F6F9] hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#263445]">{n.title}</span>
                        <span className="text-[10px] text-[#64748B]">{n.time}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center justify-between">
                        <span>Type : {n.type}</span>
                        <span className="text-[10px] font-semibold text-[#FF7900] flex items-center gap-1">
                          Consulter <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              {!isSuperAdmin && (
                <div className="pt-2 border-t border-[#DCE2EA] text-center">
                  <Link
                    href="/admin/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs font-bold text-[#062653] hover:text-[#FF7900] transition-colors"
                  >
                    Voir toutes les notifications →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Info */}
        <div className="flex items-center gap-3 pl-3 border-l border-[#DCE2EA]">
          {isSuperAdmin ? (
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-[#263445] leading-none">
                {userName || "Super Administrateur"}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                {userEmail || ""}
              </div>
            </div>
          ) : (
            <Link
              href="/admin/configuration?tab=profile"
              className="text-right hidden sm:block group cursor-pointer"
              title="Consulter et compléter mon dossier personnel"
            >
              <div className="text-xs font-bold text-[#263445] group-hover:text-[#FF7900] transition-colors leading-none">
                {userName || "Collaborateur"}
              </div>
              <div className="text-[11px] text-[#64748B] group-hover:text-[#263445] transition-colors mt-1">
                {userEmail || ""}
              </div>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="p-2 text-[#64748B] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </header>

      <LogoutConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        userName={userName}
        userEmail={userEmail}
        isLoggingOut={isLoggingOut}
      />
    </>
  );
}
