"use client";

import React, { useState, useEffect } from "react";
import {
  FileSignature,
  Plus,
  CheckCircle2,
  Trash2,
  Check,
  X,
  UserCheck,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { showSystemToast } from "@/components/ui/SystemToast";

export interface SignerItem {
  id: string;
  userId?: string;
  userName: string;
  userEmail: string;
  role: string;
  canSignLeaves: boolean;
  canSignSalaryRaises: boolean;
  canSignAuthorizations: boolean;
  status: "ACTIVE" | "SUSPENDED";
  signatureUrl?: string | null;
}

export interface AvailableUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

function formatUserRole(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Administrateur";
    case "ORGANIZATION_ADMIN":
      return "Directeur Général (PDG)";
    case "ADMINISTRATEUR":
    case "ADMIN":
      return "Administrateur";
    case "RH":
    case "SECRETARY":
      return "Ressources Humaines (RH)";
    case "FINANCIAL_MANAGER":
      return "Directeur Financier (DAF)";
    case "CASHIER":
      return "Caissier";
    case "EMPLOYEE":
      return "Collaborateur";
    default:
      return role;
  }
}

export default function SignaturesPage() {
  const [signers, setSigners] = useState<SignerItem[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [signerModalOpen, setSignerModalOpen] = useState(false);
  const [selectedSigner, setSelectedSigner] = useState<SignerItem | null>(null);

  // Form states for modal
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [canSignLeaves, setCanSignLeaves] = useState(true);
  const [canSignSalaryRaises, setCanSignSalaryRaises] = useState(false);
  const [canSignAuthorizations, setCanSignAuthorizations] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch real delegations from API (starts at 0 if no delegation was configured)
  const fetchSignatures = async () => {
    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("rkonekte_signers_list");
      }

      const res = await fetch("/api/admin/signatures");
      if (res.ok) {
        const data = await res.json();
        setSigners(data.signers || []);
        if (data.availableUsers) {
          setAvailableUsers(data.availableUsers);
        }
      }
    } catch (err) {
      console.warn("Could not fetch signatures:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignatures();
  }, []);

  const openCreate = () => {
    setSelectedSigner(null);
    setSelectedUserId("");
    setCanSignLeaves(true);
    setCanSignSalaryRaises(false);
    setCanSignAuthorizations(false);
    setSignerModalOpen(true);
  };

  const openConfigure = (s: SignerItem) => {
    setSelectedSigner(s);
    setSelectedUserId(s.userId || s.id);
    setCanSignLeaves(s.canSignLeaves);
    setCanSignSalaryRaises(s.canSignSalaryRaises);
    setCanSignAuthorizations(s.canSignAuthorizations);
    setSignerModalOpen(true);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
  };

  const handleSaveSigner = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSigner && !selectedUserId) {
      showSystemToast("Veuillez sélectionner un utilisateur de l'entreprise.", "error");
      return;
    }

    const targetUser = availableUsers.find((u) => u.id === selectedUserId);
    const userName = selectedSigner ? selectedSigner.userName : targetUser?.name || "Utilisateur";
    const userEmail = selectedSigner ? selectedSigner.userEmail : targetUser?.email || "";
    const userRole = selectedSigner ? selectedSigner.role : targetUser?.role || "COLLABORATEUR";

    setSaving(true);

    try {
      const res = await fetch("/api/admin/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedSigner ? (selectedSigner.userId || selectedSigner.id) : selectedUserId,
          userEmail,
          canSignLeaves,
          canSignSalaryRaises,
          canSignAuthorizations,
          status: "ACTIVE",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        showSystemToast(errJson.error || "Impossible d'enregistrer la délégation.", "error");
        return;
      }

      if (selectedSigner) {
        setSigners((prev) =>
          prev.map((item) =>
            item.id === selectedSigner.id
              ? {
                  ...item,
                  canSignLeaves,
                  canSignSalaryRaises,
                  canSignAuthorizations,
                }
              : item
          )
        );
        showSystemToast(`Délégation mise à jour pour ${userName}.`);
      } else {
        const newSigner: SignerItem = {
          id: `sig-${Date.now()}`,
          userId: selectedUserId,
          userName,
          userEmail,
          role: userRole,
          canSignLeaves,
          canSignSalaryRaises,
          canSignAuthorizations,
          status: "ACTIVE",
          signatureUrl: null,
        };
        setSigners((prev) => [...prev, newSigner]);
        showSystemToast(`Nouveau signataire « ${userName} » habilité avec succès.`);
      }

      setSignerModalOpen(false);
    } catch (_) {
      showSystemToast("Erreur réseau lors de l'enregistrement.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSigner = async (signer: SignerItem) => {
    if (
      !confirm(
        `Êtes-vous sûr de vouloir révoquer l'habilitation de signature de ${signer.userName} ?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/signatures?id=${encodeURIComponent(signer.id)}&userId=${encodeURIComponent(
          signer.userId || signer.id
        )}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        showSystemToast("Impossible de révoquer l'habilitation.", "error");
        return;
      }

      setSigners((prev) => prev.filter((s) => s.id !== signer.id));
      showSystemToast(`Habilitation révoquée pour ${signer.userName}.`);
      if (signerModalOpen) {
        setSignerModalOpen(false);
      }
    } catch (_) {
      showSystemToast("Erreur lors de la révocation.", "error");
    }
  };

  const handleResetToZero = async () => {
    if (!confirm("Voulez-vous réinitialiser cette page à zéro et retirer toutes les délégations ?")) {
      return;
    }
    try {
      await fetch("/api/admin/signatures?reset=true", { method: "DELETE" });
      setSigners([]);
      showSystemToast("Page réinitialisée à 0.");
    } catch (_) {
      showSystemToast("Erreur lors de la réinitialisation.", "error");
    }
  };

  // List of users eligible for a new delegation (exclude users already in signers list)
  const existingUserIds = new Set(signers.map((s) => s.userId || s.id));
  const eligibleUsers = availableUsers.filter((u) => !existingUserIds.has(u.id));

  return (
    <div className="space-y-6">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Droits de signature
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Délégations de signature électronique pour les documents officiels de l'entreprise.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          {signers.length > 0 && (
            <button
              onClick={handleResetToZero}
              title="Remettre la page à 0"
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Remettre à 0</span>
            </button>
          )}
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Habiliter un signataire</span>
          </button>
        </div>
      </div>

      {/* 2. EXPLANATORY BANNER */}
      <div className="text-xs text-[#263445]">
        <span className="font-bold text-[#062653] block text-sm">
          Signatures Numériques Sans Arrière-Plan (PNG Transparent)
        </span>
        <p className="text-[#64748B] mt-0.5">
          Chaque signataire habilité enregistre personnellement son spécimen de signature sans fond (PNG transparent) depuis son profil personnel. Lorsqu'une demande ou un bon lui est soumis, sa signature est automatiquement apposée de manière certifiée sur le document final sans carré blanc.
        </p>
      </div>

      {/* 3. SIGNERS CONTENT */}
      {loading ? (
        <div className="bg-white rounded-xl p-12 text-center text-xs text-slate-500 shadow-xs">
          Chargement des droits de signature...
        </div>
      ) : signers.length === 0 ? (
        /* EMPTY STATE: PAGE AT 0 */
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <FileSignature className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#062653]">
              Aucun signataire habilité pour le moment
            </h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
              Aucune délégation de signature n'a encore été accordée. Cliquez sur le bouton ci-dessous pour choisir un utilisateur de votre organisation et lui conférer les droits de signature souhaités.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={openCreate}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Habiliter un signataire</span>
            </button>
          </div>
        </div>
      ) : (
        /* TABLE: EXPLICIT SIGNERS ONLY */
        <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                <tr>
                  <th className="px-5 py-3">Signataire Habilité</th>
                  <th className="px-5 py-3 text-center">Spécimen Transparent</th>
                  <th className="px-5 py-3 text-center">Congés RH</th>
                  <th className="px-5 py-3 text-center">Augmentations</th>
                  <th className="px-5 py-3 text-center">Autorisations / Achats</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {signers.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F4F6F9]/50 transition-colors">
                    {/* USER INFO */}
                    <td className="px-5 py-3.5 font-bold text-[#062653]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#062653] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {s.userName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-slate-900 font-bold">{s.userName}</div>
                          <div className="text-[11px] text-[#64748B] font-mono font-normal">
                            {s.userEmail}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* SPECIMEN STATUS: PERSONALLY CONFIGURED */}
                    <td className="px-5 py-3.5 text-center">
                      {s.signatureUrl ? (
                        <div className="inline-flex items-center gap-2">
                          <div
                            className="w-20 h-8 rounded flex items-center justify-center p-1 relative overflow-hidden bg-slate-50 border border-slate-200"
                            style={{
                              backgroundImage:
                                "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                              backgroundSize: "8px 8px",
                              backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                            }}
                            title="Spécimen personnel enregistré"
                          >
                            <img
                              src={s.signatureUrl}
                              alt="Spécimen"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600">
                            Configuré
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-400 italic">
                          En attente du signataire
                        </span>
                      )}
                    </td>

                    {/* CONGÉS RH */}
                    <td className="px-5 py-3.5 text-center">
                      {s.canSignLeaves ? (
                        <span className="text-emerald-600 font-bold text-xs">
                          Autorisé
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-xs">
                          Refusé
                        </span>
                      )}
                    </td>

                    {/* AUGMENTATIONS */}
                    <td className="px-5 py-3.5 text-center">
                      {s.canSignSalaryRaises ? (
                        <span className="text-emerald-600 font-bold text-xs">
                          Autorisé
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-xs">
                          Refusé
                        </span>
                      )}
                    </td>

                    {/* AUTORISATIONS / ACHATS */}
                    <td className="px-5 py-3.5 text-center">
                      {s.canSignAuthorizations ? (
                        <span className="text-emerald-600 font-bold text-xs">
                          Autorisé
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-xs">
                          Refusé
                        </span>
                      )}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openConfigure(s)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#062653] hover:text-[#FF7900] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Configurer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeSigner(s)}
                          title="Révoquer les droits de signature"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SIGNER DELEGATION DRAWER (SORTANT LATÉRALEMENT À DROITE) */}
      <SlideOver
        isOpen={signerModalOpen}
        onClose={() => setSignerModalOpen(false)}
        side="right"
        width="xl"
        title={
          selectedSigner
            ? `Modifier les droits : ${selectedSigner.userName}`
            : "Habiliter un nouveau signataire"
        }
        subtitle="Délégation de signature électronique officielle pour l'entreprise"
        icon={<FileSignature className="w-5 h-5 text-emerald-600" />}
      >
        <form onSubmit={handleSaveSigner} className="space-y-4 text-xs">
          {/* USER SELECTION: USERS LIST ONLY */}
          {!selectedSigner ? (
            <div>
              <label className="block text-xs font-bold text-[#062653] mb-1.5">
                Sélectionner l'utilisateur de l'entreprise <span className="text-rose-500">*</span>
              </label>
              {eligibleUsers.length > 0 ? (
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => handleSelectUser(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F4F6F9] rounded-xl text-xs font-medium text-[#263445] focus:bg-white outline-none transition-colors border border-transparent focus:border-slate-300 cursor-pointer"
                >
                  <option value="">-- Choisir un utilisateur --</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) — {formatUserRole(u.role)}
                    </option>
                  ))}
                </select>
              ) : availableUsers.length > 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs">
                  Tous les utilisateurs actuels de l'entreprise possèdent déjà une délégation de signature.
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                  Aucun autre compte utilisateur trouvé. Créez d'abord un utilisateur dans « Liste des utilisateurs » pour lui attribuer des droits de signature.
                </div>
              )}
              <span className="text-[11px] text-slate-500 mt-1 block leading-tight">
                Seuls les comptes utilisateurs actifs de l'entreprise peuvent être habilités à signer.
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-[#F4F6F9] rounded-xl flex items-center justify-between border border-slate-200/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#062653] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedSigner.userName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-xs text-[#062653]">
                    {selectedSigner.userName}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {selectedSigner.userEmail}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-white text-[#062653] px-2 py-1 rounded border border-slate-200">
                {formatUserRole(selectedSigner.role)}
              </span>
            </div>
          )}

          {/* RIGHTS CHECKBOXES */}
          <div className="space-y-2.5 pt-1">
            <span className="block text-xs font-bold text-[#062653] mb-1">
              Pouvoirs de signature délégués
            </span>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/60 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={canSignLeaves}
                onChange={(e) => setCanSignLeaves(e.target.checked)}
                className="accent-[#062653] w-4 h-4 cursor-pointer"
              />
              <span className="font-semibold text-xs text-[#062653]">
                Autorisation de signer les fiches de congé RH
              </span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/60 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={canSignSalaryRaises}
                onChange={(e) => setCanSignSalaryRaises(e.target.checked)}
                className="accent-[#062653] w-4 h-4 cursor-pointer"
              />
              <span className="font-semibold text-xs text-[#062653]">
                Autorisation de signer les augmentations de salaire
              </span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/60 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={canSignAuthorizations}
                onChange={(e) => setCanSignAuthorizations(e.target.checked)}
                className="accent-[#062653] w-4 h-4 cursor-pointer"
              />
              <span className="font-semibold text-xs text-[#062653]">
                Autorisation de signer les décaissements et achats
              </span>
            </label>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
            {selectedSigner ? (
              <button
                type="button"
                onClick={() => handleRevokeSigner(selectedSigner)}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                Révoquer l'habilitation
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSignerModalOpen(false)}
                className="px-4 py-2.5 text-xs font-semibold text-[#64748B] bg-[#F4F6F9] hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || (!selectedSigner && !selectedUserId)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#062653] hover:bg-[#031B3A] disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {saving
                  ? "Enregistrement..."
                  : selectedSigner
                  ? "Mettre à jour"
                  : "Enregistrer l'habilitation"}
              </button>
            </div>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
