"use client";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  Upload,
  Inbox,
  Send,
  Check,
  CheckCheck,
  Search,
  Filter,
  Eye,
  Download,
  Trash2,
  X,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  FileCheck2,
  RefreshCw,
  Users,
  ShieldCheck,
  AlertCircle,
  Mail,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Calendar,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  ArrowLeft,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { showSystemToast } from "@/components/ui/SystemToast";

interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface SelectedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  extension: string;
}

interface ReceivedDocItem {
  recipientRecordId: string;
  documentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  fileExtension: string;
  fileSize: number;
  senderUserId: string;
  senderName: string;
  senderEmail: string;
  status: "TRANSMITTED" | "DELIVERED" | "VIEWED";
  deliveredAt: number;
  viewedAt: number | null;
  createdAt: number;
  isUnread: boolean;
}

interface RecipientStatusItem {
  id: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  status: "TRANSMITTED" | "DELIVERED" | "VIEWED";
  deliveredAt: number;
  viewedAt: number | null;
  notificationEmailSent: boolean;
  notificationEmailSentAt: number | null;
  notificationEmailError: string | null;
}

interface SentDocItem {
  id: string;
  organizationId: string;
  senderUserId: string;
  senderName: string;
  senderEmail: string;
  fileName: string;
  fileType: string;
  fileExtension: string;
  fileSize: number;
  fileHash?: string;
  createdAt: number;
  updatedAt: number;
  recipients: RecipientStatusItem[];
  overallStatus: "ALL_VIEWED" | "PARTIALLY_VIEWED" | "DELIVERED" | "TRANSMITTED";
  viewedCount: number;
  totalRecipientsCount: number;
}

interface GroupedSentDocItem {
  docId: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  fileType: string;
  createdAt: number;
  recipientStatus: "TRANSMITTED" | "DELIVERED" | "VIEWED";
  viewedAt: number | null;
}

