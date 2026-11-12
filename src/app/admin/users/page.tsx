"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  AlertCircle,
  Shield,
  Edit2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { showSystemToast } from "@/components/ui/SystemToast";
import { RoleModel, HIERARCHY_LABELS } from "@/lib/types/roles";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: number;
}

const SYSTEM_ROLE_OPTIONS = [
  {
    value: "ORGANIZATION_ADMIN",
    label: "Président Directeur Général (PDG) / Propriétaire",
  },
  {
    value: "ADMINISTRATEUR",
    label: "Administrateur",
  },
  {
    value: "RH",
    label: "Ressources Humaines (RH)",
  },
  {
    value: "SECRETARY",
    label: "Secrétaire",
  },
  {
    value: "BRANCH_MANAGER",
    label: "Responsable de Succursale",
  },
  {
    value: "FINANCIAL_MANAGER",
    label: "Responsable Financier / Comptable",
  },
  {
    value: "CASHIER",
    label: "Caissier(e)",
  },
  {
    value: "EMPLOYEE",
    label: "Collaborateur / Employé",
  },
] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrateur",
  ORGANIZATION_ADMIN: "Président Directeur Général (PDG) / Propriétaire",
  ADMINISTRATEUR: "Administrateur",
  RH: "Ressources Humaines (RH)",
  SECRETARY: "Secrétaire",
  FINANCIAL_MANAGER: "Responsable Financier / Comptable",
  BRANCH_MANAGER: "Responsable de Succursale",
  CASHIER: "Caissier(e)",
  CAISSIER: "Caissier(e)",
  EMPLOYEE: "Collaborateur / Employé",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [orgRoles, setOrgRoles] = useState<RoleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Edit System Role Modal state (strictly limited to modifying the user's system role)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
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

    setEditingUser(u);
    setSelectedRole(initialRole);
    setModalError(null);
  };

  const closeEditRoleModal = () => {
    if (savingRole) return;
    setEditingUser(null);
    setModalError(null);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !selectedRole) return;

    if (selectedRole === editingUser.role) {
      setEditingUser(null);
      return;
    }

    setSavingRole(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setModalError(
          data.error || "Impossible de mettre à jour le rôle système."
        );
        return;
      }

      const updatedRole = data.user?.role || selectedRole;
      setUsers((prev) =>
        prev.map((item) =>
          item.id === editingUser.id ? { ...item, role: updatedRole } : item
        )
      );
      showSystemToast(
        `Le rôle système de ${editingUser.name} a été mis à jour (${resolveRoleLabel(updatedRole)}).`,
        "success"
      );
      setEditingUser(null);
    } catch (_) {
      setModalError("Erreur réseau lors de la mise à jour du rôle.");
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

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Liste des utilisateurs
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Gestion des comptes d'accès, affectation des rôles et des succursales.
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
      <div className="bg-white p-4 rounded-xl border border-[#DCE2EA] shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Rechercher par nom, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-[#F4F6F9] border border-[#DCE2EA] rounded-lg text-xs text-[#263445] placeholder-[#64748B] focus:bg-white transition-colors"
          />
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" />
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#64748B]">Rôle :</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 px-3 bg-[#F4F6F9] border border-[#DCE2EA] rounded-lg text-xs font-semibold text-[#263445]"
            >
              <option value="ALL">Tous les rôles</option>
              <option value="ORGANIZATION_ADMIN">PDG / Propriétaire</option>
              <option value="ADMINISTRATEUR">Administrateur</option>
              <option value="RH">Ressources Humaines (RH)</option>
              <option value="SECRETARY">Secrétaire</option>
              <option value="BRANCH_MANAGER">Responsable Succursale</option>
              <option value="FINANCIAL_MANAGER">Responsable Financier / Comptable</option>
              <option value="CASHIER">Caissier(e)</option>
              <option value="EMPLOYEE">Collaborateur / Employé</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[#64748B]">Statut :</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 bg-[#F4F6F9] border border-[#DCE2EA] rounded-lg text-xs font-semibold text-[#263445]"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Actif</option>
              <option value="DISABLED">Désactivé</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. TABLE OF USERS */}
      <div className="bg-white rounded-xl border border-[#DCE2EA] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#64748B] text-xs">
            Chargement des utilisateurs...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-[#64748B] text-xs">
            Aucun utilisateur ne correspond à votre recherche.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-[#DCE2EA]">
                <tr>
                  <th className="px-5 py-3">Utilisateur</th>
                  <th className="px-5 py-3">Email professionnel</th>
                  <th className="px-5 py-3">Rôle système</th>
                  <th className="px-5 py-3">Statut</th>
                  <th className="px-5 py-3">Date d'accès</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EA]">
                {filteredUsers.map((u) => {
                  const isSuperAdminTarget = u.role === "SUPER_ADMIN";
                  return (
                    <tr key={u.id} className="hover:bg-[#F4F6F9]/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-[#062653] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#062653] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {u.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="block">{u.name}</span>
                          <span className="text-[10px] text-[#64748B] font-normal">
                            ID: {u.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[#263445] font-mono text-[11px]">
                        {u.email}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold text-[#062653]">
                          {resolveRoleLabel(u.role)}
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
                              : "Modifier le rôle système"
                          }
                          aria-label={`Modifier le rôle système de ${u.name}`}
                          className={`p-1.5 rounded transition-colors ${
                            isSuperAdminTarget
                              ? "text-[#94A3B8] opacity-40 cursor-not-allowed"
                              : "text-[#64748B] hover:text-[#062653] hover:bg-[#F4F6F9] cursor-pointer"
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
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

      {/* 5. EDIT SYSTEM ROLE MODAL (Read-only user context, ONLY system role is editable) */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={closeEditRoleModal}
        title="Modifier le rôle système"
        maxWidth="md"
      >
        {editingUser && (
          <form onSubmit={handleSaveRole} className="space-y-4">
            {/* Read-only user context */}
            <div className="bg-[#F4F6F9] border border-[#DCE2EA] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#062653] text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {editingUser.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#062653] truncate">
                      {editingUser.name}
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono truncate">
                      {editingUser.email}
                    </div>
                  </div>
                </div>
                <StatusBadge status={editingUser.status} size="sm" />
              </div>

              <div className="pt-2 border-t border-[#DCE2EA] flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#64748B] font-medium">Rôle actuel :</span>
                <span className="font-semibold text-[#062653] text-right">
                  {resolveRoleLabel(editingUser.role)}
                </span>
              </div>
            </div>

            {/* Single editable field: System Role */}
            <div className="space-y-1.5">
              <label
                htmlFor="edit-user-system-role"
                className="flex items-center gap-1.5 text-xs font-bold text-[#062653]"
              >
                <Shield className="w-3.5 h-3.5 text-[#062653]" />
                Rôle système <span className="text-rose-500">*</span>
              </label>
              <select
                id="edit-user-system-role"
                value={selectedRole}
                onChange={(e) => {
                  setSelectedRole(e.target.value);
                  setModalError(null);
                }}
                className="w-full h-10 px-3 bg-white border border-[#DCE2EA] focus:border-[#062653] focus:outline-none rounded-lg text-xs font-semibold text-[#263445] cursor-pointer"
                required
              >
                <optgroup label="Rôles système">
                  {SYSTEM_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
                {customRoles.length > 0 && (
                  <optgroup label="Rôles personnalisés">
                    {customRoles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} ({HIERARCHY_LABELS[r.hierarchyLevel]?.badge || r.hierarchyLevel})
                      </option>
                    ))}
                  </optgroup>
                )}
                {selectedRole &&
                  !SYSTEM_ROLE_OPTIONS.some((opt) => opt.value === selectedRole) &&
                  !customRoles.some((r) => r.name === selectedRole) && (
                    <option value={selectedRole}>{resolveRoleLabel(selectedRole)}</option>
                  )}
              </select>
              <p className="text-[11px] text-[#64748B]">
                Seul le rôle système de cet utilisateur peut être modifié ici (détermine ses autorisations d&apos;accès).
              </p>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={closeEditRoleModal}
                disabled={savingRole}
                className="px-4 py-2 text-xs font-semibold text-[#263445] bg-white border border-[#DCE2EA] hover:bg-[#F4F6F9] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingRole || !selectedRole || selectedRole === editingUser.role}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingRole ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
