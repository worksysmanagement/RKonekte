"use client";

import React, { useEffect, useState } from "react";
import {
  CreditCard,
  Download,
  FileText,
  Landmark,
  Smartphone,
  X,
} from "lucide-react";
import { PaymentAccountConfig } from "@/lib/utils/subscription";

export function PaymentAccountLogo({
  account,
  className = "w-14 h-12 sm:w-16 sm:h-12",
}: {
  account: Pick<PaymentAccountConfig, "id" | "label" | "logoUrl">;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [account.logoUrl]);

  if (account.logoUrl && !imgError) {
    return (
      <div
        className={`${className} rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1.5 shrink-0 shadow-2xs`}
      >
        <img
          src={account.logoUrl}
          alt={`Logo ${account.label}`}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const key = `${account.id} ${account.label}`.toLowerCase();
  if (key.includes("moncash")) {
    return (
      <div
        className={`${className} rounded-xl border border-rose-200 bg-rose-50 text-rose-600 flex items-center justify-center shrink-0`}
        title="MonCash"
      >
        <Smartphone className="w-5 h-5" />
      </div>
    );
  }
  if (key.includes("unibank")) {
    return (
      <div
        className={`${className} rounded-xl border border-amber-200 bg-amber-50 text-[#062653] flex items-center justify-center shrink-0`}
        title="Unibank"
      >
        <Landmark className="w-5 h-5" />
      </div>
    );
  }
  if (key.includes("sogebank")) {
    return (
      <div
        className={`${className} rounded-xl border border-sky-200 bg-sky-50 text-[#062653] flex items-center justify-center shrink-0`}
        title="Sogebank"
      >
        <Landmark className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div
      className={`${className} rounded-xl border border-slate-200 bg-slate-50 text-[#FF7900] flex items-center justify-center shrink-0`}
    >
      <CreditCard className="w-5 h-5" />
    </div>
  );
}

export async function readPaymentProofFile(
  file: File
): Promise<{ dataUrl: string; fileName: string }> {
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Le fichier ne doit pas dépasser 5 Mo.");
  }

  const nameLower = file.name.toLowerCase();
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(nameLower);
  const isPdf = file.type === "application/pdf" || nameLower.endsWith(".pdf");

  if (!isImage && !isPdf) {
    throw new Error(
      "Format non supporté. Veuillez importer une image (JPG, PNG, WEBP) ou un fichier PDF."
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Impossible de lire le fichier sélectionné."));
        return;
      }
      resolve({ dataUrl: result, fileName: file.name });
    };
    reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [header, base64] = dataUrl.split(",");
    if (!header || !base64) return null;
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch (_) {
    return null;
  }
}

export function triggerProofDownload(dataUrl: string, fileName?: string | null) {
  const blob = dataUrlToBlob(dataUrl);
  const ext = dataUrl.startsWith("data:application/pdf") ? "pdf" : "png";
  const resolvedName = fileName?.trim() || `preuve-paiement.${ext}`;

  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resolvedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return;
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = resolvedName;
  a.click();
}

export function ProofPreviewModal({
  isOpen,
  onClose,
  proofDataUrl,
  proofFileName,
  title = "Preuve de paiement",
}: {
  isOpen: boolean;
  onClose: () => void;
  proofDataUrl: string | null | undefined;
  proofFileName?: string | null;
  title?: string;
}) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const isPdf = Boolean(proofDataUrl?.startsWith("data:application/pdf"));

  useEffect(() => {
    if (!isOpen || !proofDataUrl || !isPdf) {
      setPdfBlobUrl(null);
      return;
    }
    const blob = dataUrlToBlob(proofDataUrl);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [isOpen, proofDataUrl, isPdf]);

  if (!isOpen || !proofDataUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-[#F8FAFC]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#FF7900] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#062653] truncate">{title}</div>
              {proofFileName && (
                <div className="text-[11px] text-[#64748B] truncate">{proofFileName}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => triggerProofDownload(proofDataUrl, proofFileName)}
              className="px-3 py-1.5 rounded-lg bg-[#062653] hover:bg-[#031B3A] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Télécharger</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-100 flex-1 overflow-auto flex items-center justify-center min-h-[320px]">
          {isPdf ? (
            pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title={proofFileName || "Preuve PDF"}
                className="w-full h-[65vh] rounded-lg bg-white border border-slate-200"
              />
            ) : (
              <div className="text-xs text-slate-500">Chargement du PDF...</div>
            )
          ) : (
            <img
              src={proofDataUrl}
              alt={proofFileName || "Preuve de paiement"}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
