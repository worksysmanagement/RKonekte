"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  FileText,
  History,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  PaymentAccountLogo,
  ProofPreviewModal,
  readPaymentProofFile,
} from "@/components/subscription/PaymentVisuals";
import {
  calculateRenewalWindow,
  formatFrDate,
  formatMoney,
  PaymentAccountConfig,
  PlatformSubscriptionSettingsData,
  SubscriptionPlanOption,
  SubscriptionRenewalItem,
  SubscriptionStateSummary,
} from "@/lib/utils/subscription";
import { showSystemToast } from "@/components/ui/SystemToast";

interface SubscriptionOverviewResponse {
  canManageSubscription: boolean;
  message?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
    email: string | null;
    status: string;
    createdAt: number;
    activatedAt: number | null;
    lastRenewedAt: number | null;
    subscriptionExpiresAt: number | null;
    serviceStopped: boolean;
    serviceStoppedAt: number | null;
  };
  state?: SubscriptionStateSummary;
  settings?: PlatformSubscriptionSettingsData;
  plans?: SubscriptionPlanOption[];
  paymentAccounts?: PaymentAccountConfig[];
  pendingRenewal?: SubscriptionRenewalItem | null;
  lastRejectedRenewal?: SubscriptionRenewalItem | null;
  history?: SubscriptionRenewalItem[];
}

