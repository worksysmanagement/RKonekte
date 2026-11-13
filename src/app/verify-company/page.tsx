"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ShieldCheck,
  Check,
  FileText,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";

function VerifyCompanyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  // Password evaluation
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const isConforme = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
  const criteriaCount = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;

  const passwordStrengthScore =
    password.length === 0
      ? 0
      : isConforme
      ? 4
      : criteriaCount >= 4
      ? 3
      : criteriaCount === 3
      ? 2
      : 1;

  // 1. Check token validity on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Aucun jeton de validation n'a été fourni dans le lien.");
      return;
    }

    async function verifyToken() {
      try {
        const res = await fetch(`/api/public/verify-company?token=${encodeURIComponent(token!)}`);
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || "Lien d'activation invalide ou expiré.");
          return;
        }
        setTokenData(result);
        if (result.alreadyActivated) {
          setActivated(true);
        }
      } catch (err) {
        setError("Erreur réseau lors de la vérification du lien.");
      } finally {
        setLoading(false);
      }
    }

    verifyToken();
  }, [token]);

  // 2. Handle password creation and account activation
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!acceptedTerms) {
      setFormError("Veuillez confirmer l'acceptation de l'utilisation du système pour continuer.");
      return;
    }

    if (!isConforme) {
      const missing: string[] = [];
      if (!hasMinLength) missing.push("au moins 8 caractères");
      if (!hasUppercase) missing.push("une majuscule (A-Z)");
      if (!hasLowercase) missing.push("une minuscule (a-z)");
      if (!hasNumber) missing.push("un chiffre (0-9)");
      if (!hasSpecial) missing.push("un caractère spécial (!@#$%^&*...)");
      setFormError(`Le mot de passe doit comporter : ${missing.join(", ")}.`);
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/public/verify-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Une erreur est survenue lors de l'activation.");
        return;
      }

      setActivated(true);

      // Auto redirect to dashboard after 1.5s
      setTimeout(() => {
        router.push(data.redirectUrl || "/admin/dashboard");
      }, 1500);
    } catch (err: any) {
      setFormError("Erreur réseau. Veuillez vérifier votre connexion et réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12 overflow-y-auto">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-7 sm:p-10 text-center my-auto">
        {/* Brand Logo Header */}
        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <img
            src="/logo-rkonekte.png"
            alt="RKonekte"
            className="h-11 sm:h-12 w-auto object-contain mb-2"
          />
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#64748B] uppercase">
            GESTION DIGITALISÉE
          </p>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-10 h-10 text-[#FF7900] animate-spin mx-auto" />
            <h2 className="text-base font-bold text-[#062653]">
              Vérification du lien d'activation...
            </h2>
            <p className="text-xs text-[#64748B]">
              Veuillez patienter un instant.
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="space-y-4 animate-fadeIn">
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-rose-900">
              Lien invalide ou expiré
            </h1>

            <p className="text-xs text-rose-700 leading-relaxed bg-rose-50 p-3 rounded-xl">
              {error}
            </p>

            <div className="pt-4 space-y-2">
              <Link
                href="/login?mode=register"
                className="block w-full py-2.5 bg-[#FF7900] hover:bg-[#E66D00] text-white text-xs font-bold rounded-xl transition-colors"
              >
                Recommencer l'inscription
              </Link>
              <Link
                href="/login"
                className="block text-xs font-semibold text-[#062653] hover:underline pt-2"
              >
                Retour à la page de connexion
              </Link>
            </div>
          </div>
        )}

        {/* SUCCESS STATE (ACTIVATED) */}
        {!loading && !error && activated && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex justify-center mx-auto mb-1">
              <img
                src="/success-check.png"
                alt="Succès"
                className="w-18 h-18 sm:w-20 sm:h-20 object-contain drop-shadow-xs"
              />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[#062653]">
              Compte activé avec succès !
            </h1>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Votre mot de passe administrateur est configuré. Vous disposez de l'ensemble des accès pour gérer{" "}
              <strong className="text-[#062653]">{tokenData?.companyName}</strong>.
            </p>

            <div className="py-2">
              <div className="inline-flex items-center gap-2 text-xs text-[#FF7900] font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Redirection vers votre tableau de bord...</span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/admin/dashboard"
                className="w-full h-11 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>Accéder immédiatement à l'espace</span>
                <ArrowRight className="w-4 h-4 text-[#FF7900]" />
              </Link>
            </div>
          </div>
        )}

        {/* FORM STATE: SET PASSWORD */}
        {!loading && !error && !activated && tokenData && (
          <div className="space-y-5 text-left animate-fadeIn">
            <div className="text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 inline-block mb-1">
                Activation du compte administrateur
              </span>
              <h1 className="text-xl font-bold text-[#062653] mt-2">
                Définissez votre mot de passe
              </h1>
            </div>

            {/* Company & Role Summary */}
            <div className="bg-[#F4F6F9] rounded-2xl p-4 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Entreprise :</span>
                <span className="font-bold text-[#062653]">{tokenData.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email administrateur :</span>
                <span className="font-semibold text-slate-800">{tokenData.companyEmail}</span>
              </div>
              <div className="pt-1 text-[11px] text-emerald-700 flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Accès complet aux opérations de l'entreprise</span>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#062653] mb-1.5">
                  Nouveau mot de passe <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 car., Maj, Min, Chiffre, Caractère spécial"
                    className="w-full h-11 pl-3.5 pr-10 text-xs rounded-xl bg-[#F4F6F9] text-slate-900 focus:bg-white focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Barre d'évaluation fixe (ne redimensionne pas la boîte) */}
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1.5 h-1.5 w-full">
                    <div
                      className={`h-full flex-1 rounded-full transition-all duration-200 ${
                        passwordStrengthScore >= 1
                          ? passwordStrengthScore === 1
                            ? "bg-rose-500"
                            : passwordStrengthScore === 2
                            ? "bg-amber-500"
                            : passwordStrengthScore === 3
                            ? "bg-sky-500"
                            : "bg-emerald-500"
                          : "bg-slate-200"
                      }`}
                    />
                    <div
                      className={`h-full flex-1 rounded-full transition-all duration-200 ${
                        passwordStrengthScore >= 2
                          ? passwordStrengthScore === 2
                            ? "bg-amber-500"
                            : passwordStrengthScore === 3
                            ? "bg-sky-500"
                            : "bg-emerald-500"
                          : "bg-slate-200"
                      }`}
                    />
                    <div
                      className={`h-full flex-1 rounded-full transition-all duration-200 ${
                        passwordStrengthScore >= 3
                          ? passwordStrengthScore === 3
                            ? "bg-sky-500"
                            : "bg-emerald-500"
                          : "bg-slate-200"
                      }`}
                    />
                    <div
                      className={`h-full flex-1 rounded-full transition-all duration-200 ${
                        passwordStrengthScore >= 4 ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] h-4 leading-none">
                    <span className="text-slate-400">Force du mot de passe</span>
                    <span
                      className={`font-semibold transition-colors ${
                        passwordStrengthScore === 0
                          ? "text-slate-400 font-normal"
                          : passwordStrengthScore === 1
                          ? "text-rose-500"
                          : passwordStrengthScore === 2
                          ? "text-amber-500"
                          : passwordStrengthScore === 3
                          ? !hasSpecial
                            ? "text-amber-600 font-bold"
                            : "text-sky-600"
                          : "text-emerald-600 font-bold"
                      }`}
                    >
                      {passwordStrengthScore === 0
                        ? "8+ car., Maj, Min, Chiffre, Car. spécial"
                        : passwordStrengthScore === 1
                        ? "Très faible"
                        : passwordStrengthScore === 2
                        ? "Moyen"
                        : passwordStrengthScore === 3
                        ? !hasSpecial
                          ? "Caractère spécial requis (!@#...)"
                          : "Bon"
                        : "Fort (conforme)"}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#062653] mb-1.5">
                  Confirmer le mot de passe <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez votre mot de passe"
                  className="w-full h-11 px-3.5 text-xs rounded-xl bg-[#F4F6F9] text-slate-900 focus:bg-white focus:outline-none transition-colors"
                />
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-[11px] text-rose-500 mt-1">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              {/* CONFIRMATION D'ACCEPTATION DU SYSTÈME (BOUTON RADIO OBLIGATOIRE) */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  acceptedTerms
                    ? "border-emerald-300"
                    : "border-slate-200"
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="acceptConditions"
                    id="acceptConditions"
                    checked={acceptedTerms}
                    onChange={() => setAcceptedTerms(true)}
                    className="mt-0.5 w-4 h-4 accent-[#FF7900] cursor-pointer shrink-0"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-[#062653] leading-snug block">
                      Confirmation d'acceptation du système (Obligatoire)
                    </span>
                    <span className="text-xs text-[#263445] leading-relaxed block">
                      Je confirme avoir pris connaissance des objectifs, des tarifs et de la charte de fonctionnement de RKonekte, et j'accepte formellement l'utilisation de la plateforme pour mon organisation.
                    </span>
                  </div>
                </label>
                <div className="pl-7 pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-[11px] font-semibold text-[#FF7900] hover:text-[#E66D00] hover:underline cursor-pointer"
                  >
                    Consulter la charte d'utilisation &amp; les tarifs →
                  </button>
                  {acceptedTerms && (
                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                      ✓ Conditions acceptées
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !acceptedTerms || !isConforme || password !== confirmPassword}
                className="w-full h-11 bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#FF7900]" />
                    <span>Enregistrement du mot de passe...</span>
                  </>
                ) : (
                  <>
                    <span>Définir mon mot de passe et activer mon compte</span>
                    <ArrowRight className="w-4 h-4 text-[#FF7900]" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* MODAL DE CONSULTATION DE LA CHARTE D'UTILISATION & TARIFS */}
      <Modal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Charte d'Utilisation, Tarifs & Engagements RKonekte"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs text-[#263445] leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
          <div className="p-4 bg-[#F4F6F9] rounded-2xl space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7900] block">
              1. Objectifs &amp; Fonctionnalités de la Plateforme
            </span>
            <p className="text-[#64748B]">
              RKonekte est une solution de gestion digitalisée d'entreprise. Elle permet la dématérialisation intégrale des demandes de congé RH avec génération de fiches officielles A4 imprimables, les revalorisations salariales formelles avec notifications automatiques, les autorisations d'achats avec signatures numériques certifiées sans arrière-plan blanc, ainsi que la saisie de caisse et l'édition de rapports financiers consolidés en temps réel.
            </p>
          </div>

          <div className="p-4 bg-[#F4F6F9] rounded-2xl space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              2. Tarifs &amp; Période Gratuite
            </span>
            <p className="font-semibold text-emerald-800">
              ✓ Premier mois offert (30 jours gratuits) dès l'activation de votre compte administrateur sans engagement initial.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="p-2.5 bg-white rounded-xl shadow-2xs">
                <strong>1 mois :</strong> 50 USD / mois
              </div>
              <div className="p-2.5 bg-white rounded-xl shadow-2xs">
                <strong>3 mois :</strong> 135 USD (-10%)
              </div>
              <div className="p-2.5 bg-white rounded-xl shadow-2xs">
                <strong>6 mois :</strong> 255 USD (-15%)
              </div>
              <div className="p-2.5 bg-white rounded-xl shadow-2xs">
                <strong>12 mois :</strong> 510 USD (-15%)
              </div>
            </div>
            <p className="text-[11px] text-[#64748B] pt-1">
              Règlements acceptés : Sogebank, Unibank, MonCash. Tout réabonnement anticipé prolonge automatiquement l'échéance : aucun jour restant n'est perdu.
            </p>
          </div>

          <div className="p-4 bg-[#F4F6F9] rounded-2xl space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#062653] block">
              3. Ce qu'il faut savoir avant de se lancer
            </span>
            <ul className="list-disc pl-4 space-y-1.5 text-[#64748B]">
              <li><strong>Rôle Administrateur :</strong> Vous disposez de l'autorité complète pour configurer le logo officiel transparent, définir les succursales et inviter vos collaborateurs.</li>
              <li><strong>Cloisonnement &amp; Confidentialité :</strong> Chaque utilisateur accède strictement aux données et fonctionnalités autorisées par son profil d'accès.</li>
              <li><strong>Authenticité &amp; Archivage :</strong> Tous les documents générés sont traçables, prêts pour l'impression A4 et scellés avec vos signatures numériques.</li>
            </ul>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowTermsModal(false)}
              className="px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F4F6F9] rounded-xl transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => {
                setAcceptedTerms(true);
                setShowTermsModal(false);
              }}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#062653] hover:bg-[#031B3A] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              J'ai compris et j'accepte
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function VerifyCompanyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#FF7900] animate-spin" />
        </div>
      }
    >
      <VerifyCompanyContent />
    </Suspense>
  );
}
