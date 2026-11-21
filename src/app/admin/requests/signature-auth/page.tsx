"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  PlusCircle,
  X,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  FileText,
  ShieldCheck,
  Download,
  ExternalLink,
  UploadCloud,
  FileSignature,
  Stamp,
  RotateCw,
  RotateCcw,
  Printer,
  Move,
  PenTool,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { EmployeeSignatureAuthView, SAMPLE_PDF_DATA_URL } from "@/components/requests/EmployeeSignatureAuthView";
import { WordDocumentEditor, WordDocumentEditorRef } from "@/components/requests/WordDocumentEditor";
import { showSystemToast } from "@/components/ui/SystemToast";
import { processTransparentImage } from "@/lib/utils/signature";
import {
  printPdfDocument,
  openPdfFullscreen,
  downloadPdfDocument,
  dataUrlToPdfBlob,
  formatPdfDisplayTitle,
  sanitizePdfFileName,
} from "@/lib/utils/pdf";
import { stampSignatureOnPdf } from "@/lib/utils/stamp-pdf";

interface SignatureAuthRequest {
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

const SAMPLE_ADMIN_SIGNATURE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 90' fill='none'><path d='M20,65 C45,15 75,80 110,35 C135,5 155,75 190,40 C210,20 230,70 245,30' stroke='%23062653' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/><path d='M70,55 C120,50 170,52 230,50' stroke='%23062653' stroke-width='2.5' stroke-linecap='round'/></svg>";

const DEFAULT_SIGNATURE_REQUESTS: SignatureAuthRequest[] = [
  {
    id: "SIG-2026-001",
    applicantName: "Fatou Traore",
    applicantRole: "Comptable",
    employeeNumber: "EB-SIEGE-102",
    branch: "Siège Principal",
    pdfFileName: "Ordre_Virement_VIR-SOGE-2026-089.pdf",
    pdfFileSize: "142 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "Virement bancaire fournisseur pour achat de matériel bureautique et fournitures de bureau du trimestre.",
    submittedAt: "2026-03-26",
    status: "PENDING",
  },
  {
    id: "SIG-2026-002",
    applicantName: "Marc Bamba",
    applicantRole: "Responsable Achats",
    employeeNumber: "EB-SIEGE-205",
    branch: "Siège Principal",
    pdfFileName: "Contrat_Maintenance_CTR-SERV-2026-014.pdf",
    pdfFileSize: "285 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "Contrat annuel de maintenance des serveurs et réseaux informatiques de l'entreprise.",
    submittedAt: "2026-03-24",
    status: "APPROVED",
    authorizedBy: "Direction Générale",
    authorizedAt: "2026-03-25",
    signatureUrl: SAMPLE_ADMIN_SIGNATURE,
  },
  {
    id: "SIG-2026-003",
    applicantName: "Rodjensky Emmanuel Piton",
    applicantRole: "Développeur",
    employeeNumber: "EB-SIEGE-884",
    branch: "Siège Principal",
    pdfFileName: "Rapport Lecture.pdf",
    pdfFileSize: "505 Ko",
    pdfUrl: SAMPLE_PDF_DATA_URL,
    description: "C est ok",
    submittedAt: "2026-10-24",
    status: "PENDING",
  },
];

function deduplicateRequests(items: SignatureAuthRequest[]): SignatureAuthRequest[] {
  const byId = new Map<string, SignatureAuthRequest>();
  for (const item of items) {
    if (!item.id) continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
    } else {
      if (item.status === "APPROVED" || item.status === "REJECTED") {
        byId.set(item.id, item);
      } else if (existing.status !== "APPROVED" && existing.status !== "REJECTED") {
        byId.set(item.id, item);
      }
    }
  }
  return Array.from(byId.values());
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " octets";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / (1024 * 1024)).toFixed(2) + " Mo";
}

