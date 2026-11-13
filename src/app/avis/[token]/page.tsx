import React from "react";
import { AlertTriangle, Lock, MapPin, MessageSquarePlus } from "lucide-react";
import { resolvePublicQrByToken } from "@/lib/services/customer-feedback";
import { PublicFeedbackForm } from "./PublicFeedbackForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolvePublicQrByToken(token);

  // 1. Token invalide / inexistant
  if (!resolved.found) {
    return (
      <main className="flex-1 min-h-screen w-full bg-white flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Lien introuvable ou invalide
          </h1>
          <p className="text-sm text-[#64748B] leading-relaxed">
            Ce QR Code ne correspond à aucun questionnaire client valide.
            Veuillez vérifier le code affiché en succursale.
          </p>
        </div>
      </main>
    );
  }

  const companyName = resolved.organizationName || "Notre entreprise";
  const branchName = resolved.branchName || "Succursale";

  // 2. QR Code désactivé
  if (!resolved.active) {
    return (
      <main className="flex-1 min-h-screen w-full bg-white flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-white px-6 py-6 text-center space-y-2 border-b border-slate-100">
            <p className="text-lg font-bold tracking-tight text-slate-900">
              {companyName}
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Succursale : <strong className="text-slate-900">{branchName}</strong></span>
            </div>
          </div>

          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#F4F6F9] text-slate-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              Questionnaire temporairement désactivé
            </h1>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Ce QR Code n'accepte plus de nouveaux avis pour le moment pour la succursale{" "}
              <strong className="text-slate-900">{branchName}</strong>.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // 3. QR Code valide et actif — Interface publique unifiée mobile-first
  return (
    <main className="flex-1 min-h-screen w-full bg-white py-6 px-4 sm:py-12 sm:px-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-lg space-y-4">
        {/* Carte unique unifiée (aucune séparation entre l'entreprise et le formulaire) */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-7 space-y-6">
          {/* En-tête épuré : uniquement nom de l'entreprise et succursale */}
          <div className="text-center space-y-1.5 pb-5 border-b border-slate-100">
            {resolved.organizationLogo && (
              <div className="flex justify-center pb-1">
                <img
                  src={resolved.organizationLogo}
                  alt={companyName}
                  className="max-h-11 max-w-[170px] object-contain"
                />
              </div>
            )}

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {companyName}
            </h1>

            <div>
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>
                  Succursale : <strong className="text-slate-900">{branchName}</strong>
                </span>
              </span>
            </div>
          </div>

          {/* Titre du formulaire + N.B. en rouge */}
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F4F6F9] text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquarePlus className="w-4 h-4 text-slate-600" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-slate-900">
                  Partagez votre avis
                </h2>
                <p className="text-xs text-red-600 font-bold italic leading-relaxed">
                  N.B. : Respectueusement, rapide, simple et anonyme si vous le souhaitez.
                </p>
              </div>
            </div>

            <PublicFeedbackForm
              token={token}
              organizationName={companyName}
              branchName={branchName}
            />
          </div>
        </div>

        {/* Pied de page discret (aucun lien vers le CMS) */}
        <p className="text-center text-[11px] text-[#64748B] px-4">
          {companyName} • Service Satisfaction Client
        </p>
      </div>
    </main>
  );
}