interface SentRecipientDateGroup {
  id: string; // `${recipientUserId}_${dateKey}`
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  dateKey: string; // "YYYY-MM-DD"
  latestTimestamp: number;
  documents: GroupedSentDocItem[];
  viewedCount: number;
  totalDocsCount: number;
  isAllViewed: boolean;
  isPartial: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Ko";
  const k = 1024;
  if (bytes < k) return `${bytes} o`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} Ko`;
  return `${(bytes / (k * k)).toFixed(1)} Mo`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDateOnly(timestamp: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatTimeOnly(timestamp: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function matchesDateFilter(timestamp: number, dateStr: string): boolean {
  if (!dateStr) return true;
  if (!timestamp) return false;
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const docDate = `${year}-${month}-${day}`;
  return docDate === dateStr;
}

function normalizeSearchText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatFilterDateLabel(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }
  } catch (_) {}
  return dateStr;
}

function getFileBadge(ext: string) {
  const e = ext.toLowerCase();
  if (e === ".pdf") {
    return {
      label: "PDF",
      bg: "bg-red-50 text-red-700 border-red-200",
      icon: FileText,
      iconColor: "text-red-600",
    };
  }
  if (e === ".xls" || e === ".xlsx" || e === ".csv") {
    return {
      label: "EXCEL",
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: FileSpreadsheet,
      iconColor: "text-emerald-600",
    };
  }
  if (e === ".doc" || e === ".docx" || e === ".txt") {
    return {
      label: "WORD",
      bg: "bg-blue-50 text-blue-700 border-blue-200",
      icon: FileText,
      iconColor: "text-blue-600",
    };
  }
  if (e === ".ppt" || e === ".pptx") {
    return {
      label: "PPT",
      bg: "bg-orange-50 text-orange-700 border-orange-200",
      icon: FileText,
      iconColor: "text-orange-600",
    };
  }
  if (e === ".png" || e === ".jpg" || e === ".jpeg") {
    return {
      label: "IMAGE",
      bg: "bg-purple-50 text-purple-700 border-purple-200",
      icon: ImageIcon,
      iconColor: "text-purple-600",
    };
  }
  return {
    label: "DOC",
    bg: "bg-slate-50 text-slate-700 border-slate-200",
    icon: FileCode,
    iconColor: "text-slate-600",
  };
}

function ExchangesContent() {
  const searchParams = useSearchParams();
  const deepLinkedDocId = searchParams.get("docId");

  const [activeTab, setActiveTab] = useState<"received" | "sent" | "send">(
    deepLinkedDocId ? "received" : "received"
  );
  const [previousTab, setPreviousTab] = useState<"received" | "sent">("sent");

  // Directory of eligible admin recipients
  const [adminRecipients, setAdminRecipients] = useState<AdminUserItem[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Send form states
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Received documents state
  const [receivedDocs, setReceivedDocs] = useState<ReceivedDocItem[]>([]);
  const [loadingReceived, setLoadingReceived] = useState(true);
  const [searchReceived, setSearchReceived] = useState("");
  const [dateFilterReceived, setDateFilterReceived] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const receivedDateInputRef = useRef<HTMLInputElement>(null);

  // Sent documents state
  const [sentDocs, setSentDocs] = useState<SentDocItem[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [searchSent, setSearchSent] = useState("");
  const [dateFilterSent, setDateFilterSent] = useState("");
  const [resendingDocId, setResendingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const sentDateInputRef = useRef<HTMLInputElement>(null);

  // Pagination & Grouping states
  const PAGE_SIZE = 15;
  const [sentPage, setSentPage] = useState(1);
  const [receivedPage, setReceivedPage] = useState(1);
  const [selectedGroupIdForDocsModal, setSelectedGroupIdForDocsModal] = useState<string | null>(null);

  useEffect(() => {
    setSentPage(1);
  }, [searchSent, dateFilterSent]);

  useEffect(() => {
    setReceivedPage(1);
  }, [searchReceived, dateFilterReceived, unreadOnly]);

  // Filtered received documents
  const filteredReceivedDocs = useMemo(() => {
    return receivedDocs.filter((doc) => {
      if (unreadOnly && !doc.isUnread) return false;
      if (searchReceived.trim()) {
        const q = normalizeSearchText(searchReceived);
        const qWords = q.split(/\s+/).filter(Boolean);
        const senderText = normalizeSearchText(`${doc.senderName} ${doc.senderEmail}`);
        const docText = normalizeSearchText(doc.fileName);
        const matchesSender = qWords.every((w) => senderText.includes(w));
        const matchesName = qWords.every((w) => docText.includes(w));
        if (!matchesName && !matchesSender) return false;
      }
      if (dateFilterReceived) {
        if (!matchesDateFilter(doc.deliveredAt, dateFilterReceived)) return false;
      }
      return true;
    });
  }, [receivedDocs, searchReceived, unreadOnly, dateFilterReceived]);

  // Group sent documents by (Destinataire + Date)
  const groupedSentDocs = useMemo(() => {
    const map = new Map<string, SentRecipientDateGroup>();

    for (const doc of sentDocs) {
      const d = new Date(doc.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      for (const r of doc.recipients) {
        const groupKey = `${r.recipientUserId}_${dateKey}`;
        let group = map.get(groupKey);
        if (!group) {
          group = {
            id: groupKey,
            recipientUserId: r.recipientUserId,
            recipientName: r.recipientName,
            recipientEmail: r.recipientEmail,
            dateKey,
            latestTimestamp: doc.createdAt,
            documents: [],
            viewedCount: 0,
            totalDocsCount: 0,
            isAllViewed: false,
            isPartial: false,
          };
          map.set(groupKey, group);
        }

        if (doc.createdAt > group.latestTimestamp) {
          group.latestTimestamp = doc.createdAt;
        }

        group.documents.push({
          docId: doc.id,
          fileName: doc.fileName,
          fileExtension: doc.fileExtension,
          fileSize: doc.fileSize,
          fileType: doc.fileType,
          createdAt: doc.createdAt,
          recipientStatus: r.status,
          viewedAt: r.viewedAt,
        });
      }
    }

    const groups = Array.from(map.values()).map((g) => {
      g.documents.sort((a, b) => b.createdAt - a.createdAt);
      const viewedCount = g.documents.filter((d) => d.recipientStatus === "VIEWED").length;
      const totalDocsCount = g.documents.length;
      const isAllViewed = totalDocsCount > 0 && viewedCount === totalDocsCount;
      const isPartial = viewedCount > 0 && viewedCount < totalDocsCount;
      return {
        ...g,
        viewedCount,
        totalDocsCount,
        isAllViewed,
        isPartial,
      };
    });

    groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    return groups;
  }, [sentDocs]);

  // Filtered sent groups by search text (destinataire ou nom de document) and date filter
  const filteredSentGroups = useMemo(() => {
    return groupedSentDocs.filter((g) => {
      if (searchSent.trim()) {
        const q = normalizeSearchText(searchSent);
        const qWords = q.split(/\s+/).filter(Boolean);
        const recipientText = normalizeSearchText(`${g.recipientName} ${g.recipientEmail}`);
        const matchesRecipient = qWords.every((w) => recipientText.includes(w));
        const matchesDocName = g.documents.some((d) => {
          const docText = normalizeSearchText(d.fileName);
          return qWords.every((w) => docText.includes(w));
        });
        if (!matchesRecipient && !matchesDocName) return false;
      }
      if (dateFilterSent) {
        if (g.dateKey !== dateFilterSent) return false;
      }
      return true;
    });
  }, [groupedSentDocs, searchSent, dateFilterSent]);

  // Paginated Slices (15 items max per page)
  const paginatedSentGroups = useMemo(() => {
    const start = (sentPage - 1) * PAGE_SIZE;
    return filteredSentGroups.slice(start, start + PAGE_SIZE);
  }, [filteredSentGroups, sentPage]);

  const paginatedReceivedDocs = useMemo(() => {
    const start = (receivedPage - 1) * PAGE_SIZE;
    return filteredReceivedDocs.slice(start, start + PAGE_SIZE);
  }, [filteredReceivedDocs, receivedPage]);

  const totalSentGroups = filteredSentGroups.length;
  const totalSentPages = Math.max(1, Math.ceil(totalSentGroups / PAGE_SIZE));
  const sentStartItem = totalSentGroups === 0 ? 0 : (sentPage - 1) * PAGE_SIZE + 1;
  const sentEndItem = Math.min(sentPage * PAGE_SIZE, totalSentGroups);

  const totalReceivedDocs = filteredReceivedDocs.length;
  const totalReceivedPages = Math.max(1, Math.ceil(totalReceivedDocs / PAGE_SIZE));
  const receivedStartItem = totalReceivedDocs === 0 ? 0 : (receivedPage - 1) * PAGE_SIZE + 1;
  const receivedEndItem = Math.min(receivedPage * PAGE_SIZE, totalReceivedDocs);

  const activeGroupForDocsModal = useMemo(() => {
    if (!selectedGroupIdForDocsModal) return null;
    return groupedSentDocs.find((g) => g.id === selectedGroupIdForDocsModal) || null;
  }, [groupedSentDocs, selectedGroupIdForDocsModal]);

  // Preview modal for received or sent document
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    name: string;
    extension: string;
    type: string;
  } | null>(null);

  // 1. Load administrators list for recipient selection
  const fetchAdmins = async () => {
    try {
      setLoadingAdmins(true);
      const res = await fetch("/api/admin/exchanges/admins");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.admins)) {
          setAdminRecipients(data.admins);
        }
      }
    } catch (_) {
    } finally {
      setLoadingAdmins(false);
    }
  };

  // 2. Load received documents
  const fetchReceivedDocs = async () => {
    try {
      setLoadingReceived(true);
      const url = new URL("/api/admin/exchanges/received", window.location.origin);
      if (unreadOnly) url.searchParams.set("unreadOnly", "true");

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) {
          setReceivedDocs(data.documents);
        }
      }
    } catch (_) {
    } finally {
      setLoadingReceived(false);
    }
  };

  // 3. Load sent documents
  const fetchSentDocs = async () => {
    try {
      setLoadingSent(true);
      const url = new URL("/api/admin/exchanges/sent", window.location.origin);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) {
          setSentDocs(data.documents);
        }
      }
    } catch (_) {
    } finally {
      setLoadingSent(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchReceivedDocs();
    fetchSentDocs();
  }, []);

  useEffect(() => {
    if (activeTab === "received") {
      fetchReceivedDocs();
    } else if (activeTab === "sent") {
      fetchSentDocs();
    }
  }, [activeTab, unreadOnly]);

  // Handle deep-link from email notification
  useEffect(() => {
    if (deepLinkedDocId && receivedDocs.length > 0) {
      const targetDoc = receivedDocs.find((d) => d.documentId === deepLinkedDocId);
      if (targetDoc) {
        setActiveTab("received");
        handleOpenPreview(targetDoc.documentId, targetDoc.fileName, targetDoc.fileExtension, targetDoc.fileType);
      }
    }
  }, [deepLinkedDocId, receivedDocs]);

  // File selection handlers
  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFormError(null);

    const newItems: SelectedFileItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const ext = f.name.includes(".") ? `.${f.name.split(".").pop()?.toLowerCase()}` : "";
      if (f.size > 25 * 1024 * 1024) {
        showSystemToast(`Le fichier « ${f.name} » dépasse la taille maximale autorisée (25 Mo).`, "error");
        continue;
      }
      newItems.push({
        id: `${f.name}_${f.size}_${Date.now()}_${Math.random()}`,
        file: f,
        name: f.name,
        size: f.size,
        extension: ext,
      });
    }

    setSelectedFiles((prev) => [...prev, ...newItems]);
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllRecipients = () => {
    if (selectedRecipientIds.length === adminRecipients.length) {
      setSelectedRecipientIds([]);
    } else {
      setSelectedRecipientIds(adminRecipients.map((a) => a.id));
    }
  };

  // Submit transmission
  const handleTransmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedRecipientIds.length === 0) {
      setFormError("Veuillez sélectionner au moins un administrateur destinataire.");
      return;
    }
    if (selectedFiles.length === 0) {
      setFormError("Veuillez sélectionner au moins un document à transmettre.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      for (const rid of selectedRecipientIds) {
        formData.append("recipientIds", rid);
      }
      for (const item of selectedFiles) {
        formData.append("files", item.file);
      }

      const res = await fetch("/api/admin/exchanges/send", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'effectuer la transmission.");
      }

      showSystemToast(data.message || "Transmission effectuée avec succès !");
      setSelectedFiles([]);
      setSelectedRecipientIds([]);
      setActiveTab("sent");
      fetchSentDocs();
    } catch (err: any) {
      setFormError(err.message || "Une erreur est survenue lors de la transmission.");
      showSystemToast(err.message || "Erreur de transmission", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Preview & auto-mark viewed
  const handleOpenPreview = async (
    docId: string,
    name: string,
    extension: string,
    type: string
  ) => {
    setPreviewDoc({
      id: docId,
      name,
      extension,
      type,
    });

    // Fire view ack in background
    try {
      await fetch(`/api/admin/exchanges/documents/${encodeURIComponent(docId)}/view`, {
        method: "POST",
      });
      // Refresh local unread badge
      setReceivedDocs((prev) =>
        prev.map((d) =>
          d.documentId === docId ? { ...d, isUnread: false, status: "VIEWED", viewedAt: Date.now() } : d
        )
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("rkonekte_notification_update"));
      }
    } catch (_) {}
  };

  // Download document
  const handleDownload = (docId: string) => {
    window.open(`/api/admin/exchanges/documents/${encodeURIComponent(docId)}/download`, "_blank");
    // Update local status to viewed
    setReceivedDocs((prev) =>
      prev.map((d) =>
        d.documentId === docId ? { ...d, isUnread: false, status: "VIEWED", viewedAt: Date.now() } : d
      )
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("rkonekte_notification_update"));
    }
  };

  // Resend email notification directly for a single document
  const handleResendDocAlert = async (docId: string, recipientUserId?: string) => {
    try {
      setResendingDocId(docId);
      const doc = sentDocs.find((d) => d.id === docId);
      if (!doc) {
        showSystemToast("Document introuvable.", "error");
        return;
      }
      let listToSend = doc.recipients;
      if (recipientUserId) {
        listToSend = doc.recipients.filter((r) => r.recipientUserId === recipientUserId);
      } else {
        const pending = doc.recipients.filter((r) => r.status !== "VIEWED");
        listToSend = pending.length > 0 ? pending : doc.recipients;
      }

      if (listToSend.length === 0) {
        showSystemToast("Aucun destinataire associé à ce document.", "error");
        return;
      }

      for (const recp of listToSend) {
        const res = await fetch(`/api/admin/exchanges/documents/${encodeURIComponent(doc.id)}/resend-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: recp.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Échec de renvoi");
      }

      showSystemToast("Alerte e-mail renvoyée avec succès.");
      fetchSentDocs();
    } catch (err: any) {
      showSystemToast(err.message || "Impossible de renvoyer l'alerte.", "error");
    } finally {
      setResendingDocId(null);
    }
  };

  // Delete a single document permanently
  const handleDeleteSingleDoc = async (docId: string, fileName: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement le document "${fileName}" ?`)) {
      return;
    }

    try {
      setDeletingDocId(docId);
      const res = await fetch(`/api/admin/exchanges/documents/${encodeURIComponent(docId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Impossible de supprimer ce document.");
      }

      setSentDocs((prev) => prev.filter((d) => d.id !== docId));
      showSystemToast(`Le document "${fileName}" a été supprimé.`);
    } catch (err: any) {
      showSystemToast(err.message || "Erreur lors de la suppression.", "error");
    } finally {
      setDeletingDocId(null);
    }
  };

  // Delete an entire transmission group (all documents sent to this recipient on that date)
  const handleDeleteGroup = async (group: SentRecipientDateGroup) => {
    const count = group.totalDocsCount;
    const confirmMsg =
      count > 1
        ? `Êtes-vous sûr de vouloir supprimer cette transmission et ses ${count} documents partagés avec ${group.recipientName} ?`
        : `Êtes-vous sûr de vouloir supprimer cette transmission (${group.documents[0]?.fileName}) ?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setDeletingDocId(group.id);
      const docIds = group.documents.map((d) => d.docId);

      for (const id of docIds) {
        const res = await fetch(`/api/admin/exchanges/documents/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur lors de la suppression.");
        }
      }

      const idSet = new Set(docIds);
      setSentDocs((prev) => prev.filter((d) => !idSet.has(d.id)));

      if (selectedGroupIdForDocsModal === group.id) {
        setSelectedGroupIdForDocsModal(null);
      }

      showSystemToast("Transmission supprimée avec succès.");
    } catch (err: any) {
      showSystemToast(err.message || "Impossible de supprimer la transmission.", "error");
    } finally {
      setDeletingDocId(null);
    }
  };

  // Resend email notification for all unviewed documents in a group
  const handleResendGroupAlert = async (group: SentRecipientDateGroup) => {
    try {
      setResendingDocId(group.id);
      const unviewedDocs = group.documents.filter((d) => d.recipientStatus !== "VIEWED");
      const docsToAlert = unviewedDocs.length > 0 ? unviewedDocs : group.documents;

      let sentCount = 0;
      for (const item of docsToAlert) {
        const doc = sentDocs.find((d) => d.id === item.docId);
        const recp = doc?.recipients.find((r) => r.recipientUserId === group.recipientUserId);
        if (doc && recp) {
          const res = await fetch(`/api/admin/exchanges/documents/${encodeURIComponent(doc.id)}/resend-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipientId: recp.id }),
          });
          if (res.ok) sentCount++;
        }
      }

      showSystemToast(`Alerte renvoyée pour ${sentCount} document(s) à ${group.recipientName}.`);
      fetchSentDocs();
    } catch (err: any) {
      showSystemToast(err.message || "Impossible de renvoyer les alertes.", "error");
    } finally {
      setResendingDocId(null);
    }
  };

  const unreadCount = useMemo(() => {
    return receivedDocs.filter((d) => d.isUnread).length;
  }, [receivedDocs]);

  return (
    <div className="space-y-6">
      {/* 1. Header Bar (Harmonisé avec Demandes de congé et les pages standards) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-[#062653] tracking-tight">
              Échanges administratifs
            </h1>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Transmission, réception et traçabilité des documents officiels entre administrateurs.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (activeTab === "received") fetchReceivedDocs();
              else if (activeTab === "sent") fetchSentDocs();
              else fetchAdmins();
              showSystemToast("Données actualisées");
            }}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-white hover:bg-[#F4F6F9] active:bg-slate-100 text-[#062653] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Actualiser les données"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualiser</span>
          </button>

          {activeTab === "send" ? (
            <button
              type="button"
              onClick={() => setActiveTab(previousTab)}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-100 text-[#062653] border border-slate-200/90 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              title="Retourner aux échanges"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600" />
              <span>Retour</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPreviousTab(activeTab === "received" ? "received" : "sent");
                setActiveTab("send");
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              title="Transmettre un document aux administrateurs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Transmettre un document</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. FILTERS & SEARCH BAR (BARRE UNIQUE HARMONISÉE EXACTEMENT COMME DEMANDES DE CONGÉ) */}
      <div className="bg-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("received")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === "received"
                ? "bg-[#062653] text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200/80 hover:text-[#263445]"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Documents reçus</span>
            {unreadCount > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                  activeTab === "received"
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sent")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === "sent"
                ? "bg-[#062653] text-white"
                : "bg-[#F4F6F9] text-[#64748B] hover:bg-slate-200/80 hover:text-[#263445]"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Documents transmis</span>
            {groupedSentDocs.length > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-semibold rounded-full ${
                  activeTab === "sent" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {groupedSentDocs.length}
              </span>
            )}
          </button>
        </div>

        {/* Search input & Options on the right */}
        {activeTab === "received" && (
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Date filter - icône compacte pour ne pas encombrer l'entête */}
            {dateFilterReceived ? (
              <div className="relative flex items-center gap-1.5 h-10 px-2.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold ring-1 ring-emerald-200 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[11px] font-bold">{formatFilterDateLabel(dateFilterReceived)}</span>
                <input
                  ref={receivedDateInputRef}
                  type="date"
                  value={dateFilterReceived}
                  onChange={(e) => setDateFilterReceived(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title="Changer la date de réception"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDateFilterReceived("");
                  }}
                  className="z-10 p-0.5 rounded-full hover:bg-emerald-200 text-emerald-700 hover:text-emerald-900 cursor-pointer ml-0.5"
                  title="Effacer le filtre date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  try {
                    receivedDateInputRef.current?.showPicker?.();
                  } catch (_) {}
                }}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg bg-[#F4F6F9] hover:bg-slate-200/80 transition-colors cursor-pointer shrink-0"
                title="Filtrer par date de réception"
              >
                <Calendar className="w-4 h-4 text-[#64748B]" />
                <input
                  ref={receivedDateInputRef}
                  type="date"
                  value={dateFilterReceived}
                  onChange={(e) => setDateFilterReceived(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title="Filtrer par date de réception"
                />
              </div>
            )}

            {/* Text search */}
            <div className="w-full sm:w-64 md:w-72 relative">
              <input
                type="text"
                placeholder="Rechercher (nom, expéditeur)..."
                value={searchReceived}
                onChange={(e) => setSearchReceived(e.target.value)}
                className="w-full h-10 pl-9 pr-8 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder:text-[#64748B] focus:bg-white transition-all border-0 focus:ring-1 focus:ring-slate-300"
              />
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3 pointer-events-none" />
              {searchReceived && (
                <button
                  type="button"
                  onClick={() => setSearchReceived("")}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                  title="Effacer la recherche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "sent" && (
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Date filter - icône compacte pour ne pas encombrer l'entête */}
            {dateFilterSent ? (
              <div className="relative flex items-center gap-1.5 h-10 px-2.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold ring-1 ring-emerald-200 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[11px] font-bold">{formatFilterDateLabel(dateFilterSent)}</span>
                <input
                  ref={sentDateInputRef}
                  type="date"
                  value={dateFilterSent}
                  onChange={(e) => setDateFilterSent(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title="Changer la date de transmission"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDateFilterSent("");
                  }}
                  className="z-10 p-0.5 rounded-full hover:bg-emerald-200 text-emerald-700 hover:text-emerald-900 cursor-pointer ml-0.5"
                  title="Effacer le filtre date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  try {
                    sentDateInputRef.current?.showPicker?.();
                  } catch (_) {}
                }}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg bg-[#F4F6F9] hover:bg-slate-200/80 transition-colors cursor-pointer shrink-0"
                title="Filtrer par date de transmission"
              >
                <Calendar className="w-4 h-4 text-[#64748B]" />
                <input
                  ref={sentDateInputRef}
                  type="date"
                  value={dateFilterSent}
                  onChange={(e) => setDateFilterSent(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title="Filtrer par date de transmission"
                />
              </div>
            )}

            {/* Text search : filtre instantanément par nom de destinataire ou nom de document */}
            <div className="w-full sm:w-64 md:w-80 relative">
              <input
                type="text"
                placeholder="Rechercher par destinataire ou document..."
                value={searchSent}
                onChange={(e) => setSearchSent(e.target.value)}
                className="w-full h-10 pl-9 pr-8 bg-[#F4F6F9] rounded-lg text-xs text-[#263445] placeholder:text-[#64748B] focus:bg-white transition-all border-0 focus:ring-1 focus:ring-slate-300"
                title="Filtrer en temps réel par nom de destinataire ou nom de fichier"
              />
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3 pointer-events-none" />
              {searchSent && (
                <button
                  type="button"
                  onClick={() => setSearchSent("")}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 cursor-pointer"
                  title="Effacer la recherche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "send" && (
          <div className="text-xs text-[#64748B]">
            Destinataire(s) sélectionné(s) :{" "}
            <strong className="text-[#062653]">{selectedRecipientIds.length}</strong>
            {" • "}
            Fichier(s) :{" "}
            <strong className="text-[#062653]">{selectedFiles.length}</strong>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION A : TRANSMETTRE UN DOCUMENT                                      */}
      {/* ========================================================================= */}
      {activeTab === "send" && (
        <form onSubmit={handleTransmit} className="space-y-6">
          {formError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Sélection des Destinataires Administrateurs */}
          <div className="bg-white rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#062653] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#062653]" />
                  1. Sélectionner les administrateurs destinataires
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Seuls les comptes ayant le rôle Administrateur ou Direction sont éligibles.
                </p>
              </div>

              {adminRecipients.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllRecipients}
                  className="text-xs font-semibold text-[#062653] hover:underline cursor-pointer"
                >
                  {selectedRecipientIds.length === adminRecipients.length
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </button>
              )}
            </div>

            {loadingAdmins ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
                Chargement des administrateurs...
              </div>
            ) : adminRecipients.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B] bg-[#F4F6F9] rounded-xl">
                Aucun autre compte administrateur actif n'est présent dans votre entreprise.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {adminRecipients.map((admin) => {
                  const isSelected = selectedRecipientIds.includes(admin.id);
                  return (
                    <div
                      key={admin.id}
                      onClick={() => toggleRecipient(admin.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between select-none ${
                        isSelected
                          ? "bg-blue-50/70 border-[#062653] text-[#062653] shadow-xs"
                          : "bg-[#F4F6F9] border-transparent hover:border-slate-300 text-[#263445]"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold truncate">{admin.name}</div>
                        <div className="text-[11px] text-[#64748B] truncate">{admin.email}</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? "bg-[#062653] border-[#062653] text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-xs text-[#64748B] pt-1">
              Destinataire(s) sélectionné(s) :{" "}
              <strong className="text-[#062653]">{selectedRecipientIds.length}</strong>
            </div>
          </div>

          {/* 2. Sélection et Dépôt des Fichiers */}
          <div className="bg-white rounded-xl shadow-xs p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#062653] flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#062653]" />
                2. Ajouter les documents à transmettre
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Formats acceptés : PDF, Word (DOC, DOCX), Excel (XLS, XLSX), PowerPoint (PPT, PPTX), Images (PNG, JPG). Limite : 25 Mo par fichier.
              </p>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleAddFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? "border-[#062653] bg-blue-50/50"
                  : "border-slate-300 hover:border-slate-400 bg-[#F4F6F9]/60"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv"
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-[#062653] flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-[#263445]">
                Glissez-déposez vos fichiers ici, ou{" "}
                <span className="text-[#062653] underline font-bold">parcourez votre ordinateur</span>
              </div>
              <div className="text-[11px] text-[#64748B]">
                Transmission directe et sécurisée • Aucun message texte requis
              </div>
            </div>

            {/* Selected Files Queue */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-700">
                  Fichiers prêts pour l'envoi ({selectedFiles.length}) :
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {selectedFiles.map((item) => {
                    const badge = getFileBadge(item.extension);
                    const BadgeIcon = badge.icon;
                    return (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-semibold text-slate-800 truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-slate-400 shrink-0">({formatBytes(item.size)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors cursor-pointer shrink-0"
                          title="Retirer ce fichier"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setSelectedRecipientIds([]);
                setFormError(null);
                setActiveTab(previousTab);
              }}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setSelectedRecipientIds([]);
                setFormError(null);
              }}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Réinitialiser
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedFiles.length === 0 || selectedRecipientIds.length === 0}
              className={`px-5 py-2 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                isSubmitting || selectedFiles.length === 0 || selectedRecipientIds.length === 0
                  ? "bg-slate-300 cursor-not-allowed opacity-60"
                  : "bg-[#062653] hover:bg-[#031B3A]"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting
                ? "Transmission en cours..."
                : `Confirmer la transmission (${selectedFiles.length})`}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SECTION B : DOCUMENTS REÇUS                                              */}
      {/* ========================================================================= */}
      {activeTab === "received" && (
        <div className="bg-white rounded-xl shadow-xs overflow-hidden">
          {loadingReceived ? (
            <div className="p-12 text-center text-xs text-[#64748B]">
              Chargement des documents reçus...
            </div>
          ) : filteredReceivedDocs.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#64748B] space-y-2">
              <p>
                {searchReceived || dateFilterReceived || unreadOnly
                  ? "Aucun document reçu ne correspond aux critères de recherche (nom ou date)."
                  : "Aucun document reçu pour le moment."}
              </p>
              {(searchReceived || dateFilterReceived || unreadOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchReceived("");
                    setDateFilterReceived("");
                    setUnreadOnly(false);
                  }}
                  className="text-xs font-bold text-[#062653] hover:underline cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                  <tr>
                    <th className="px-5 py-3.5">Document</th>
                    <th className="px-5 py-3.5">Taille</th>
                    <th className="px-5 py-3.5">Expéditeur</th>
                    <th className="px-5 py-3.5">Reçu le</th>
                    <th className="px-5 py-3.5">Statut</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedReceivedDocs.map((doc) => {
                    const badge = getFileBadge(doc.fileExtension);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr
                        key={doc.recipientRecordId}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          doc.isUnread ? "bg-emerald-50/20" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                            <div className="min-w-0">
                              <div
                                className="font-bold text-[#062653] truncate"
                                title={doc.fileName}
                              >
                                {doc.fileName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[#64748B] whitespace-nowrap">
                          {formatBytes(doc.fileSize)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="font-semibold text-[#263445]">{doc.senderName}</div>
                          <div className="text-[11px] text-[#64748B]">{doc.senderEmail}</div>
                        </td>
                        <td className="px-5 py-3.5 text-[#64748B] whitespace-nowrap">
                          {formatDate(doc.deliveredAt)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {doc.isUnread ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Nouveau • Non consulté</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
                              title={`Consulté le ${formatDate(doc.viewedAt || 0)}`}
                            >
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Consulté</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenPreview(
                                  doc.documentId,
                                  doc.fileName,
                                  doc.fileExtension,
                                  doc.fileType
                                )
                              }
                              className="p-1.5 rounded-lg border border-slate-200 text-[#263445] hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Visualiser le document"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownload(doc.documentId)}
                              className="p-1.5 rounded-lg bg-[#062653] text-white hover:bg-[#031B3A] transition-colors cursor-pointer shadow-2xs"
                              title="Télécharger le document"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar Received (Max 15 lignes par page) */}
          {totalReceivedDocs > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
              <div>
                <span className="font-medium text-[#263445]">
                  {receivedStartItem} – {receivedEndItem}
                </span>{" "}
                sur <span className="font-semibold text-[#062653]">{totalReceivedDocs}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReceivedPage((p) => Math.max(1, p - 1))}
                  disabled={receivedPage <= 1}
                  className="p-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 text-[#263445] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setReceivedPage((p) => Math.min(totalReceivedPages, p + 1))}
                  disabled={receivedPage >= totalReceivedPages}
                  className="p-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 text-[#263445] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Page suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION C : DOCUMENTS TRANSMIS (GROUPÉS PAR DESTINATAIRE ET DATE)        */}
      {/* ========================================================================= */}
      {activeTab === "sent" && (
        <div className="bg-white rounded-xl shadow-xs overflow-hidden">
          {loadingSent ? (
            <div className="p-12 text-center text-xs text-[#64748B]">
              Chargement des transmissions...
            </div>
          ) : filteredSentGroups.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#64748B] space-y-2">
              <p>
                {searchSent || dateFilterSent
                  ? "Aucune transmission ne correspond aux critères de recherche (destinataire, document ou date)."
                  : "Aucun document transmis pour le moment."}
              </p>
              {(searchSent || dateFilterSent) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchSent("");
                    setDateFilterSent("");
                  }}
                  className="text-xs font-bold text-[#062653] hover:underline cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F6F9] text-[11px] uppercase font-bold text-[#64748B] border-b border-slate-200/70">
                  <tr>
                    <th className="px-5 py-3.5">Destinataire</th>
                    <th className="px-5 py-3.5">Documents partagés</th>
                    <th className="px-5 py-3.5">Transmis le</th>
                    <th className="px-5 py-3.5 text-center">Accusé de consultation</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedSentGroups.map((group) => {
                    const hasPending = group.documents.some((d) => d.recipientStatus !== "VIEWED");

                    return (
                      <tr
                        key={group.id}
                        onClick={() => setSelectedGroupIdForDocsModal(group.id)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        {/* 1. Destinataire */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#062653]/10 text-[#062653] font-bold text-xs flex items-center justify-center shrink-0">
                              {group.recipientName ? group.recipientName.charAt(0).toUpperCase() : "A"}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[#062653] truncate" title={group.recipientName}>
                                {group.recipientName}
                              </div>
                              <div className="text-[11px] text-[#64748B] truncate" title={group.recipientEmail}>
                                {group.recipientEmail}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Documents partagés (cliquable pour ouvrir la modale simple) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGroupIdForDocsModal(group.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-[#062653] font-bold text-xs transition-colors cursor-pointer"
                            title="Cliquer pour afficher les documents"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#062653]" />
                            <span>
                              {group.totalDocsCount} document{group.totalDocsCount > 1 ? "s" : ""}
                            </span>
                          </button>
                        </td>

                        {/* 3. Transmis le */}
                        <td className="px-5 py-3.5 text-[#64748B] whitespace-nowrap font-medium">
                          {formatDateOnly(group.latestTimestamp)}
                        </td>

                        {/* 4. Accusé de consultation (WhatsApp Checkmarks Display) */}
                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold">
                            {group.isAllViewed ? (
                              <>
                                <CheckCheck className="w-4 h-4 text-emerald-500" />
                                <span className="text-emerald-700 font-bold">
                                  Consulté ({group.viewedCount}/{group.totalDocsCount})
                                </span>
                              </>
                            ) : group.isPartial ? (
                              <>
                                <CheckCheck className="w-4 h-4 text-emerald-500" />
                                <span className="text-emerald-700 font-medium">
                                  En cours ({group.viewedCount}/{group.totalDocsCount})
                                </span>
                              </>
                            ) : (
                              <>
                                <CheckCheck className="w-4 h-4 text-slate-400" />
                                <span className="text-[#64748B]">
                                  Disponible (0/{group.totalDocsCount})
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 5. Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasPending && (
                              <button
                                type="button"
                                onClick={() => handleResendGroupAlert(group)}
                                disabled={resendingDocId === group.id}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-[#062653] hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
                                title="Renvoyer l'alerte e-mail pour les documents non encore consultés"
                              >
                                <Mail className="w-3.5 h-3.5 text-[#FF7900]" />
                                <span>{resendingDocId === group.id ? "Envoi..." : "Renvoyer l'alerte"}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteGroup(group)}
                              disabled={deletingDocId === group.id}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                              title="Supprimer cette transmission"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar Sent (Max 15 lignes par page) */}
          {totalSentGroups > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
              <div>
                <span className="font-medium text-[#263445]">
                  {sentStartItem} – {sentEndItem}
                </span>{" "}
                sur <span className="font-semibold text-[#062653]">{totalSentGroups}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSentPage((p) => Math.max(1, p - 1))}
                  disabled={sentPage <= 1}
                  className="p-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 text-[#263445] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Page précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSentPage((p) => Math.min(totalSentPages, p + 1))}
                  disabled={sentPage >= totalSentPages}
                  className="p-1.5 rounded-lg bg-[#F4F6F9] hover:bg-slate-200/70 text-[#263445] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  title="Page suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL SIMPLE : DOCUMENTS PARTAGÉS AVEC LE DESTINATAIRE                   */}
      {/* ========================================================================= */}
      {activeGroupForDocsModal && (
        <Modal
          isOpen={Boolean(activeGroupForDocsModal)}
          onClose={() => setSelectedGroupIdForDocsModal(null)}
          title={`Documents partagés (${activeGroupForDocsModal.totalDocsCount})`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Infos destinataire & date */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#062653]/10 text-[#062653] font-bold text-xs flex items-center justify-center shrink-0">
                  {activeGroupForDocsModal.recipientName
                    ? activeGroupForDocsModal.recipientName.charAt(0).toUpperCase()
                    : "A"}
                </div>
                <div>
                  <span className="font-bold text-[#062653]">
                    {activeGroupForDocsModal.recipientName}
                  </span>{" "}
                  <span className="text-[#64748B]">({activeGroupForDocsModal.recipientEmail})</span>
                </div>
              </div>
              <div className="text-[#64748B] text-[11px] sm:text-right">
                Transmis le <strong className="text-[#062653]">{formatDateOnly(activeGroupForDocsModal.latestTimestamp)}</strong>
              </div>
            </div>

            {/* Liste des documents */}
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto pr-1">
              {activeGroupForDocsModal.documents.map((docItem) => {
                const badge = getFileBadge(docItem.fileExtension);
                const isItemViewed = docItem.recipientStatus === "VIEWED";

                return (
                  <div
                    key={docItem.docId}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors px-2 rounded-lg"
                  >
                    {/* Doc Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                      <div className="min-w-0">
                        <div
                          className="font-bold text-[#062653] truncate"
                          title={docItem.fileName}
                        >
                          {docItem.fileName}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                          <span>{formatBytes(docItem.fileSize)}</span>
                          <span>•</span>
                          <span className="font-semibold text-[#263445]">
                            Heure de transmission : {formatTimeOnly(docItem.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Accusé & Actions */}
                    <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        {isItemViewed ? (
                          <>
                            <CheckCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-emerald-700 font-semibold text-[11px]">
                              Consulté{docItem.viewedAt ? ` à ${formatTimeOnly(docItem.viewedAt)}` : ""}
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCheck className="w-4 h-4 text-slate-400" />
                            <span className="text-[#64748B] text-[11px]">Non ouvert</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenPreview(
                              docItem.docId,
                              docItem.fileName,
                              docItem.fileExtension,
                              docItem.fileType
                            )
                          }
                          className="p-1.5 rounded-lg border border-slate-200 text-[#062653] hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Prévisualiser ce document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(docItem.docId)}
                          className="p-1.5 rounded-lg border border-slate-200 text-[#263445] hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Télécharger une copie"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {!isItemViewed && (
                          <button
                            type="button"
                            onClick={() =>
                              handleResendDocAlert(docItem.docId, activeGroupForDocsModal.recipientUserId)
                            }
                            disabled={resendingDocId === docItem.docId}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-[#062653] hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                            title="Renvoyer l'alerte pour ce document"
                          >
                            <Mail className="w-3 h-3 text-[#FF7900]" />
                            <span>
                              {resendingDocId === docItem.docId ? "..." : "Renvoyer l'alerte"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteSingleDoc(docItem.docId, docItem.fileName)}
                          disabled={deletingDocId === docItem.docId}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                          title="Supprimer ce document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL : PRÉVISUALISATION DIRECTE DES DOCUMENTS (PDF & IMAGES)            */}
      {/* ========================================================================= */}
      {previewDoc && (
        <Modal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.name}
          maxWidth="4xl"
          allowMaximize={true}
        >
          <div className="h-full flex-1 flex flex-col space-y-3 min-h-0">
            <div className="w-full flex-1 min-h-[68vh] bg-slate-900 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
              {previewDoc.extension === ".pdf" ? (
                <iframe
                  src={`/api/admin/exchanges/documents/${encodeURIComponent(previewDoc.id)}/download?action=preview`}
                  className="w-full h-full border-0"
                  title={previewDoc.name}
                />
              ) : [".png", ".jpg", ".jpeg"].includes(previewDoc.extension) ? (
                <img
                  src={`/api/admin/exchanges/documents/${encodeURIComponent(previewDoc.id)}/download?action=preview`}
                  alt={previewDoc.name}
                  className="max-h-full max-w-full object-contain p-4"
                />
              ) : (
                <div className="text-center p-8 text-white space-y-3">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                  <div className="text-sm font-semibold">
                    La prévisualisation directe n'est pas prise en charge pour ce type de fichier ({previewDoc.extension}).
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewDoc.id)}
                    className="px-4 py-2 rounded-xl bg-white text-[#062653] font-bold text-xs inline-flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger pour ouvrir sur votre poste
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1 shrink-0">
              <span className="font-semibold text-[#062653] truncate max-w-md">{previewDoc.name}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`/api/admin/exchanges/documents/${encodeURIComponent(previewDoc.id)}/download?action=preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-[#062653] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#FF7900]" />
                  Nouvel onglet
                </a>
                <button
                  type="button"
                  onClick={() => handleDownload(previewDoc.id)}
                  className="px-4 py-2 rounded-xl bg-[#062653] text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-[#031B3A] transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le fichier
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AdminExchangesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-slate-400 font-['Poppins',sans-serif]">
          Chargement du coffre-fort documentaire...
        </div>
      }
    >
      <ExchangesContent />
    </Suspense>
  );
}