export default function SignatureAuthRequestsPage() {
  const [requests, setRequests] = useState<SignatureAuthRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [adminViewMode, setAdminViewMode] = useState<"list" | "create">("list");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<SignatureAuthRequest | null>(null);
  const [isModalMaximized, setIsModalMaximized] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("Direction Générale");
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  // Position officielle de la signature, calibrée au centre exact du rectangle réservé à l'Administration
  const DEFAULT_SIGNATURE_POSITION = { x: 70, y: 74.5 };
  const [signaturePosition, setSignaturePosition] = useState<{ x: number; y: number }>(DEFAULT_SIGNATURE_POSITION);
  const [isDraggingSignature, setIsDraggingSignature] = useState(false);
  const documentContainerRef = useRef<HTMLDivElement | null>(null);
  const documentScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Réinitialiser automatiquement la signature au centre exact du cadre officiel lors de l'ouverture
  useEffect(() => {
    if (selectedRequest) {
      setSignaturePosition(DEFAULT_SIGNATURE_POSITION);
    }
  }, [selectedRequest?.id]);

  // Gestion du déplacement fluide de la signature sur la feuille
  useEffect(() => {
    if (!isDraggingSignature) return;

    const onGlobalMouseMove = (e: MouseEvent) => {
      if (!documentContainerRef.current) return;
      const rect = documentContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(10, Math.min(90, Math.round(x * 10) / 10));
      const clampedY = Math.max(10, Math.min(90, Math.round(y * 10) / 10));
      setSignaturePosition({ x: clampedX, y: clampedY });
    };

    const onGlobalMouseUp = () => {
      setIsDraggingSignature(false);
    };

    window.addEventListener("mousemove", onGlobalMouseMove);
    window.addEventListener("mouseup", onGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", onGlobalMouseMove);
      window.removeEventListener("mouseup", onGlobalMouseUp);
    };
  }, [isDraggingSignature]);

  const handleSheetClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!documentContainerRef.current || isDraggingSignature) return;
    const rect = documentContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(10, Math.min(90, Math.round(x * 10) / 10));
    const clampedY = Math.max(10, Math.min(90, Math.round(y * 10) / 10));
    setSignaturePosition({ x: clampedX, y: clampedY });
  };

  // URL Blob pour affichage fiable du PDF en haute résolution dans l'iframe (évite le blanc des data URLs)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRequest?.pdfUrl && !selectedRequest) {
      setPreviewBlobUrl(null);
      return;
    }

    const rawPdf = selectedRequest.pdfUrl || SAMPLE_PDF_DATA_URL;
    let url: string | null = null;

    try {
      if (rawPdf.startsWith("data:")) {
        const blob = dataUrlToPdfBlob(rawPdf);
        url = URL.createObjectURL(blob);
      } else {
        url = rawPdf;
      }
      setPreviewBlobUrl(url);
    } catch (err) {
      console.warn("Avertissement lors de la conversion du PDF en Blob URL:", err);
      setPreviewBlobUrl(rawPdf);
    }

    return () => {
      if (url && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }
    };
  }, [selectedRequest]);

  const notifySignatureSync = (id?: string, status?: string) => {
    try {
      localStorage.setItem("rkonekte_signature_last_sync", Date.now().toString());
    } catch (_) {}
    try {
      window.dispatchEvent(
        new CustomEvent("rkonekte_signature_updated", { detail: { id, status } })
      );
    } catch (_) {}
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("rkonekte_signature_sync");
        bc.postMessage({ type: "SYNC", id, status });
        bc.close();
      }
    } catch (_) {}
  };

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/admin/signature-auth?all=true&_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.requests && Array.isArray(data.requests)) {
          const normalized = data.requests.map((item: any) => ({
            ...item,
            pdfFileName: item.pdfFileName || item.documentReference || `${item.id}.pdf`,
            pdfUrl: item.pdfUrl || SAMPLE_PDF_DATA_URL,
          }));
          const clean = deduplicateRequests(normalized);
          setRequests(clean);
          try {
            const lightClean = clean.map((r: any) => ({
              ...r,
              pdfUrl: (r.pdfUrl && r.pdfUrl.length > 500000) ? undefined : r.pdfUrl,
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightClean));
          } catch (_) {}
          setLoadingRequests(false);
          return;
        }
      }
    } catch (_) {}

    // Fallback to localStorage only if server API is not reachable
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: SignatureAuthRequest[] = JSON.parse(saved);
        const normalized = parsed.map((item) => ({
          ...item,
          pdfFileName: item.pdfFileName || item.documentReference || `${item.id}.pdf`,
          pdfUrl: item.pdfUrl || SAMPLE_PDF_DATA_URL,
        }));
        const clean = deduplicateRequests(normalized);
        setRequests(clean);
      }
    } catch (_) {}
    setLoadingRequests(false);
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.role) {
          setCurrentUserRole(data.user.role);
        } else {
          setCurrentUserRole("EMPLOYEE");
        }
        if (data.user?.name) {
          setCurrentUserName(data.user.name);
        }
      })
      .catch(() => {
        setCurrentUserRole("EMPLOYEE");
      });

    fetch("/api/admin/my-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.profile) setUserProfile(d.profile);
      })
      .catch(() => {});

    // Load registered user signature if available (exclude sample/mock signature)
    try {
      const userSig = localStorage.getItem("rkonekte_user_signature");
      if (userSig && !userSig.includes("M20,65 C45,15 75,80")) {
        setAdminSignature(userSig);
      } else {
        setAdminSignature(null);
      }
    } catch (_) {
      setAdminSignature(null);
    }

    // Fetch live requests from server
    fetchRequests();

    const handleSync = () => {
      fetchRequests();
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "rkonekte_signature_last_sync" || e.key === STORAGE_KEY) {
        fetchRequests();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("rkonekte_signature_updated", handleSync);
    window.addEventListener("focus", handleSync);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("rkonekte_signature_updated", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, []);

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showSystemToast("Veuillez sélectionner un fichier image valide (PNG, JPG, SVG).", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawData = ev.target?.result as string;
      if (rawData) {
        const cleanSig = await processTransparentImage(rawData);
        setAdminSignature(cleanSig);
        try {
          localStorage.setItem("rkonekte_user_signature", cleanSig);
        } catch (_) {}
        showSystemToast("Signature officielle téléversée avec succès !");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isEmployee =
    currentUserRole === "EMPLOYEE" ||
    currentUserRole === "COLLABORATEUR" ||
    currentUserRole === "CASHIER" ||
    currentUserRole === "CAISSIER" ||
    currentUserRole?.toLowerCase().includes("employ") ||
    currentUserRole?.toLowerCase().includes("collab") ||
    currentUserRole?.toLowerCase().includes("caissier") ||
    currentUserRole?.toLowerCase().includes("cashier") ||
    currentUserRole?.toLowerCase().includes("operat");

  const isMasterAccount =
    currentUserRole === "ORGANIZATION_ADMIN" ||
    currentUserRole === "SUPER_ADMIN" ||
    currentUserRole?.toLowerCase().includes("pdg") ||
    currentUserRole?.toLowerCase().includes("fondateur") ||
    currentUserRole?.toLowerCase().includes("directeur général") ||
    currentUserRole?.toLowerCase().includes("propriétaire");

  // Admin approves and affixes their official signature directly onto the document sheet
  const handleApproveWithSignature = async (id: string) => {
    if (!adminSignature) {
      showSystemToast("Veuillez d'abord téléverser votre signature officielle avant d'approuver.", "error");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const signer = currentUserName || "Direction Générale";
    const role = currentUserRole || "Direction Générale";

    // Incruster physiquement et définitivement la signature sur la feuille du document PDF
    let finalPdfUrl = selectedRequest?.pdfUrl || SAMPLE_PDF_DATA_URL;
    try {
      finalPdfUrl = await stampSignatureOnPdf({
        pdfDataUrlOrBytes: finalPdfUrl,
        signatureDataUrl: adminSignature,
        signerName: signer,
        signerRole: role,
        date: today,
        xPercent: signaturePosition.x,
        yPercent: signaturePosition.y,
      });
    } catch (stampErr) {
      console.warn("Erreur lors de l'incrustation directe de la signature sur le PDF:", stampErr);
    }

    try {
      await fetch(`/api/admin/signature-auth/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "APPROVED",
          authorizedBy: signer,
          authorizedRole: role,
          authorizedAt: today,
          signatureUrl: adminSignature,
          pdfUrl: finalPdfUrl,
        }),
      });
    } catch (_) {}

    const updated = requests.map((r) =>
      r.id === id
        ? {
            ...r,
            status: "APPROVED" as const,
            authorizedBy: signer,
            authorizedRole: role,
            authorizedAt: today,
            signatureUrl: adminSignature,
            pdfUrl: finalPdfUrl,
          }
        : r
    );

    setRequests(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}

    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest((prev) =>
        prev
          ? {
              ...prev,
              status: "APPROVED",
              authorizedBy: signer,
              authorizedRole: role,
              authorizedAt: today,
              signatureUrl: adminSignature,
              pdfUrl: finalPdfUrl,
            }
          : null
      );
    }

    notifySignatureSync(id, "APPROVED");
    showSystemToast(`Document ${id} approuvé ! Votre signature a été apposée directement sur la feuille.`);
  };

  const handleRejectDecision = async (id: string) => {
    const signer = currentUserName || "Direction Générale";

    try {
      await fetch(`/api/admin/signature-auth/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "REJECTED",
          authorizedBy: signer,
        }),
      });
    } catch (_) {}

    const updated = requests.map((r) =>
      r.id === id ? { ...r, status: "REJECTED" as const, authorizedBy: signer } : r
    );
    setRequests(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}

    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest((prev) => (prev ? { ...prev, status: "REJECTED" } : null));
    }
    notifySignatureSync(id, "REJECTED");
    showSystemToast(`La demande de signature ${id} a été refusée.`, "info");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement la demande d'autorisation pour ${name} (${id}) ?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/signature-auth/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        console.warn("Avertissement suppression serveur:", errData);
      }
    } catch (err) {
      console.warn("Avertissement réseau suppression:", err);
    }

    const updated = requests.filter((r) => r.id !== id);
    setRequests(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}

    if (selectedRequest && selectedRequest.id === id) {
      setSelectedRequest(null);
    }
    notifySignatureSync(id, "DELETED");
    showSystemToast(`La demande ${id} a été supprimée définitivement de la base de données.`);
  };

  const isOwnSignatureRequest = (r: SignatureAuthRequest) => {
    const myEmpNum = (userProfile?.employeeNumber || "").toLowerCase().trim();
    const reqEmpNum = (r.employeeNumber || "").toLowerCase().trim();
    if (myEmpNum && reqEmpNum) {
      return myEmpNum === reqEmpNum;
    }

    const applicant = (r.applicantName || "").toLowerCase().trim();
    const myName = currentUserName.toLowerCase().trim();
    const userProfileFullName = `${userProfile?.firstName || ""} ${userProfile?.lastName || ""}`.toLowerCase().trim();

    return Boolean(
      (myName && applicant === myName) ||
      (userProfileFullName && applicant === userProfileFullName)
    );
  };

  const filtered = requests.filter((r) => {
    const isOwn = isOwnSignatureRequest(r);

    if (filterStatus === "MY_REQUESTS") {
      // Dans "Mes signatures" : UNIQUEMENT les demandes de signature de l'utilisateur connecté
      if (!isOwn) return false;
    } else {
      // Dans les onglets d'instruction : on exclut les demandes de l'utilisateur lui-même (pas d'auto-approbation)
      if (isOwn) return false;
      if (filterStatus !== "ALL" && r.status !== filterStatus) {
        return false;
      }
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        r.applicantName.toLowerCase().includes(q) ||
        r.pdfFileName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (currentUserRole === null) {
    return (
      <div className="p-16 text-center text-xs text-[#64748B] flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-[#FF7900] rounded-full animate-spin" />
        <span>Chargement de votre espace...</span>
      </div>
    );
  }

  if (isEmployee) {
    return <EmployeeSignatureAuthView />;
  }

  // Vue Plein Écran Officielle pour Nouvelle Demande d'Autorisation Admin (Word A4 ou PDF)
  if (adminViewMode === "create") {
    return (
      <div className="space-y-6">
        <EmployeeSignatureAuthView
          hideHeaderTabs={true}
          onBackToList={() => {
            setAdminViewMode("list");
            fetchRequests();
          }}
          onSubmitted={() => {
            setAdminViewMode("list");
            setFilterStatus("MY_REQUESTS");
            fetchRequests();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
            Signature d'Autorisation
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Examinez les documents PDF soumis par les collaborateurs et apposez votre signature numérique officielle.
          </p>
        </div>

        {/* Action Buttons: Rafraîchir + Nouvelle Demande */}
        <div className="flex items-center gap-2.5 self-start">
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loadingRequests}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-white hover:bg-[#F4F6F9] active:bg-slate-100 text-[#062653] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            title="Actualiser et synchroniser les demandes de signature"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loadingRequests ? "animate-spin text-[#FF7900]" : "text-slate-600"}`} />
            <span>Rafraîchir</span>
          </button>

          {/* Bouton Nouvelle Demande d'Autorisation (Activé pour les administrateurs) */}
          <button
            type="button"
            onClick={() => setAdminViewMode("create")}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nouvelle demande d'autorisation</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "ALL", label: "Toutes" },
            { id: "PENDING", label: "En attente" },
            { id: "APPROVED", label: "Approuvées" },
            { id: "REJECTED", label: "Refusées" },
            { id: "MY_REQUESTS", label: "Mes signatures" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
                filterStatus === tab.id
                  ? "bg-[#062653] text-white"
                  : "bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200/80 hover:text-[#263445]"
              }`}
            >
              {tab.id === "MY_REQUESTS" && (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="8" fill="#F59E0B" />
                  <path d="M8 4V8.2L10.8 9.8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher fichier, demandeur..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#F4F6F9] rounded-xl text-xs text-[#263445] placeholder:text-[#64748B] focus:bg-white focus:outline-hidden"
          />
        </div>
      </div>

      {/* TABLE DES DEMANDES DE SIGNATURE */}
      <div className="bg-white rounded-2xl shadow-xs overflow-hidden">
        {loadingRequests && requests.length === 0 ? (
          <div className="p-12 text-center text-[#64748B] text-xs space-y-2">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-[#FF7900] rounded-full animate-spin mx-auto" />
            <p className="font-semibold">Chargement des demandes de signature...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-[#64748B] text-xs space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-semibold">Aucune demande de signature trouvée</p>
            <p className="text-[11px] text-slate-400">
              Modifiez vos filtres ou effectuez une recherche différente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#263445]">
              <thead className="bg-[#F8FAFC] border-b border-slate-200/70 text-[#64748B] uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Réf. Dossier</th>
                  <th className="px-5 py-3.5">Demandeur</th>
                  <th className="px-5 py-3.5">Document PDF à Signer</th>
                  <th className="px-5 py-3.5">Motif de l'Autorisation</th>
                  <th className="px-5 py-3.5">Déposé le</th>
                  <th className="px-5 py-3.5">Statut</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((req, idx) => (
                  <tr key={`${req.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    {/* Réf Dossier */}
                    <td className="px-5 py-4 font-mono font-bold text-[#FF7900] whitespace-nowrap">
                      {req.id}
                    </td>

                    {/* Demandeur */}
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#062653]">{req.applicantName}</div>
                      <div className="text-[11px] text-[#64748B]">
                        {req.applicantRole} {req.branch ? `• ${req.branch}` : ""}
                      </div>
                    </td>

                    {/* Document PDF */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <span
                            className="font-bold text-slate-800 truncate block max-w-[200px]"
                            title={formatPdfDisplayTitle(req.pdfFileName, req.description)}
                          >
                            {formatPdfDisplayTitle(req.pdfFileName, req.description)}
                          </span>
                          {req.pdfFileSize && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {req.pdfFileSize}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Motif de l'Autorisation */}
                    <td className="px-5 py-4 max-w-xs">
                      <p className="line-clamp-2 text-slate-600 italic text-[11px]" title={req.description}>
                        « {req.description} »
                      </p>
                    </td>

                    {/* Déposé le */}
                    <td className="px-5 py-4 text-[#64748B] whitespace-nowrap">
                      {req.submittedAt}
                    </td>

                    {/* Statut */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      {req.status === "APPROVED" ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            Signé & Autorisé
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1 font-medium">
                            Par : <strong className="text-slate-800">{req.authorizedBy || "Direction"}</strong>
                          </div>
                        </div>
                      ) : req.status === "REJECTED" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          Refusé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7900]">
                          <Clock className="w-3.5 h-3.5 text-[#FF7900] shrink-0" />
                          À signer
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsModalMaximized(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
                            req.status === "PENDING"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-[#062653] hover:bg-[#031B3A] text-white"
                          }`}
                          title="Examiner le document et y apposer sa signature"
                        >
                          {req.status === "PENDING" ? (
                            <>
                              <FileSignature className="w-3.5 h-3.5" />
                              <span>Examiner & Signer</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Voir le visa</span>
                            </>
                          )}
                        </button>

                        {/* BOUTON SUPPRIMER : TOUJOURS EN ROUGE */}
                        <button
                          type="button"
                          onClick={() => handleDelete(req.id, req.applicantName)}
                          className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer shrink-0"
                          title="Supprimer définitivement cette demande"
                        >
                          <Trash2 className="w-4 h-4 text-white shrink-0" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL & SIGNATURE PLACEMENT MODAL */}
      {selectedRequest && (
        <div
          onClick={() => {
            setSelectedRequest(null);
            setIsModalMaximized(false);
          }}
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center animate-in fade-in cursor-pointer transition-all ${
            isModalMaximized ? "p-0" : "p-2 sm:p-4"
          }`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white shadow-2xl flex flex-col overflow-hidden cursor-default transition-all duration-200 ${
              isModalMaximized
                ? "fixed inset-0 w-full h-full rounded-none z-50 max-w-none max-h-none"
                : "rounded-2xl w-full max-w-5xl max-h-[90vh]"
            }`}
          >
            {/* Modal Top Bar */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-xs bg-slate-200 text-[#062653] px-2.5 py-1 rounded-md">
                  {selectedRequest.id}
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#062653]">
                    {selectedRequest.status === "PENDING"
                      ? "Examen du document & Signature de l'Autorisation"
                      : "Document Autorisé & Certifié"}
                  </h2>
                  <p className="text-[11px] text-slate-500 truncate max-w-xl">
                    Demandé par <strong>{selectedRequest.applicantName}</strong> ({selectedRequest.applicantRole}) le {selectedRequest.submittedAt}
                    {selectedRequest.description ? ` • « ${selectedRequest.description} »` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalMaximized((prev) => !prev)}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                  title={isModalMaximized ? "Réduire la taille" : "Agrandir en plein écran"}
                >
                  {isModalMaximized ? (
                    <Minimize2 className="w-4 h-4 text-slate-600" />
                  ) : (
                    <Maximize2 className="w-4 h-4 text-slate-600" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest(null);
                    setIsModalMaximized(false);
                  }}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Visualisation du document PDF */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                    <span
                      className="text-xs font-bold text-[#062653] truncate"
                      title={formatPdfDisplayTitle(selectedRequest.pdfFileName, selectedRequest.description)}
                    >
                      Document PDF : {formatPdfDisplayTitle(selectedRequest.pdfFileName, selectedRequest.description)}
                    </span>
                    {selectedRequest.pdfFileSize && (
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">
                        ({selectedRequest.pdfFileSize})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        openPdfFullscreen(
                          selectedRequest.pdfUrl || SAMPLE_PDF_DATA_URL,
                          formatPdfDisplayTitle(selectedRequest.pdfFileName, selectedRequest.description)
                        )
                      }
                      className="px-3 py-1.5 bg-[#F4F6F9] hover:bg-slate-200/70 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all"
                      title="Ouvrir le document PDF en plein écran dans un nouvel onglet"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                      <span>Plein écran</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        printPdfDocument(
                          selectedRequest.pdfUrl || SAMPLE_PDF_DATA_URL,
                          formatPdfDisplayTitle(selectedRequest.pdfFileName, selectedRequest.description)
                        )
                      }
                      className="px-3 py-1.5 bg-black hover:bg-zinc-800 active:bg-zinc-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                      title="Imprimer directement ce document"
                    >
                      <Printer className="w-3.5 h-3.5 text-white" />
                      <span>Imprimer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadPdfDocument(
                          selectedRequest.pdfUrl || SAMPLE_PDF_DATA_URL,
                          sanitizePdfFileName(
                            formatPdfDisplayTitle(selectedRequest.pdfFileName, selectedRequest.description),
                            "pdf"
                          )
                        )
                      }
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                      title="Télécharger le fichier PDF"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Télécharger le PDF</span>
                    </button>
                  </div>
                </div>

                {/* ZONE DE VISUALISATION DU DOCUMENT PDF & PLACEMENT DE SIGNATURE */}
                <div
                  ref={documentScrollContainerRef}
                  className={`relative rounded-xl bg-slate-200/70 overflow-y-auto overflow-x-hidden p-3 sm:p-5 select-none transition-all ${
                    isModalMaximized ? "h-[74vh]" : "h-[58vh] sm:h-[62vh] max-h-[660px]"
                  }`}
                >
                  <div
                    ref={documentContainerRef}
                    onClick={selectedRequest.status === "PENDING" ? handleSheetClick : undefined}
                    className={`relative mx-auto bg-white rounded-xl shadow-xl w-full overflow-hidden transition-all ${
                      isModalMaximized ? "max-w-[860px]" : "max-w-[780px]"
                    }`}
                    style={{ aspectRatio: "210 / 297" }}
                  >
                    {previewBlobUrl ? (
                      <iframe
                        src={`${previewBlobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                        className={`w-full h-full border-none bg-white ${
                          isDraggingSignature ? "pointer-events-none" : ""
                        }`}
                        title={selectedRequest.pdfFileName}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 gap-2">
                        <Clock className="w-6 h-6 animate-spin text-slate-400" />
                        <span className="text-xs">Chargement du document PDF...</span>
                      </div>
                    )}

                    {/* Signature automatiquement positionnée dans le cadre officiel de l'Administration */}
                    {selectedRequest.status === "PENDING" && adminSignature && !isOwnSignatureRequest(selectedRequest) && (
                      <div
                        style={{
                          left: `${signaturePosition.x}%`,
                          top: `${signaturePosition.y}%`,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingSignature(true);
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-30 select-none transition-transform group ${
                          isDraggingSignature ? "scale-105" : "hover:scale-102"
                        }`}
                        title="Signature officiellement positionnée dans le rectangle (Glissez pour ajuster ou cliquez sur Recentrer)"
                      >
                        <div className="relative p-1.5 rounded-lg border-2 border-dashed border-emerald-500/80 bg-emerald-50/40 backdrop-blur-[1px] hover:border-emerald-600 transition-all shadow-sm">
                          <img
                            src={adminSignature}
                            alt="Signature Officielle"
                            className="h-12 sm:h-14 w-auto max-w-[190px] object-contain drop-shadow-xs pointer-events-none select-none"
                            draggable={false}
                          />
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Cadre officiel
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Cadre d'apposition de la signature officielle ("et d'y placer sa signature") */}
              <div className="border-t border-slate-100 pt-4">
                {selectedRequest.status === "PENDING" ? (
                  isOwnSignatureRequest(selectedRequest) ? (
                    <div className="bg-amber-50/80 border border-amber-200 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                            Votre propre demande d'autorisation
                          </span>
                          <span className="text-xs text-amber-700 font-medium">• En attente de visa</span>
                        </div>
                        <h4 className="text-sm font-bold text-[#062653] mt-1">
                          En attente de signature par un autre administrateur
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
                          Conformément aux règles de conformité et de séparation des pouvoirs, vous ne pouvez pas signer ou approuver votre propre demande d'autorisation. Un autre administrateur ou la Direction Générale doit l'examiner et y apposer sa signature officielle.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-white text-amber-900 rounded-xl border border-amber-200/90 text-xs font-bold shrink-0 shadow-2xs">
                        <Clock className="w-4 h-4 text-[#FF7900]" />
                        <span>En attente de visa d'un tiers</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/70 p-5 rounded-2xl space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                            <FileSignature className="w-4 h-4 text-emerald-700" />
                            <span>Apposer la signature officielle de la Direction</span>
                          </div>
                          <p className="text-xs text-emerald-800 mt-0.5">
                            {adminSignature
                              ? "Votre signature est automatiquement placée dans le cadre officiel de la feuille. Vous avez uniquement à cliquer sur Approuver."
                              : "Aucune signature n'est enregistrée. Veuillez téléverser votre signature ci-dessous pour débloquer le bouton d'approbation."}
                          </p>
                        </div>

                      {adminSignature ? (
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 shrink-0">
                          Prêt à signer
                        </span>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-wider text-[#FF7900] shrink-0">
                          Signature requise
                        </span>
                      )}
                    </div>

                    {/* Input caché pour téléverser la signature */}
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSignatureUpload}
                    />

                    {/* Aperçu du visa et spécimen de signature qui sera apposé */}
                    <div className="bg-white p-4 rounded-xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Spécimen officiel du signataire habilité :
                        </span>
                        <div className="font-bold text-sm text-[#062653]">
                          {currentUserName || "Direction Générale"}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          Rôle : {currentUserRole || "Direction Générale"} • Date : {new Date().toLocaleDateString("fr-FR")}
                        </div>
                      </div>

                      {/* Zone Signature */}
                      {adminSignature ? (
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#F4F6F9] rounded-lg flex flex-col items-center justify-center min-w-[170px] min-h-[70px]">
                            <img
                              src={adminSignature}
                              alt="Signature Direction"
                              className="h-12 max-w-[180px] object-contain drop-shadow-xs"
                            />
                            <span className="text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-widest mt-1">
                              [ VISA NUMÉRIQUE CONFORME ]
                            </span>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSignaturePosition(DEFAULT_SIGNATURE_POSITION);
                                showSystemToast("Signature recentrée dans le cadre officiel de l'Administration.");
                              }}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                              title="Recentrer automatiquement la signature au milieu exact du cadre officiel"
                            >
                              <RotateCcw className="w-3 h-3 text-emerald-700" />
                              <span>Recentrer</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => signatureInputRef.current?.click()}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                            >
                              Changer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAdminSignature(null);
                                try {
                                  localStorage.removeItem("rkonekte_user_signature");
                                } catch (_) {}
                              }}
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <button
                            type="button"
                            onClick={() => signatureInputRef.current?.click()}
                            className="px-4 py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 transition-all flex items-center gap-2.5 cursor-pointer"
                          >
                            <UploadCloud className="w-5 h-5 text-emerald-700 shrink-0" />
                            <div className="text-left">
                              <span className="text-xs font-bold block text-emerald-950">
                                Téléverser votre signature
                              </span>
                              <span className="text-[10px] text-emerald-700 block">
                                Format image (PNG, JPG, SVG)
                              </span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Boutons d'Action : Refuser en ROUGE, Approuver en VERT ÉMERAUDE (cliquable UNIQUEMENT après upload) */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs">
                        {!adminSignature ? (
                          <span className="text-amber-800 font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg">
                            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>Bouton d'approbation verrouillé : téléversez votre signature ci-dessus pour l'activer.</span>
                          </span>
                        ) : (
                          <span className="text-emerald-800 font-semibold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                            <span>Signature automatiquement placée dans le cadre. Cliquez ci-contre pour approuver !</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleRejectDecision(selectedRequest.id)}
                          className="px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          Refuser l'autorisation
                        </button>

                        <button
                          type="button"
                          disabled={!adminSignature}
                          onClick={() => adminSignature && handleApproveWithSignature(selectedRequest.id)}
                          className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 select-none ${
                            adminSignature
                              ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95"
                              : "bg-slate-200 text-slate-400 cursor-not-allowed opacity-50 shadow-none pointer-events-none"
                          }`}
                          title={
                            adminSignature
                              ? "Approuver et apposer ma signature officielle"
                              : "Bouton incliquable : aucune signature téléversée"
                          }
                        >
                          <ShieldCheck className="w-4 h-4 text-white" />
                          <span>Approuver et apposer ma signature</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )) : selectedRequest.status === "APPROVED" ? (
                  <div className="bg-emerald-50 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Document Officiellement Autorisé et Signé</span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Signé par <strong>{selectedRequest.authorizedBy || "la Direction"}</strong>{" "}
                        le {selectedRequest.authorizedAt || selectedRequest.submittedAt}.
                      </p>
                      <span className="inline-block text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider">
                        Signataire authentifié • Empreinte numérique certifiée et scellée
                      </span>
                    </div>

                    {selectedRequest.signatureUrl && (
                      <div className="bg-white p-3 rounded-xl shadow-2xs flex flex-col items-center shrink-0">
                        <img
                          src={selectedRequest.signatureUrl}
                          alt="Signature Direction"
                          className="h-12 max-w-[180px] object-contain"
                        />
                        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mt-1">
                          Signature de la Direction
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-rose-50 p-4 rounded-xl text-rose-800 text-xs flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <strong className="block text-sm">Demande d'autorisation refusée</strong>
                      <span>Cette demande a été rejetée et aucun visa n'a été accordé.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
