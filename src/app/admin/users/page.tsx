"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  AlertCircle,
  Shield,
  Edit2,
  Sliders,
  Check,
  X,
  Mail,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { showSystemToast } from "@/components/ui/SystemToast";
import { RoleModel, ModuleKey, HIERARCHY_LABELS } from "@/lib/types/roles";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  permissions?: string | null;
  createdAt: number;
}

interface TabDefinition {
  key: ModuleKey;
  label: string;
  category: "Général" | "Opérations" | "Administration" | "Personnel";
  description: string;
  iconSrc?: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultAdmin: boolean;
  defaultEmployee: boolean;
}

const AVAILABLE_TABS: TabDefinition[] = [
  {
    key: "dashboard",
    label: "Tableau de Bord",
    category: "Général",
    description: "Indicateurs clés de performance, statistiques en temps réel et vision globale.",
    iconSrc: "/icons/sidebar/dashboard.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "requests",
    label: "Requêtes & Demandes",
    category: "Opérations",
    description: "Demandes de congés, signatures d'autorisations et attribution de salaires.",
    iconSrc: "/icons/sidebar/requests.png",
    defaultAdmin: true,
    defaultEmployee: true,
  },
  {
    key: "employees",
    label: "Gestion des Employés",
    category: "Administration",
    description: "Liste des collaborateurs, contrats de travail, fiches RH et invitations.",
    iconSrc: "/icons/sidebar/employees.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "branches",
    label: "Succursales",
    category: "Administration",
    description: "Gestion des agences physiques, implantations et affectations du personnel.",
    iconSrc: "/icons/sidebar/branches.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "financial_ops",
    label: "Opérations Financières",
    category: "Opérations",
    description: "Comptes bancaires, dépôts, retraits et écritures financières d'entreprise.",
    iconSrc: "/icons/sidebar/financial-ops.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "financial_reports",
    label: "Rapports Financiers & Saisie de Caisse",
    category: "Opérations",
    description: "Saisie quotidienne de caisse par les caissiers et synthèses financières consolidées.",
    iconSrc: "/icons/sidebar/financial-reports.png",
    defaultAdmin: true,
    defaultEmployee: true,
  },
  {
    key: "events",
    label: "Événements & Calendrier",
    category: "Général",
    description: "Agenda d'entreprise, réunions générales, diffusions et dates importantes.",
    iconSrc: "/icons/sidebar/calendar-white.png",
    defaultAdmin: true,
    defaultEmployee: true,
  },
  {
    key: "broadcast",
    label: "Échanges administratifs",
    category: "Administration",
    description: "Transmission sécurisée et suivi de consultation des documents entre administrateurs.",
    iconSrc: "/icons/sidebar/exchanges.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "customer_space",
    label: "Espace Client & Partenaires",
    category: "Opérations",
    description: "Fiches clients, carnet de contacts et suivi des relations partenaires.",
    icon: Users,
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "users",
    label: "Gestion des accès & Rôles",
    category: "Administration",
    description: "Attribution des rôles système, modification des permissions et signatures.",
    iconSrc: "/icons/sidebar/access.png",
    defaultAdmin: true,
    defaultEmployee: false,
  },
  {
    key: "notifications",
    label: "Centre de Notifications",
    category: "Général",
    description: "Historique d'activité, alertes directes et centre de notifications d'entreprise.",
    iconSrc: "/icons/sidebar/notifications.png",
    defaultAdmin: true,
    defaultEmployee: true,
  },
  {
    key: "configuration",
    label: "Configurations & Sécurité",
    category: "Personnel",
    description: "Profil personnel, changement de mot de passe et préférences système.",
    iconSrc: "/icons/sidebar/config.png",
    defaultAdmin: true,
    defaultEmployee: true,
  },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrateur",
  ORGANIZATION_ADMIN: "Administrateur",
  EMPLOYEE: "Employé / Collaborateur",
  ADMINISTRATEUR: "Administrateur",
  COLLABORATEUR: "Employé / Collaborateur",
  CASHIER: "Employé / Collaborateur",
  CAISSIER: "Employé / Collaborateur",
  SECRETARY: "Employé / Collaborateur",
  RH: "Administrateur",
  FINANCIAL_MANAGER: "Administrateur",
  BRANCH_MANAGER: "Administrateur",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [orgRoles, setOrgRoles] = useState<RoleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Edit System Role & Tabs Drawer state
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("ORGANIZATION_ADMIN");
  const [selectedTabs, setSelectedTabs] = useState<Record<ModuleKey, boolean>>({
    dashboard: true,
    requests: true,
    employees: true,
    branches: true,
    financial_ops: true,
    financial_reports: true,
    events: true,
    customer_space: true,
    users: true,
    notifications: true,
    configuration: true,
    broadcast: true,
  });
  const [savingRole, setSavingRole] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/roles"),
      ]);
      const data = await usersRes.json();
      if (data.users) {
        setUsers(data.users);
      }
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        if (Array.isArray(rolesData.roles)) {
          setOrgRoles(rolesData.roles);
        }
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Lock body scroll and handle Escape key when drawer is open
  useEffect(() => {
    if (editingUser) {
      document.body.style.overflow = "hidden";
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !savingRole) closeEditRoleModal();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        document.body.style.overflow = "unset";
        window.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [editingUser, savingRole]);

  const customRoles = useMemo(
    () => orgRoles.filter((r) => !r.isSystem),
    [orgRoles]
  );

  const resolveRoleLabel = (roleValue: string) => {
    if (ROLE_LABELS[roleValue]) return ROLE_LABELS[roleValue];
    const customMatch = customRoles.find(
      (r) =>
        r.name.toLowerCase() === roleValue.toLowerCase() ||
        r.id.toLowerCase() === roleValue.toLowerCase()
    );
    return customMatch ? customMatch.name : roleValue;
  };

  const applyRoleDefaults = (role: string) => {
    const isTargetAdmin =
      role === "ORGANIZATION_ADMIN" ||
      role === "ADMINISTRATEUR" ||
      role === "PDG";

    const nextTabs: Record<ModuleKey, boolean> = {} as any;
    AVAILABLE_TABS.forEach((tab) => {
      nextTabs[tab.key] = isTargetAdmin ? tab.defaultAdmin : tab.defaultEmployee;
    });
    setSelectedTabs(nextTabs);
  };

  const setAllTabs = (granted: boolean) => {
    const nextTabs: Record<ModuleKey, boolean> = {} as any;
    AVAILABLE_TABS.forEach((tab) => {
      nextTabs[tab.key] = granted;
    });
    setSelectedTabs(nextTabs);
  };

  const toggleTab = (key: ModuleKey) => {
    setSelectedTabs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const openEditRoleModal = (u: UserItem) => {
    if (u.role === "SUPER_ADMIN") {
      showSystemToast(
        "Le rôle Super Administrateur ne peut pas être modifié depuis cet espace.",
        "error"
      );
      return;
    }

    let initialRole = u.role === "CAISSIER" ? "CASHIER" : u.role;
    const matchedCustom = customRoles.find(
      (r) =>
        r.id.toLowerCase() === u.role.toLowerCase() ||
        r.name.toLowerCase() === u.role.toLowerCase()
    );
    if (matchedCustom) {
      initialRole = matchedCustom.name;
    }

    // Initialize tabs state from user.permissions or role defaults
    const initialTabs: Record<ModuleKey, boolean> = {} as any;
    let parsedPerms: any = null;
    if (u.permissions) {
      try {
        parsedPerms =
          typeof u.permissions === "string"
            ? JSON.parse(u.permissions)
            : u.permissions;
      } catch (_) {}
    }

    const isTargetAdmin =
      initialRole === "ORGANIZATION_ADMIN" ||
      initialRole === "ADMINISTRATEUR" ||
      initialRole === "PDG";

    AVAILABLE_TABS.forEach((tab) => {
      if (parsedPerms && parsedPerms[tab.key] !== undefined) {
        initialTabs[tab.key] = Boolean(parsedPerms[tab.key]?.view);
      } else {
        initialTabs[tab.key] = isTargetAdmin ? tab.defaultAdmin : tab.defaultEmployee;
      }
    });

    setEditingUser(u);
    setSelectedRole(initialRole);
    setSelectedTabs(initialTabs);
    setModalError(null);
  };

  const closeEditRoleModal = () => {
    if (savingRole) return;
    setEditingUser(null);
    setModalError(null);
  };

  const handleSaveRole = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingUser || !selectedRole) return;

    setSavingRole(true);
    setModalError(null);
    try {
      // Build permissions payload
      const permissionsMap: Record<string, any> = {};
      AVAILABLE_TABS.forEach((tab) => {
        const isGranted = Boolean(selectedTabs[tab.key]);
        permissionsMap[tab.key] = {
          view: isGranted,
          create:
            isGranted &&
            (selectedRole === "ORGANIZATION_ADMIN" ||
              tab.key === "requests" ||
              tab.key === "financial_reports"),
          edit:
            isGranted &&
            (selectedRole === "ORGANIZATION_ADMIN" ||
              tab.key === "requests" ||
              tab.key === "configuration"),
          delete: isGranted && selectedRole === "ORGANIZATION_ADMIN",
        };
      });

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          permissions: permissionsMap,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModalError(
          data.error || "Impossible de mettre à jour le rôle et les accès."
        );
        return;
      }

      const updatedRole = data.user?.role || selectedRole;
      const updatedPerms =
        data.user?.permissions || JSON.stringify(permissionsMap);

      setUsers((prev) =>
        prev.map((item) =>
          item.id === editingUser.id
            ? { ...item, role: updatedRole, permissions: updatedPerms }
            : item
        )
      );

      showSystemToast(
        `Les accès et onglets de ${editingUser.name} ont été enregistrés avec succès.`,
        "success"
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rkonekte_permissions_updated"));
      }

      setEditingUser(null);
    } catch (_) {
      setModalError("Erreur réseau lors de la mise à jour des accès.");
    } finally {
      setSavingRole(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRole =
        roleFilter === "ALL" ||
        u.role === roleFilter ||
        (roleFilter === "CASHIER" && u.role === "CAISSIER");
      const matchStatus = statusFilter === "ALL" || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const activeTabsCount = useMemo(() => {
    return Object.values(selectedTabs).filter(Boolean).length;
  }, [selectedTabs]);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Liste des utilisateurs
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Gestion des comptes d'accès, affectation des rôles et contrôle des onglets accordés.
          </p>
        </div>

        <Link
          href="/admin/employees"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-2 self-start cursor-pointer"
        >
          <Users className="w-4 h-4 text-white" />
          Habiliter un employé
        </Link>
      </div>

      {/* 2. SEARCH & FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Rechercher par nom, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder-[#64748B] focus:bg-white transition-colors"
          />
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#64748B]">Rôle :</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 bg-[#F4F6F9] rounded-lg text-xs font-semibold text-[#263445] focus:bg-white transition-colors"
            >
              <option value="ALL">Tous les rôles</option>
              <option value="ORGANIZATION_ADMIN">Administrateur</option>
              <option value="EMPLOYEE">Employé / Collaborateur</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#64748B]">Statut :</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 bg-[#F4F6F9] rounded-lg text-xs font-semibold text-[#263445] focus:bg-white transition-colors"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Actif</option>
              <option value="DISABLED">Désactivé</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. TABLE OF USERS */}
      <div className="bg-white rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            Chargement des utilisateurs...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            Aucun utilisateur ne correspond aux filtres.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6F9] border-b border-slate-200 text-[#062653] font-bold">
                  <th className="px-5 py-3">Utilisateur</th>
                  <th className="px-5 py-3">Rôle système</th>
                  <th className="px-5 py-3">Onglets accordés</th>
                  <th className="px-5 py-3">Statut</th>
                  <th className="px-5 py-3">Créé le</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredUsers.map((u) => {
                  const isSuperAdminTarget = u.role === "SUPER_ADMIN";
                  let grantedCount = 11;
                  if (u.permissions) {
                    try {
                      const p =
                        typeof u.permissions === "string"
                          ? JSON.parse(u.permissions)
                          : u.permissions;
                      grantedCount = Object.values(p).filter(
                        (item: any) => Boolean(item?.view)
                      ).length;
                    } catch (_) {}
                  } else if (u.role === "EMPLOYEE" || u.role === "COLLABORATEUR") {
                    grantedCount = 5;
                  }

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#062653] text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-[#062653]">{u.name}</div>
                            <div className="text-[11px] text-[#64748B] font-mono">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-[#062653]">
                        {resolveRoleLabel(u.role)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {grantedCount} / {AVAILABLE_TABS.length} onglets
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={u.status} size="sm" />
                      </td>
                      <td className="px-5 py-3.5 text-[#64748B]">
                        {new Date(u.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openEditRoleModal(u)}
                          disabled={isSuperAdminTarget}
                          title={
                            isSuperAdminTarget
                              ? "Rôle Super Administrateur protégé"
                              : "Modifier les accès et les onglets accordés"
                          }
                          aria-label={`Gérer les onglets de ${u.name}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isSuperAdminTarget
                              ? "text-[#94A3B8] opacity-40 cursor-not-allowed bg-slate-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200/80 cursor-pointer shadow-2xs"
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Gérer les onglets</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. RIGHT-SIDE SLIDE-OVER DRAWER */}
      {editingUser && (
        <div className="fixed inset-0 z-50 overflow-hidden font-['Poppins',sans-serif]">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
            onClick={closeEditRoleModal}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-md sm:max-w-xl md:max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 animate-in slide-in-from-right duration-300">
              {/* Header */}
              <div className="px-6 py-5 bg-[#062653] text-white flex items-center justify-between shrink-0 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                    <Sliders className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold tracking-tight">
                      Gérer les accès & onglets
                    </h2>
                    <p className="text-xs text-slate-300">
                      Personnalisez les onglets accordés et visibles pour cet utilisateur
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEditRoleModal}
                  disabled={savingRole}
                  aria-label="Fermer"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* User Info Card */}
                <div className="bg-[#F4F6F9] rounded-2xl p-4 border border-slate-200/80">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-[#062653] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                        {editingUser.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#062653] truncate">
                          {editingUser.name}
                        </div>
                        <div className="text-xs text-[#64748B] font-mono truncate">
                          {editingUser.email}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={editingUser.status} size="sm" />
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#64748B] font-medium">Rôle actuel en base :</span>
                    <span className="font-bold text-[#062653]">
                      {resolveRoleLabel(editingUser.role)}
                    </span>
                  </div>
                </div>

                {/* Section 1: Rôle système */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-[#062653] uppercase tracking-wider">
                    <Shield className="w-4 h-4 text-[#062653]" />
                    Rôle système du compte <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-[#64748B]">
                    Détermine le statut de base de l&apos;utilisateur.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRole("ORGANIZATION_ADMIN");
                        applyRoleDefaults("ORGANIZATION_ADMIN");
                      }}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        selectedRole === "ORGANIZATION_ADMIN" || selectedRole === "ADMINISTRATEUR"
                          ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-2xs"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#062653]">Administrateur</span>
                        {(selectedRole === "ORGANIZATION_ADMIN" || selectedRole === "ADMINISTRATEUR") && (
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-1.5 leading-relaxed">
                        Droits d&apos;administration complets. Tous les onglets sont accordés par défaut.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRole("EMPLOYEE");
                        applyRoleDefaults("EMPLOYEE");
                      }}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        selectedRole === "EMPLOYEE" || selectedRole === "COLLABORATEUR"
                          ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-2xs"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#062653]">Employé / Collaborateur</span>
                        {(selectedRole === "EMPLOYEE" || selectedRole === "COLLABORATEUR") && (
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-1.5 leading-relaxed">
                        Accès opérationnel standard. 5 onglets opérationnels cochés par défaut.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Section 2: Onglets accordés */}
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <h3 className="text-xs font-bold text-[#062653] uppercase tracking-wider flex items-center gap-2">
                        <span>Onglets de navigation accordés</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {activeTabsCount} / {AVAILABLE_TABS.length} cochés
                        </span>
                      </h3>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Cliquez sur un onglet pour l&apos;ajouter ou le retirer des accès de cet utilisateur :
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAllTabs(true)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Tout cocher
                      </button>
                      <button
                        type="button"
                        onClick={() => applyRoleDefaults(selectedRole)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#062653] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Défaut rôle
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllTabs(false)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Tout décocher
                      </button>
                    </div>
                  </div>

                  {/* List of 11 Tabs */}
                  <div className="space-y-2.5 pt-1">
                    {AVAILABLE_TABS.map((tab) => {
                      const isChecked = Boolean(selectedTabs[tab.key]);
                      return (
                        <div
                          key={tab.key}
                          onClick={() => toggleTab(tab.key)}
                          className={`p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 cursor-pointer select-none ${
                            isChecked
                              ? "border-emerald-500 bg-emerald-50/40 shadow-2xs ring-1 ring-emerald-500/20"
                              : "border-slate-200 bg-slate-50/60 opacity-60 hover:opacity-100 hover:border-slate-300"
                          }`}
                        >
                          {/* Checkbox Icon */}
                          <div className="pt-0.5">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                                isChecked
                                  ? "bg-emerald-600 text-white shadow-xs"
                                  : "border-2 border-slate-300 bg-white"
                              }`}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>

                          {/* Tab Icon */}
                          <div className="w-8 h-8 rounded-lg bg-[#062653] p-1.5 flex items-center justify-center shrink-0 shadow-xs">
                            {tab.iconSrc ? (
                              <img
                                src={tab.iconSrc}
                                alt=""
                                aria-hidden="true"
                                className="w-full h-full object-contain"
                              />
                            ) : tab.icon ? (
                              <tab.icon className="w-4 h-4 text-white" />
                            ) : null}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs sm:text-sm text-[#062653]">
                                  {tab.label}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-slate-200/70 text-slate-600">
                                  {tab.category}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-colors ${
                                  isChecked
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {isChecked ? "Accordé" : "Masqué"}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">
                              {tab.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {modalError && (
                  <div className="p-3 bg-rose-50 rounded-xl flex items-start gap-2 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span>{modalError}</span>
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-lg">
                <div className="text-xs text-[#64748B]">
                  <strong className="text-[#062653] font-bold">{activeTabsCount}</strong> onglet(s) sélectionné(s)
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={closeEditRoleModal}
                    disabled={savingRole}
                    className="px-4 py-2 text-xs font-semibold text-[#263445] bg-[#F4F6F9] hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveRole()}
                    disabled={savingRole || !selectedRole}
                    className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {savingRole ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Enregistrer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
