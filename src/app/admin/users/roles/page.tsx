"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  Plus,
  Crown,
  Eye,
  Sliders,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";
import {
  RoleModel,
  ModuleKey,
  HierarchyLevel,
  TabPermission,
  MODULE_LABELS,
  MODULE_SUB_TABS,
  HIERARCHY_LABELS,
} from "@/lib/types/roles";

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<RoleModel[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [hierarchyFilter, setHierarchyFilter] = useState<string>("ALL");

  // Role Create / Edit Modal State
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleLevel, setRoleLevel] = useState<HierarchyLevel>("OPERATIONAL");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<ModuleKey, TabPermission>>({
    dashboard: { view: true, create: false, edit: false, delete: false },
    requests: { view: true, create: true, edit: true, delete: false },
    employees: { view: true, create: true, edit: true, delete: false },
    branches: { view: false, create: false, edit: false, delete: false },
    financial_ops: { view: false, create: false, edit: false, delete: false },
    financial_reports: { view: false, create: false, edit: false, delete: false },
    events: { view: true, create: true, edit: true, delete: false },
    customer_space: { view: false, create: false, edit: false, delete: false },
    users: { view: false, create: false, edit: false, delete: false },
    configuration: { view: false, create: false, edit: false, delete: false },
    notifications: { view: true, create: false, edit: false, delete: false },
  });

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch (_) {
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const filteredRoles = useMemo(() => {
    if (hierarchyFilter === "ALL") return roles;
    return roles.filter((r) => r.hierarchyLevel === hierarchyFilter);
  }, [roles, hierarchyFilter]);

  const openCreateRoleModal = () => {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRoleLevel("OPERATIONAL");
    setRolePermissions({
      dashboard: { view: true, create: false, edit: false, delete: false },
      requests: { view: true, create: true, edit: true, delete: false },
      employees: { view: true, create: false, edit: false, delete: false },
      branches: { view: false, create: false, edit: false, delete: false },
      financial_ops: { view: false, create: false, edit: false, delete: false },
      financial_reports: { view: false, create: false, edit: false, delete: false },
      events: { view: true, create: false, edit: false, delete: false },
      customer_space: { view: false, create: false, edit: false, delete: false },
      users: { view: false, create: false, edit: false, delete: false },
      configuration: { view: false, create: false, edit: false, delete: false },
      notifications: { view: true, create: false, edit: false, delete: false },
    });
    setRoleFormError(null);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (r: RoleModel) => {
    setEditingRoleId(r.id);
    setRoleName(r.name);
    setRoleDescription(r.description || "");
    setRoleLevel(r.hierarchyLevel);
    setRolePermissions(r.permissions);
    setRoleFormError(null);
    setRoleModalOpen(true);
  };

  const currentEditingRole = useMemo(
    () => (editingRoleId ? roles.find((r) => r.id === editingRoleId) : null),
    [editingRoleId, roles]
  );
  const isOwnerRole = Boolean(currentEditingRole?.isDefaultOwner);

  const isSubTabChecked = (mKey: ModuleKey, subTabId: string) => {
    const p = rolePermissions[mKey];
    if (!p || !p.view) return false;
    if (!p.subTabs) return true; // Actif par défaut si non spécifié
    return p.subTabs.includes(subTabId);
  };

  const toggleSubTab = (mKey: ModuleKey, subTabId: string) => {
    if (isOwnerRole) return;
    setRolePermissions((prev) => {
      const cur = prev[mKey] || { view: false, create: false, edit: false, delete: false };
      const allSubTabs = MODULE_SUB_TABS[mKey] || [];
      const allIds = allSubTabs.map((s) => s.id);
      const currentActiveIds = cur.subTabs ? [...cur.subTabs] : (cur.view ? [...allIds] : []);

      let newSubTabs: string[];
      if (currentActiveIds.includes(subTabId)) {
        newSubTabs = currentActiveIds.filter((id) => id !== subTabId);
      } else {
        newSubTabs = [...currentActiveIds, subTabId];
      }

      const hasAnyActive = newSubTabs.length > 0;
      return {
        ...prev,
        [mKey]: {
          ...cur,
          view: hasAnyActive,
          subTabs: newSubTabs,
          create: hasAnyActive ? cur.create : false,
          edit: hasAnyActive ? cur.edit : false,
          delete: hasAnyActive ? cur.delete : false,
        },
      };
    });
  };

  const togglePermission = (mKey: ModuleKey, permKey: keyof TabPermission) => {
    setRolePermissions((prev) => {
      const current = prev[mKey] || { view: false, create: false, edit: false, delete: false };
      const nextVal = !current[permKey];
      const allIds = (MODULE_SUB_TABS[mKey] || []).map((s) => s.id);
      const updated = { ...current, [permKey]: nextVal };
      if (nextVal && (permKey === "create" || permKey === "edit" || permKey === "delete")) {
        updated.view = true;
        if (!updated.subTabs || updated.subTabs.length === 0) {
          updated.subTabs = [...allIds];
        }
      }
      if (permKey === "view") {
        if (nextVal) {
          updated.subTabs = [...allIds];
        } else {
          updated.subTabs = [];
          updated.create = false;
          updated.edit = false;
          updated.delete = false;
        }
      }
      return { ...prev, [mKey]: updated };
    });
  };

  const applyPresetPermissions = (mode: "all" | "readonly" | "none") => {
    const next: Record<ModuleKey, TabPermission> = {} as any;
    (Object.keys(MODULE_LABELS) as ModuleKey[]).forEach((key) => {
      const allIds = (MODULE_SUB_TABS[key] || []).map((s) => s.id);
      if (mode === "all") {
        next[key] = { view: true, create: true, edit: true, delete: true, subTabs: allIds };
      } else if (mode === "readonly") {
        next[key] = { view: true, create: false, edit: false, delete: false, subTabs: allIds };
      } else {
        next[key] = { view: false, create: false, edit: false, delete: false, subTabs: [] };
      }
    });
    setRolePermissions(next);
  };

  const toggleAllForModule = (mKey: ModuleKey) => {
    setRolePermissions((prev) => {
      const cur = prev[mKey] || { view: false, create: false, edit: false, delete: false };
      const allActive = cur.view && cur.create && cur.edit && cur.delete;
      const allIds = (MODULE_SUB_TABS[mKey] || []).map((s) => s.id);
      return {
        ...prev,
        [mKey]: allActive
          ? { view: false, create: false, edit: false, delete: false, subTabs: [] }
          : { view: true, create: true, edit: true, delete: true, subTabs: allIds },
      };
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleFormError(null);
    if (!roleName.trim()) {
      setRoleFormError("Le nom du rôle est obligatoire.");
      return;
    }

    setRoleSaving(true);
    try {
      const url = editingRoleId ? `/api/admin/roles/${editingRoleId}` : "/api/admin/roles";
      const method = editingRoleId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roleName.trim(),
          description: roleDescription.trim(),
          hierarchyLevel: roleLevel,
          permissions: rolePermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRoleFormError(data.error || "Erreur lors de l'enregistrement du rôle.");
        return;
      }

      setRoleModalOpen(false);
      showSystemToast(
        editingRoleId
          ? `Rôle « ${roleName} » mis à jour avec succès !`
          : `Rôle « ${roleName} » créé dans la hiérarchie !`
      );
      await fetchRoles();
    } catch (_) {
      setRoleFormError("Erreur réseau lors de l'enregistrement.");
    } finally {
      setRoleSaving(false);
    }
  };

  const handleDeleteRole = async (r: RoleModel) => {
    if (r.isSystem) return;
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le rôle « ${r.name} » ?`)) return;

    try {
      const res = await fetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showSystemToast(data.error || "Impossible de supprimer ce rôle.", "error");
        return;
      }
      showSystemToast(`Rôle « ${r.name} » supprimé avec succès.`);
      await fetchRoles();
    } catch (_) {
      showSystemToast("Erreur de communication avec le serveur.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Rôles & Permissions
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Configuration des niveaux hiérarchiques de l'entreprise et matrice des autorisations par onglet.
          </p>
        </div>

        <button
          onClick={openCreateRoleModal}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-2 self-start cursor-pointer"
        >
          <Plus className="w-4 h-4 text-white" />
          Ajouter un rôle hiérarchique
        </button>
      </div>

      {/* 2. EXPLANATORY BANNER */}
      <div className="bg-[#FFF4EB] border border-[#FF7900]/20 rounded-xl p-4 text-xs text-[#263445] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#FF7900] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#062653] block text-sm">
              Hiérarchie de l'Entreprise & Droits d'Accès par Onglet
            </span>
            <p className="text-[#64748B] mt-0.5">
              Configurez les rôles de votre organisation et déterminez pour chaque onglet les autorisations précises : <strong>Consulter</strong>, <strong>Créer</strong>, <strong>Modifier</strong> et <strong>Supprimer</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* 4. HIERARCHY FILTER PILLS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px] mr-1 shrink-0">
          Niveau hiérarchique :
        </span>
        {[
          { key: "ALL", label: `Tous les rôles (${roles.length})` },
          { key: "DIRECTION", label: "Direction & Propriétaire" },
          { key: "MANAGEMENT", label: "Management & Cadres" },
          { key: "SUPERVISOR", label: "Superviseurs" },
          { key: "OPERATIONAL", label: "Opérationnels" },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setHierarchyFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-all cursor-pointer ${
              hierarchyFilter === f.key
                ? "bg-[#062653] text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-[#DCE2EA]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 5. ROLES GRID */}
      {rolesLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Chargement des rôles hiérarchiques...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRoles.map((r) => {
            const levelInfo =
              HIERARCHY_LABELS[r.hierarchyLevel] ||
              HIERARCHY_LABELS.OPERATIONAL;
            const activeModulesCount = Object.values(r.permissions || {}).filter(
              (p: any) => p?.view
            ).length;

            return (
              <div
                key={r.id}
                className="bg-white rounded-xl border border-[#DCE2EA] shadow-xs p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#062653] text-white flex items-center justify-center shrink-0 shadow-xs">
                        {r.isDefaultOwner ? (
                          <Crown className="w-5 h-5 text-[#FF7900]" />
                        ) : (
                          <Shield className="w-4 h-4 text-slate-200" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#062653] flex items-center gap-1.5">
                          <span>{r.name}</span>
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${levelInfo.color}`}
                          >
                            {levelInfo.badge}
                          </span>
                          {r.isSystem ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                              Rôle Système
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Rôle Personnalisé
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {r.description || "Aucune description renseignée pour ce rôle."}
                  </p>

                  {/* Permissions Overview */}
                  <div className="pt-2 border-t border-[#DCE2EA]/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>Onglets accordés :</span>
                      <span className="text-[#062653] font-mono">
                        {activeModulesCount} / 12 onglets
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((mKey) => {
                        const perm = r.permissions?.[mKey];
                        if (!perm?.view && !perm?.create) return null;
                        const subTabs = MODULE_SUB_TABS[mKey] || [];
                        const activeSubTabs = subTabs.filter((st) => {
                          if (!perm.subTabs) return true;
                          return perm.subTabs.includes(st.id);
                        });
                        const isPartial = subTabs.length > 0 && activeSubTabs.length < subTabs.length;

                        return (
                          <div
                            key={mKey}
                            className={`px-2 py-1 rounded-md border text-[11px] flex flex-col gap-0.5 font-medium ${
                              isPartial
                                ? "bg-amber-50/70 border-amber-200 text-amber-950"
                                : "bg-slate-50 border-slate-200 text-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className="font-semibold">{MODULE_LABELS[mKey]}</span>
                              <div className="flex items-center gap-1">
                                {isPartial && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                                    {activeSubTabs.length}/{subTabs.length}
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5 text-[9px] font-bold text-slate-500">
                                  {perm.create && (
                                    <span className="text-blue-600" title="Peut créer">
                                      +C
                                    </span>
                                  )}
                                  {perm.edit && (
                                    <span className="text-amber-600" title="Peut modifier">
                                      ✎M
                                    </span>
                                  )}
                                  {perm.delete && (
                                    <span className="text-rose-600" title="Peut supprimer">
                                      🗑S
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {subTabs.length > 0 ? (
                              <span
                                className="text-[9px] text-slate-500 font-normal truncate max-w-[240px]"
                                title={activeSubTabs.map((s) => s.name).join(", ")}
                              >
                                ↳ {activeSubTabs.length > 0
                                  ? activeSubTabs.map((s) => s.name).join(" • ")
                                  : "Aucun sous-onglet sélectionné"}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-[#DCE2EA] flex items-center justify-end gap-2">
                  {r.isDefaultOwner ? (
                    <button
                      type="button"
                      onClick={() => openEditRoleModal(r)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#062653] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Voir les accès (Fixe)</span>
                    </button>
                  ) : (
                    <>
                      {!r.isSystem && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(r)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                          <span>Supprimer</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditRoleModal(r)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#062653] hover:bg-[#031B3A] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#FF7900]" />
                        <span>Modifier les accès</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. ROLE MODAL (Créer ou Modifier un rôle et ses droits par onglet) */}
      <Modal
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={
          currentEditingRole?.isDefaultOwner
            ? `Rôle Maître : ${roleName}`
            : editingRoleId
            ? `Modifier le rôle : ${roleName}`
            : "Ajouter un rôle dans la hiérarchie de l'entreprise"
        }
        maxWidth="3xl"
      >
        <form onSubmit={handleSaveRole} className="space-y-5 text-xs">
          {roleFormError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              {roleFormError}
            </div>
          )}

          {isOwnerRole && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Le compte Président Directeur Général (PDG) détient le statut de super-propriétaire de l'entreprise avec l'ensemble des droits garantis.
              </span>
            </div>
          )}

          {/* Form details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#062653] mb-1">
                Intitulé du rôle <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isOwnerRole}
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="ex. Directeur des Opérations, Contrôleur, Superviseur"
                className="w-full h-9 px-3 border border-[#DCE2EA] rounded-lg text-xs text-[#263445] focus:bg-white focus:outline-hidden focus:border-[#062653] disabled:bg-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#062653] mb-1">
                Niveau hiérarchique <span className="text-rose-500">*</span>
              </label>
              <select
                disabled={isOwnerRole}
                value={roleLevel}
                onChange={(e) => setRoleLevel(e.target.value as HierarchyLevel)}
                className="w-full h-9 px-3 border border-[#DCE2EA] rounded-lg text-xs text-[#263445] bg-white font-medium focus:outline-hidden focus:border-[#062653] disabled:bg-slate-100"
              >
                <option value="DIRECTION">Niveau 1 — Direction & Propriétaire</option>
                <option value="MANAGEMENT">Niveau 2 — Management & Cadres</option>
                <option value="SUPERVISOR">Niveau 3 — Superviseurs & Chefs d'équipe</option>
                <option value="OPERATIONAL">Niveau 4 — Opérationnels & Collaborateurs</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#062653] mb-1">
              Description du rôle & responsabilités
            </label>
            <input
              type="text"
              disabled={isOwnerRole}
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="ex. Supervision des activités courantes, validation des demandes et contrôle des rapports..."
              className="w-full h-9 px-3 border border-[#DCE2EA] rounded-lg text-xs text-[#263445] focus:bg-white focus:outline-hidden focus:border-[#062653] disabled:bg-slate-100"
            />
          </div>

          {/* PERMISSIONS MATRIX */}
          <div className="space-y-2 pt-2 border-t border-[#DCE2EA]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-[#062653] text-xs flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#FF7900]" />
                  <span>Matrice des Autorisations d'Accès par Onglet</span>
                </h4>
                <p className="text-[11px] text-[#64748B]">
                  Cochez l'accès à l'onglet et définissez précisément si le rôle peut créer, modifier ou supprimer.
                </p>
              </div>

              {!isOwnerRole && (
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => applyPresetPermissions("all")}
                    className="px-2.5 py-1 rounded-md bg-[#FFF4EB] text-[#FF7900] hover:bg-[#FFE8D6] text-[10px] font-bold border border-[#FF7900]/30 transition-colors cursor-pointer"
                  >
                    Tout accorder
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetPermissions("readonly")}
                    className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-bold border border-slate-300 transition-colors cursor-pointer"
                  >
                    Lecture seule
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetPermissions("none")}
                    className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] font-bold border border-rose-200 transition-colors cursor-pointer"
                  >
                    Tout réinitialiser
                  </button>
                </div>
              )}
            </div>

            {/* Matrix Table */}
            <div className="border border-[#DCE2EA] rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F4F6F9] text-[11px] font-bold text-[#062653] border-b border-[#DCE2EA] sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5">Onglet & Sous-onglets Système</th>
                      <th className="px-3 py-2.5 text-center">Accès Onglet</th>
                      <th className="px-3 py-2.5 text-center">Consulter</th>
                      <th className="px-3 py-2.5 text-center">Créer (+C)</th>
                      <th className="px-3 py-2.5 text-center">Modifier (✎M)</th>
                      <th className="px-3 py-2.5 text-center">Supprimer (🗑S)</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE2EA]">
                    {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((mKey) => {
                      const p = rolePermissions[mKey] || {
                        view: false,
                        create: false,
                        edit: false,
                        delete: false,
                      };
                      const subTabs = MODULE_SUB_TABS[mKey] || [];

                      return (
                        <tr
                          key={mKey}
                          className={`hover:bg-[#F8FAFC] transition-colors ${
                            p.view ? "bg-white" : "bg-slate-50/60 opacity-75"
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold text-[#062653]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    p.view ? "bg-emerald-500" : "bg-slate-300"
                                  }`}
                                />
                                <span className="font-bold">{MODULE_LABELS[mKey]}</span>
                              </div>
                              {subTabs.length > 0 && p.view && (
                                <span className="text-[10px] font-bold text-[#062653] bg-slate-100 px-2 py-0.5 rounded border border-[#DCE2EA]">
                                  {subTabs.filter((s) => isSubTabChecked(mKey, s.id)).length} / {subTabs.length} sous-onglets
                                </span>
                              )}
                            </div>
                            {subTabs.length > 0 && (
                              <div className="mt-2 ml-4 pl-2.5 border-l-2 border-[#DCE2EA] space-y-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                  Sous-onglets autorisés :
                                </span>
                                {subTabs.map((st) => {
                                  const isChecked = isSubTabChecked(mKey, st.id);
                                  return (
                                    <label
                                      key={st.id}
                                      className={`flex items-start gap-2 text-[11px] p-2 rounded-lg border transition-all cursor-pointer ${
                                        isChecked
                                          ? "bg-emerald-50/70 border-emerald-300/80 text-emerald-950 font-medium"
                                          : "bg-slate-50/70 border-slate-200/60 text-slate-500 hover:bg-slate-100"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={isOwnerRole}
                                        checked={isChecked}
                                        onChange={() => toggleSubTab(mKey, st.id)}
                                        className="w-4 h-4 mt-0.5 accent-emerald-600 rounded cursor-pointer shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-xs leading-tight">
                                          {st.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 leading-normal mt-0.5">
                                          {st.scope}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Toggle View */}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              disabled={isOwnerRole}
                              checked={p.view}
                              onChange={() => togglePermission(mKey, "view")}
                              className="w-4 h-4 accent-[#062653] cursor-pointer"
                            />
                          </td>

                          {/* View badge / check */}
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                p.view
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {p.view ? "Oui" : "Non"}
                            </span>
                          </td>

                          {/* Create */}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              disabled={isOwnerRole || !p.view}
                              checked={p.create}
                              onChange={() => togglePermission(mKey, "create")}
                              className="w-4 h-4 accent-[#062653] cursor-pointer disabled:opacity-30"
                            />
                          </td>

                          {/* Edit */}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              disabled={isOwnerRole || !p.view}
                              checked={p.edit}
                              onChange={() => togglePermission(mKey, "edit")}
                              className="w-4 h-4 accent-[#062653] cursor-pointer disabled:opacity-30"
                            />
                          </td>

                          {/* Delete */}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              disabled={isOwnerRole || !p.view}
                              checked={p.delete}
                              onChange={() => togglePermission(mKey, "delete")}
                              className="w-4 h-4 accent-rose-600 cursor-pointer disabled:opacity-30"
                            />
                          </td>

                          {/* Row fast toggle */}
                          <td className="px-3 py-2.5 text-right">
                            {!isOwnerRole && (
                              <button
                                type="button"
                                onClick={() => toggleAllForModule(mKey)}
                                className="text-[10px] text-[#062653] hover:text-[#FF7900] font-semibold underline cursor-pointer"
                              >
                                {p.view && p.create && p.edit && p.delete
                                  ? "Désactiver"
                                  : "Plein accès"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#DCE2EA]">
            <button
              type="button"
              onClick={() => setRoleModalOpen(false)}
              className="px-3.5 py-2 text-xs font-medium text-[#64748B] hover:bg-[#F4F6F9] rounded-lg cursor-pointer"
            >
              Fermer
            </button>
            {!isOwnerRole && (
              <button
                type="submit"
                disabled={roleSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#062653] hover:bg-[#031B3A] rounded-lg shadow-xs cursor-pointer border-b-2 border-[#FF7900]"
              >
                {roleSaving
                  ? "Enregistrement..."
                  : editingRoleId
                  ? "Mettre à jour le rôle"
                  : "Créer le rôle"}
              </button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