export default function AdminSubscriptionPage() {
  const [data, setData] = useState<SubscriptionOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedDuration, setSelectedDuration] = useState<number>(3);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [payerCompanyName, setPayerCompanyName] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [proofDataUrl, setProofDataUrl] = useState<string>("");
  const [proofFileName, setProofFileName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewTarget, setPreviewTarget] = useState<{
    url: string;
    name?: string | null;
  } | null>(null);
  const [replaceMode, setReplaceMode] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/subscription", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/login");
        return;
      }
      const json: SubscriptionOverviewResponse & { code?: string } = await res.json();
      if (
        res.status === 403 &&
        (json?.code === "SERVICE_STOPPED" || !json?.code)
      ) {
        window.location.replace("/api/auth/stopped-redirect");
        return;
      }
      if (res.status === 403 && json?.code === "ACCOUNT_INACTIVE") {
        window.location.replace("/login?inactive=1");
        return;
      }
      if (
        json?.state?.isExpired ||
        json?.state?.serviceStopped ||
        json?.state?.isAccessBlocked
      ) {
        window.location.replace("/api/auth/stopped-redirect");
        return;
      }
      setData(json);
      if (json.paymentAccounts && json.paymentAccounts.length === 1) {
        setPaymentMethod(json.paymentAccounts[0].label);
      } else if (json.paymentAccounts && json.paymentAccounts.length > 1) {
        setPaymentMethod((prev) =>
          prev && json.paymentAccounts!.some((a) => a.label === prev) ? prev : ""
        );
      }
      if (json.pendingRenewal) {
        setSelectedDuration(json.pendingRenewal.durationMonths || 1);
      }
    } catch (err) {
      console.error("Failed to fetch subscription overview:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const plans = data?.plans || [];
  const selectedPlan = useMemo(() => {
    return plans.find((p) => p.durationMonths === selectedDuration) || plans[0] || null;
  }, [plans, selectedDuration]);

  const projectedWindow = useMemo(() => {
    return calculateRenewalWindow(
      data?.organization?.subscriptionExpiresAt ?? null,
      Date.now(),
      selectedDuration
    );
  }, [data?.organization?.subscriptionExpiresAt, selectedDuration]);

  const handleCopyAccount = async (acc: PaymentAccountConfig) => {
    try {
      await navigator.clipboard.writeText(acc.accountNumber);
      setCopiedId(acc.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (_) {}
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const { dataUrl, fileName } = await readPaymentProofFile(file);
      setProofDataUrl(dataUrl);
      setProofFileName(fileName);
    } catch (err: any) {
      setFormError(err?.message || "Impossible de lire ce fichier.");
    } finally {
      e.target.value = "";
    }
  };

  const handleSubmitReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!paymentMethod) {
      setFormError("Veuillez choisir un compte de paiement.");
      setWizardStep(2);
      return;
    }

    if (!proofDataUrl && paymentReference.trim().length < 3) {
      setFormError(
        "Veuillez importer votre preuve de paiement (ou saisir une référence valide)."
      );
      setWizardStep(3);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMonths: selectedDuration,
          paymentMethod,
          paymentReference: paymentReference.trim() || null,
          payerCompanyName: payerCompanyName.trim() || null,
          proofDataUrl: proofDataUrl || null,
          proofFileName: proofFileName || null,
          replacePending: Boolean(data?.pendingRenewal && replaceMode),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Impossible d'envoyer votre preuve.");
        return;
      }

      showSystemToast(
        json.message || "Preuve de paiement transmise pour vérification manuelle."
      );
      setPaymentReference("");
      setPayerCompanyName("");
      setProofDataUrl("");
      setProofFileName("");
      setReplaceMode(false);
      setWizardStep(1);
      if (json.overview) {
        setData({ canManageSubscription: true, ...json.overview });
      } else {
        await loadOverview();
      }
    } catch (_) {
      setFormError("Erreur réseau lors de l'envoi de votre preuve.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPending = async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/admin/subscription", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        showSystemToast(json.error || "Erreur lors de l'annulation.", "error");
        return;
      }
      showSystemToast("Soumission annulée. Vous pouvez envoyer une nouvelle preuve.");
      setReplaceMode(false);
      setWizardStep(1);
      if (json.overview) {
        setData({ canManageSubscription: true, ...json.overview });
      } else {
        await loadOverview();
      }
    } catch (_) {
      showSystemToast("Erreur réseau.", "error");
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-[#64748B]">
        <div className="w-7 h-7 border-2 border-[#FF7900] border-t-transparent rounded-full animate-spin" />
        <span>Chargement de votre espace abonnement...</span>
      </div>
    );
  }

  if (
    data?.state?.isExpired ||
    data?.state?.serviceStopped ||
    data?.state?.isAccessBlocked
  ) {
    return null;
  }

  if (!data?.canManageSubscription) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-[#062653] flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-[#062653]">Accès restreint</h1>
        <p className="text-xs text-[#64748B] leading-relaxed">
          {data?.message ||
            "La gestion de l'abonnement et des paiements est strictement réservée à l'administrateur de votre entreprise."}
        </p>
      </div>
    );
  }

  const org = data.organization!;
  const state = data.state!;
  const settings = data.settings!;
  const accounts = data.paymentAccounts || [];
  const pendingRenewal = data.pendingRenewal;
  const lastRejected = data.lastRejectedRenewal;
  const history = data.history || [];

  const isExpired = state.isExpired;
  const isExpiringSoon =
    !isExpired && typeof state.daysRemaining === "number" && state.daysRemaining <= 7;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Abonnement & Paiement
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Suivi de votre période d'utilisation pour <strong>{org.name}</strong>, choix de durée et soumission manuelle des références de paiement.
          </p>
        </div>

        <button
          type="button"
          onClick={loadOverview}
          className="px-3.5 py-2 bg-white hover:bg-[#F4F6F9] shadow-xs rounded-xl text-xs font-semibold text-[#062653] flex items-center gap-2 self-start cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Statut du forfait
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                isExpired
                  ? "text-rose-600"
                  : isExpiringSoon
                  ? "text-[#FF7900]"
                  : "text-emerald-600"
              }`}
            >
              {isExpired ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : isExpiringSoon ? (
                <Clock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              )}
              {state.countdownLabel}
            </span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-2">
            {org.lastRenewedAt
              ? "Cycle payant actif"
              : `${settings.trialMonths}er mois gratuit offert à l'activation`}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Activation du compte
          </div>
          <div className="mt-2 text-lg font-bold text-[#062653]">
            {formatFrDate(org.activatedAt || org.createdAt)}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            Départ du {settings.trialMonths}er mois gratuit
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Dernier renouvellement
          </div>
          <div className="mt-2 text-lg font-bold text-[#062653]">
            {formatFrDate(org.lastRenewedAt)}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            {org.lastRenewedAt ? "Dernière validation manuelle" : "Période d'essai initiale"}
          </p>
        </div>

        <div
          className={`rounded-2xl p-4 shadow-xs ${
            isExpired
              ? "bg-rose-50/60"
              : isExpiringSoon
              ? "bg-amber-50/70"
              : "bg-white"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Prochaine expiration
          </div>
          <div className="mt-2 text-lg font-bold text-[#062653]">
            {formatFrDate(org.subscriptionExpiresAt)}
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            {typeof state.daysRemaining === "number"
              ? state.daysRemaining < 0
                ? `Dépassée de ${Math.abs(state.daysRemaining)} jour(s)`
                : state.daysRemaining === 0
                ? "Arrive à terme aujourd'hui"
                : `Reste ${state.daysRemaining} jour${state.daysRemaining > 1 ? "s" : ""}`
              : "—"}
          </p>
        </div>
      </div>

      {/* MESSAGE CONFIGURE PAR SUPERADMIN + RÈGLE D'AVANCE */}
      <div className="bg-[#062653] text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#FF7900] uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>{settings.autoMessageTitle}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-3xl">
            {settings.autoMessageBody}
          </p>
        </div>
        <div className="bg-white/10 rounded-xl p-3 text-[11px] text-slate-100 shrink-0 max-w-xs">
          <div className="font-bold text-[#FF7900] mb-1">Paiement en avance protégé</div>
          Tout renouvellement validé avant votre date d'expiration s'ajoute directement à partir de l'échéance actuelle : aucun jour restant n'est perdu.
        </div>
      </div>

      {/* WIZARD PAR ÉTAPES : DURÉE -> COMPTE DE PAIEMENT -> PREUVE */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        {/* LAST REJECTED NOTICE */}
        {lastRejected && !pendingRenewal && (
          <div className="p-3.5 rounded-xl bg-rose-50 text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Dernière soumission refusée (
                {lastRejected.paymentReference || lastRejected.proofFileName || lastRejected.paymentMethod}
                )
              </span>
            </div>
            <p className="text-rose-800">
              Motif : {lastRejected.rejectionReason || "Paiement non confirmé."}
            </p>
          </div>
        )}

        {pendingRenewal && !replaceMode ? (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 space-y-3 text-xs text-amber-950">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Clock className="w-4 h-4 text-[#FF7900]" />
                  Preuve de paiement transmise — Vérification en cours
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-950">
                  En attente
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <span className="text-amber-800/80 block text-[10px]">Durée demandée</span>
                  <strong>{pendingRenewal.durationMonths} mois</strong>
                </div>
                <div>
                  <span className="text-amber-800/80 block text-[10px]">Montant</span>
                  <strong>
                    {formatMoney(pendingRenewal.amountExpected, pendingRenewal.currency)}
                  </strong>
                </div>
                <div>
                  <span className="text-amber-800/80 block text-[10px]">Compte utilisé</span>
                  <strong>{pendingRenewal.paymentMethod}</strong>
                </div>
                <div>
                  <span className="text-amber-800/80 block text-[10px]">
                    {pendingRenewal.paymentReference ? "Référence" : "Entreprise indiquée"}
                  </span>
                  <strong className="font-mono">
                    {pendingRenewal.paymentReference ||
                      pendingRenewal.payerCompanyName ||
                      "—"}
                  </strong>
                </div>
              </div>
              {pendingRenewal.payerCompanyName && pendingRenewal.paymentReference && (
                <div className="text-[11px] text-amber-900">
                  Entreprise indiquée : <strong>{pendingRenewal.payerCompanyName}</strong>
                </div>
              )}
              {pendingRenewal.proofDataUrl && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewTarget({
                        url: pendingRenewal.proofDataUrl!,
                        name: pendingRenewal.proofFileName,
                      });
                      setPreviewOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white shadow-2xs text-xs font-bold text-[#062653] hover:bg-amber-100/50 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                    <span>
                      Voir la preuve ({pendingRenewal.proofFileName || "Fichier joint"})
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod(pendingRenewal.paymentMethod);
                  setPaymentReference(pendingRenewal.paymentReference || "");
                  setPayerCompanyName(pendingRenewal.payerCompanyName || "");
                  setProofDataUrl(pendingRenewal.proofDataUrl || "");
                  setProofFileName(pendingRenewal.proofFileName || "");
                  setSelectedDuration(pendingRenewal.durationMonths);
                  setReplaceMode(true);
                  setWizardStep(1);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Corriger / Remplacer
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelPending}
                className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Annuler</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* STEP INDICATOR */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              {[
                { num: 1, label: "1. Durée" },
                { num: 2, label: "2. Compte" },
                { num: 3, label: "3. Preuve" },
                { num: 4, label: "4. Récapitulatif" },
              ].map((stepItem, idx) => {
                const isActive = wizardStep === stepItem.num;
                const isDone = wizardStep > stepItem.num;
                return (
                  <React.Fragment key={stepItem.num}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                          isActive
                            ? "bg-[#FF7900] text-white"
                            : isDone
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isDone ? <Check className="w-3.5 h-3.5" /> : stepItem.num}
                      </span>
                      <span
                        className={`text-xs font-bold hidden sm:inline ${
                          isActive
                            ? "text-[#062653]"
                            : isDone
                            ? "text-emerald-700"
                            : "text-slate-400"
                        }`}
                      >
                        {stepItem.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div
                        className={`flex-1 h-0.5 rounded-full ${
                          wizardStep > stepItem.num ? "bg-emerald-500" : "bg-slate-200"
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* STEP 1 ONLY */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#062653]">
                      1. Choisissez votre durée de renouvellement
                    </h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Profitez automatiquement des remises sur les engagements de 3, 6 ou 12 mois.
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F4F6F9] text-[#062653]">
                    {settings.currency}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {plans.map((plan) => {
                    const isSelected = plan.durationMonths === selectedDuration;
                    return (
                      <button
                        key={plan.durationMonths}
                        type="button"
                        onClick={() => setSelectedDuration(plan.durationMonths)}
                        className={`text-left p-4 rounded-xl transition-all cursor-pointer relative ${
                          isSelected
                            ? "ring-2 ring-[#FF7900] bg-[#FFF8F2] shadow-xs"
                            : "bg-[#F4F6F9] hover:bg-slate-200/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#062653]">{plan.label}</span>
                          {plan.discountPct > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              -{plan.discountPct}%
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-extrabold text-[#062653]">
                            {formatMoney(plan.price, plan.currency)}
                          </span>
                          {plan.savings > 0 && (
                            <span className="text-xs line-through text-slate-400">
                              {formatMoney(plan.baseTotal, plan.currency)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[11px] text-[#64748B]">
                          {plan.savings > 0
                            ? `Économie de ${formatMoney(plan.savings, plan.currency)} • ${formatMoney(plan.pricePerMonth, plan.currency)}/mois`
                            : `Tarif mensuel standard`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPlan && (
                  <div className="p-3.5 bg-[#F4F6F9] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-[#263445]">
                      <Calendar className="w-4 h-4 text-[#FF7900] shrink-0" />
                      <span>
                        Si validé aujourd'hui, la période partira du{" "}
                        <strong className="text-[#062653]">
                          {formatFrDate(projectedWindow.periodStart)}
                        </strong>{" "}
                        au{" "}
                        <strong className="text-[#062653]">
                          {formatFrDate(projectedWindow.periodEnd)}
                        </strong>
                        .
                      </span>
                    </div>
                    <span className="font-bold text-[#062653] shrink-0">
                      {formatMoney(selectedPlan.price, selectedPlan.currency)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {replaceMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplaceMode(false);
                        setFormError(null);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#F4F6F9] text-xs font-semibold text-[#64748B] hover:bg-slate-200/70 cursor-pointer"
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setWizardStep(2);
                    }}
                    className="px-6 h-11 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>Suivant</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2 ONLY */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#062653]">
                      2. Comptes disponibles pour le paiement
                    </h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Choisissez un compte (MonCash, Unibank ou Sogebank), effectuez votre règlement puis cliquez sur Suivant.
                    </p>
                  </div>
                  {selectedPlan && (
                    <div className="px-3 py-1.5 rounded-xl bg-[#F4F6F9] text-xs font-bold text-[#062653] shrink-0">
                      {selectedPlan.label} •{" "}
                      <span className="text-[#FF7900]">
                        {formatMoney(selectedPlan.price, selectedPlan.currency)}
                      </span>
                    </div>
                  )}
                </div>

                {accounts.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#F4F6F9] text-xs text-[#64748B]">
                    Aucun compte de paiement n'est encore configuré par l'administrateur plateforme.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((acc) => {
                      const isChosenMethod = paymentMethod === acc.label;
                      return (
                        <div
                          key={acc.id}
                          onClick={() => {
                            setPaymentMethod(acc.label);
                            setFormError(null);
                          }}
                          className={`p-4 rounded-xl transition-all cursor-pointer ${
                            isChosenMethod
                              ? "ring-2 ring-[#FF7900] bg-[#FFF8F2]"
                              : "bg-[#F4F6F9] hover:bg-slate-200/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <PaymentAccountLogo account={acc} />
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-[#062653]">
                                    {acc.label}
                                  </span>
                                  {acc.accountName && (
                                    <span className="text-[11px] text-[#64748B]">
                                      • {acc.accountName}
                                    </span>
                                  )}
                                  {isChosenMethod && (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF7900] text-white">
                                      <Check className="w-2.5 h-2.5" />
                                      Sélectionné
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-mono font-bold text-[#062653]">
                                  {acc.accountNumber}
                                </div>
                                {acc.instructions && (
                                  <p className="text-[11px] text-[#64748B]">{acc.instructions}</p>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyAccount(acc);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 shadow-2xs text-[11px] font-semibold text-[#062653] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {copiedId === acc.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Copié</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copier</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {formError && (
                  <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setWizardStep(1);
                    }}
                    className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Précédent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!paymentMethod) {
                        setFormError(
                          "Veuillez choisir un compte de paiement avant de continuer."
                        );
                        return;
                      }
                      setFormError(null);
                      setWizardStep(3);
                    }}
                    className="px-6 h-11 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <span>Suivant</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 ONLY: UPLOAD PROOF + OPTIONAL COMPANY NAME */}
            {wizardStep === 3 && (() => {
              const chosenAcc =
                accounts.find((a) => a.label === paymentMethod) || null;
              return (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#F4F6F9] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {chosenAcc ? (
                        <PaymentAccountLogo account={chosenAcc} className="w-12 h-10" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-[#FF7900]" />
                      )}
                      <div className="text-xs min-w-0">
                        <div className="font-bold text-[#062653]">
                          {paymentMethod}
                          {chosenAcc?.accountNumber ? ` • ${chosenAcc.accountNumber}` : ""}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Forfait : {selectedPlan?.label || `${selectedDuration} mois`}
                        </div>
                      </div>
                    </div>
                    {selectedPlan && (
                      <span className="text-sm font-extrabold text-[#FF7900] shrink-0">
                        {formatMoney(selectedPlan.price, selectedPlan.currency)}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#062653] mb-1.5">
                      3. Importer votre preuve de paiement{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    {!proofDataUrl ? (
                      <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-[#F4F6F9] hover:bg-[#FFF8F2]/80 transition-all cursor-pointer text-center">
                        <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#FF7900] shadow-2xs">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-[#062653]">
                            Cliquez pour importer votre preuve de paiement
                          </div>
                          <div className="text-[11px] text-[#64748B]">
                            Capture d'écran, photo du reçu bancaire ou PDF (max 5 Mo)
                          </div>
                        </div>
                        <input
                          type="file"
                          accept="image/*,.pdf,application/pdf"
                          onChange={handleProofFileChange}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="p-3.5 rounded-2xl bg-emerald-50/70 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {proofDataUrl.startsWith("data:image/") ? (
                            <img
                              src={proofDataUrl}
                              alt="Aperçu preuve"
                              className="w-12 h-12 rounded-lg object-cover bg-white shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-white text-rose-600 flex items-center justify-center shrink-0">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#062653] truncate">
                              {proofFileName || "Preuve importée"}
                            </div>
                            <div className="text-[11px] text-emerald-700 font-semibold">
                              Preuve prête à être envoyée
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewTarget({
                                url: proofDataUrl,
                                name: proofFileName,
                              });
                              setPreviewOpen(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white shadow-2xs text-[11px] font-semibold text-[#062653] hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Voir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProofDataUrl("");
                              setProofFileName("");
                            }}
                            className="p-1.5 rounded-lg bg-white shadow-2xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Retirer le fichier"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#263445] mb-1">
                        Nom de l'entreprise (optionnel)
                      </label>
                      <input
                        type="text"
                        value={payerCompanyName}
                        onChange={(e) => setPayerCompanyName(e.target.value)}
                        placeholder={`Ex : ${org.name} (optionnel)`}
                        className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs text-[#062653] outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#263445] mb-1">
                        Référence de transaction (optionnel)
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Ex : N° de bordereau ou transaction"
                        className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-mono text-[#062653] outline-hidden"
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
                      {formError}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setWizardStep(2);
                      }}
                      className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Précédent</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!proofDataUrl && paymentReference.trim().length < 3) {
                          setFormError(
                            "Veuillez importer votre preuve de paiement (ou saisir une référence valide)."
                          );
                          return;
                        }
                        setFormError(null);
                        setWizardStep(4);
                      }}
                      className="px-6 h-11 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Suivant</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* STEP 4 ONLY: RÉCAPITULATIF AVANT SOUMISSION */}
            {wizardStep === 4 && (() => {
              const chosenAcc =
                accounts.find((a) => a.label === paymentMethod) || null;
              return (
                <form onSubmit={handleSubmitReference} className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#062653]">
                      4. Récapitulatif avant soumission
                    </h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Vérifiez l'ensemble de vos informations avant d'envoyer votre preuve.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F4F6F9] divide-y divide-slate-200/70 text-xs">
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] text-[#64748B]">Forfait choisi</div>
                        <div className="font-bold text-[#062653] mt-0.5">
                          {selectedPlan?.label || `${selectedDuration} mois`}
                          {selectedPlan && selectedPlan.discountPct > 0 && (
                            <span className="ml-1.5 text-[11px] font-bold text-emerald-700">
                              (-{selectedPlan.discountPct}%)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Période estimée : du{" "}
                          <strong className="text-[#062653]">
                            {formatFrDate(projectedWindow.periodStart)}
                          </strong>{" "}
                          au{" "}
                          <strong className="text-[#062653]">
                            {formatFrDate(projectedWindow.periodEnd)}
                          </strong>
                        </div>
                      </div>
                      {selectedPlan && (
                        <span className="text-base font-extrabold text-[#FF7900] shrink-0">
                          {formatMoney(selectedPlan.price, selectedPlan.currency)}
                        </span>
                      )}
                    </div>

                    <div className="p-4 flex items-center gap-3">
                      {chosenAcc ? (
                        <PaymentAccountLogo account={chosenAcc} className="w-12 h-10" />
                      ) : (
                        <CreditCard className="w-5 h-5 text-[#FF7900] shrink-0" />
                      )}
                      <div>
                        <div className="text-[11px] text-[#64748B]">
                          Compte de paiement sélectionné
                        </div>
                        <div className="font-bold text-[#062653]">
                          {paymentMethod}
                          {chosenAcc?.accountName ? ` • ${chosenAcc.accountName}` : ""}
                        </div>
                        {chosenAcc?.accountNumber && (
                          <div className="text-[11px] font-mono text-[#263445]">
                            {chosenAcc.accountNumber}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="text-[11px] text-[#64748B]">
                        Preuve de paiement jointe
                      </div>
                      {proofDataUrl ? (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white shadow-2xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {proofDataUrl.startsWith("data:image/") ? (
                              <img
                                src={proofDataUrl}
                                alt="Aperçu preuve"
                                className="w-10 h-10 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                            )}
                            <span className="text-xs font-bold text-[#062653] truncate">
                              {proofFileName || "Preuve importée"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewTarget({
                                url: proofDataUrl,
                                name: proofFileName,
                              });
                              setPreviewOpen(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#F4F6F9] text-[11px] font-semibold text-[#062653] hover:bg-slate-200/70 flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                            <span>Voir</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-[#263445]">
                          Référence transmise sans pièce jointe
                        </div>
                      )}
                    </div>

                    {(payerCompanyName.trim() || paymentReference.trim()) && (
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {payerCompanyName.trim() && (
                          <div>
                            <div className="text-[11px] text-[#64748B]">
                              Nom de l'entreprise
                            </div>
                            <div className="font-bold text-[#062653]">
                              {payerCompanyName.trim()}
                            </div>
                          </div>
                        )}
                        {paymentReference.trim() && (
                          <div>
                            <div className="text-[11px] text-[#64748B]">
                              Référence de transaction
                            </div>
                            <div className="font-mono font-bold text-[#062653]">
                              {paymentReference.trim()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {formError && (
                    <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
                      {formError}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setWizardStep(3);
                      }}
                      className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Précédent</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 h-11 bg-[#FF7900] hover:bg-[#E66D00] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {submitting
                          ? "Soumission en cours..."
                          : replaceMode
                          ? "Confirmer la mise à jour"
                          : "Soumettre"}
                      </span>
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-[11px] text-[#64748B]">
                    <Info className="w-4 h-4 text-[#062653] shrink-0 mt-0.5" />
                    <span>
                      Après réception et vérification manuelle sur notre compte, votre nouvelle date d'expiration sera mise à jour automatiquement.
                    </span>
                  </div>
                </form>
              );
            })()}
          </div>
        )}
      </div>

      {/* HISTORIQUE DES RENOUVELLEMENTS */}
      <div className="bg-white rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#062653]" />
            <h2 className="text-sm font-bold text-[#062653]">
              Historique de vos renouvellements ({history.length})
            </h2>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            Aucun paiement ou renouvellement enregistré pour le moment. Vous êtes sur votre {settings.trialMonths}er mois gratuit initial.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Durée & Montant</th>
                  <th className="px-5 py-3">Mode & Preuve</th>
                  <th className="px-5 py-3">Période couverte</th>
                  <th className="px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 text-[#263445] font-medium">
                      {formatFrDate(item.createdAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[#062653]">{item.durationMonths} mois</div>
                      <div className="text-[11px] text-[#64748B]">
                        {formatMoney(item.amountExpected, item.currency)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 space-y-1">
                      <div className="font-semibold text-[#263445]">{item.paymentMethod}</div>
                      {item.paymentReference && (
                        <div className="font-mono text-[11px] text-[#64748B]">
                          Réf : {item.paymentReference}
                        </div>
                      )}
                      {item.payerCompanyName && (
                        <div className="text-[11px] text-[#64748B]">
                          Entreprise : {item.payerCompanyName}
                        </div>
                      )}
                      {item.proofDataUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewTarget({
                              url: item.proofDataUrl!,
                              name: item.proofFileName,
                            });
                            setPreviewOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF7900] hover:underline cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Voir preuve</span>
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[#263445]">
                      {item.periodStart && item.periodEnd ? (
                        <span>
                          {formatFrDate(item.periodStart)} →{" "}
                          <strong>{formatFrDate(item.periodEnd)}</strong>
                        </span>
                      ) : (
                        <span className="text-[#64748B]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {item.status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Validé
                        </span>
                      ) : item.status === "REJECTED" ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            Refusé
                          </span>
                          {item.rejectionReason && (
                            <div className="text-[10px] text-rose-700 mt-1 max-w-xs">
                              {item.rejectionReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900]">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          En attente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProofPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        proofDataUrl={previewTarget?.url}
        proofFileName={previewTarget?.name}
      />
    </div>
  );
}
