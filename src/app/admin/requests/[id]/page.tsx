"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  User,
  Building,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  RotateCw,
  AlertCircle,
  FileCheck,
  FileSignature,
  ShieldCheck,
  Printer,
  Stamp,
  Building2,
  FileText,
  Download,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DecisionModal } from "@/components/admin/DecisionModal";
import { showSystemToast } from "@/components/ui/SystemToast";
import { generateLeaveRequestPdfBlob, downloadPdfBlob, printPdfDocument } from "@/lib/utils/pdf";

export default function AdminRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [request, setRequest] = useState<any>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalType, setModalType] = useState<"APPROVE" | "REJECT" | null>(null);
  const [postDecisionWhatsAppUrl, setPostDecisionWhatsAppUrl] = useState<string | null>(null);

  // PDF & WhatsApp State
  const sheetRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [whatsAppModalInfo, setWhatsAppModalInfo] = useState<{
    isOpen: boolean;
    phone: string;
    fileName: string;
    pdfBlob?: Blob;
    waUrl: string;
  } | null>(null);

  const handleDownloadPdf = async () => {
    if (!sheetRef.current || !request) return;
    setDownloadingPdf(true);
    try {
      const fileName = `Feuille_Conge_${request.requestNumber}.pdf`;
      const { blob } = await generateLeaveRequestPdfBlob(sheetRef.current, fileName);
      downloadPdfBlob(blob, fileName);
      showSystemToast("Feuille officielle téléchargée en PDF avec succès !");
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      showSystemToast("Erreur lors de la génération du PDF.", "error");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!sheetRef.current || !request) return;
    setPrintingPdf(true);
    try {
      const fileName = `Feuille_Conge_${request.requestNumber}.pdf`;
      const { blob } = await generateLeaveRequestPdfBlob(sheetRef.current, fileName);
      printPdfDocument(blob);
    } catch (err) {
      console.error("Erreur impression PDF:", err);
      window.print();
    } finally {
      setPrintingPdf(false);
    }
  };

  const loadData = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/requests/${id}`);
      if (!res.ok) {
        setError("Demande de congé introuvable ou accès refusé.");
        return;
      }
      const data = await res.json();
      setRequest(data.request);
      if (data.request?.organizationLogo) {
        setCompanyLogo(data.request.organizationLogo);
      } else if (typeof window !== "undefined") {
        const cached = localStorage.getItem("rk_company_logo");
        if (cached) setCompanyLogo(cached);
      }
      setAuditLogs(data.auditLogs || []);
      setNotifications(data.notifications || []);
    } catch (err) {
      setError("Erreur réseau lors du chargement de la demande.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // Client fallback for employee signature snapshot
  useEffect(() => {
    if (request && !request.employeeSignature) {
      try {
        const sigs = JSON.parse(localStorage.getItem("rkonekte_employee_signatures") || "{}");
        const found = sigs[request.requestNumber];
        if (found?.signature) {
          setRequest((prev: any) => ({
            ...prev,
            employeeSignature: found.signature,
            signatureMode: found.mode || "upload",
            typedSignatureText: found.mode === "type" ? found.signature : prev?.typedSignatureText,
          }));
          return;
        }
      } catch (_) {}

      // Fallback: Check if the employee or user has a saved official signature in localStorage
      if (typeof window !== "undefined") {
        const userSig = localStorage.getItem("rkonekte_user_signature");
        if (userSig) {
          setRequest((prev: any) => ({
            ...prev,
            employeeSignature: userSig,
            signatureMode: "upload",
          }));
        }
      }
    }
  }, [request?.requestNumber, request?.employeeSignature]);

  const handleDecision = async ({
    rejectionReason,
    comment,
    signatureUrl,
  }: {
    rejectionReason?: string;
    comment?: string;
    signatureUrl?: string;
  }) => {
    const endpoint =
      modalType === "APPROVE"
        ? `/api/admin/requests/${id}/approve`
        : `/api/admin/requests/${id}/reject`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rejectionReason,
        decisionComment: comment,
        signatureUrl,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Impossible d'enregistrer la décision");
    }

    showSystemToast(
      modalType === "APPROVE"
        ? "La demande a été approuvée avec succès !"
        : "La demande a été refusée.",
      modalType === "APPROVE" ? "success" : "info"
    );

    // Automatically prepare WhatsApp notification link for employee and launch it immediately
    if (request?.contactPhone) {
      const waText =
        modalType === "APPROVE"
          ? `Bonjour ${request.firstName},\n\nVotre demande de congé ${request.requestNumber} a été APPROUVÉE.\n\nDate de début : ${request.startDate}\nDate de fin : ${request.endDate}\n\nConsulter votre demande et voir le verdict :\n${window.location.origin}/request/${request.employeeAccessTokenHash}`
          : `Bonjour ${request.firstName},\n\nVotre demande de congé ${request.requestNumber} a été REFUSÉE.\n\nMotif : ${rejectionReason || "Non précisé"}\n\nConsulter votre demande et voir le verdict :\n${window.location.origin}/request/${request.employeeAccessTokenHash}`;

      const cleanPhone = request.contactPhone.replace(/[^0-9]/g, "");
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

      if (typeof window !== "undefined") {
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }

      setPostDecisionWhatsAppUrl(waUrl);
    }

    await loadData();
  };

  const handleSendWhatsAppWithPdf = async () => {
    if (!request) return;
    const cleanPhone = request.contactPhone ? request.contactPhone.replace(/[^0-9]/g, "") : "";
    const publicUrl = typeof window !== "undefined"
      ? `${window.location.origin}/request/${request.employeeAccessTokenHash}`
      : "";

    const waText = request.status === "APPROVED"
      ? `Bonjour ${request.firstName},\n\nVotre demande de congé ${request.requestNumber} a été APPROUVÉE.\n\nDate de début : ${request.startDate}\nDate de fin : ${request.endDate}\n\n📄 Votre feuille officielle signée (PDF) est disponible ici :\n${publicUrl}\n\n(Le document PDF officiel a été certifié avec signatures et visa).`
      : request.status === "REJECTED"
      ? `Bonjour ${request.firstName},\n\nVotre demande de congé ${request.requestNumber} a été REFUSÉE.\n\nMotif : ${request.rejectionReason || "Non précisé"}\n\n📄 Consulter votre feuille officielle signée :\n${publicUrl}`
      : `Bonjour ${request.firstName},\n\nVotre demande de congé ${request.requestNumber} est bien reçue.\n\n📄 Suivre votre feuille officielle :\n${publicUrl}`;

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;

    setGeneratingPdf(true);
    try {
      const sheetEl = sheetRef.current;
      if (!sheetEl) {
        window.open(waUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const fileName = `Feuille_Conge_${request.requestNumber}.pdf`;
      const { blob, file } = await generateLeaveRequestPdfBlob(sheetEl, fileName);

      // 1. Si mobile ou navigateur compatible Web Share API avec partage de fichiers
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Feuille officielle de congé ${request.requestNumber}`,
            text: waText,
          });
          showSystemToast("Feuille PDF partagée avec succès !");
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") {
            return;
          }
        }
      }

      // 2. Fallback PC / Web Desktop : Téléchargement automatique du fichier PDF physique
      downloadPdfBlob(blob, fileName);

      // Ouvrir la discussion WhatsApp avec le message pré-rempli et le lien officiel
      window.open(waUrl, "_blank", "noopener,noreferrer");

      // Afficher la fenêtre modale explicative pour l'envoi immédiat
      setWhatsAppModalInfo({
        isOpen: true,
        phone: request.contactPhone || cleanPhone,
        fileName,
        pdfBlob: blob,
        waUrl,
      });

      showSystemToast("PDF généré et téléchargé pour l'envoi WhatsApp !");
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      window.open(waUrl, "_blank", "noopener,noreferrer");
      showSystemToast("Lien WhatsApp ouvert.", "info");
    } finally {
      setGeneratingPdf(false);
    }
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

  if (loading) {
    return (
      <div className="p-16 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-slate-300 border-t-[#062653] rounded-full animate-spin" />
        <span>Chargement de la feuille de demande...</span>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-2xl border border-rose-200 text-center shadow-xs">
        <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-slate-800">Erreur</h2>
        <p className="text-xs text-slate-600 mt-1">{error || "Demande introuvable"}</p>
        <Link
          href="/admin/requests"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#062653] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à la liste des demandes
        </Link>
      </div>
    );
  }

  const isPending = request.status === "PENDING";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* 1. TOP TOOLBAR (MASQUÉ À L'IMPRESSION) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#062653] transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à la liste des demandes
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-[#062653]">
              {request.requestNumber}
            </h1>
            <StatusBadge status={request.status} size="md" />
          </div>
        </div>

        {/* ACTIONS DU HAUT : IMPRESSION, TÉLÉCHARGEMENT PDF & WHATSAPP */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-75 border border-red-600"
            title="Télécharger la feuille officielle en fichier PDF"
          >
            {downloadingPdf ? (
              <RotateCw className="w-4 h-4 text-white animate-spin shrink-0" />
            ) : (
              <Download className="w-4 h-4 text-white shrink-0" />
            )}
            <span>{downloadingPdf ? "Création du PDF..." : "Télécharger le PDF"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printingPdf}
            className="px-4 py-2 bg-black hover:bg-zinc-800 text-white border border-black text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-75"
            title="Imprimer la feuille officielle de demande de congé"
          >
            {printingPdf ? (
              <RotateCw className="w-4 h-4 text-white animate-spin shrink-0" />
            ) : (
              <Printer className="w-4 h-4 text-white shrink-0" />
            )}
            <span>{printingPdf ? "Préparation..." : "Imprimer la feuille"}</span>
          </button>

          {request.contactPhone && (
            <button
              type="button"
              onClick={handleSendWhatsAppWithPdf}
              disabled={generatingPdf}
              className="px-4 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 border border-[#25D366] disabled:opacity-75"
              title="Envoyer la feuille officielle en PDF par WhatsApp à l'employé"
            >
              {generatingPdf ? (
                <RotateCw className="w-4 h-4 text-white animate-spin shrink-0" />
              ) : (
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.086s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.392-12.416c-5.523 0-10 4.477-10 10 0 1.776.467 3.447 1.284 4.899l-1.365 4.989 5.12-1.343c1.402.771 3.007 1.215 4.717 1.215 5.523 0 10-4.477 10-10s-4.477-10-10-10z" />
                </svg>
              )}
              <span>{generatingPdf ? "Création du PDF..." : "WhatsApp"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. LA FEUILLE DÛMENT REMPLIE (PRINTABLE DOCUMENT SHEET) */}
      <div
        ref={sheetRef}
        className="bg-white rounded-2xl border border-slate-300 shadow-xl p-6 sm:p-10 space-y-6 max-w-4xl mx-auto print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full print-sheet"
      >
        {/* EN-TÊTE OFFICIEL DE LA FEUILLE */}
        <div className="pb-3 border-b border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {companyLogo && (
                <img
                  src={companyLogo}
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
                <span className="text-sm font-extrabold text-[#062653]">
                  {request.requestedDays} jour{request.requestedDays > 1 ? "s" : ""} ouvré{request.requestedDays > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                Remplaçant Proposé pour l'Intérim / Service
              </span>
              <span className="font-medium text-slate-800">
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
            className="border border-slate-300 border-t-0 rounded-b-lg p-4 grid grid-cols-2 gap-4"
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
                {request.employeeSignature ? (
                  <img
                    src={request.employeeSignature}
                    alt={`Signature de ${request.firstName} ${request.lastName}`}
                    className="h-16 max-w-[200px] object-contain my-1 drop-shadow-xs"
                  />
                ) : (
                  <div className="text-center">
                    <div className="font-windsong text-3xl sm:text-4xl text-[#062653] italic select-none py-1">
                      {request.typedSignatureText || `${request.firstName} ${request.lastName}`}
                    </div>
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">
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
                request.status === "APPROVED"
                  ? "bg-emerald-50/40 border-emerald-300"
                  : request.status === "REJECTED"
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
                    className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      request.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-800"
                        : request.status === "REJECTED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {request.status === "APPROVED"
                      ? "Accordé & Signé"
                      : request.status === "REJECTED"
                      ? "Refusé"
                      : "En attente"}
                  </span>
                </div>
                <div className="text-xs text-slate-700 leading-normal pt-1">
                  {request.status === "APPROVED" ? (
                    <>
                      Validé par : <strong className="text-slate-900 font-bold">{request.signerName || "Direction Générale"}</strong>
                      {request.signerRole && (
                        <span className="text-slate-500 text-[11px]"> ({formatRoleLabel(request.signerRole)})</span>
                      )}
                    </>
                  ) : request.status === "REJECTED" ? (
                    <span className="text-rose-600 font-semibold">Décision de refus enregistrée</span>
                  ) : (
                    <span className="text-slate-400 italic">Cadre réservé à l'Administration</span>
                  )}
                </div>
              </div>

              {/* Contenu Signature Direction */}
              <div className="py-2 flex flex-col items-center justify-center min-h-[70px]">
                {request.status === "APPROVED" ? (
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
                ) : request.status === "REJECTED" ? (
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
                      Décision : &nbsp;&nbsp;□ Accordé &nbsp;&nbsp;&nbsp;&nbsp; □ Refusé
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      (Signature en attente d'approbation ci-dessous)
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                <span>Cachet & Signature Direction</span>
                <span>
                  {request.decidedAt ? formatDateDisplay(request.decidedAt) : "Date : ____/____/________"}
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

      {/* 3. EN DESSOUS DE LA FEUILLE : BOUTONS APPROUVER ET REFUSER (UNIQUEMENT QUAND EN ATTENTE) */}
      {isPending && (
        <div className="max-w-4xl mx-auto print:hidden">
          <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-md p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5 animate-in fade-in">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7900] bg-[#FFF4EB] px-2 py-0.5 rounded border border-[#FF7900]/20">
                  Décision Administrative
                </span>
                <span className="text-xs text-slate-400">• Formulaire en attente de visa</span>
              </div>
              <h3 className="text-base font-bold text-[#062653] mt-1">
                Traiter cette demande de congé
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Après avoir examiné la feuille dûment remplie ci-dessus, confirmez l'approbation ou le refus officiel pour <strong>{request.firstName} {request.lastName}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setModalType("REJECT")}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <XCircle className="w-4 h-4" />
                Refuser
              </button>
              <button
                type="button"
                onClick={() => setModalType("APPROVE")}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approuver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DECISION MODAL */}
      {modalType && (
        <DecisionModal
          isOpen={!!modalType}
          onClose={() => setModalType(null)}
          type={modalType}
          requestNumber={request.requestNumber}
          employeeName={`${request.firstName} ${request.lastName}`}
          onConfirm={handleDecision}
        />
      )}

      {/* POST-DECISION WHATSAPP PROMPT MODAL */}
      {postDecisionWhatsAppUrl && (
        <Modal
          isOpen={!!postDecisionWhatsAppUrl}
          onClose={() => setPostDecisionWhatsAppUrl(null)}
          title="Notification WhatsApp de l'employé"
        >
          <div className="space-y-4 text-center p-2">
            <div className="w-12 h-12 bg-slate-100 text-slate-700 border border-slate-200 rounded-full flex items-center justify-center mx-auto">
              <Phone className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                Transmission automatique par WhatsApp
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                La fenêtre WhatsApp s'est ouverte automatiquement avec le verdict et le lien sécurisé pour <strong>{request.firstName} {request.lastName}</strong>.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Si la fenêtre ne s'est pas ouverte (bloqueur de pop-up), cliquez sur le bouton ci-dessous :
              </p>
            </div>

            <div className="pt-3 flex flex-col gap-2">
              <a
                href={postDecisionWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPostDecisionWhatsAppUrl(null)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                Envoyer le verdict par WhatsApp
              </a>

              <button
                type="button"
                onClick={() => setPostDecisionWhatsAppUrl(null)}
                className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL GUIDAGE ENVOI PDF VIA WHATSAPP */}
      {whatsAppModalInfo && (
        <Modal
          isOpen={whatsAppModalInfo.isOpen}
          onClose={() => setWhatsAppModalInfo(null)}
          title="Feuille Officielle PDF prête pour WhatsApp"
        >
          <div className="space-y-4 p-2 text-center">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                Document PDF généré avec succès !
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Le document officiel <strong>{whatsAppModalInfo.fileName}</strong> a été téléchargé sur votre appareil.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2.5 text-xs text-slate-700">
              <div className="flex items-start gap-2">
                <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">1</span>
                <span>La discussion WhatsApp avec <strong>{whatsAppModalInfo.phone}</strong> est ouverte.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">2</span>
                <span>
                  <strong>Glissez-déposez le fichier PDF téléchargé</strong> directement dans la discussion WhatsApp (ou cliquez sur le trombone 📎 &gt; Document).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">3</span>
                <span className="text-slate-500">
                  Le message WhatsApp envoyé contient aussi le lien direct sécurisé permettant à l'employé de consulter et télécharger son attestation certifiée à tout moment.
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <a
                href={whatsAppModalInfo.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.086s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.392-12.416c-5.523 0-10 4.477-10 10 0 1.776.467 3.447 1.284 4.899l-1.365 4.989 5.12-1.343c1.402.771 3.007 1.215 4.717 1.215 5.523 0 10-4.477 10-10s-4.477-10-10-10z" />
                </svg>
                Rouvrir WhatsApp
              </a>
              {whatsAppModalInfo.pdfBlob && (
                <button
                  type="button"
                  onClick={() => downloadPdfBlob(whatsAppModalInfo.pdfBlob!, whatsAppModalInfo.fileName)}
                  className="py-2.5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                  <span>Télécharger le PDF</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setWhatsAppModalInfo(null)}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
