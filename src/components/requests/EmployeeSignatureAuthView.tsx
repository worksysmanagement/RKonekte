"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building,
  Briefcase,
  ShieldCheck,
  RefreshCw,
  Stamp,
  Plus,
  UploadCloud,
  FileUp,
  FileCheck,
  Eye,
  Download,
  ExternalLink,
  Trash2,
  X,
  FileSignature,
  Printer,
  Maximize2,
  Minimize2,
  PenTool,
  Sparkles,
} from "lucide-react";
import { showSystemToast } from "@/components/ui/SystemToast";
import { printPdfDocument, openPdfFullscreen, downloadPdfDocument, dataUrlToPdfBlob } from "@/lib/utils/pdf";
import { WordDocumentEditor, WordDocumentEditorRef } from "./WordDocumentEditor";

interface EmployeeProfile {
  id?: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: string;
  position: string;
  branch: string;
  phone?: string;
  email: string;
}

export interface SignatureAuthRequest {
  id: string;
  applicantName: string;
  applicantRole: string;
  employeeNumber?: string;
  branch?: string;
  pdfUrl?: string;
  pdfFileName: string;
  pdfFileSize?: string;
  description: string;
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  authorizedBy?: string;
  authorizedRole?: string;
  authorizedAt?: string;
  signatureUrl?: string;
  // Legacy optional fields for backwards compatibility
  documentType?: string;
  documentReference?: string;
  amount?: string;
  currency?: string;
}

const STORAGE_KEY = "rkonekte_signature_auth_requests";
const PROFILE_STORAGE_KEY = "rkonekte_cached_employee_profile";
const HIDDEN_STORAGE_KEY = "rkonekte_hidden_signature_requests";

export const SAMPLE_PDF_DATA_URL =
  "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFI+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDU1Pj5zdHJlYW0KQVQKL0YxIDI0IFRmCjEwMCA3NTAgVGQKKEF1dG9yaXNhdGlvbiBkZSBTaWduYXR1cmUgUktvbmVrdGUpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE4IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMjE5IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMzI1CiUlRU9G";

function deduplicateRequests(items: SignatureAuthRequest[]): SignatureAuthRequest[] {
  const seen = new Set<string>();
  const result: SignatureAuthRequest[] = [];
  let counter = 1;
  for (const item of items) {
    let id = item.id;
    if (!id || seen.has(id)) {
      while (seen.has(`SIG-2026-${String(counter).padStart(3, "0")}`)) {
        counter++;
      }
      id = `SIG-2026-${String(counter).padStart(3, "0")}`;
      counter++;
    }
    seen.add(id);
    result.push({ ...item, id });
  }
  return result;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " octets";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(2) + " Mo";
}

