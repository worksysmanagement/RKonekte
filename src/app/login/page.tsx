"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PhoneCountryInput } from "@/components/ui/PhoneCountryInput";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Users,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Copy,
  Check,
  Clock,
  RefreshCw,
  Send,
  Upload,
  FileText,
  X,
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
  SubscriptionPlanOption,
  SubscriptionRenewalItem,
  SubscriptionStateSummary,
} from "@/lib/utils/subscription";

interface StoppedContextData {
  resumed: boolean;
  serviceStopped: boolean;
  isAdmin: boolean;
  organizationName: string;
  userEmail?: string;
  userName?: string;
  message?: string;
  state?: SubscriptionStateSummary;
  autoMessageTitle?: string;
  autoMessageBody?: string;
  plans?: SubscriptionPlanOption[];
  paymentAccounts?: PaymentAccountConfig[];
  pendingRenewal?: SubscriptionRenewalItem | null;
  lastRejectedRenewal?: SubscriptionRenewalItem | null;
}

const EMPLOYEE_RANGES = [
  "1 à 5 employés",
  "6 à 20 employés",
  "21 à 50 employés",
  "51 à 100 employés",
  "101 à 250 employés",
  "Plus de 250 employés",
];

const ROLES = [
  "PDG",
  "Directeur Général",
  "Administrateur",
];

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode: "login" or "register"
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login"
  );
  const resetSuccess = searchParams.get("reset") === "success";
  const [inactiveNotice, setInactiveNotice] = useState(
    searchParams.get("inactive") === "1"
  );

  // Sync mode with URL if searchParams changes
  useEffect(() => {
    if (searchParams.get("mode") === "register") {
      setMode("register");
    }
    if (searchParams.get("inactive") === "1") {
      setInactiveNotice(true);
    }
  }, [searchParams]);

  // Switch handlers
  const handleSwitchToRegister = () => {
    setMode("register");
    setRegisterError(null);
    setSubmittedBanner(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/login?mode=register");
    }
  };

  const handleSwitchToLogin = () => {
    setMode("login");
    setLoginError(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/login");
    }
  };

  // ================= LOGIN STATE & HANDLERS =================
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ================= STOPPED SERVICE NOTICE STATE =================
  const [stoppedContext, setStoppedContext] = useState<StoppedContextData | null>(null);
  const [resumedBanner, setResumedBanner] = useState(false);
  const [submittedBanner, setSubmittedBanner] = useState(false);
  const [stoppedStep, setStoppedStep] = useState<1 | 2 | 3 | 4>(1);
  const [stoppedDuration, setStoppedDuration] = useState<number>(1);
  const [stoppedMethod, setStoppedMethod] = useState<string>("");
  const [stoppedCompanyName, setStoppedCompanyName] = useState<string>("");
  const [stoppedRef, setStoppedRef] = useState<string>("");
  const [stoppedProofDataUrl, setStoppedProofDataUrl] = useState<string>("");
  const [stoppedProofFileName, setStoppedProofFileName] = useState<string>("");
  const [stoppedPreviewOpen, setStoppedPreviewOpen] = useState(false);
  const [stoppedPreviewTarget, setStoppedPreviewTarget] = useState<{
    url: string;
    name?: string | null;
  } | null>(null);
  const [stoppedSubmitting, setStoppedSubmitting] = useState(false);
  const [stoppedError, setStoppedError] = useState<string | null>(null);
  const [stoppedCopiedId, setStoppedCopiedId] = useState<string | null>(null);
  const [stoppedRefreshing, setStoppedRefreshing] = useState(false);

  const hydrateStoppedState = (ctx: StoppedContextData) => {
    setStoppedContext(ctx);
    if (ctx.paymentAccounts && ctx.paymentAccounts.length === 1) {
      setStoppedMethod(ctx.paymentAccounts[0].label);
    } else if (ctx.paymentAccounts && ctx.paymentAccounts.length > 1) {
      setStoppedMethod((prev) =>
        prev && ctx.paymentAccounts!.some((a) => a.label === prev) ? prev : ""
      );
    }
    if (ctx.pendingRenewal?.durationMonths) {
      setStoppedDuration(ctx.pendingRenewal.durationMonths);
    }
  };

  const fetchStoppedContext = async (showSpinner = false) => {
    if (showSpinner) setStoppedRefreshing(true);
    try {
      const res = await fetch("/api/public/subscription/stopped-context", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.hasNotice && json.resumed) {
        setStoppedContext(null);
        setResumedBanner(true);
        if (typeof window !== "undefined" && searchParams.get("stopped")) {
          window.history.replaceState(null, "", "/login");
        }
      } else if (json.hasNotice && json.stoppedContext) {
        hydrateStoppedState(json.stoppedContext);
      }
    } catch (_) {
    } finally {
      if (showSpinner) setStoppedRefreshing(false);
    }
  };

  useEffect(() => {
    if (mode === "login") {
      fetchStoppedContext(false);
    }
  }, [mode]);

  const handleClearStoppedContext = async () => {
    try {
      await fetch("/api/public/subscription/stopped-context", { method: "DELETE" });
    } catch (_) {}
    setStoppedContext(null);
    setStoppedError(null);
    setStoppedStep(1);
    setStoppedMethod("");
    setStoppedCompanyName("");
    setStoppedRef("");
    setStoppedProofDataUrl("");
    setStoppedProofFileName("");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/login");
    }
  };

  const handleStoppedCopy = async (acc: PaymentAccountConfig) => {
    try {
      await navigator.clipboard.writeText(acc.accountNumber);
      setStoppedCopiedId(acc.id);
      setTimeout(() => setStoppedCopiedId(null), 1800);
    } catch (_) {}
  };

  const handleStoppedProofFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStoppedError(null);
    try {
      const { dataUrl, fileName } = await readPaymentProofFile(file);
      setStoppedProofDataUrl(dataUrl);
      setStoppedProofFileName(fileName);
    } catch (err: any) {
      setStoppedError(err?.message || "Impossible de lire ce fichier.");
    } finally {
      e.target.value = "";
    }
  };

  const handleStoppedSubmitReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoppedError(null);

    if (!stoppedMethod) {
      setStoppedError("Veuillez sélectionner un compte de paiement.");
      setStoppedStep(2);
      return;
    }

    if (!stoppedProofDataUrl && stoppedRef.trim().length < 3) {
      setStoppedError(
        "Veuillez importer votre preuve de paiement (ou saisir une référence valide)."
      );
      setStoppedStep(3);
      return;
    }

    setStoppedSubmitting(true);
    try {
      const res = await fetch("/api/public/subscription/submit-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMonths: stoppedDuration,
          paymentMethod: stoppedMethod,
          paymentReference: stoppedRef.trim() || null,
          payerCompanyName: stoppedCompanyName.trim() || null,
          proofDataUrl: stoppedProofDataUrl || null,
          proofFileName: stoppedProofFileName || null,
          replacePending: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStoppedError(json.error || "Impossible d'envoyer votre preuve de paiement.");
        return;
      }

      // Redirige automatiquement vers la page de connexion après soumission
      setStoppedContext(null);
      setStoppedError(null);
      setStoppedStep(1);
      setStoppedMethod("");
      setStoppedCompanyName("");
      setStoppedRef("");
      setStoppedProofDataUrl("");
      setStoppedProofFileName("");
      setResumedBanner(false);
      setLoginError(null);
      setSubmittedBanner(true);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/login");
      }
      router.replace("/login");
    } catch (_) {
      setStoppedError("Erreur réseau lors de l'envoi de votre preuve.");
    } finally {
      setStoppedSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setResumedBanner(false);
    setSubmittedBanner(false);
    setInactiveNotice(false);
    setLoginLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (
          (data.code === "SERVICE_STOPPED_ADMIN" ||
            data.code === "SERVICE_STOPPED_EMPLOYEE") &&
          data.stoppedContext
        ) {
          setStoppedStep(1);
          setStoppedError(null);
          hydrateStoppedState(data.stoppedContext);
          return;
        }
        setLoginError(data.error || "Identifiants invalides");
        return;
      }

      if (data.user?.role === "SUPER_ADMIN") {
        router.push("/super-admin");
      } else if (
        data.user?.role === "EMPLOYEE" ||
        data.user?.role === "COLLABORATEUR" ||
        data.user?.role === "CASHIER" ||
        data.user?.role === "CAISSIER"
      ) {
        router.push("/admin/requests");
      } else {
        router.push("/admin/dashboard");
      }
      router.refresh();
    } catch (err) {
      setLoginError("Erreur réseau lors de la connexion");
    } finally {
      setLoginLoading(false);
    }
  };

  // ================= REGISTER STATE & HANDLERS =================
  const [registerData, setRegisterData] = useState({
    companyName: "",
    companyEmail: "",
    phone: "",
    address: "",
    employeeRange: "6 à 20 employés",
    applicantName: "",
    applicantRole: "PDG",
    // Honeypot anti-robot fields
    hp_website: "",
    hp_phone_trap: "",
  });

  const [formLoadTime, setFormLoadTime] = useState<number>(0);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerSubmitted, setRegisterSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    setFormLoadTime(Date.now());
  }, [mode]);

  const handleRegisterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setRegisterData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterLoading(true);

    try {
      const res = await fetch("/api/public/register-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...registerData,
          formLoadTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRegisterError(
          data.error || "Une erreur est survenue lors de l'inscription."
        );
        return;
      }

      setSubmissionResult(data);
      setRegisterSubmitted(true);
    } catch (err: any) {
      setRegisterError(
        "Erreur réseau. Veuillez vérifier votre connexion et réessayer."
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* ================= LEFT BRAND HERO PANEL ================= */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 text-white relative flex-col justify-between p-8 xl:p-12 overflow-hidden select-none border-r border-[#0D3E82]/30 bg-[#071E3D] lg:sticky lg:top-0 lg:h-screen shrink-0">
        {/* Graphic Vector Background matching reference image */}
        <img
          src="/login-bg-pattern.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
        />

        {/* --- Top Brand Logo --- */}
        <div className="relative z-10 pt-1">
          <img
            src="/logo-rk-emblem.png"
            alt="RKonekte"
            className="h-14 sm:h-16 w-auto object-contain drop-shadow-sm"
          />
        </div>

        {/* --- Hero Value Proposition --- */}
        <div className="relative z-10 mt-6 sm:mt-8 mb-auto py-2">
          <h1 className="font-script text-4xl sm:text-5xl xl:text-6xl text-white leading-tight mb-3 tracking-wide">
            Une gestion plus simple,
            <span className="block text-[#FF7900] mt-1">plus efficace.</span>
          </h1>

          <p className="text-slate-300 text-sm xl:text-base leading-relaxed max-w-md mb-6">
            Centralisez, organisez et suivez toutes vos activités et demandes en un seul endroit.
          </p>

          {/* Feature Bullets with Custom Pure White Icons */}
          <div className="space-y-4 sm:space-y-5">
            <div className="flex items-center gap-4 text-white text-[15px] xl:text-base font-medium">
              <img
                src="/icons/feature-users.png"
                alt=""
                className="w-6 h-6 object-contain shrink-0"
              />
              <span>Gestion des utilisateurs</span>
            </div>

            <div className="flex items-center gap-4 text-white text-[15px] xl:text-base font-medium">
              <img
                src="/icons/feature-projects.png"
                alt=""
                className="w-6 h-6 object-contain shrink-0"
              />
              <span>Suivi des projets & congés</span>
            </div>

            <div className="flex items-center gap-4 text-white text-[15px] xl:text-base font-medium">
              <img
                src="/icons/feature-tasks.png"
                alt=""
                className="w-6 h-6 object-contain shrink-0"
              />
              <span>Tâches et productivité</span>
            </div>

            <div className="flex items-center gap-4 text-white text-[15px] xl:text-base font-medium">
              <img
                src="/icons/feature-reports.png"
                alt=""
                className="w-6 h-6 object-contain shrink-0"
              />
              <span>Rapports et analyses</span>
            </div>
          </div>
        </div>

        {/* --- Bottom Footer Info --- */}
        <div className="relative z-10 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white gap-2">
          <span className="text-white font-medium whitespace-nowrap">© 2026 RKonekte</span>
          <span className="text-slate-300 text-center font-normal whitespace-nowrap inline-flex items-center gap-1.5">
            <span>Powered by</span>
            <a
              href="https://www.technozi-ht.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-white hover:text-white/80 font-semibold hover:underline transition-colors"
            >
              <img
                src="/logo-technozi.png"
                alt="Logo Technozi"
                className="w-4 h-4 object-contain shrink-0"
              />
              <span>Technozi Haiti</span>
            </a>
          </span>
          <a
            href="mailto:rkonekte509@gmail.com?subject=Contact%20RKonekte"
            className="inline-flex items-center gap-1.5 text-white hover:text-white/80 hover:underline active:scale-95 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5 text-[#FF7900]" />
            <span>Nous contacter</span>
          </a>
        </div>
      </div>

      {/* ================= RIGHT FORM PANEL (LOGIN OR REGISTER) ================= */}
      <div className="w-full lg:w-1/2 xl:w-7/12 min-h-screen flex items-center justify-center p-6 sm:p-8 lg:p-10 py-10 sm:py-12 relative bg-white overflow-y-auto">
        <div
          className={`w-full ${
            mode === "register"
              ? "max-w-[760px] p-7 sm:p-9"
              : stoppedContext?.isAdmin && !stoppedContext?.pendingRenewal
              ? "max-w-[580px] p-6 sm:p-8"
              : "max-w-[440px] p-6 sm:p-10"
          } bg-white rounded-3xl shadow-xl shadow-slate-200/80 relative z-10 transition-all duration-200 my-auto`}
        >
          {/* ================= MODE: LOGIN ================= */}
          {mode === "login" && stoppedContext && !stoppedContext.isAdmin && (
            <div className="animate-fadeIn text-center py-4 space-y-5">
              <div className="flex flex-col items-center justify-center">
                <img
                  src="/logo-rkonekte.png"
                  alt="RKonekte"
                  className="h-12 w-auto object-contain"
                />
              </div>

              <div className="flex items-center justify-center text-rose-600">
                <Lock className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-[#062653]">
                  {stoppedContext.organizationName}
                </h2>
                <p className="text-sm font-semibold text-rose-700 leading-relaxed max-w-sm mx-auto">
                  {stoppedContext.message ||
                    "Veuillez contacter votre administrateur pour cet arrêt de service."}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearStoppedContext}
                  className="px-5 py-2.5 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour à la connexion</span>
                </button>
              </div>
            </div>
          )}

          {mode === "login" && stoppedContext && stoppedContext.isAdmin && stoppedContext.pendingRenewal && (
            <div className="animate-fadeIn text-center py-4 space-y-5">
              <div className="flex flex-col items-center justify-center">
                <img
                  src="/logo-rkonekte.png"
                  alt="RKonekte"
                  className="h-12 w-auto object-contain mb-2"
                />
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800">
                  Traitement en cours
                </span>
              </div>

              <div className="flex items-center justify-center text-[#FF7900]">
                <Clock className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-[#062653] leading-snug">
                  Votre processus est en cours de traitement, veuillez patienter.
                </h2>
                <p className="text-xs text-[#64748B] leading-relaxed max-w-sm mx-auto">
                  Votre demande de renouvellement a bien été transmise et est en cours de vérification par notre équipe. Votre accès sera rétabli dès validation.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fetchStoppedContext(true)}
                  disabled={stoppedRefreshing}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-[#062653] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${stoppedRefreshing ? "animate-spin" : ""}`}
                  />
                  <span>Actualiser</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearStoppedContext}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour à la connexion</span>
                </button>
              </div>
            </div>
          )}

          {mode === "login" && stoppedContext && stoppedContext.isAdmin && !stoppedContext.pendingRenewal && (() => {
            const plans = stoppedContext.plans || [];
            const selectedPlan =
              plans.find((p) => p.durationMonths === stoppedDuration) || plans[0] || null;
            const accounts = stoppedContext.paymentAccounts || [];
            const chosenAccount =
              accounts.find((a) => a.label === stoppedMethod) || null;
            const estimatedExpiration = calculateRenewalWindow(
              stoppedContext.state?.subscriptionExpiresAt ?? null,
              Date.now(),
              stoppedDuration
            ).periodEnd;

            return (
              <div className="animate-fadeIn space-y-4">
                {/* Top header */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src="/logo-rkonekte.png"
                      alt="RKonekte"
                      className="h-10 w-auto object-contain shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs text-rose-600 font-semibold">
                        {stoppedContext.state?.isExpired && !stoppedContext.state?.serviceStopped
                          ? "Abonnement expiré • Accès suspendu"
                          : "Service suspendu"}{" "}
                        {stoppedContext.state?.subscriptionExpiresAt
                          ? `• Échéance ${formatFrDate(stoppedContext.state.subscriptionExpiresAt)}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchStoppedContext(true)}
                    disabled={stoppedRefreshing}
                    className="px-2.5 py-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 text-[11px] font-semibold text-[#062653] flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Vérifier si le service a été réactivé"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${stoppedRefreshing ? "animate-spin" : ""}`}
                    />
                    <span>Actualiser</span>
                  </button>
                </div>

                {/* Compact 4-Step Indicator */}
                <div className="flex items-center justify-between gap-1.5 px-1">
                  {[
                    { num: 1, label: "Durée" },
                    { num: 2, label: "Compte" },
                    { num: 3, label: "Preuve" },
                    { num: 4, label: "Récap" },
                  ].map((stepItem, idx) => {
                    const isActive = stoppedStep === stepItem.num;
                    const isDone = stoppedStep > stepItem.num;
                    return (
                      <React.Fragment key={stepItem.num}>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
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
                            className={`text-[11px] font-bold ${
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
                              stoppedStep > stepItem.num
                                ? "bg-emerald-500"
                                : "bg-slate-200"
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* STEP 1 ONLY: Durées + Suivant */}
                {stoppedStep === 1 && (
                  <div className="space-y-4 animate-fadeIn">
                    {stoppedContext.lastRejectedRenewal && (
                      <div className="p-2.5 rounded-xl bg-rose-50 text-[11px] text-rose-800">
                        <strong>Demande précédente refusée :</strong>{" "}
                        {stoppedContext.lastRejectedRenewal.rejectionReason ||
                          "Veuillez vérifier votre paiement et renvoyer votre preuve."}
                      </div>
                    )}

                    {plans.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-[#062653]">
                          1. Choisissez votre durée de renouvellement
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {plans.map((plan) => {
                            const active = plan.durationMonths === stoppedDuration;
                            return (
                              <button
                                key={plan.durationMonths}
                                type="button"
                                onClick={() => setStoppedDuration(plan.durationMonths)}
                                className={`p-3 rounded-xl text-left transition-all cursor-pointer ${
                                  active
                                    ? "ring-2 ring-[#FF7900] bg-[#FFF8F2] shadow-2xs"
                                    : "bg-[#F4F6F9] hover:bg-slate-200/70"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-bold text-[#062653]">
                                    {plan.label}
                                  </span>
                                  {plan.discountPct > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-700">
                                      -{plan.discountPct}%
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-extrabold text-[#FF7900] mt-1">
                                  {formatMoney(plan.price, plan.currency)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Nouvelle expiration estimée si validé aujourd'hui :{" "}
                          <strong className="text-[#062653]">
                            {formatFrDate(estimatedExpiration)}
                          </strong>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStoppedError(null);
                          setStoppedStep(2);
                        }}
                        className="flex-1 h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-xs font-bold rounded-xl shadow-md shadow-[#FF6B00]/20 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <span>Suivant</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                    {/* STEP 2 ONLY: Comptes disponibles (MonCash, Unibank, Sogebank + Logos) + Choisir + Suivant */}
                    {stoppedStep === 2 && (
                      <div className="space-y-4 animate-fadeIn">
                        {selectedPlan && (
                          <div className="px-3.5 py-2.5 rounded-xl bg-[#F4F6F9] flex items-center justify-between text-xs">
                            <span className="text-[#64748B] font-medium">
                              Forfait choisi :{" "}
                              <strong className="text-[#062653]">{selectedPlan.label}</strong>
                            </span>
                            <span className="font-extrabold text-[#FF7900]">
                              {formatMoney(selectedPlan.price, selectedPlan.currency)}
                            </span>
                          </div>
                        )}

                        <div className="space-y-2.5">
                          <div>
                            <div className="text-xs font-bold text-[#062653]">
                              2. Comptes disponibles pour le paiement
                            </div>
                            <p className="text-[11px] text-[#64748B] mt-0.5">
                              Sélectionnez le compte sur lequel vous effectuez le règlement puis cliquez sur Suivant.
                            </p>
                          </div>

                          {accounts.length === 0 ? (
                            <div className="p-4 rounded-xl bg-[#F4F6F9] text-xs text-[#64748B]">
                              Aucun compte de paiement n'est configuré pour le moment.
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {accounts.map((acc) => {
                                const isChosen = stoppedMethod === acc.label;
                                return (
                                  <div
                                    key={acc.id}
                                    onClick={() => {
                                      setStoppedMethod(acc.label);
                                      setStoppedError(null);
                                    }}
                                    className={`p-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                      isChosen
                                        ? "ring-2 ring-[#FF7900] bg-[#FFF8F2] shadow-2xs"
                                        : "bg-[#F4F6F9] hover:bg-slate-200/70"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <PaymentAccountLogo account={acc} />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#062653]">
                                          <span>{acc.label}</span>
                                          {acc.accountName && (
                                            <span className="font-normal text-[#64748B] truncate">
                                              • {acc.accountName}
                                            </span>
                                          )}
                                          {isChosen && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FF7900] text-white">
                                              <Check className="w-2.5 h-2.5" />
                                              Choisi
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs font-mono font-bold text-[#263445] mt-0.5">
                                          {acc.accountNumber}
                                        </div>
                                        {acc.instructions && (
                                          <div className="text-[10px] text-[#64748B] mt-0.5 line-clamp-2">
                                            {acc.instructions}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStoppedCopy(acc);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-white shadow-2xs hover:bg-slate-50 text-[10px] font-semibold text-[#062653] flex items-center gap-1 shrink-0 cursor-pointer"
                                    >
                                      {stoppedCopiedId === acc.id ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span>Copié</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copier</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {stoppedError && (
                          <div className="text-rose-600 text-xs font-medium flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{stoppedError}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setStoppedError(null);
                              setStoppedStep(1);
                            }}
                            className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Précédent</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!stoppedMethod) {
                                setStoppedError(
                                  "Veuillez choisir un compte de paiement avant de continuer."
                                );
                                return;
                              }
                              setStoppedError(null);
                              setStoppedStep(3);
                            }}
                            className="flex-1 h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-xs font-bold rounded-xl shadow-md shadow-[#FF6B00]/20 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                          >
                            <span>Suivant</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* STEP 3 ONLY: Upload Preuve de paiement + Nom de l'entreprise optionnel */}
                    {stoppedStep === 3 && (
                      <div className="space-y-3.5 animate-fadeIn">
                        <div className="p-3 rounded-xl bg-[#F4F6F9] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {chosenAccount ? (
                              <PaymentAccountLogo
                                account={chosenAccount}
                                className="w-12 h-10"
                              />
                            ) : (
                              <CreditCard className="w-4 h-4 text-[#FF7900] shrink-0" />
                            )}
                            <div className="min-w-0 text-xs">
                              <div className="font-bold text-[#062653] truncate">
                                {stoppedMethod}
                                {chosenAccount?.accountNumber
                                  ? ` • ${chosenAccount.accountNumber}`
                                  : ""}
                              </div>
                              <div className="text-[11px] text-[#64748B]">
                                {selectedPlan?.label || `${stoppedDuration} mois`}
                              </div>
                            </div>
                          </div>
                          {selectedPlan && (
                            <span className="text-xs font-extrabold text-[#FF7900] shrink-0">
                              {formatMoney(selectedPlan.price, selectedPlan.currency)}
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-bold text-[#062653] mb-1.5">
                            3. Importer votre preuve de paiement{" "}
                            <span className="text-rose-500">*</span>
                          </div>

                          {!stoppedProofDataUrl ? (
                            <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-[#F4F6F9] hover:bg-[#FFF8F2]/80 transition-all cursor-pointer text-center">
                              <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#FF7900] shadow-2xs">
                                <Upload className="w-5 h-5" />
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-xs font-bold text-[#062653]">
                                  Cliquez pour importer votre preuve de paiement
                                </div>
                                <div className="text-[11px] text-[#64748B]">
                                  Capture d'écran, photo du bordereau ou PDF (max 5 Mo)
                                </div>
                              </div>
                              <input
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                onChange={handleStoppedProofFileChange}
                                className="hidden"
                              />
                            </label>
                          ) : (
                            <div className="p-3 rounded-2xl bg-emerald-50/60 space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {stoppedProofDataUrl.startsWith("data:image/") ? (
                                    <img
                                      src={stoppedProofDataUrl}
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
                                      {stoppedProofFileName || "Preuve importée"}
                                    </div>
                                    <div className="text-[11px] text-emerald-700 font-semibold">
                                      Fichier prêt à être vérifié
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStoppedPreviewTarget({
                                        url: stoppedProofDataUrl,
                                        name: stoppedProofFileName,
                                      });
                                      setStoppedPreviewOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-white shadow-2xs text-[11px] font-semibold text-[#062653] hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Voir</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStoppedProofDataUrl("");
                                      setStoppedProofFileName("");
                                    }}
                                    className="p-1.5 rounded-lg bg-white shadow-2xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                                    title="Supprimer le fichier"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#263445] mb-1">
                            Nom de l'entreprise (optionnel)
                          </label>
                          <input
                            type="text"
                            value={stoppedCompanyName}
                            onChange={(e) => setStoppedCompanyName(e.target.value)}
                            placeholder={`Ex : ${stoppedContext.organizationName} (optionnel)`}
                            className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs text-[#062653] outline-none transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#263445] mb-1">
                            Référence de transaction (optionnel)
                          </label>
                          <input
                            type="text"
                            value={stoppedRef}
                            onChange={(e) => setStoppedRef(e.target.value)}
                            placeholder="Ex : N° de transaction ou bordereau (optionnel)"
                            className="w-full h-10 px-3.5 bg-[#F4F6F9] focus:bg-white rounded-xl text-xs font-mono text-[#062653] outline-none transition-colors"
                          />
                        </div>

                        {stoppedError && (
                          <div className="text-rose-600 text-xs font-medium flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{stoppedError}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setStoppedError(null);
                              setStoppedStep(2);
                            }}
                            className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Précédent</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!stoppedProofDataUrl && stoppedRef.trim().length < 3) {
                                setStoppedError(
                                  "Veuillez importer votre preuve de paiement (ou saisir une référence valide)."
                                );
                                return;
                              }
                              setStoppedError(null);
                              setStoppedStep(4);
                            }}
                            className="flex-1 h-11 bg-[#FF6B00] hover:bg-[#E05E00] text-white text-xs font-bold rounded-xl shadow-md shadow-[#FF6B00]/20 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                          >
                            <span>Suivant</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* STEP 4 ONLY: RÉCAPITULATIF COMPLET AVANT SOUMISSION */}
                    {stoppedStep === 4 && (
                      <form
                        onSubmit={handleStoppedSubmitReference}
                        className="space-y-4 animate-fadeIn"
                      >
                        <div>
                          <div className="text-xs font-bold text-[#062653]">
                            4. Récapitulatif avant soumission
                          </div>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            Vérifiez l'ensemble de vos informations avant de soumettre votre demande.
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#F4F6F9] divide-y divide-slate-200/70 text-xs">
                          {/* Durée & montant */}
                          <div className="p-3.5 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] text-[#64748B]">Forfait choisi</div>
                              <div className="font-bold text-[#062653] mt-0.5">
                                {selectedPlan?.label || `${stoppedDuration} mois`}
                                {selectedPlan && selectedPlan.discountPct > 0 && (
                                  <span className="ml-1.5 text-[11px] font-bold text-emerald-700">
                                    (-{selectedPlan.discountPct}%)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#64748B] mt-0.5">
                                Nouvelle expiration estimée :{" "}
                                <strong className="text-[#062653]">
                                  {formatFrDate(estimatedExpiration)}
                                </strong>
                              </div>
                            </div>
                            {selectedPlan && (
                              <span className="text-sm font-extrabold text-[#FF7900] shrink-0">
                                {formatMoney(selectedPlan.price, selectedPlan.currency)}
                              </span>
                            )}
                          </div>

                          {/* Compte choisi */}
                          <div className="p-3.5 flex items-center gap-3">
                            {chosenAccount ? (
                              <PaymentAccountLogo
                                account={chosenAccount}
                                className="w-12 h-10"
                              />
                            ) : (
                              <CreditCard className="w-5 h-5 text-[#FF7900] shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-[11px] text-[#64748B]">
                                Compte de paiement utilisé
                              </div>
                              <div className="font-bold text-[#062653]">
                                {stoppedMethod}
                                {chosenAccount?.accountName
                                  ? ` • ${chosenAccount.accountName}`
                                  : ""}
                              </div>
                              {chosenAccount?.accountNumber && (
                                <div className="text-[11px] font-mono text-[#263445]">
                                  {chosenAccount.accountNumber}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Preuve de paiement */}
                          <div className="p-3.5 space-y-2">
                            <div className="text-[11px] text-[#64748B]">
                              Preuve de paiement jointe
                            </div>
                            {stoppedProofDataUrl ? (
                              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white shadow-2xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {stoppedProofDataUrl.startsWith("data:image/") ? (
                                    <img
                                      src={stoppedProofDataUrl}
                                      alt="Aperçu preuve"
                                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                  )}
                                  <span className="text-xs font-bold text-[#062653] truncate">
                                    {stoppedProofFileName || "Preuve importée"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStoppedPreviewTarget({
                                      url: stoppedProofDataUrl,
                                      name: stoppedProofFileName,
                                    });
                                    setStoppedPreviewOpen(true);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#F4F6F9] text-[11px] font-semibold text-[#062653] hover:bg-slate-200/70 flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#FF7900]" />
                                  <span>Voir</span>
                                </button>
                              </div>
                            ) : (
                              <div className="text-xs font-medium text-[#263445]">
                                Référence saisie sans pièce jointe
                              </div>
                            )}
                          </div>

                          {/* Informations optionnelles */}
                          {(stoppedCompanyName.trim() || stoppedRef.trim()) && (
                            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {stoppedCompanyName.trim() && (
                                <div>
                                  <div className="text-[11px] text-[#64748B]">
                                    Nom de l'entreprise
                                  </div>
                                  <div className="font-bold text-[#062653]">
                                    {stoppedCompanyName.trim()}
                                  </div>
                                </div>
                              )}
                              {stoppedRef.trim() && (
                                <div>
                                  <div className="text-[11px] text-[#64748B]">
                                    Référence de transaction
                                  </div>
                                  <div className="font-mono font-bold text-[#062653]">
                                    {stoppedRef.trim()}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {stoppedError && (
                          <div className="text-rose-600 text-xs font-medium flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{stoppedError}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setStoppedError(null);
                              setStoppedStep(3);
                            }}
                            className="px-4 h-11 rounded-xl bg-[#F4F6F9] hover:bg-slate-200/70 text-xs font-semibold text-[#062653] flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Précédent</span>
                          </button>

                          <button
                            type="submit"
                            disabled={stoppedSubmitting}
                            className="flex-1 h-11 bg-[#FF6B00] hover:bg-[#E05E00] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-[#FF6B00]/20 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {stoppedSubmitting ? "Soumission..." : "Soumettre"}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}

                <div className="pt-3 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={handleClearStoppedContext}
                    className="text-xs font-semibold text-[#64748B] hover:text-[#062653] cursor-pointer"
                  >
                    Se connecter avec un autre compte
                  </button>
                </div>

                <ProofPreviewModal
                  isOpen={stoppedPreviewOpen}
                  onClose={() => setStoppedPreviewOpen(false)}
                  proofDataUrl={stoppedPreviewTarget?.url}
                  proofFileName={stoppedPreviewTarget?.name}
                />
              </div>
            );
          })()}

          {mode === "login" && !stoppedContext && (
            <div className="animate-fadeIn">
              {/* Header Card with Official Logo */}
              <div className="flex flex-col items-center justify-center mb-8 text-center">
                <img
                  src="/logo-rkonekte.png"
                  alt="RKonekte"
                  className="h-13 sm:h-14 w-auto object-contain mb-2.5"
                />
                <p className="text-[11px] font-bold tracking-[0.25em] text-[#64748B] uppercase">
                  GESTION DIGITALISÉE
                </p>
              </div>

              {/* Payment Submitted Banner */}
              {submittedBanner && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Votre demande de renouvellement a bien été soumise. Votre processus est en cours de traitement.
                  </span>
                </div>
              )}

              {/* Service Resumed Banner */}
              {resumedBanner && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Le service de votre entreprise a été réactivé ! Vous pouvez vous connecter.</span>
                </div>
              )}

              {/* Reset Success Message */}
              {resetSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl text-emerald-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.</span>
                </div>
              )}

              {/* Inactive / Unactivated Account Banner */}
              {inactiveNotice && !loginError && (
                <div className="mb-4 p-3 bg-amber-50 rounded-xl text-amber-900 text-xs font-medium flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-[#FF7900] shrink-0 mt-0.5" />
                  <span>
                    Votre entreprise ou votre compte n'est pas encore activé (ou a été désactivé). Si vous venez de soumettre votre inscription, veuillez ouvrir le lien d'activation envoyé par e-mail pour définir votre mot de passe.
                  </span>
                </div>
              )}

              {/* Error Message */}
              {loginError && (
                <div className="mb-4 text-rose-600 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Username / Email Input */}
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Nom d'utilisateur ou e-mail"
                      className="w-full h-12 pl-11 pr-4 bg-[#F4F6F9] hover:bg-slate-100/80 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none font-medium"
                    />
                    <User className="w-4 h-4 text-[#091A30] absolute left-4 top-4" />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mot de passe"
                      className="w-full h-12 pl-11 pr-11 bg-[#F4F6F9] hover:bg-slate-100/80 focus:bg-white rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all outline-none font-medium"
                    />
                    <Lock className="w-4 h-4 text-[#091A30] absolute left-4 top-4" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer p-1 transition-colors focus:outline-none"
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox & Forgot Password Link */}
                <div className="flex items-center justify-between pt-1 pb-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-[#091A30] accent-[#091A30] focus:ring-[#091A30] cursor-pointer"
                    />
                    <label
                      htmlFor="rememberMe"
                      className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                    >
                      Se souvenir de moi
                    </label>
                  </div>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-[#FF6B00] hover:text-[#E05E00] hover:underline transition-colors"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>

                {/* Submit Orange Button */}
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full h-12 bg-[#FF6B00] hover:bg-[#E05E00] active:scale-[0.99] disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-[#FF6B00]/25 transition-all flex items-center justify-center cursor-pointer mt-2"
                >
                  {loginLoading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Se connecter</span>
                  )}
                </button>
              </form>

              {/* Toggle to Registration Form */}
              <div className="mt-8 pt-5 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={handleSwitchToRegister}
                  className="text-sm font-semibold text-[#64748B] hover:text-[#062653] transition-colors cursor-pointer"
                >
                  Nouvelle entreprise ? S'inscrire ici
                </button>
              </div>
            </div>
          )}

          {/* ================= MODE: REGISTER ================= */}
          {mode === "register" && (
            <div className="animate-fadeIn">
              {/* Header Branding */}
              <div className="text-center mb-5">
                <div className="flex flex-col items-center justify-center text-center">
                  <img
                    src="/logo-rkonekte.png"
                    alt="RKonekte"
                    className="h-13 sm:h-14 w-auto object-contain mb-2.5"
                  />
                  <p className="text-xs font-bold tracking-[0.25em] text-[#64748B] uppercase">
                    GESTION DIGITALISÉE
                  </p>
                </div>
              </div>

              {registerSubmitted ? (
                /* Success View - Clean & Simple */
                <div className="text-center py-6 space-y-4 animate-fadeIn">
                  <div className="flex justify-center mx-auto mb-1">
                    <img
                      src="/success-check.png"
                      alt="Succès"
                      className="w-18 h-18 sm:w-20 sm:h-20 object-contain drop-shadow-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl sm:text-2xl font-bold text-[#062653]">
                      Votre compte a été enregistré avec succès !
                    </h3>
                    <p className="text-sm text-[#475569] max-w-md mx-auto leading-relaxed">
                      Un e-mail a été envoyé à <strong className="text-[#062653] font-bold">{registerData.companyEmail}</strong>.
                    </p>
                    <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed pt-1">
                      Veuillez vérifier votre boîte de réception <strong className="font-bold text-[#062653]">(et vos courriers indésirables / spams)</strong> et cliquer sur le bouton présent dans le mail pour définir votre mot de passe et activer votre compte.
                    </p>
                  </div>

                  <div className="pt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRegisterSubmitted(false);
                        handleSwitchToLogin();
                      }}
                      className="px-6 py-3 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      J'ai déjà un compte / Se connecter
                    </button>
                  </div>
                </div>
              ) : (
                /* Registration Form */
                <form onSubmit={handleRegisterSubmit} className="space-y-5">
                  {/* Invisible Anti-Robot Honeypot Fields */}
                  <div
                    aria-hidden="true"
                    style={{
                      display: "none",
                      position: "absolute",
                      left: "-9999px",
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                  >
                    <input
                      type="text"
                      name="hp_website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={registerData.hp_website}
                      onChange={handleRegisterChange}
                    />
                    <input
                      type="text"
                      name="hp_phone_trap"
                      tabIndex={-1}
                      autoComplete="off"
                      value={registerData.hp_phone_trap}
                      onChange={handleRegisterChange}
                    />
                  </div>

                  {registerError && (
                    <div className="text-rose-600 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{registerError}</span>
                    </div>
                  )}

                  {/* Section 1: Informations de l'Entreprise */}
                  <div>
                    <h3 className="text-sm font-bold text-[#FF7900] uppercase tracking-wider mb-2">
                      1. Informations de l'entreprise
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Nom de l'entreprise */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Nom de l'entreprise <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="companyName"
                          required
                          value={registerData.companyName}
                          onChange={handleRegisterChange}
                          placeholder="Ex: Carib Tech Solutions S.A."
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors"
                        />
                      </div>

                      {/* Email de l'entreprise */}
                      <div>
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Email de l'entreprise <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="email"
                          name="companyEmail"
                          required
                          value={registerData.companyEmail}
                          onChange={handleRegisterChange}
                          placeholder="contact@entreprise.com"
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors"
                        />
                        <span className="text-[11px] text-slate-500 mt-1 block leading-tight italic">
                          Un email direct sera envoyé à cette adresse pour valider l'enregistrement.
                        </span>
                      </div>

                      {/* Numéro de téléphone avec sélecteur de pays */}
                      <div>
                        <PhoneCountryInput
                          label="Numéro de téléphone *"
                          value={registerData.phone}
                          onChange={(val) =>
                            setRegisterData((prev) => ({ ...prev, phone: val }))
                          }
                          required
                        />
                      </div>

                      {/* Adresse physique */}
                      <div>
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Adresse physique <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="address"
                          required
                          value={registerData.address}
                          onChange={handleRegisterChange}
                          placeholder="Ex: 14, Rue Panaméricaine, Pétion-Ville"
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors"
                        />
                      </div>

                      {/* Nombre d'employés */}
                      <div>
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Nombre d'employés (Intervalle) <span className="text-rose-500">*</span>
                        </label>
                        <select
                          name="employeeRange"
                          required
                          value={registerData.employeeRange}
                          onChange={handleRegisterChange}
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-semibold text-[#263445] focus:bg-white outline-none transition-colors cursor-pointer"
                        >
                          {EMPLOYEE_RANGES.map((range) => (
                            <option key={range} value={range}>
                              {range}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Responsable de l'enregistrement */}
                  <div className="pt-2.5 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-[#FF7900] uppercase tracking-wider mb-2">
                      2. Responsable de l'enregistrement
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Nom et prénom */}
                      <div>
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Nom et prénom du déclarant <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="applicantName"
                          required
                          value={registerData.applicantName}
                          onChange={handleRegisterChange}
                          placeholder="Ex: Piton Rodjensky Emmanuel"
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-medium text-[#263445] focus:bg-white outline-none transition-colors"
                        />
                      </div>

                      {/* Rôle dans l'entreprise */}
                      <div>
                        <label className="block text-xs sm:text-[13px] font-semibold text-[#263445] mb-1">
                          Rôle dans l'entreprise <span className="text-rose-500">*</span>
                        </label>
                        <select
                          name="applicantRole"
                          required
                          value={registerData.applicantRole}
                          onChange={handleRegisterChange}
                          className="w-full h-10 px-3.5 bg-[#F4F6F9] rounded-xl text-sm font-semibold text-[#263445] focus:bg-white outline-none transition-colors cursor-pointer"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-[#64748B] mt-1">
                          Ce compte bénéficiera de tous les droits et accès d'administrateur dans le système.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="pt-5 pb-1 border-t border-slate-100 flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleSwitchToLogin}
                      className="text-sm font-semibold text-[#64748B] hover:text-[#062653] transition-colors cursor-pointer"
                    >
                      J'ai déjà un compte
                    </button>

                    <button
                      type="submit"
                      disabled={registerLoading}
                      className="px-9 h-12 bg-[#FF7900] hover:bg-[#E66D00] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#FF7900]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {registerLoading ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>S'inscrire</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Lien mobile "Nous contacter" & attribution */}
          <div className="lg:hidden mt-8 text-center space-y-2">
            <div>
              <a
                href="mailto:rkonekte509@gmail.com?subject=Contact%20RKonekte"
                className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#062653] font-semibold transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-[#FF7900]" />
                <span>Nous contacter : rkonekte509@gmail.com</span>
              </a>
            </div>
            <p className="text-[11px] text-slate-500 inline-flex items-center justify-center gap-1.5">
              <span>Powered by</span>
              <a
                href="https://www.technozi-ht.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#062653] hover:underline font-semibold"
              >
                <img
                  src="/logo-technozi.png"
                  alt="Logo Technozi"
                  className="w-3.5 h-3.5 object-contain shrink-0"
                />
                <span>Technozi</span>
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthContent />
    </Suspense>
  );
}
