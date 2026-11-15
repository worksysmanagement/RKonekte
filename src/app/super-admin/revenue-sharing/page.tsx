"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Send,
  RefreshCw,
  Sliders,
  DollarSign,
  Users,
  Shield,
  Mail,
  User,
  Info,
  Check,
  X,
  Building2,
  Calendar,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";
import { formatMoney } from "@/lib/utils/subscription";

interface RevenueSharingConfig {
  id: string;
  technoziPct: number;
  developerPct: number;
  directorEmail: string | null;
  directorName: string | null;
  developerEmail: string | null;
  developerName: string | null;
  effectiveFrom: number;
  updatedAt: number;
  updatedByUserId: string | null;
  updatedByName: string | null;
}

interface RevenueSharingProposal {
  id: string;
  previousTechnoziPct: number;
  previousDeveloperPct: number;
  proposedTechnoziPct: number;
  proposedDeveloperPct: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  proposedByUserId: string;
  proposedByName: string;
  proposedByEmail: string;
  targetEmail: string;
  targetName: string | null;
  validationToken: string;
  note: string | null;
  validatedByUserId: string | null;
  validatedByName: string | null;
  validatedByEmail: string | null;
  validatedAt: number | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RevenueSharingMetrics {
  totalApprovedRevenue: number;
  totalTechnoziAmount: number;
  totalDeveloperAmount: number;
  approvedTransactionsCount: number;
  currency: string;
}

interface SuperAdminUserOption {
  id: string;
  name: string;
  email: string;
  status: string;
}

export default function SuperAdminRevenueSharingPage() {
  const [config, setConfig] = useState<RevenueSharingConfig | null>(null);
  const [pendingProposal, setPendingProposal] = useState<RevenueSharingProposal | null>(null);
  const [proposals, setProposals] = useState<RevenueSharingProposal[]>([]);
  const [metrics, setMetrics] = useState<RevenueSharingMetrics | null>(null);
  const [superAdmins, setSuperAdmins] = useState<SuperAdminUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Current session user
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string } | null>(null);

  // Proposal form state
  const [technoziPct, setTechnoziPct] = useState<number>(60);
  const [developerPct, setDeveloperPct] = useState<number>(40);
  const [targetEmail, setTargetEmail] = useState<string>("");
  const [customTargetEmail, setCustomTargetEmail] = useState<string>("");
  const [proposalNote, setProposalNote] = useState<string>("");
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Validation / Rejection state
  const [isValidating, setIsValidating] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [cancellingProposal, setCancellingProposal] = useState(false);

  // Parties settings state
  const [isPartiesModalOpen, setIsPartiesModalOpen] = useState(false);
  const [savingParties, setSavingParties] = useState(false);
  const [editDirectorEmail, setEditDirectorEmail] = useState("");
  const [editDeveloperEmail, setEditDeveloperEmail] = useState("");