function getCachedProfile(): EmployeeProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function EmployeeSignatureAuthView() {
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [profile, setProfile] = useState<EmployeeProfile | null>(() => getCachedProfile());
  const [userName, setUserName] = useState<string>("");
  const [myRequests, setMyRequests] = useState<SignatureAuthRequest[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(() => !getCachedProfile());
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(HIDDEN_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const handleHideFromView = (id: string, name?: string) => {
    if (
      !confirm(
        `Voulez-vous supprimer cette demande (${id}) de votre affichage ?\n\nRemarque : Elle ne sera pas supprimée de la base de données et restera accessible pour l'administration.`
      )
    ) {
      return;
    }
    const updated = [...hiddenIds, id];
    setHiddenIds(updated);
    try {
      localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
    showSystemToast(`La demande ${id} a été retirée de votre interface.`);
  };

  const visibleRequests = myRequests.filter((r) => !hiddenIds.includes(r.id));

  // Mode de document : soit rédigé en ligne (style Word), soit téléversé en PDF
  const [documentSource, setDocumentSource] = useState<"editor" | "upload">("editor");
  const wordEditorRef = useRef<WordDocumentEditorRef | null>(null);
  const [editorTitle, setEditorTitle] = useState(
    "Demande d'autorisation de dépense et d'engagement de fonds"
  );
  const [companyName, setCompanyName] = useState<string>("e-biznis");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Form State: PDF file + Motif de l'autorisation
  const [uploadedPdf, setUploadedPdf] = useState<{
    name: string;
    size: string;
    dataUrl: string;
  } | null>(null);
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // PDF Preview Modal
  const [previewPdf, setPreviewPdf] = useState<{
    url: string;
    name: string;
    description?: string;
    status?: string;
    authorizedBy?: string;
    authorizedRole?: string;
    authorizedAt?: string;
    signatureUrl?: string;
  } | null>(null);
  const [isModalMaximized, setIsModalMaximized] = useState(true);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewPdf?.url) {
      setPreviewBlobUrl(null);
      return;
    }
    let url: string | null = null;
    try {
      if (previewPdf.url.startsWith("data:")) {
        const blob = dataUrlToPdfBlob(previewPdf.url);
        url = URL.createObjectURL(blob);
      } else {
        url = previewPdf.url;
      }
      setPreviewBlobUrl(url);
    } catch (_) {
      setPreviewBlobUrl(previewPdf.url);
    }
    return () => {
      if (url && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }
    };
  }, [previewPdf?.url]);

  // Load employee profile & listen for profile updates
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.name) {
          setUserName(data.user.name);
        }
      })
      .catch(() => {});

    fetch("/api/admin/organization")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.organization?.name) {
          setCompanyName(data.organization.name);
        }
        if (data?.organization?.logoUrl) {
          setCompanyLogo(data.organization.logoUrl);
        } else if (typeof window !== "undefined") {
          const cachedLogo = localStorage.getItem("rk_company_logo");
          if (cachedLogo) setCompanyLogo(cachedLogo);
        }
      })
      .catch(() => {});

    fetch("/api/admin/my-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.profile) {
          setProfile(data.profile);
          try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data.profile));
          } catch (_) {}
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    const handleProfileUpdate = (e: any) => {
      const p = e.detail || getCachedProfile();
      if (p) setProfile(p);
    };

    window.addEventListener("rkonekte_profile_updated", handleProfileUpdate);
    window.addEventListener("storage", handleProfileUpdate);
    return () => {
      window.removeEventListener("rkonekte_profile_updated", handleProfileUpdate);
      window.removeEventListener("storage", handleProfileUpdate);
    };
  }, []);

  // Load requests from server API with localStorage caching
  const loadRequests = async () => {
    try {
      const res = await fetch("/api/admin/signature-auth");
      if (res.ok) {
        const data = await res.json();
        if (data.requests && Array.isArray(data.requests)) {
          const myItems = profile?.employeeNumber
            ? data.requests.filter(
                (r: SignatureAuthRequest) =>
                  r.employeeNumber === profile.employeeNumber ||
                  r.applicantName === `${profile.firstName} ${profile.lastName}`
              )
            : data.requests;
          const clean = deduplicateRequests(myItems);
          setMyRequests(clean);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.requests));
          } catch (_) {}
          return;
        }
      }
    } catch (_) {}

    // Fallback to localStorage if API is unreachable
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: SignatureAuthRequest[] = JSON.parse(saved);
        const myItems = profile?.employeeNumber
          ? parsed.filter(
              (r) =>
                r.employeeNumber === profile.employeeNumber ||
                r.applicantName === `${profile.firstName} ${profile.lastName}`
            )
          : parsed;
        const clean = deduplicateRequests(myItems);
        setMyRequests(clean);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const handleFileProcess = (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showSystemToast("Veuillez sélectionner un fichier au format PDF uniquement (.pdf).", "error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showSystemToast("Le fichier dépasse la taille maximale autorisée de 10 Mo.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setUploadedPdf({
        name: file.name,
        size: formatFileSize(file.size),
        dataUrl,
      });
      setDocumentSource("upload");
      showSystemToast(`Document PDF "${file.name}" importé avec succès !`);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileProcess(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileProcess(file);
  };

  const isFormValid =
    documentSource === "upload"
      ? Boolean(uploadedPdf)
      : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);

    try {
      let finalPdfUrl = "";
      let finalFileName = "";
      let finalFileSize = "";

      if (documentSource === "upload") {
        if (!uploadedPdf) {
          showSystemToast("Veuillez téléverser le document PDF à faire signer.", "error");
          setSubmitting(false);
          return;
        }
        finalPdfUrl = uploadedPdf.dataUrl;
        finalFileName = uploadedPdf.name;
        finalFileSize = uploadedPdf.size;
      } else {
        if (!wordEditorRef.current) {
          showSystemToast("L'éditeur de document n'est pas encore prêt.", "error");
          setSubmitting(false);
          return;
        }
        showSystemToast("Génération du document PDF en cours...", "info");
        const generated = await wordEditorRef.current.generatePdfDataUrl();
        finalPdfUrl = generated.dataUrl;
        finalFileName = generated.fileName;
        finalFileSize = generated.fileSize;
      }

      const exactFullName = profile && (profile.firstName || profile.lastName)
        ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
        : (userName || "Rodjensky Emmanuel Piton");

      const finalDescription = (
        wordEditorRef.current?.getTitle() ||
        editorTitle ||
        (uploadedPdf ? uploadedPdf.name.replace(/\.[^/.]+$/, "") : "") ||
        "Demande d'autorisation de dépense et d'engagement de fonds"
      );

      const payload = {
        applicantName: exactFullName,
        applicantRole: profile?.position || "Développeur",
        employeeNumber: profile?.employeeNumber || "COLLAB",
        branch: profile?.branch || "",
        pdfUrl: finalPdfUrl,
        pdfFileName: finalFileName,
        pdfFileSize: finalFileSize,
        description: finalDescription,
      };

      const res = await fetch("/api/admin/signature-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let newReq: SignatureAuthRequest | null = null;
      if (res.ok) {
        const data = await res.json();
        newReq = data.request;
      }

      if (!newReq) {
        // Fallback local creation if server offline
        const existingStr = localStorage.getItem(STORAGE_KEY);
        const allRequests: SignatureAuthRequest[] = existingStr ? JSON.parse(existingStr) : [];
        const existingNumbers = allRequests
          .map((r) => {
            const match = r.id?.match(/^SIG-2026-(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((n) => !isNaN(n) && n > 0);
        const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
        const nextIndex = Math.max(allRequests.length + 1, maxNumber + 1);
        newReq = {
          id: `SIG-2026-${String(nextIndex).padStart(3, "0")}`,
          ...payload,
          submittedAt: new Date().toISOString().split("T")[0],
          status: "PENDING",
        };
        const updated = deduplicateRequests([newReq, ...allRequests]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }

      showSystemToast(`Demande de signature (Réf: ${newReq.id}) transmise avec succès à la Direction !`);
      setUploadedPdf(null);
      setDescription("");
      await loadRequests();
      setActiveTab("history");
    } catch (err) {
      showSystemToast("Erreur lors de l'enregistrement de la demande.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Signé & Autorisé</span>
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Signature refusée</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>En attente de signature</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Collaborateur */}
      <div className="bg-white rounded-2xl p-5 border border-[#DCE2EA] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Signature d'autorisation
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Téléversez un document PDF et renseignez le motif pour validation et signature officielle par la Direction.
          </p>
        </div>

        {/* Informations du collaborateur */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#062653]">
          <div className="flex items-center gap-1.5">
            <span>Matricule :</span>
            {profile?.employeeNumber ? (
              <strong className="text-[#FF7900] font-mono font-bold">
                {profile.employeeNumber}
              </strong>
            ) : (
              <span className="inline-block w-24 h-3.5 bg-slate-200 animate-pulse rounded-sm" />
            )}
          </div>
          <span className="text-slate-300 font-normal">|</span>
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            {profile?.branch ? (
              <span>{profile.branch}</span>
            ) : (
              <span className="inline-block w-20 h-3.5 bg-slate-200 animate-pulse rounded-sm" />
            )}
          </div>
          <span className="text-slate-300 font-normal">|</span>
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-500" />
            {profile?.position ? (
              <span>{profile.position}</span>
            ) : (
              <span>Employé</span>
            )}
          </div>
        </div>
      </div>

      {/* Onglets Faciles */}
      <div className="flex items-center gap-2 border-b border-[#DCE2EA] pb-1">
        <button
          onClick={() => setActiveTab("form")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "form"
              ? "bg-[#062653] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#062653] hover:bg-slate-50 border border-transparent"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle demande de signature</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("history");
            loadRequests();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === "history"
              ? "bg-[#062653] text-white shadow-xs"
              : "bg-white text-[#64748B] hover:text-[#062653] hover:bg-slate-50 border border-transparent"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="8" fill="#F59E0B" />
            <path d="M8 4V8.2L10.8 9.8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Mes signatures</span>
          {visibleRequests.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "history"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {visibleRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* FORMULAIRE DIRECT : ÉDITEUR WORD COMPLET + UPLOAD PDF EN DESSOUS + MOTIF */}
      {activeTab === "form" && (
        <div className="bg-white rounded-2xl border border-[#DCE2EA] shadow-xs p-5 md:p-8 animate-in fade-in space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-[#062653]">
                Soumettre un document à signer
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Rédigez directement votre document avec la mise en page Word (avec sauvegarde de brouillon et téléchargement) ou téléversez un fichier PDF existant.
              </p>
            </div>

            {/* Sélecteur rapide de source de document */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDocumentSource("editor")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  documentSource === "editor"
                    ? "bg-black text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Rédiger en ligne (Word)</span>
              </button>

              <button
                type="button"
                onClick={() => setDocumentSource("upload")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  documentSource === "upload"
                    ? "bg-black text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Téléverser PDF {uploadedPdf && "✓"}</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 1. ÉDITEUR DE TEXTE STYLE WORD COMPLET (Affiché uniquement si mode Rédiger) */}
            {documentSource === "editor" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#062653]">
                    Rédiger le document officiel (Interface style Word A4)
                  </label>
                </div>

                {/* Composant Éditeur Word Complet */}
                <WordDocumentEditor
                  ref={wordEditorRef}
                  companyName={companyName}
                  companyLogo={companyLogo}
                  employeeName={
                    profile && (profile.firstName || profile.lastName)
                      ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
                      : userName || "Rodjensky Emmanuel Piton"
                  }
                  employeeRole={profile?.position || "Collaborateur"}
                  employeeNumber={profile?.employeeNumber || "COLLAB"}
                  branch={profile?.branch || ""}
                  onTitleChange={(title) => {
                    setEditorTitle(title);
                    if (!description.trim()) {
                      setDescription(title);
                    }
                  }}
                />
              </div>
            )}

            {/* 2. ZONE DE TÉLÉVERSEMENT DU DOCUMENT PDF (Affiché uniquement si mode Téléverser PDF) */}
            {documentSource === "upload" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#062653]">
                      Téléverser le document PDF à faire signer
                    </label>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Mode Téléversement PDF actif
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Téléversez votre document PDF déjà préparé (ordre de virement, facture, devis, contrat scanné, bordereau...).
                </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              {!uploadedPdf ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
                      : "border-slate-300 hover:border-[#062653] hover:bg-slate-50/60 bg-[#F8FAFC]"
                  }`}
                >
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-[#062653] mb-2.5">
                    <UploadCloud className="w-6 h-6 text-[#062653]" />
                  </div>
                  <h4 className="text-xs font-bold text-[#062653]">
                    Cliquez pour téléverser votre document PDF
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 max-w-md mx-auto">
                    ou glissez-déposez directement votre fichier PDF ici
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 shadow-2xs">
                    <FileText className="w-3 h-3 text-rose-500" />
                    <span>Format .PDF uniquement (max 10 Mo)</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6 text-rose-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#062653] truncate max-w-xs sm:max-w-md">
                          {uploadedPdf.name}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                          PDF Prêt
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Taille : {uploadedPdf.size} • Fichier PDF prêt à être signé
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalMaximized(true);
                        setPreviewPdf({
                          url: uploadedPdf.dataUrl,
                          name: uploadedPdf.name,
                          description,
                        });
                      }}
                      className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-[#062653] text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Aperçu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Changer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedPdf(null);
                      }}
                      className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                      title="Retirer ce fichier"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}



            {/* BARRE D'ACTION ET SOUMISSION */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200">
              <div className="text-xs text-slate-600">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700">Document envoyé :</span>
                  {documentSource === "upload" && uploadedPdf ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                      <FileText className="w-3.5 h-3.5 text-rose-600" />
                      <span>Fichier PDF : {uploadedPdf.name}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                      <PenTool className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Document officiel rédigé (Style Word A4)</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !isFormValid}
                className="w-full sm:w-auto px-7 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Génération et envoi du document...</span>
                  </>
                ) : (
                  <>
                    <FileSignature className="w-4 h-4" />
                    <span>Demander la signature d'autorisation</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HISTORIQUE PERSONNEL DES DEMANDES DE SIGNATURE */}
      {activeTab === "history" && (
        <div className="space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#062653]">
              Mes documents soumis pour signature
            </h2>
            <button
              onClick={loadRequests}
              className="text-xs text-[#64748B] hover:text-[#062653] flex items-center gap-1 font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualiser</span>
            </button>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-[#DCE2EA] shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Stamp className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#062653]">Aucun document pour signature</h3>
              <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                Vous n'avez pas encore téléversé de document PDF à faire viser par la Direction.
              </p>
              <button
                onClick={() => setActiveTab("form")}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Soumettre un document PDF
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleRequests.map((req, idx) => (
                <div
                  key={`${req.id}-${idx}`}
                  className="bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {req.id}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-xs sm:max-w-md" title={req.pdfFileName || req.documentReference}>
                          {req.pdfFileName || req.documentReference || "Document PDF"}
                        </span>
                      </span>
                      {req.pdfFileSize && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({req.pdfFileSize})
                        </span>
                      )}
                    </div>

                    {req.status === "APPROVED" && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 pt-1.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>
                            Document officiel approuvé et signé par{" "}
                            <strong className="text-slate-800 font-semibold">{req.authorizedBy || "la Direction"}</strong>
                            {req.authorizedRole ? ` (${req.authorizedRole})` : ""}
                            {req.authorizedAt ? ` le ${req.authorizedAt}` : ""}.
                          </span>
                        </div>

                        {req.signatureUrl && (
                          <div className="shrink-0 flex items-center gap-2 pl-2 sm:border-l sm:border-slate-200">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase">Visa :</span>
                            <img
                              src={req.signatureUrl}
                              alt="Signature Direction"
                              className="h-6 max-w-[90px] object-contain"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {req.status === "REJECTED" && (
                      <div className="text-xs text-rose-600 pt-1.5 border-t border-slate-100 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>La signature de cette autorisation a été refusée par la Direction.</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center justify-between md:justify-end gap-3 sm:gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                    <div className="flex flex-col md:items-end">
                      {getStatusBadge(req.status)}
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        Soumis le {req.submittedAt}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalMaximized(true);
                          setPreviewPdf({
                            url: req.pdfUrl || SAMPLE_PDF_DATA_URL,
                            name: req.pdfFileName || "Document_Officiel.pdf",
                            description: req.description,
                            status: req.status,
                            authorizedBy: req.authorizedBy,
                            authorizedRole: req.authorizedRole,
                            authorizedAt: req.authorizedAt,
                            signatureUrl: req.signatureUrl,
                          });
                        }}
                        className="w-8 h-8 rounded-lg bg-[#062653] hover:bg-slate-800 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                        title="Consulter le PDF"
                      >
                        <Eye className="w-4 h-4 text-white" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleHideFromView(req.id, req.pdfFileName)}
                        className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer shrink-0"
                        title="Supprimer de mon affichage"
                      >
                        <Trash2 className="w-4 h-4 text-white shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODALE DE VISUALISATION DU DOCUMENT PDF */}
      {previewPdf && (
        <div
          onClick={() => {
            setPreviewPdf(null);
            setIsModalMaximized(false);
          }}
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in cursor-pointer ${
            isModalMaximized ? "p-0" : ""
          }`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white shadow-2xl flex flex-col overflow-hidden cursor-default transition-all duration-200 ${
              isModalMaximized
                ? "fixed inset-0 w-full h-full rounded-none z-50 max-w-none max-h-none border-none"
                : "rounded-2xl border border-slate-300 w-full max-w-5xl max-h-[90vh]"
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#062653] truncate max-w-xs sm:max-w-md">
                    {previewPdf.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    Aperçu du document PDF soumis pour signature
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openPdfFullscreen(previewPdf.url, previewPdf.name)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Ouvrir le document PDF en plein écran dans un nouvel onglet"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Plein écran</span>
                </button>
                <button
                  type="button"
                  onClick={() => printPdfDocument(previewPdf.url, previewPdf.name)}
                  className="px-3 py-1.5 bg-black hover:bg-zinc-800 active:bg-zinc-900 text-white border border-black text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Imprimer directement ce document"
                >
                  <Printer className="w-3.5 h-3.5 text-white" />
                  <span className="hidden sm:inline">Imprimer</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadPdfDocument(previewPdf.url, previewPdf.name)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer border border-red-600 transition-all"
                  title="Télécharger le fichier PDF"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                  <span className="hidden sm:inline">Télécharger le PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalMaximized(!isModalMaximized)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                  title={isModalMaximized ? "Réduire la fenêtre" : "Agrandir dans la fenêtre"}
                >
                  {isModalMaximized ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPdf(null);
                    setIsModalMaximized(false);
                  }}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* If Approved, show the signature visa banner */}
            {previewPdf.status === "APPROVED" && (
              <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    Document officiellement validé et signé par {previewPdf.authorizedBy || "la Direction"}
                    {previewPdf.authorizedRole ? ` (${previewPdf.authorizedRole})` : ""}
                    {previewPdf.authorizedAt ? ` le ${previewPdf.authorizedAt}` : ""}
                  </span>
                </div>
                {previewPdf.signatureUrl && (
                  <div className="bg-white px-3 py-1 rounded-lg border border-emerald-300 shadow-2xs flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Visa Officiel :</span>
                    <img
                      src={previewPdf.signatureUrl}
                      alt="Signature Direction"
                      className="h-8 max-w-[120px] object-contain"
                    />
                  </div>
                )}
              </div>
            )}

            {/* PDF Embedded Viewer */}
            <div className="flex-1 p-2 bg-slate-100 min-h-[420px]">
              <iframe
                src={previewBlobUrl || previewPdf.url}
                className="w-full h-full min-h-[420px] rounded-xl border border-slate-300 bg-white shadow-inner"
                title={previewPdf.name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
