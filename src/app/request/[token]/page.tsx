"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  User,
  Building,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  FileText,
  Printer,
  Download,
  ShieldCheck,
  RotateCw,
  FileSignature,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { generateLeaveRequestPdfBlob, downloadPdfBlob, printPdfDocument } from "@/lib/utils/pdf";
import { isImageSignature } from "@/lib/utils/signature";

export default function EmployeeRequestStatusPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;
  const autoDownload = searchParams?.get("download") === "1" || searchParams?.get("pdf") === "1";

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadStatus() {
      if (!token) return;
      try {
        const res = await fetch(`/api/public/request-status?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.request) {
          setError(data.error || "Cette demande n'est pas disponible ou le lien est invalide.");
          return;
        }
        setRequest(data.request);
      } catch (err) {
        setError("Impossible de contacter le serveur.");
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [token]);

  // Client-side auto-download if requested via query param
  useEffect(() => {
    if (autoDownload && request && sheetRef.current) {
      handleDownloadPdf();
    }
  }, [autoDownload, request]);

  const handlePrint = async () => {
    if (!sheetRef.current || !request) return;
    setPrintingPdf(true);
    try {
      const fileName = `Feuille_Conge_${request.requestNumber}.pdf`;
      const { blob } = await generateLeaveRequestPdfBlob(sheetRef.current, fileName);
      printPdfDocument(blob);
    } catch (err) {
      console.error("Erreur impression:", err);
      window.print();
    } finally {
      setPrintingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current || !request) return;
    setDownloadingPdf(true);
    try {
      const fileName = `Feuille_Conge_${request.requestNumber}.pdf`;
      const { blob } = await generateLeaveRequestPdfBlob(sheetRef.current, fileName);
      downloadPdfBlob(blob, fileName);
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      // Fallback to print
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  const formatDateDisplay = (dateVal: string | number | null | undefined) => {
    if (!dateVal) return "Non précisé";
    if (typeof dateVal === "string" && dateVal.includes("-")) {
      const parts = dateVal.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatRoleLabel = (role?: string) => {
    if (!role) return "Direction";
    const upper = role.toUpperCase();
    if (upper === "ORGANIZATION_ADMIN") return "Administrateur";
    if (upper === "SUPER_ADMIN") return "Super Admin";
    if (upper === "SECRETARY") return "Secrétariat RH";
    if (upper === "FINANCIAL_MANAGER") return "Directeur Financier";
    if (upper === "BRANCH_MANAGER") return "Responsable Succursale";
    if (upper === "EMPLOYEE") return "Collaborateur";
    return role;
  };

  const getLeaveTypeLabel = (type: string, other?: string) => {
    switch (type) {
      case "ANNUAL":
        return "Congé Annuel Payé";
      case "SICK":
        return "Congé Maladie";
      case "UNPAID":
        return "Congé Sans Solde";
      case "MATERNITY_PATERNITY":
        return "Congé Maternité / Paternité";
      case "OTHER":
        return other ? `Autre motif (${other})` : "Autre motif";
      default:
        return type || "Congé";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Chargement de votre feuille officielle...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Demande introuvable</h2>
          <p className="text-xs text-slate-500 mb-6">
            {error || "Cette demande n'est pas disponible ou le lien est invalide."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  const isApproved = request.status === "APPROVED";
  const isRejected = request.status === "REJECTED";
  const isPending = request.status === "PENDING";

  return (
    <div className="min-h-screen bg-white py-8 px-4 sm:px-6 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* TOP TOOLBAR (MASQUÉ À L'IMPRESSION) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#062653] transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Accueil RKonekte
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-[#062653]">
                {request.requestNumber}
              </h1>
              <StatusBadge status={request.status} size="md" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-75"
              title="Télécharger la feuille officielle en fichier PDF"
            >
              {downloadingPdf ? (
                <RotateCw className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-white" />
              )}
              <span>{downloadingPdf ? "Génération du PDF..." : "Télécharger le PDF"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={printingPdf}
              className="px-4 py-2 bg-black hover:bg-zinc-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-75"
              title="Imprimer directement la feuille officielle"
            >
              {printingPdf ? (
                <RotateCw className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Printer className="w-4 h-4 text-white" />
              )}
              <span>{printingPdf ? "Préparation..." : "Imprimer"}</span>
            </button>
          </div>
        </div>

        {/* FEUILLE OFFICIELLE DÛMENT REMPLIE (PRINTABLE DOCUMENT SHEET) */}
        <div
          ref={sheetRef}
          className="bg-white rounded-2xl border border-slate-300 shadow-xl p-6 sm:p-10 space-y-6 max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print-sheet"
        >
          {/* EN-TÊTE OFFICIEL DE LA FEUILLE */}
          <div className="pb-3 border-b border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                {request.organizationLogo && (
                  <img
                    src={request.organizationLogo}
                    alt={request.organizationName || "Logo Entreprise"}
                    className="max-h-14 max-w-[190px] object-contain drop-shadow-xs"
                  />
                )}
                <div>
                  <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-[#062653]">
                    {request.organizationName || "ENTREPRISE PARTENAIRE"}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                    Direction des Ressources Humaines • Gestion des Absences & Congés
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded-lg font-mono font-bold text-xs text-[#062653]">
                  {request.requestNumber}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  Déposée le {formatDateDisplay(request.submittedAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 text-center">
              <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#062653]">
                Formulaire Officiel de Demande de Congé & d'Absence
              </h1>
            </div>
          </div>

          {/* SECTION I : IDENTIFICATION DU COLLABORATEUR (DEMANDEUR) */}
          <div>
            <div
              data-pdf-navy-header="true"
              className="bg-[#062653] text-white px-3.5 py-1.5 rounded-t-lg font-bold text-xs uppercase tracking-wider flex items-center justify-between"
              style={{ backgroundColor: "#062653", color: "#ffffff" }}
            >
              <span>I. Identification du Collaborateur (Demandeur)</span>
              <span className="text-[10px] text-slate-300 font-normal" style={{ color: "#cbd5e1" }}>Fiche Individuelle</span>
            </div>
            <div className="border border-slate-300 border-t-0 rounded-b-lg divide-y divide-slate-200 text-xs">
              <div className="grid grid-cols-2 divide-x divide-slate-200">
                <div className="p-3 bg-slate-50/40">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Nom & Prénom de l'Employé
                  </span>
                  <span className="text-sm font-bold text-[#062653]">
                    {request.firstName} {request.lastName}
                  </span>
                </div>
                <div className="p-3 bg-slate-50/40">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Numéro de Matricule Officiel
                  </span>
                  <span className="text-sm font-mono font-extrabold text-[#FF7900]">
                    {request.employeeNumber}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-200">
                <div className="p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Département / Service
                  </span>
                  <span className="font-semibold text-slate-800">
                    {request.department}
                  </span>
                </div>
                <div className="p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Fonction / Poste Occupé
                  </span>
                  <span className="font-semibold text-slate-800">
                    {request.position}
                  </span>
                </div>
                <div className="p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Succursale d'Affectation
                  </span>
                  <span className="font-semibold text-slate-800">
                    {request.branch || "Non assignée"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-slate-200">
                <div className="p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Téléphone de Contact (WhatsApp)
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {request.contactPhone || "Non renseigné"}
                  </span>
                </div>
                <div className="p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Courrier Électronique
                  </span>
                  <span className="font-semibold text-slate-800">
                    {request.contactEmail || "Non renseigné"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION II : MODALITÉS DU CONGÉ & PÉRIODE D'ABSENCE */}
          <div>
            <div
              data-pdf-navy-header="true"
              className="bg-[#062653] text-white px-3.5 py-1.5 rounded-t-lg font-bold text-xs uppercase tracking-wider flex items-center justify-between"
              style={{ backgroundColor: "#062653", color: "#ffffff" }}
            >
              <span>II. Modalités du Congé & Période d'Absence</span>
              <span className="text-[10px] text-slate-300 font-normal" style={{ color: "#cbd5e1" }}>Dispositions Statutaires</span>
            </div>
            <div className="border border-slate-300 border-t-0 rounded-b-lg divide-y divide-slate-200 text-xs">
              <div className="grid grid-cols-3 divide-x divide-slate-200">
                <div className="p-3 bg-slate-50/40">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Nature / Type de Congé
                  </span>
                  <span className="text-xs font-bold text-[#062653]">
                    {getLeaveTypeLabel(request.leaveType, request.leaveTypeOther)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50/40">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Période Sollicitée (Dates incluses)
                  </span>
                  <span className="font-bold text-slate-800">
                    Du {formatDateDisplay(request.startDate)} au {formatDateDisplay(request.endDate)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50/40">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Nombre de Jours Demandés
                  </span>
                  <span className="text-sm font-black text-[#062653]">
                    {request.requestedDays} {request.requestedDays > 1 ? "jours ouvrés" : "jour ouvré"}
                  </span>
                </div>
              </div>

              <div className="p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Remplaçant Proposé pour l'Intérim / Service
                </span>
                <span className="font-medium text-slate-700">
                  {request.replacementName || "Aucun remplaçant désigné (Prise en charge interne par l'équipe)"}
                </span>
              </div>

              <div className="p-3 bg-slate-50/30">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Motif & Justification de la Demande
                </span>
                <p className="text-xs text-slate-700 leading-relaxed italic">
                  {request.leaveTypeOther
                    ? `« ${request.leaveTypeOther} »`
                    : `« Demande formelle de ${getLeaveTypeLabel(request.leaveType).toLowerCase()} introduite par le collaborateur dans le cadre des prévisions statutaires en vigueur. »`}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION III : CADRE OFFICIEL DES SIGNATURES & VISAS */}
          <div>
            <div
              data-pdf-navy-header="true"
              className="bg-[#062653] text-white px-3.5 py-1.5 rounded-t-lg font-bold text-xs uppercase tracking-wider flex items-center justify-between"
              style={{ backgroundColor: "#062653", color: "#ffffff" }}
            >
              <span>III. Approbation de l'administration</span>
            </div>

            <div
              data-pdf-signatures="true"
              className="border border-slate-300 border-t-0 rounded-b-lg p-4 grid grid-cols-2 gap-4 text-xs"
              style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}
            >
              {/* À GAUCHE : SIGNATURE DE L'EMPLOYÉ */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-slate-300 bg-white flex flex-col justify-between min-h-[175px] shadow-2xs">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1.5">
                    <span className="text-[11px] font-bold text-[#062653] flex items-center gap-1.5 shrink-0">
                      <FileSignature className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
                      Signature de l'Employé
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">
                      {formatDateDisplay(request.submittedAt)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 leading-normal pt-1">
                    Fait par : <strong className="text-slate-900 font-bold">{request.firstName} {request.lastName}</strong>{" "}
                    <span className="text-slate-500 font-mono text-[11px]">({request.employeeNumber})</span>
                  </div>
                </div>

                {/* Contenu Signature Employé */}
                <div className="py-2 flex flex-col items-center justify-center min-h-[70px]">
                  {isImageSignature(request.employeeSignature) ? (
                    <img
                      src={request.employeeSignature}
                      alt={`Signature de ${request.firstName} ${request.lastName}`}
                      className="h-16 max-w-[200px] object-contain my-1 drop-shadow-xs"
                    />
                  ) : (
                    <div className="text-center py-1 select-none">
                      <div
                        className="font-windsong text-3xl sm:text-4xl text-[#062653] py-1 leading-normal tracking-wide"
                        style={{ fontFamily: "'WindSong', 'Caveat', 'Dancing Script', cursive, sans-serif" }}
                      >
                        {request.typedSignatureText ||
                          (!isImageSignature(request.employeeSignature) ? request.employeeSignature : "") ||
                          `${request.firstName} ${request.lastName}`}
                      </div>
                      <div className="w-44 h-0.5 bg-[#062653]/30 mx-auto mt-0.5" />
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block mt-1">
                        Signature officielle certifiée
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="italic">Attestation sur l'honneur certifiée</span>
                  <span>Fait le {formatDateDisplay(request.submittedAt)}</span>
                </div>
              </div>

              {/* À DROITE : SIGNATURE DE L'ADMINISTRATION */}
              <div
                className={`p-3.5 sm:p-4 rounded-xl border flex flex-col justify-between min-h-[175px] ${
                  isApproved
                    ? "bg-emerald-50/40 border-emerald-300"
                    : isRejected
                    ? "bg-rose-50/40 border-rose-300"
                    : "bg-slate-50/60 border-dashed border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1.5">
                    <span className="text-[11px] font-bold text-[#062653] flex items-center gap-1.5 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Signature de l'Administration
                    </span>
                    <span
                      className={`text-[11px] font-bold shrink-0 inline-flex items-center gap-1 ${
                        isApproved
                          ? "text-emerald-600"
                          : isRejected
                          ? "text-rose-600"
                          : "text-[#FF7900]"
                      }`}
                    >
                      {isApproved ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Accordé & Signé
                        </>
                      ) : isRejected ? (
                        <>
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Refusé
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 text-[#FF7900]" />
                          En attente
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 leading-normal pt-1">
                    {isApproved ? (
                      <>
                        Validé par : <strong className="text-slate-900 font-bold">{request.signerName || "Direction Générale"}</strong>
                        {request.signerRole && (
                          <span className="text-slate-500 text-[11px]"> ({formatRoleLabel(request.signerRole)})</span>
                        )}
                      </>
                    ) : isRejected ? (
                      <span className="text-rose-700 font-medium">Décision de refus enregistrée</span>
                    ) : (
                      <span className="text-slate-500 italic">Cadre réservé à l'Administration</span>
                    )}
                  </div>
                </div>

                {/* Contenu Signature Direction */}
                <div className="py-2 flex flex-col items-center justify-center min-h-[70px]">
                  {isApproved ? (
                    request.signatureUrl ? (
                      <img
                        src={request.signatureUrl}
                        alt="Signature Direction"
                        className="h-14 max-w-[200px] object-contain my-1"
                      />
                    ) : (
                      <div className="text-center">
                        <div className="font-windsong text-2xl text-emerald-800 italic select-none">
                          {request.signerName || "Direction Générale"}
                        </div>
                        <span className="text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-widest">
                          [ VISA NUMÉRIQUE CERTIFIÉ ]
                        </span>
                      </div>
                    )
                  ) : isRejected ? (
                    <div className="text-center text-xs text-rose-700 font-semibold p-1">
                      <div className="font-bold">Demande Non Accordée</div>
                      {request.rejectionReason && (
                        <div className="text-[11px] font-normal italic mt-0.5">
                          Motif : « {request.rejectionReason} »
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-[11px] text-slate-400 italic">
                      <div className="font-semibold text-slate-500">
                        En attente de traitement par le Responsable
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Cachet & Signature Direction</span>
                  <span>
                    {request.decidedAt ? formatDateDisplay(request.decidedAt) : "Date : En attente"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* PIED DE PAGE LÉGAL DE LA FEUILLE */}
          <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400 space-y-0.5">
            <p>
              Document officiel de demande de congé généré et certifié électroniquement.
            </p>
            <p className="font-mono">
              Réf: {request.requestNumber} • Empreinte de sécurité: {request.employeeAccessTokenHash?.substring(0, 16)}...
            </p>
          </div>
        </div>

        {/* BOTTOM DOWNLOAD CTA (Hidden on print) */}
        <div className="max-w-4xl mx-auto print:hidden pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#F4F6F9] p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Feuille certifiée conforme aux registres de l'entreprise</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-75"
          >
            {downloadingPdf ? (
              <RotateCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-white" />
            )}
            <span>Télécharger la feuille officielle en PDF</span>
          </button>
        </div>
      </div>

    </div>
  );
}