  // Load data
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      // Get current logged-in user
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.user) {
          setCurrentUser({
            id: meJson.user.id,
            email: meJson.user.email?.toLowerCase().trim() || "",
            name: meJson.user.name || "SuperAdmin",
          });
        }
      }

      const res = await fetch("/api/super-admin/revenue-sharing", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Impossible de charger la configuration de partage des revenus.");
      }
      const data = await res.json();
      setConfig(data.config);
      setPendingProposal(data.pendingProposal);
      setProposals(data.proposals || []);
      setMetrics(data.metrics);
      setSuperAdmins(data.superAdmins || []);

      if (data.config) {
        setTechnoziPct(data.config.technoziPct);
        setDeveloperPct(data.config.developerPct);
        setEditDirectorEmail(data.config.directorEmail || "");
        setEditDeveloperEmail(data.config.developerEmail || "");
      }
    } catch (err: any) {
      showSystemToast(err.message || "Erreur de chargement", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update percentages synchronized
  const handleTechnoziChange = (val: number) => {
    const safeVal = Math.min(100, Math.max(0, Number(val) || 0));
    setTechnoziPct(safeVal);
    setDeveloperPct(Math.round((100 - safeVal) * 100) / 100);
  };

  const handleDeveloperChange = (val: number) => {
    const safeVal = Math.min(100, Math.max(0, Number(val) || 0));
    setDeveloperPct(safeVal);
    setTechnoziPct(Math.round((100 - safeVal) * 100) / 100);
  };

  const applyPreset = (t: number, d: number) => {
    setTechnoziPct(t);
    setDeveloperPct(d);
  };

  // Determine effective target email
  const effectiveTargetEmail = useMemo(() => {
    if (customTargetEmail.trim()) return customTargetEmail.trim().toLowerCase();
    if (targetEmail) return targetEmail.trim().toLowerCase();

    // Default detection
    if (currentUser && config) {
      const myEmail = currentUser.email.toLowerCase();
      const devEmail = config.developerEmail?.toLowerCase().trim();
      const dirEmail = config.directorEmail?.toLowerCase().trim();

      if (devEmail && myEmail === devEmail && dirEmail) {
        return dirEmail;
      }
      if (dirEmail && myEmail === dirEmail && devEmail) {
        return devEmail;
      }
    }
    return "";
  }, [targetEmail, customTargetEmail, currentUser, config]);

  // Is sum valid?
  const isSumValid = Math.round((technoziPct + developerPct) * 100) / 100 === 100;

  // Has changes compared to active?
  const hasChanges =
    config &&
    (technoziPct !== config.technoziPct || developerPct !== config.developerPct);

  // Can the current user validate the pending proposal?
  // Strictly: NOT the proposer!
  const canValidatePending = useMemo(() => {
    if (!pendingProposal || !currentUser) return false;
    const isProposer =
      currentUser.id === pendingProposal.proposedByUserId ||
      currentUser.email.toLowerCase() === pendingProposal.proposedByEmail.toLowerCase();
    return !isProposer;
  }, [pendingProposal, currentUser]);

  // Submit proposal handler
  const handlePropose = async () => {
    if (!isSumValid) {
      showSystemToast("La somme des deux pourcentages doit être exactement égale à 100 %.", "error");
      return;
    }

    if (!effectiveTargetEmail) {
      showSystemToast("Veuillez sélectionner ou saisir l'adresse e-mail de l'autre partie (Directeur ou Développeur).", "error");
      return;
    }

    if (currentUser && effectiveTargetEmail === currentUser.email.toLowerCase()) {
      showSystemToast("Vous ne pouvez pas envoyer la proposition à votre propre adresse e-mail.", "error");
      return;
    }

    setSubmittingProposal(true);
    try {
      const res = await fetch("/api/super-admin/revenue-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedTechnoziPct: technoziPct,
          proposedDeveloperPct: developerPct,
          targetEmail: effectiveTargetEmail,
          note: proposalNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Échec de l'envoi de la proposition.");
      }

      showSystemToast(json.message || "Proposition transmise par e-mail avec succès !");
      setIsSubmitModalOpen(false);
      setProposalNote("");
      loadData(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur de transmission", "error");
    } finally {
      setSubmittingProposal(false);
    }
  };

  // Validate or Reject handler
  const handleValidateAction = async (action: "APPROVE" | "REJECT") => {
    if (!pendingProposal) return;
    setIsValidating(true);
    try {
      const res = await fetch("/api/super-admin/revenue-sharing/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: pendingProposal.id,
          action,
          rejectionReason: action === "REJECT" ? rejectionReason.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Impossible d'effectuer l'action.");
      }

      showSystemToast(json.message || "Action enregistrée !");
      setIsApproveModalOpen(false);
      setIsRejectModalOpen(false);
      setRejectionReason("");
      loadData(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la validation", "error");
    } finally {
      setIsValidating(false);
    }
  };

  // Cancel proposal
  const handleCancelProposal = async () => {
    if (!pendingProposal) return;
    if (!confirm("Voulez-vous vraiment annuler votre proposition en attente ?")) return;

    setCancellingProposal(true);
    try {
      const res = await fetch("/api/super-admin/revenue-sharing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: pendingProposal.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'annulation.");
      showSystemToast(json.message || "Proposition annulée.");
      loadData(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur", "error");
    } finally {
      setCancellingProposal(false);
    }
  };

  // Save parties contacts
  const handleSaveParties = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingParties(true);
    try {
      const res = await fetch("/api/super-admin/revenue-sharing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directorEmail: editDirectorEmail.trim() || null,
          developerEmail: editDeveloperEmail.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de mise à jour.");
      showSystemToast(json.message || "Coordonnées mises à jour.");
      setIsPartiesModalOpen(false);
      loadData(true);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur", "error");
    } finally {
      setSavingParties(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. TOP HEADER & BACK NAVIGATION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/super-admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#062653] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>SuperAdmin</span>
            </Link>
            <span className="text-slate-300 text-xs">/</span>
            <Link
              href="/super-admin/subscription-settings"
              className="text-xs font-semibold text-[#64748B] hover:text-[#062653] transition-colors"
            >
              Tarifs & Abonnements
            </Link>
            <span className="text-slate-300 text-xs">/</span>
            <span className="text-xs font-bold text-[#FF7900]">Partage des revenus</span>
          </div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight flex items-center gap-2">
            <span>Partage des Revenus (Revenue Sharing)</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Configuration bilatérale de la clé de répartition financière entre TECHNOZI et le Développeur avec validation croisée par e-mail.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsPartiesModalOpen(true)}
            className="h-9 px-3.5 bg-white hover:bg-slate-50 text-xs font-semibold text-[#062653] rounded-xl shadow-2xs border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-[#FF7900]" />
            <span>Coordonnées DG & Développeur</span>
          </button>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="h-9 px-3.5 bg-white hover:bg-slate-50 text-xs font-semibold text-[#062653] rounded-xl shadow-2xs border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* 2. FINANCIAL KPIS & CURRENT SPLIT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Clé Active */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider block">
              Répartition Active
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#062653]">
                {config ? `${config.technoziPct}% / ${config.developerPct}%` : "60% / 40%"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              TECHNOZI ({config?.technoziPct ?? 60}%) • Dév ({config?.developerPct ?? 40}%)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#0284C7] flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Total Encaissé */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider block">
              Total Abonnements Validés
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#062653]">
                {metrics ? formatMoney(metrics.totalApprovedRevenue, metrics.currency) : "$0.00"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {metrics?.approvedTransactionsCount ?? 0} transaction(s) confirmée(s)
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Part Cumulée TECHNOZI */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider block">
              Part Cumulée TECHNOZI
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0284C7]">
                {metrics ? formatMoney(metrics.totalTechnoziAmount, metrics.currency) : "$0.00"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Commission plateforme encaissée
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* KPI: Part Cumulée Développeur */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider block">
              Part Cumulée Développeur
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#FF7900]">
                {metrics ? formatMoney(metrics.totalDeveloperAmount, metrics.currency) : "$0.00"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              Redevance technique perçue
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FF7900] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. PENDING PROPOSAL BANNER (IF ACTIVE) */}
      {pendingProposal && (
        <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-full bg-amber-200 text-amber-900 tracking-wide flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Proposition en attente de validation
                </span>
                <span className="text-xs text-amber-800">
                  Créée le {new Date(pendingProposal.createdAt).toLocaleString("fr-FR")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-[#062653]">
                <span>
                  <strong>Auteur :</strong> {pendingProposal.proposedByName} ({pendingProposal.proposedByEmail})
                </span>
                <span className="text-slate-400">•</span>
                <span>
                  <strong>Destinataire :</strong> {pendingProposal.targetEmail}
                </span>
              </div>

              {pendingProposal.note && (
                <div className="text-xs bg-white/80 border border-amber-200 rounded-xl p-3 text-slate-700 italic">
                  « {pendingProposal.note} »
                </div>
              )}

              {/* Comparaison Visuelle */}
              <div className="pt-2 flex items-center gap-4 text-xs font-semibold">
                <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                  Actuel : {pendingProposal.previousTechnoziPct}% TECHNOZI / {pendingProposal.previousDeveloperPct}% Développeur
                </div>
                <span className="text-amber-700 font-bold">➜</span>
                <div className="bg-amber-100 text-amber-950 px-3 py-1.5 rounded-lg border border-amber-300 font-bold text-sm">
                  Proposé : {pendingProposal.proposedTechnoziPct}% TECHNOZI / {pendingProposal.proposedDeveloperPct}% Développeur
                </div>
              </div>
            </div>

            {/* Action buttons depending on role */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {canValidatePending ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsApproveModalOpen(true)}
                    className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Valider et appliquer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRejectModalOpen(true)}
                    className="h-10 px-4 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Rejeter</span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-xs text-amber-900 bg-white/90 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
                    En attente de validation par <strong>{pendingProposal.targetEmail}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelProposal}
                    disabled={cancellingProposal}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 underline cursor-pointer disabled:opacity-50"
                  >
                    {cancellingProposal ? "Annulation en cours..." : "Annuler ma proposition"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. ACTIVE VISUAL SPLIT BAR */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#062653] flex items-center gap-2">
              <span>Répartition des revenus actuellement active</span>
            </h2>
            <p className="text-xs text-[#64748B]">
              Cette clé est scellée sur chaque transaction d'abonnement au moment de son approbation.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 text-[#0284C7]">
              <span className="w-3 h-3 rounded-full bg-[#0284C7]" />
              TECHNOZI ({config?.technoziPct ?? 60}%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#FF7900]">
              <span className="w-3 h-3 rounded-full bg-[#FF7900]" />
              Développeur ({config?.developerPct ?? 40}%)
            </span>
          </div>
        </div>

        {/* Visual Dual-Color Bar */}
        <div className="w-full h-8 bg-slate-100 rounded-2xl overflow-hidden flex shadow-inner border border-slate-200/80 p-0.5">
          <div
            style={{ width: `${config?.technoziPct ?? 60}%` }}
            className="h-full bg-gradient-to-r from-[#062653] to-[#0284C7] rounded-l-xl flex items-center justify-start px-3 text-white text-xs font-bold transition-all duration-500 whitespace-nowrap overflow-hidden"
          >
            TECHNOZI {config?.technoziPct ?? 60}%
          </div>
          <div
            style={{ width: `${config?.developerPct ?? 40}%` }}
            className="h-full bg-gradient-to-r from-[#FF7900] to-[#E66D00] rounded-r-xl flex items-center justify-end px-3 text-white text-xs font-bold transition-all duration-500 whitespace-nowrap overflow-hidden"
          >
            Développeur {config?.developerPct ?? 40}%
          </div>
        </div>
      </div>

      {/* 5. FORM: PROPOSER UNE NOUVELLE RÉPARTITION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche : Formulaire & curseurs */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-[#062653] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#FF7900]" />
              <span>Proposer une nouvelle répartition</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Ajustez librement les deux pourcentages. La somme doit impérativement faire 100 %.
            </p>
          </div>

          {/* Raccourcis / Préréglages fréquents */}
          <div>
            <label className="text-xs font-bold text-[#062653] mb-2 block">
              Préréglages rapides :
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { t: 60, d: 40, label: "60% / 40%" },
                { t: 50, d: 50, label: "50% / 50%" },
                { t: 70, d: 30, label: "70% / 30%" },
                { t: 55, d: 45, label: "55% / 45%" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.t, preset.d)}
                  className={`h-9 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                    technoziPct === preset.t && developerPct === preset.d
                      ? "bg-[#062653] text-white border-[#062653] shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Saisie synchronisée des pourcentages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Input TECHNOZI */}
            <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#062653] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" />
                  TECHNOZI (%)
                </label>
                <span className="text-xs font-semibold text-[#0284C7]">{technoziPct}%</span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={technoziPct}
                onChange={(e) => handleTechnoziChange(Number(e.target.value))}
                className="w-full h-11 px-3 bg-white border border-sky-200 rounded-xl text-lg font-bold text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={technoziPct}
                onChange={(e) => handleTechnoziChange(Number(e.target.value))}
                className="w-full accent-[#0284C7] cursor-pointer"
              />
            </div>

            {/* Input DÉVELOPPEUR */}
            <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#062653] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF7900]" />
                  Développeur (%)
                </label>
                <span className="text-xs font-semibold text-[#FF7900]">{developerPct}%</span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={developerPct}
                onChange={(e) => handleDeveloperChange(Number(e.target.value))}
                className="w-full h-11 px-3 bg-white border border-orange-200 rounded-xl text-lg font-bold text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#FF7900]"
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={developerPct}
                onChange={(e) => handleDeveloperChange(Number(e.target.value))}
                className="w-full accent-[#FF7900] cursor-pointer"
              />
            </div>
          </div>

          {/* Visualisation en temps réel de la proposition */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Aperçu de la nouvelle clé :</span>
              <span className={isSumValid ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                Total : {Math.round((technoziPct + developerPct) * 100) / 100}%
                {isSumValid ? " (Valide = 100%)" : " (Invalide ≠ 100%)"}
              </span>
            </div>
            <div className="w-full h-7 bg-slate-100 rounded-xl overflow-hidden flex border border-slate-200 p-0.5">
              <div
                style={{ width: `${technoziPct}%` }}
                className="h-full bg-[#0284C7] rounded-l-lg flex items-center justify-center text-white text-[11px] font-bold transition-all"
              >
                {technoziPct}%
              </div>
              <div
                style={{ width: `${developerPct}%` }}
                className="h-full bg-[#FF7900] rounded-r-lg flex items-center justify-center text-white text-[11px] font-bold transition-all"
              >
                {developerPct}%
              </div>
            </div>
          </div>

          {/* Choix du destinataire pour validation */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-bold text-[#062653] block mb-1">
                Destinataire pour la validation croisée (Directeur Général ou Développeur) :
              </label>
              <p className="text-[11px] text-[#64748B] mb-2">
                L'e-mail officiel avec le bouton d'accès et de validation sera transmis à cette adresse.
              </p>

              {/* Sélection parmi les SuperAdmins */}
              <select
                value={targetEmail}
                onChange={(e) => {
                  setTargetEmail(e.target.value);
                  if (e.target.value) setCustomTargetEmail("");
                }}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#FF7900] mb-2"
              >
                <option value="">-- Choisir un compte SuperAdmin existant --</option>
                {superAdmins
                  .filter((a) => !currentUser || a.email.toLowerCase() !== currentUser.email.toLowerCase())
                  .map((a) => (
                    <option key={a.id} value={a.email}>
                      {a.name} ({a.email})
                    </option>
                  ))}
              </select>

              {/* Ou saisie manuelle libre */}
              <input
                type="email"
                placeholder="Ou saisir une autre adresse e-mail officielle..."
                value={customTargetEmail}
                onChange={(e) => {
                  setCustomTargetEmail(e.target.value);
                  if (e.target.value) setTargetEmail("");
                }}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#FF7900]"
              />
            </div>

            {/* Note ou motif optionnel */}
            <div>
              <label className="text-xs font-bold text-[#062653] block mb-1">
                Motif ou note explicative (Optionnel) :
              </label>
              <textarea
                rows={2}
                value={proposalNote}
                onChange={(e) => setProposalNote(e.target.value)}
                placeholder="Ex. Révision périodique convenue par accord mutuel..."
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#FF7900] resize-none"
              />
            </div>
          </div>

          {/* Bouton de soumission */}
          <div>
            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(true)}
              disabled={!isSumValid || !effectiveTargetEmail || submittingProposal}
              className="w-full h-11 bg-[#062653] hover:bg-[#03152d] text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 text-[#FF7900]" />
              <span>Transmettre la proposition pour validation bilatérale</span>
            </button>
            {!isSumValid && (
              <p className="text-[11px] text-rose-600 mt-1.5 text-center font-medium">
                La somme doit être strictement égale à 100 % pour pouvoir soumettre.
              </p>
            )}
          </div>
        </div>

        {/* Colonne droite : Simulateur financier dynamique & Règles */}
        <div className="lg:col-span-5 space-y-6">
          {/* Simulateur sur les tarifs officiels */}
          <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#062653] flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-[#0284C7]" />
                <span>Simulateur d'impact sur les forfaits</span>
              </h3>
              <p className="text-[11px] text-[#64748B]">
                Calcul automatique pour chaque nouvel abonnement selon la clé sélectionnée ({technoziPct}% / {developerPct}%) :
              </p>
            </div>

            <div className="space-y-3">
              {[
                { label: "1 Mois", price: 50 },
                { label: "3 Mois (-10%)", price: 135 },
                { label: "6 Mois (-15%)", price: 255 },
                { label: "12 Mois (-15%)", price: 510 },
              ].map((item) => {
                const tAmt = Math.round(item.price * (technoziPct / 100) * 100) / 100;
                const dAmt = Math.round((item.price - tAmt) * 100) / 100;
                return (
                  <div
                    key={item.label}
                    className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#062653] block">{item.label}</span>
                      <span className="text-[11px] text-slate-500">${item.price} USD</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="text-[#0284C7] font-semibold">
                        TECHNOZI : <strong>${tAmt.toFixed(2)}</strong>
                      </div>
                      <div className="text-[#FF7900] font-semibold">
                        Développeur : <strong>${dAmt.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Règle d'or de protection & non-rétroactivité */}
          <div className="bg-blue-50/60 rounded-3xl p-5 border border-blue-100 space-y-2">
            <h4 className="text-xs font-bold text-[#062653] flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#0284C7]" />
              <span>Protection stricte des anciennes transactions</span>
            </h4>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Une modification des pourcentages ne s'applique <strong>jamais</strong> rétroactivement. Chaque paiement conserve de façon permanente la copie des commissions calculées au moment de son encaissement officiel.
            </p>
          </div>
        </div>
      </div>

      {/* 6. HISTORIQUE DES PROPOSITIONS & CHANGEMENTS */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#062653] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#64748B]" />
            <span>Historique des modifications & propositions</span>
          </h2>
          <p className="text-xs text-[#64748B]">
            Journal immuable de toutes les demandes, validations croisées et dates d'effet.
          </p>
        </div>

        {proposals.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
            Aucun historique de modification pour le moment. La répartition initiale par défaut est de 60 % TECHNOZI / 40 % Développeur.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Auteur</th>
                  <th className="py-3 px-3">Répartition</th>
                  <th className="py-3 px-3">Destinataire</th>
                  <th className="py-3 px-3">Statut</th>
                  <th className="py-3 px-3">Validé / Rejeté par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proposals.map((p) => {
                  let badge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      En attente
                    </span>
                  );
                  if (p.status === "APPROVED") {
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Approuvé
                      </span>
                    );
                  } else if (p.status === "REJECTED") {
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Rejeté
                      </span>
                    );
                  } else if (p.status === "CANCELLED") {
                    badge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        Annulé
                      </span>
                    );
                  }

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString("fr-FR")} à{" "}
                        {new Date(p.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 px-3 text-[#062653] font-medium">
                        {p.proposedByName}
                        <span className="text-[11px] text-slate-400 block">{p.proposedByEmail}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#062653]">
                        <span className="text-[#0284C7]">{p.proposedTechnoziPct}%</span> /{" "}
                        <span className="text-[#FF7900]">{p.proposedDeveloperPct}%</span>
                        <span className="text-[10px] text-slate-400 font-normal block">
                          (était {p.previousTechnoziPct}% / {p.previousDeveloperPct}%)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {p.targetEmail}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{badge}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {p.validatedByName ? (
                          <div>
                            <span className="font-medium text-[#062653]">{p.validatedByName}</span>
                            <span className="text-[10px] text-slate-400 block">
                              {p.validatedAt ? new Date(p.validatedAt).toLocaleDateString("fr-FR") : ""}
                            </span>
                          </div>
                        ) : p.rejectionReason ? (
                          <span className="text-rose-600 text-[11px] italic">{p.rejectionReason}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MODALE 1 : CONFIRMATION DE SOUMISSION ================= */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Confirmation de la proposition de répartition"
      >
        <div className="space-y-4 pt-2">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Nouvelle répartition proposée :</span>
              <strong className="text-[#062653]">
                TECHNOZI {technoziPct}% / Développeur {developerPct}%
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Destinataire pour validation :</span>
              <strong className="text-[#062653]">{effectiveTargetEmail}</strong>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Un e-mail officiel sera automatiquement envoyé à <strong>{effectiveTargetEmail}</strong> avec le lien direct pour examiner et valider cette modification.
          </p>

          <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-[11px] text-amber-900">
            <strong>Rappel :</strong> Cette nouvelle répartition ne sera active qu'une fois que l'autre partie aura cliqué sur <strong>Valider</strong>.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handlePropose}
              disabled={submittingProposal}
              className="px-5 py-2 bg-[#062653] hover:bg-[#03152d] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5"
            >
              {submittingProposal ? "Envoi en cours..." : "Confirmer et envoyer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ================= MODALE 2 : VALIDATION ET APPROBATION ================= */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Valider la nouvelle clé de répartition"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-700 leading-relaxed">
            Vous êtes sur le point de valider la proposition de répartition suivante :
          </p>

          {pendingProposal && (
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-xs space-y-1.5 text-center">
              <span className="text-emerald-800 text-[11px] font-bold uppercase tracking-wider block">
                Nouvelle clé active
              </span>
              <div className="text-xl font-extrabold text-[#062653]">
                TECHNOZI : <span className="text-[#0284C7]">{pendingProposal.proposedTechnoziPct}%</span> &nbsp;|&nbsp; Développeur : <span className="text-[#FF7900]">{pendingProposal.proposedDeveloperPct}%</span>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Dès validation, ce pourcentage s'appliquera immédiatement aux prochains paiements confirmés. Les transactions antérieures resteront inchangées.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsApproveModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleValidateAction("APPROVE")}
              disabled={isValidating}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5"
            >
              {isValidating ? "Validation en cours..." : "Confirmer la validation"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ================= MODALE 3 : REJET ================= */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Rejeter la proposition de répartition"
      >
        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-700 leading-relaxed">
            Veuillez indiquer le motif du rejet de cette proposition. La répartition actuelle restera active.
          </p>

          <div>
            <label className="text-xs font-bold text-[#062653] block mb-1">
              Motif du refus (Obligatoire) :
            </label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Indiquez la raison du désaccord..."
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-[#062653] focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsRejectModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => handleValidateAction("REJECT")}
              disabled={isValidating || !rejectionReason.trim()}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isValidating ? "Rejet en cours..." : "Confirmer le rejet"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ================= MODALE 4 : COORDONNÉES DES PARTIES ================= */}
      <Modal
        isOpen={isPartiesModalOpen}
        onClose={() => setIsPartiesModalOpen(false)}
        title="Coordonnées officielles des deux parties"
      >
        <form onSubmit={handleSaveParties} className="space-y-4 pt-2">
          <p className="text-xs text-slate-600">
            Ces adresses e-mail serviront de destinataires privilégiés lors de l'émission d'une proposition de révision du partage des revenus.
          </p>

          <div>
            <label className="text-xs font-bold text-[#062653] block mb-1">
              E-mail du Directeur Général (TECHNOZI) :
            </label>
            <input
              type="email"
              value={editDirectorEmail}
              onChange={(e) => setEditDirectorEmail(e.target.value)}
              placeholder="Ex. dg@technozi-ht.com"
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#062653] block mb-1">
              E-mail du Développeur :
            </label>
            <input
              type="email"
              value={editDeveloperEmail}
              onChange={(e) => setEditDeveloperEmail(e.target.value)}
              placeholder="Ex. pitonrodjy@gmail.com"
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-[#062653] focus:outline-none focus:ring-2 focus:ring-[#FF7900]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPartiesModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={savingParties}
              className="px-5 py-2 bg-[#062653] hover:bg-[#03152d] text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {savingParties ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
