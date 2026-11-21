"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Shield,
  CircleHelp,
  Mail,
  Copy,
  Check,
  ExternalLink,
  X,
  Calendar,
  Users,
  Settings,
  FileSignature,
  User,
  Lock,
  Bell,
  LayoutDashboard,
  Building2,
  PlusCircle,
  CreditCard,
  Sliders,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { ModuleKey, TabPermission } from "@/lib/types/roles";

interface AdminSidebarProps {
  role?: "SUPER_ADMIN" | "ORGANIZATION_ADMIN" | "EMPLOYEE" | string;
  organizationName?: string;
}

export function AdminSidebar({ role: initialRole, organizationName }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isCollapsed } = useSidebar();
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("rk_company_logo");
      if (cached) setLogo(cached);

      const handler = (e: any) => {
        if (e.detail?.logoUrl !== undefined) {
          setLogo(e.detail.logoUrl);
        }
      };
      window.addEventListener("rkonekte_organization_updated", handler);
      return () => window.removeEventListener("rkonekte_organization_updated", handler);
    }
  }, []);

  // Helper to check active state including query params when present
  const isLinkActive = (href: string) => {
    const [path, query] = href.split("?");
    if (query) {
      if (pathname !== path) return false;
      const targetParams = new URLSearchParams(query);
      for (const [key, val] of targetParams.entries()) {
        if (searchParams.get(key) !== val) return false;
      }
      return true;
    }

    if (href === "/admin/requests") {
      return (
        pathname === "/admin/requests" ||
        (pathname.startsWith("/admin/requests/") &&
          !pathname.startsWith("/admin/requests/signature-auth"))
      );
    }

    return (
      pathname === href ||
      (pathname.startsWith(href + "/") && href !== "/admin" && href !== "/super-admin")
    );
  };

  // Dynamic role & permissions synchronized from DB
  const [activeRole, setActiveRole] = useState(initialRole);
  const [permissions, setPermissions] = useState<Record<ModuleKey, TabPermission> | null>(null);

  useEffect(() => {
    setActiveRole(initialRole);
  }, [initialRole]);

  const fetchMyPermissions = () => {
    fetch("/api/admin/my-permissions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.role) {
          setActiveRole(data.role);
        }
        if (data?.permissions) {
          setPermissions(data.permissions);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchMyPermissions();
    if (typeof window !== "undefined") {
      const handler = () => fetchMyPermissions();
      window.addEventListener("rkonekte_permissions_updated", handler);
      return () => window.removeEventListener("rkonekte_permissions_updated", handler);
    }
  }, []);

  const role = activeRole;

  // Rôles stricts : 3 types de comptes
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isEmployee =
    role === "EMPLOYEE" ||
    role === "COLLABORATEUR" ||
    role === "CASHIER" ||
    role === "CAISSIER" ||
    (typeof role === "string" &&
      (role.toLowerCase().includes("employ") ||
        role.toLowerCase().includes("collab") ||
        role.toLowerCase().includes("caissier") ||
        role.toLowerCase().includes("cashier") ||
        (!role.toLowerCase().includes("admin") &&
          !role.toLowerCase().includes("pdg") &&
          role !== "SUPER_ADMIN" &&
          role !== "ORGANIZATION_ADMIN")));
  const isOrgAdmin = !isEmployee && (role === "ORGANIZATION_ADMIN" || isSuperAdmin);
  const isCashier = isEmployee;

  // Permissions dynamiques par onglet (respecte les cases cochées de l'utilisateur)
  const hasPerm = (key: ModuleKey, fallback: boolean) => {
    if (permissions && permissions[key] !== undefined) {
      return Boolean(permissions[key]?.view);
    }
    return fallback;
  };

  // Règles d'accès personnalisables par onglet :
  const canSeeDashboard = hasPerm("dashboard", isOrgAdmin);

  // 1. REQUETES (Congé, Signature d'autorisation pour tous ; Attribution de salaire STRICTEMENT pour Admin)
  const canSeeLeaves = true;
  const canSeeSignatureAuth = true;
  const canSeeSalaryRaise = !isEmployee && isOrgAdmin;
  const canSeeRequestsSection = hasPerm("requests", true);

  // 2. EMPLOYÉS
  const canSeeEmployeesList = isOrgAdmin || Boolean(permissions?.employees?.view);
  const canSeeNewEmployee = isOrgAdmin || Boolean(permissions?.employees?.create);
  const canSeeEmployeesSection = hasPerm("employees", isOrgAdmin);

  // 3. SUCCURSALES
  const canSeeBranchesList = isOrgAdmin || Boolean(permissions?.branches?.view);
  const canSeeNewBranch = isOrgAdmin || Boolean(permissions?.branches?.create);
  const canSeeBranchesSection = hasPerm("branches", isOrgAdmin);

  // 4. OPÉRATIONS FINANCIÈRES
  const canSeeAccounts = isOrgAdmin || Boolean(permissions?.financial_ops?.create);
  const canSeeBankReports = isOrgAdmin || Boolean(permissions?.financial_ops?.view);
  const canSeeFinances = hasPerm("financial_ops", isOrgAdmin);

  // 5. RAPPORTS FINANCIERS / SAISIE DE CAISSE (Synthèse & Rapports Consolidés STRICTEMENT pour Admin)
  const canSeeReportsSummary = !isEmployee && isOrgAdmin;
  const canSeeCashierEntry = true;
  const canSeeReports = hasPerm("financial_reports", isOrgAdmin);

  // 6. ÉVÉNEMENTS
  const canSeeEvents = hasPerm("events", true);

  // 7. ESPACE CLIENT
  const canSeeCustomerSpace = hasPerm("customer_space", isOrgAdmin);

  // 8. GESTION DES ACCÈS
  const canSeeUsersList = isOrgAdmin || Boolean(permissions?.users?.view);
  const canSeeRoles = false; // Sous-onglet Rôles & Permissions retiré car simplifié
  const canSeeSignatures = isOrgAdmin || Boolean(permissions?.users?.view);
  const canSeeAccess = hasPerm("users", isOrgAdmin);

  // 9. CENTRE DE NOTIFICATIONS
  const canSeeNotifications = hasPerm("notifications", true);

  // 10. ÉCHANGES ADMINISTRATIFS
  const canSeeBroadcast = hasPerm("broadcast", isOrgAdmin);

  // 11. CONFIGURATIONS
  const canSeeConfigGeneral = isOrgAdmin || Boolean(permissions?.configuration?.edit);
  const canSeeProfile = true;
  const canSeeSecurity = true;
  const canSeeConfig = hasPerm("configuration", true);

  // Active state flags
  const isDashboardActive = isLinkActive("/admin/dashboard");
  const isRequestsActive = pathname.startsWith("/admin/requests");
  const isEmployeesActive = pathname.startsWith("/admin/employees");
  const isBranchesActive = pathname.startsWith("/admin/branches");
  const isFinancesActive = pathname.startsWith("/admin/financial-operations");
  const isReportsActive = pathname.startsWith("/admin/financial-reports");
  const isEventsActive = pathname.startsWith("/admin/events");
  const isCustomerSpaceActive = pathname.startsWith("/admin/espace-client");
  const isAccessActive = pathname.startsWith("/admin/users");
  const isExchangesActive = pathname.startsWith("/admin/exchanges") || pathname.startsWith("/admin/broadcast");
  const isConfigActive = pathname.startsWith("/admin/configuration");
  const isGeneralPrefActive = pathname === "/admin/configuration";
  const isProfileActive = pathname.startsWith("/admin/configuration/profile");
  const isSecurityActive = pathname.startsWith("/admin/configuration/security");
  const isSupportActive = pathname.startsWith("/admin/support");

  const superAdminNavItems = [
    {
      href: "/super-admin",
      label: "Vue d'ensemble",
      icon: LayoutDashboard,
      active: pathname === "/super-admin",
    },
    {
      href: "/super-admin/organizations",
      label: "Entreprises clientes",
      icon: Building2,
      active:
        pathname === "/super-admin/organizations" ||
        (pathname.startsWith("/super-admin/organizations/") &&
          !pathname.startsWith("/super-admin/organizations/new")),
    },
    {
      href: "/super-admin/organizations/new",
      label: "Ajouter une entreprise",
      icon: PlusCircle,
      active:
        pathname === "/super-admin/organizations/new" ||
        pathname.startsWith("/super-admin/organizations/new/"),
    },
    {
      href: "/super-admin/admins",
      label: "Super Administrateurs",
      icon: Shield,
      active:
        pathname === "/super-admin/admins" ||
        pathname.startsWith("/super-admin/admins/"),
    },
    {
      href: "/super-admin/subscription-settings",
      label: "Tarifs & Comptes",
      icon: CreditCard,
      active:
        pathname === "/super-admin/subscription-settings" ||
        pathname.startsWith("/super-admin/subscription-settings/"),
    },
    {
      href: "/super-admin/revenue-sharing",
      label: "Partage des revenus",
      icon: Sliders,
      active:
        pathname === "/super-admin/revenue-sharing" ||
        pathname.startsWith("/super-admin/revenue-sharing/"),
    },
    {
      href: "/super-admin/broadcast",
      label: "Diffuser un message",
      icon: Mail,
      active:
        pathname === "/super-admin/broadcast" ||
        pathname.startsWith("/super-admin/broadcast/"),
    },
  ];

  // Accordion open/close state: strictly ONE menu open at a time
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (isRequestsActive) initial.requete = true;
    else if (isEmployeesActive) initial.employes = true;
    else if (isBranchesActive) initial.succursales = true;
    else if (isFinancesActive) initial.finances = true;
    else if (isReportsActive) initial.reports = true;
    else if (isAccessActive) initial.acces = true;
    else if (isConfigActive) initial.config = true;
    return initial;
  });

  // Keep ONLY the active section open when route changes (closes all others)
  useEffect(() => {
    if (isRequestsActive) setOpenMenus({ requete: true });
    else if (isEmployeesActive) setOpenMenus({ employes: true });
    else if (isBranchesActive) setOpenMenus({ succursales: true });
    else if (isFinancesActive) setOpenMenus({ finances: true });
    else if (isReportsActive) setOpenMenus({ reports: true });
    else if (isAccessActive) setOpenMenus({ acces: true });
    else if (isConfigActive) setOpenMenus({ config: true });
    else setOpenMenus({});
  }, [pathname]);

  const toggleMenu = (key: string) => {
    setOpenMenus((prev) => {
      const isCurrentlyOpen = Boolean(prev[key]);
      // If clicking on the currently open menu, collapse it
      if (isCurrentlyOpen) {
        return {};
      }
      // Otherwise, open ONLY the clicked menu (closes any other open menu)
      return { [key]: true };
    });
  };

  // Support Modal state & mail connection
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSupportMounted, setIsSupportMounted] = useState(false);
  useEffect(() => setIsSupportMounted(true), []);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSupportOpen(false);
    };
    if (isSupportOpen) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [isSupportOpen]);

  const supportEmail = "rkonekte509@gmail.com";
  const mailtoSubject = encodeURIComponent(
    `Demande de Support — ${organizationName || "Entreprise"}`
  );
  const mailtoBody = encodeURIComponent(
    `Bonjour l'équipe support RKonekte,\n\nEntreprise : ${organizationName || "Entreprise"}\n\nDescription de ma demande :\n`
  );
  const mailtoUrl = `mailto:${supportEmail}?subject=${mailtoSubject}&body=${mailtoBody}`;
  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${supportEmail}&su=${mailtoSubject}&body=${mailtoBody}`;

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(supportEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  return (
    <aside
      suppressHydrationWarning
      className={`bg-[#062653] text-[#F4F6F9] font-['Poppins',sans-serif] flex flex-col shrink-0 border-r border-[#031B3A] h-screen sticky top-0 overflow-hidden select-none transition-[width] duration-300 ease-in-out print:hidden ${
        isCollapsed ? "w-[72px]" : "w-64 sm:w-[270px]"
      }`}
    >
      {/* 1. TOP HEADER */}
      <div className="h-16 flex items-center justify-center px-3 bg-[#031B3A] border-b border-[#0D3E82]/40 shrink-0 text-center">
        {isCollapsed ? (
          !isSuperAdmin && logo ? (
            <div
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center p-1 select-none shadow-xs"
              title={organizationName || "Entreprise"}
            >
              <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" />
            </div>
          ) : isSuperAdmin ? (
            <div
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white font-extrabold text-sm select-none shadow-xs"
              title="Super Administration"
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
          ) : (
            <div
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white font-extrabold text-sm select-none shadow-xs"
              title={organizationName || "Entreprise"}
            >
              {(organizationName || "R").charAt(0).toUpperCase()}
            </div>
          )
        ) : (
          <div className="flex items-center justify-center gap-2 max-w-full px-2">
            {!isSuperAdmin && logo && (
              <img
                src={logo}
                alt="Logo"
                className="max-h-7 max-w-[36px] object-contain drop-shadow-xs"
              />
            )}
            <h2
              className="text-sm sm:text-base font-bold text-white truncate text-center"
              title={organizationName || (isSuperAdmin ? "Super Administration" : "Entreprise")}
            >
              {organizationName || (isSuperAdmin ? "Super Administration" : "Entreprise Connectée")}
            </h2>
          </div>
        )}
      </div>

      {/* 2. NAVIGATION */}
      {isSuperAdmin ? (
        isCollapsed ? (
          <nav className="flex-1 px-2.5 py-4 space-y-2 overflow-y-auto overflow-x-hidden">
            {superAdminNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                    item.active
                      ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-5 h-5 text-white shrink-0" />
                  <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="flex-1 px-3.5 py-4 space-y-1.5 overflow-y-auto">
            <div className="px-3.5 pt-1 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
              Vue d'ensemble
            </div>
            {superAdminNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                    item.active
                      ? "bg-white/15 font-bold shadow-xs"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5 text-white shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )
      ) : isCollapsed ? (
        /* COLLAPSED ICON-ONLY RAIL (Only icons remain, centered, with tooltips) */
        <nav className="flex-1 px-2.5 py-4 space-y-2 overflow-y-auto overflow-x-hidden">

          {/* TABLEAU DE BORD */}
          {canSeeDashboard && (
            <Link
              href="/admin/dashboard"
              title="Tableau de Bord"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isDashboardActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/dashboard.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Tableau de Bord
              </div>
            </Link>
          )}

          {/* REQUETE */}
          {canSeeRequestsSection && (
            <Link
              href="/admin/requests"
              title="Requete"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isRequestsActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/requests.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Requete
              </div>
            </Link>
          )}

          {/* EMPLOYÉS */}
          {canSeeEmployeesSection && (
            <Link
              href="/admin/employees"
              title="Employés"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isEmployeesActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/employees.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Employés
              </div>
            </Link>
          )}

          {/* SUCCURSALES */}
          {canSeeBranchesSection && (
            <Link
              href="/admin/branches"
              title="Succursales"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isBranchesActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/branches.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Succursales
              </div>
            </Link>
          )}

          {/* OPÉRATIONS FINANCIÈRES */}
          {canSeeFinances && (
            <Link
              href="/admin/financial-operations"
              title="Opérations Financieres"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isFinancesActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/financial-ops.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Opérations Financieres
              </div>
            </Link>
          )}

          {/* RAPPORTS FINANCIERS */}
          {canSeeReports && (
            <Link
              href={!isOrgAdmin || isEmployee ? "/admin/financial-reports?tab=entry" : "/admin/financial-reports?tab=reports"}
              title={!isOrgAdmin || isEmployee ? "Saisie de Caisse" : "Rapports Financiers"}
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isReportsActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/financial-reports.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                {!isOrgAdmin || isEmployee ? "Saisie de Caisse" : "Rapports Financiers"}
              </div>
            </Link>
          )}

          {/* ÉVÉNEMENTS */}
          {canSeeEvents && (
            <Link
              href="/admin/events"
              title="Événements"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isEventsActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/calendar-white.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Événements
              </div>
            </Link>
          )}

          {/* ÉCHANGES ADMINISTRATIFS */}
          {canSeeBroadcast && (
            <Link
              href="/admin/exchanges"
              title="Échanges administratifs"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isExchangesActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/exchanges.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Échanges administratifs
              </div>
            </Link>
          )}

          {/* ESPACE CLIENT */}
          {canSeeCustomerSpace && (
            <Link
              href="/admin/espace-client"
              title="Espace Client"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isCustomerSpaceActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Users className="w-5 h-5 shrink-0 text-white" />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Espace Client
              </div>
            </Link>
          )}

          {/* GESTIONS DES ACCÈS */}
          {canSeeAccess && (
            <Link
              href="/admin/users"
              title="Gestions des accès"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isAccessActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/access.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Gestions des accès
              </div>
            </Link>
          )}

          {/* Spacer */}
          <div className="my-2" />

          {/* CENTRE DE NOTIFICATIONS */}
          {canSeeNotifications && (
            <Link
              href="/admin/notifications"
              title="Centre de notifications"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isLinkActive("/admin/notifications")
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/notifications.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Centre de notifications
              </div>
            </Link>
          )}

          {/* CONFIGURATIONS */}
          {canSeeConfig && (
            <Link
              href={isEmployee ? "/admin/configuration/profile" : "/admin/configuration"}
              title="Configurations"
              className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isConfigActive
                  ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <img
                src="/icons/sidebar/config.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
                Configurations
              </div>
            </Link>
          )}

          {/* SUPPORT */}
          <Link
            href="/admin/support"
            title="Support & Manuel d'Utilisation"
            className={`w-11 h-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 relative group cursor-pointer ${
              isSupportActive
                ? "bg-white/15 text-white font-bold ring-1 ring-white/20 shadow-xs"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <CircleHelp className="w-5 h-5 shrink-0" />
            <div className="hidden group-hover:flex absolute left-full ml-3 px-2.5 py-1 bg-[#031B3A] text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center">
              Support & Manuel
            </div>
          </Link>
        </nav>
      ) : (
        /* 2. NAVIGATION: Menus Déroulants avec Sous-Onglets (100% White Theme, No Apricot) */
        <nav className="flex-1 px-3.5 py-4 space-y-3 overflow-y-auto">
        {/* SECTION 1: VUE D'ENSEMBLE (du haut jusqu'à Gestion des accès inclues) */}
        <div className="px-3.5 pt-1 pb-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
          Vue d'ensemble
        </div>

        {/* 1. TABLEAU DE BORD (Lien direct sans sous-menu) */}
        {canSeeDashboard && (
          <div>
            <Link
              href="/admin/dashboard"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isDashboardActive ? "bg-white/10 font-bold" : "text-slate-300 hover:text-white"
              }`}
            >
              <img
                src="/icons/sidebar/dashboard.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <span className="truncate">Tableau de Bord</span>
            </Link>
          </div>
        )}

        {/* 2. REQUETE */}
        {canSeeRequestsSection && (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("requete")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isRequestsActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/requests.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Requete</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.requete ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.requete && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeLeaves && (
                  <Link
                    href="/admin/requests"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/requests")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Congé
                  </Link>
                )}
                {canSeeSignatureAuth && (
                  <Link
                    href="/admin/requests/signature-auth"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/requests/signature-auth")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Signature d'autorisation
                  </Link>
                )}
                {canSeeSalaryRaise && (
                  <Link
                    href="/admin/requests/salary-raise"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/requests/salary-raise")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Attribution de salaire
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. EMPLOYÉS */}
        {canSeeEmployeesSection && (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("employes")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isEmployeesActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/employees.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Employés</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.employes ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.employes && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeEmployeesList && (
                  <Link
                    href="/admin/employees"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/employees") && !pathname.includes("/new")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Liste des employés
                  </Link>
                )}
                {canSeeNewEmployee && (
                  <Link
                    href="/admin/employees/new"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/employees/new")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Nouvel employé
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. SUCCURSALES */}
        {canSeeBranchesSection && (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("succursales")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isBranchesActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/branches.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Succursales</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.succursales ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.succursales && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeBranchesList && (
                  <Link
                    href="/admin/branches"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/branches") && !pathname.includes("/new")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Liste des succursales
                  </Link>
                )}
                {canSeeNewBranch && (
                  <Link
                    href="/admin/branches/new"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/branches/new")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Nouvelle succursale
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. OPÉRATIONS FINANCIÈRES */}
        {canSeeFinances && (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("finances")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isFinancesActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/financial-ops.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Opérations Financieres</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.finances ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.finances && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeAccounts && (
                  <Link
                    href="/admin/financial-operations?tab=accounts"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/financial-operations?tab=accounts")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Comptes bancaires
                  </Link>
                )}
                {canSeeBankReports && (
                  <Link
                    href="/admin/financial-operations?tab=report"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/financial-operations?tab=report")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Rapport des transactions
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* 6. RAPPORTS FINANCIERS (Admin) / SAISIE DE CAISSE (Employé) */}
        {!isEmployee && isOrgAdmin ? (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("reports")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isReportsActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/financial-reports.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Rapports Financiers</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.reports ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.reports && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeReportsSummary && (
                  <Link
                    href="/admin/financial-reports?tab=reports"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/financial-reports?tab=reports") ||
                      (pathname === "/admin/financial-reports" && (!searchParams.get("tab") || searchParams.get("tab") === "reports"))
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Synthèse & Rapports Consolidés
                  </Link>
                )}
                {canSeeCashierEntry && (
                  <Link
                    href="/admin/financial-reports?tab=entry"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      isLinkActive("/admin/financial-reports?tab=entry") ||
                      (pathname === "/admin/financial-reports" && searchParams.get("tab") === "entry")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Saisie de Caisse
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : canSeeReports ? (
          <div>
            <Link
              href="/admin/financial-reports?tab=entry"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isReportsActive ? "bg-white/10 font-bold" : "text-slate-300 hover:text-white"
              }`}
            >
              <img
                src="/icons/sidebar/financial-reports.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <span className="truncate">Saisie de Caisse</span>
            </Link>
          </div>
        ) : null}

        {/* ÉVÉNEMENTS */}
        {canSeeEvents && (
          <div>
            <Link
              href="/admin/events"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isEventsActive
                  ? "bg-white/10 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <img
                src="/icons/sidebar/calendar-white.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <span className="truncate">Événements</span>
            </Link>
          </div>
        )}

        {/* ÉCHANGES ADMINISTRATIFS */}
        {canSeeBroadcast && (
          <div>
            <Link
              href="/admin/exchanges"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isExchangesActive
                  ? "bg-white/10 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <img
                src="/icons/sidebar/exchanges.png"
                alt=""
                aria-hidden="true"
                className="w-5 h-5 object-contain shrink-0"
              />
              <span className="truncate">Échanges administratifs</span>
            </Link>
          </div>
        )}

        {/* ESPACE CLIENT */}
        {canSeeCustomerSpace && (
          <div>
            <Link
              href="/admin/espace-client"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isCustomerSpaceActive
                  ? "bg-white/10 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Users className="w-5 h-5 shrink-0 text-white" />
              <span className="truncate">Espace Client</span>
            </Link>
          </div>
        )}

        {/* 7. GESTION DES ACCÈS */}
        {canSeeAccess && (
          <div>
            <button
              type="button"
              onClick={() => toggleMenu("acces")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isAccessActive ? "bg-white/10 font-bold" : "bg-transparent"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <img
                  src="/icons/sidebar/access.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Gestions des accès</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                  openMenus.acces ? "rotate-180" : ""
                }`}
              />
            </button>
            {openMenus.acces && (
              <div className="mt-1.5 ml-4 pl-3 space-y-1">
                {canSeeUsersList && (
                  <Link
                    href="/admin/users"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      pathname === "/admin/users"
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Liste des utilisateurs
                  </Link>
                )}
                {canSeeSignatures && (
                  <Link
                    href="/admin/users/signatures"
                    className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      pathname.startsWith("/admin/users/signatures")
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Droits de signature
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: SYSTÈME (Notifications, Configurations, Support) */}
        <div className="pt-2 mt-4 space-y-3">
          <div className="px-3.5 pb-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
            Système
          </div>

          {/* NOTIFICATIONS */}
          {canSeeNotifications && (
            <div>
              <Link
                href="/admin/notifications"
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                  isLinkActive("/admin/notifications")
                    ? "bg-white/10 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <img
                  src="/icons/sidebar/notifications.png"
                  alt=""
                  aria-hidden="true"
                  className="w-5 h-5 object-contain shrink-0"
                />
                <span className="truncate">Centre de notifications</span>
              </Link>
            </div>
          )}

          {/* CONFIGURATIONS AVEC SOUS-ONGLETS */}
          {canSeeConfig && (
            <div>
              <button
                type="button"
                onClick={() => toggleMenu("config")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                  isConfigActive ? "bg-white/10 font-bold" : "bg-transparent"
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <img
                    src="/icons/sidebar/config.png"
                    alt=""
                    aria-hidden="true"
                    className="w-5 h-5 object-contain shrink-0"
                  />
                  <span className="truncate">Configurations</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-300 transition-transform duration-200 shrink-0 ml-1.5 ${
                    openMenus.config ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openMenus.config && (
                <div className="mt-1.5 ml-4 pl-3 space-y-1">
                  {!isEmployee && canSeeConfigGeneral && (
                    <Link
                      href="/admin/configuration"
                      className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        pathname === "/admin/configuration"
                          ? "bg-white/15 text-white font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Préférences générales
                    </Link>
                  )}
                  {canSeeProfile && (
                    <Link
                      href="/admin/configuration/profile"
                      className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        pathname.startsWith("/admin/configuration/profile")
                          ? "bg-white/15 text-white font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Mon dossier personnel
                    </Link>
                  )}
                  {canSeeSecurity && (
                    <Link
                      href="/admin/configuration/security"
                      className={`block px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        pathname.startsWith("/admin/configuration/security")
                          ? "bg-white/15 text-white font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Sécurité du compte
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUPPORT */}
          <div>
            <Link
              href="/admin/support"
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-semibold rounded-lg transition-colors text-white hover:bg-white/10 ${
                isSupportActive
                  ? "bg-white/10 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
              title="Centre d'Aide & Manuel d'Utilisation"
            >
              <CircleHelp className="w-5 h-5 shrink-0" />
              <span className="truncate">Support & Manuel</span>
            </Link>
          </div>
        </div>
      </nav>
      )}

      {/* 3. FIXED BOTTOM FOOTER: Only RK logo when collapsed */}
      {isCollapsed ? (
        <div className="py-3 px-2 bg-[#031B3A] border-t border-[#0D3E82]/40 shrink-0 flex items-center justify-center">
          <img
            src="/logo-rk-emblem.png"
            alt="RK"
            className="w-8 h-auto object-contain"
          />
        </div>
      ) : (
        <div className="py-2.5 px-3 bg-[#031B3A] border-t border-[#0D3E82]/40 shrink-0 flex flex-col items-center justify-center">
          <img
            src="/logo-rk-emblem.png"
            alt="RKonekte"
            className="h-8 w-auto max-w-[120px] object-contain"
          />
          <span className="text-[8px] text-slate-400 mt-1 uppercase tracking-widest font-semibold">
            {isSuperAdmin ? "Super-Administration" : "Gestion Digitalisée"}
          </span>
        </div>
      )}

      {/* 4. SUPPORT MODAL (Connecté à l'adresse mail officielle rkonekte509@gmail.com) */}
      {isSupportMounted && isSupportOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsSupportOpen(false)}
        >
          <div
            className="bg-white text-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#062653] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <CircleHelp className="w-5 h-5 text-[#FF7900]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Support & Requêtes Entreprises</h3>
                  <p className="text-[11px] text-slate-300">Plateforme officielle RKonekte</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSupportOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Pour toute demande d'assistance technique, requête administrative ou question relative à votre entreprise, notre équipe de support officiel est à votre disposition :
              </p>

              {/* Email Box with Copy */}
              <div className="bg-[#F4F6F9] rounded-xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Mail className="w-4 h-4 text-[#062653] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      E-mail de support officiel
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {supportEmail}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedEmail
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-slate-700 shadow-2xs hover:bg-slate-100"
                  }`}
                >
                  {copiedEmail ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copier</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2 pt-1">
                <a
                  href={gmailWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Ouvrir directement dans Gmail</span>
                </a>

                <a
                  href={mailtoUrl}
                  className="w-full py-2.5 px-4 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Ouvrir l'application de messagerie</span>
                </a>
              </div>

              <p className="text-[11px] text-slate-400 text-center pt-1">
                Délai habituel de réponse : sous 24h ouvrées.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
