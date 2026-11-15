"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  UserPlus,
  Search,
  RefreshCw,
  KeyRound,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Mail,
  User,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";

interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export default function SuperAdminAccountsPage() {
  const [admins, setAdmins] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Password reset modal
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [targetAdmin, setTargetAdmin] = useState<SuperAdminUser | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [resetConfirmVal, setResetConfirmVal] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<SuperAdminUser | null>(null);

  // Load current session & admins
  const loadAdmins = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Get current logged-in user to identify "Moi"
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.user?.email) {
          setCurrentAdminEmail(meJson.user.email.toLowerCase());
        }
      }

      const res = await fetch("/api/super-admin/admins", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Impossible de charger les comptes SuperAdmin");
      }
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur de chargement", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  // Filtered admins
  const filteredAdmins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [admins, searchQuery]);

  // Create handler
  const handleCreateSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      showSystemToast("Veuillez remplir tous les champs obligatoires.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showSystemToast("Le mot de passe doit comporter au moins 8 caractères.", "error");
      return;
    }
    if (newPassword !== newConfirmPassword) {
      showSystemToast("Les deux mots de passe ne correspondent pas.", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/super-admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          password: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Échec de création du compte SuperAdmin");
      }

      showSystemToast(data.message || "Compte SuperAdmin créé avec succès !");
      setIsCreateOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewConfirmPassword("");
      await loadAdmins(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la création", "error");
    } finally {
      setCreating(false);
    }
  };

  // Toggle status
  const handleToggleStatus = async (admin: SuperAdminUser) => {
    if (admin.email.toLowerCase() === currentAdminEmail) {
      showSystemToast("Vous ne pouvez pas désactiver votre propre compte actuellement connecté.", "error");
      return;
    }
    const nextStatus = admin.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible de mettre à jour le statut");
      }
      showSystemToast(data.message || "Statut mis à jour !");
      await loadAdmins(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la mise à jour", "error");
    }
  };

  // Password reset handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAdmin) return;
    if (resetPasswordVal.length < 8) {
      showSystemToast("Le nouveau mot de passe doit comporter au moins 8 caractères.", "error");
      return;
    }
    if (resetPasswordVal !== resetConfirmVal) {
      showSystemToast("Les deux mots de passe ne correspondent pas.", "error");
      return;
    }

    setResetting(true);
    try {
      const res = await fetch(`/api/super-admin/admins/${targetAdmin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible de réinitialiser le mot de passe");
      }
      showSystemToast(data.message || "Mot de passe réinitialisé avec succès !");
      setIsResetOpen(false);
      setTargetAdmin(null);
      setResetPasswordVal("");
      setResetConfirmVal("");
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la réinitialisation", "error");
    } finally {
      setResetting(false);
    }
  };

  // Delete handler
  const handleDeleteAdmin = async () => {
    if (!adminToDelete) return;
    if (adminToDelete.email.toLowerCase() === currentAdminEmail) {
      showSystemToast("Vous ne pouvez pas supprimer votre propre compte connecté.", "error");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/super-admin/admins/${adminToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible de supprimer le compte");
      }
      showSystemToast(data.message || "Compte SuperAdmin supprimé avec succès.");
      setIsDeleteOpen(false);
      setAdminToDelete(null);
      await loadAdmins(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = admins.filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/super-admin"
              className="text-xs font-semibold text-[#64748B] hover:text-[#062653] inline-flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retour à la vue d&apos;ensemble</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Comptes Super Administrateurs
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Gestion des accès plateforme de niveau administrateur suprême (SUPER_ADMIN).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadAdmins(true)}
            disabled={refreshing}
            className="h-10 px-3.5 bg-white hover:bg-slate-50 text-xs font-semibold text-[#062653] rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            title="Rafraîchir la liste"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="h-10 px-4 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Nouveau SuperAdmin</span>
          </button>
        </div>
      </div>

      {/* 2. STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Total SuperAdmins
            </div>
            <div className="text-2xl font-extrabold text-[#062653] mt-1">
              {admins.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#062653] flex items-center justify-center font-bold">
            <Shield className="w-5 h-5 text-[#062653]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Comptes Actifs
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {activeCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Niveau de Privilège
            </div>
            <div className="text-xs font-bold text-[#062653] mt-2">
              Accès Complet Plateforme
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-[#FF7900] flex items-center justify-center font-bold">
            <KeyRound className="w-5 h-5 text-[#FF7900]" />
          </div>
        </div>
      </div>

      {/* 3. TABLE SECTION */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        {/* Search header */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom ou adresse e-mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-xs bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 placeholder:text-slate-400 outline-none transition-colors border border-transparent focus:border-slate-300"
            />
          </div>
          <div className="text-xs text-[#64748B]">
            <strong>{filteredAdmins.length}</strong> compte(s) trouvé(s)
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="p-12 text-center text-[#64748B] flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#FF7900]" />
            <span className="text-xs font-semibold">Chargement des comptes super-administrateurs...</span>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="p-12 text-center text-[#64748B]">
            <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium">Aucun compte super-administrateur trouvé.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#DCE2EA] text-[#64748B] font-bold">
                  <th className="px-5 py-3">Super Administrateur</th>
                  <th className="px-5 py-3">Adresse e-mail</th>
                  <th className="px-5 py-3">Rôle système</th>
                  <th className="px-5 py-3 text-center">Statut</th>
                  <th className="px-5 py-3">Créé le</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EA]">
                {filteredAdmins.map((admin) => {
                  const isCurrent = admin.email.toLowerCase() === currentAdminEmail;
                  const isActive = admin.status === "ACTIVE";

                  return (
                    <tr key={admin.id} className="hover:bg-slate-50/70 transition">
                      {/* Nom + Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#062653] text-white flex items-center justify-center text-xs font-bold uppercase shrink-0">
                            {admin.name.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-[#062653] flex items-center gap-1.5">
                              <span>{admin.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-blue-50 text-[#062653] px-2 py-0.5 rounded-full font-bold">
                                  Vous
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {admin.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5 font-medium text-slate-700">
                        {admin.email}
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#062653] text-white">
                          <Shield className="w-3 h-3 text-[#FF7900]" />
                          <span>SUPER_ADMIN</span>
                        </span>
                      </td>

                      {/* Statut */}
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          disabled={isCurrent}
                          onClick={() => handleToggleStatus(admin)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                            isActive
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-300 text-slate-700"
                          } ${isCurrent ? "opacity-90 cursor-default" : "cursor-pointer hover:opacity-80"}`}
                          title={isCurrent ? "Votre propre compte reste actif" : "Cliquer pour modifier"}
                        >
                          {isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-white" />
                              <span>Actif</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-slate-600" />
                              <span>Désactivé</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Date de création */}
                      <td className="px-5 py-3.5 text-[#64748B]">
                        {new Date(admin.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Modifier mot de passe */}
                          <button
                            type="button"
                            onClick={() => {
                              setTargetAdmin(admin);
                              setResetPasswordVal("");
                              setResetConfirmVal("");
                              setIsResetOpen(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                            title="Modifier le mot de passe"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-white shrink-0" />
                          </button>

                          {/* Supprimer compte (interdit sur soi-même) */}
                          <button
                            type="button"
                            disabled={isCurrent || admins.length <= 1}
                            onClick={() => {
                              setAdminToDelete(admin);
                              setIsDeleteOpen(true);
                            }}
                            className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:hover:bg-red-500 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                            title={
                              isCurrent
                                ? "Impossible de supprimer votre propre compte"
                                : admins.length <= 1
                                ? "Impossible de supprimer le seul SuperAdmin"
                                : "Supprimer ce compte SuperAdmin"
                            }
                          >
                            <Trash2 className="w-4 h-4 text-white shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. MODAL: CRÉER UN NOUVEAU SUPERADMIN */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Créer un nouveau compte Super Administrateur"
        >
          <form onSubmit={handleCreateSuperAdmin} className="space-y-4 text-xs">
            <p className="text-[#64748B] leading-relaxed">
              Ce compte aura un accès souverain et illimité à l&apos;ensemble de la plateforme RKonekte (toutes les entreprises, réglages globaux, paiements et utilisateurs).
            </p>

            {/* Nom */}
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Nom complet <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Jean Dupont"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 pl-9 pr-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Adresse e-mail <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="admin@platform.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full h-10 pl-9 pr-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Mot de passe initial (Min. 8 caractères) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Min. 8 car. (Maj, Min, Chiffre, Symbole)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 pl-3.5 pr-10 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmation mot de passe */}
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Confirmer le mot de passe <span className="text-rose-500">*</span>
              </label>
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Répétez le mot de passe"
                value={newConfirmPassword}
                onChange={(e) => setNewConfirmPassword(e.target.value)}
                className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
              />
              {newConfirmPassword.length > 0 && newPassword !== newConfirmPassword && (
                <p className="text-[11px] text-rose-500 mt-1">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={
                  creating ||
                  !newName.trim() ||
                  !newEmail.trim() ||
                  newPassword.length < 8 ||
                  newPassword !== newConfirmPassword
                }
                className="px-5 py-2 bg-[#FF7900] hover:bg-[#E66D00] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Création en cours...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5 text-white" />
                    <span>Créer le compte SuperAdmin</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. MODAL: RÉINITIALISER LE MOT DE PASSE */}
      {isResetOpen && targetAdmin && (
        <Modal
          isOpen={isResetOpen}
          onClose={() => setIsResetOpen(false)}
          title={`Modifier le mot de passe — ${targetAdmin.name}`}
        >
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
            <p className="text-[#64748B] leading-relaxed">
              Définissez un nouveau mot de passe sécurisé pour l&apos;administrateur <strong>{targetAdmin.email}</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Nouveau mot de passe <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showResetPassword ? "text" : "password"}
                  required
                  placeholder="Min. 8 caractères"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  className="w-full h-10 pl-3.5 pr-10 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1">
                Confirmer le nouveau mot de passe <span className="text-rose-500">*</span>
              </label>
              <input
                type={showResetPassword ? "text" : "password"}
                required
                placeholder="Répétez le mot de passe"
                value={resetConfirmVal}
                onChange={(e) => setResetConfirmVal(e.target.value)}
                className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-slate-900 border border-slate-200 outline-none transition-colors"
              />
              {resetConfirmVal.length > 0 && resetPasswordVal !== resetConfirmVal && (
                <p className="text-[11px] text-rose-500 mt-1">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsResetOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={
                  resetting ||
                  resetPasswordVal.length < 8 ||
                  resetPasswordVal !== resetConfirmVal
                }
                className="px-5 py-2 bg-[#062653] hover:bg-[#031B3A] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Mise à jour...</span>
                  </>
                ) : (
                  <span>Mettre à jour le mot de passe</span>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 6. MODAL: CONFIRMATION SUPPRESSION */}
      {isDeleteOpen && adminToDelete && (
        <Modal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Supprimer ce compte Super Administrateur ?"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-rose-50 rounded-xl text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Attention : Action irréversible</p>
                <p className="mt-0.5 text-[11px] text-rose-700 leading-relaxed">
                  Êtes-vous certain de vouloir supprimer le compte Super Administrateur de{" "}
                  <strong>{adminToDelete.name}</strong> ({adminToDelete.email}) ? Cet utilisateur n&apos;aura plus aucun accès à la plateforme.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAdmin}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>Confirmer la suppression</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
