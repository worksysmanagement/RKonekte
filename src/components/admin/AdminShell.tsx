"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { SidebarProvider } from "./SidebarContext";
import { AdminHeader } from "./AdminHeader";
import { formatFrDate, SubscriptionStateSummary } from "@/lib/utils/subscription";

// Dynamically import AdminSidebar with ssr: false to prevent hydration mismatches
// from server-cached AST/HMR chunks or dynamic permission states.
const AdminSidebar = dynamic(
  () => import("./AdminSidebar").then((m) => m.AdminSidebar),
  {
    ssr: false,
    loading: () => (
      <aside className="w-64 bg-[#062653] text-[#F4F6F9] font-['Poppins',sans-serif] flex flex-col shrink-0 border-r border-[#031B3A] h-screen sticky top-0 overflow-hidden select-none" />
    ),
  }
);

interface AdminShellProps {
  role?: "SUPER_ADMIN" | "ORGANIZATION_ADMIN" | "EMPLOYEE" | string;
  organizationName?: string;
  userName?: string;
  userEmail?: string;
  userBranchId?: string | null;
  userBranchName?: string;
  initialSubscriptionSummary?: SubscriptionStateSummary | null;
  children: React.ReactNode;
}

export function AdminShell({
  role,
  organizationName,
  userName,
  userEmail,
  userBranchId,
  userBranchName,
  initialSubscriptionSummary = null,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [subscriptionSummary, setSubscriptionSummary] =
    useState<SubscriptionStateSummary | null>(initialSubscriptionSummary);

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isOrgAdmin = role === "ORGANIZATION_ADMIN";

  // Enforce immediate ejection if expired/stopped summary ever reaches the shell
  useEffect(() => {
    if (isSuperAdmin) return;
    if (
      subscriptionSummary?.isExpired ||
      subscriptionSummary?.serviceStopped ||
      subscriptionSummary?.isAccessBlocked
    ) {
      window.location.replace("/api/auth/stopped-redirect");
    }
  }, [isSuperAdmin, subscriptionSummary]);

  // Poll /api/auth/me on mount, window focus, and every 15s for non-SuperAdmin users:
  // 1) Immediately and brutally disconnect to /login?stopped=1 if subscription expired or SuperAdmin stopped service
  // 2) Keep the J-7 decrementing countdown live for ORGANIZATION_ADMIN
  useEffect(() => {
    if (isSuperAdmin) return;
    let active = true;

    const checkLiveStatus = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        if (data.serviceStopped) {
          window.location.replace("/login?stopped=1");
          return;
        }
        if (data.authenticated === false) {
          window.location.replace(data.accountInactive ? "/login?inactive=1" : "/login");
          return;
        }
        if (
          data.subscriptionSummary?.isExpired ||
          data.subscriptionSummary?.serviceStopped ||
          data.subscriptionSummary?.isAccessBlocked
        ) {
          window.location.replace("/api/auth/stopped-redirect");
          return;
        }
        if (data.subscriptionSummary) {
          setSubscriptionSummary(data.subscriptionSummary);
        }
      } catch (_) {}
    };

    checkLiveStatus();
    const intervalId = window.setInterval(checkLiveStatus, 15000);
    const onFocus = () => {
      checkLiveStatus();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkLiveStatus();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isSuperAdmin, pathname]);

  const showBanner =
    !isSuperAdmin &&
    isOrgAdmin &&
    subscriptionSummary?.shouldShowCountdownBanner &&
    !subscriptionSummary?.isExpired &&
    !subscriptionSummary?.serviceStopped &&
    !subscriptionSummary?.isAccessBlocked;

  const days = subscriptionSummary?.daysRemaining;

  const bannerHeadline =
    days === 0
      ? "Votre forfait expire aujourd'hui !"
      : `Votre abonnement se termine dans ${days} jour${days !== 1 ? "s" : ""}`;

  const bannerSub = `Échéance prévue le ${formatFrDate(subscriptionSummary?.subscriptionExpiresAt)}. Veuillez contacter l'administration RKonekte pour prolonger votre accès avant l'expiration.`;

  return (
    <SidebarProvider>
      <div className="flex h-screen print:h-auto print:block bg-white print:bg-white overflow-hidden print:overflow-visible text-[#263445]">
        <AdminSidebar role={role} organizationName={organizationName} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
          <AdminHeader
            userName={userName}
            userEmail={userEmail}
            role={role}
            organizationName={organizationName}
            userBranchId={userBranchId}
            userBranchName={userBranchName}
          />
          {showBanner && (
            <div className="print:hidden px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 text-amber-950">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#FF7900] text-white">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold flex items-center gap-2 flex-wrap">
                    <span>{bannerHeadline}</span>
                    {typeof days === "number" && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/80 text-amber-950">
                        J-{days}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 text-amber-900/90">
                    {bannerSub}
                  </p>
                </div>
              </div>
            </div>
          )}
          <main className="flex-1 overflow-y-auto print:overflow-visible print:p-0 print:bg-white p-4 sm:p-6 lg:p-8 bg-white">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
