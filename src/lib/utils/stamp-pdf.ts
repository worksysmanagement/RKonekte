import { PDFDocument } from "pdf-lib";

export interface StampSignatureOptions {
  pdfDataUrlOrBytes: string | Uint8Array;
  signatureDataUrl: string;
  signerName: string;
  signerRole?: string;
  date?: string;
  xPercent?: number; // 0 to 100 (horizontal position from left)
  yPercent?: number; // 0 to 100 (vertical position from top)
  pageIndex?: number; // -1 for last page, or 0-indexed page
}

/**
 * Convertit un SVG ou une image en dataURL PNG via canvas si exécuté dans le navigateur.
 */
async function ensurePngSignature(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith("data:image/png;base64,")) {
    return dataUrl;
  }
  if (typeof window === "undefined") {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(img.naturalWidth || 320, 320);
      canvas.height = Math.max(img.naturalHeight || 120, 120);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function base64ToUint8Array(base64Str: string): Uint8Array {
  const clean = base64Str.includes("base64,") ? base64Str.split("base64,")[1] : base64Str;
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const binary = window.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  // Node.js fallback
  return new Uint8Array(Buffer.from(clean, "base64"));
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return window.btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

/**
 * Incruste physiquement la signature manuscrite et le visa d'approbation officiel
 * directement sur la feuille du document PDF aux coordonnées choisies par l'administrateur.
 */
export async function stampSignatureOnPdf({
  pdfDataUrlOrBytes,
  signatureDataUrl,
  signerName,
  signerRole,
  date,
  xPercent = 70,
  yPercent = 74.5,
  pageIndex = -1,
}: StampSignatureOptions): Promise<string> {
  // 1. Charger les octets du PDF
  const pdfBytes =
    typeof pdfDataUrlOrBytes === "string"
      ? base64ToUint8Array(pdfDataUrlOrBytes)
      : pdfDataUrlOrBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error("Le document PDF ne contient aucune page.");
  }

  // Cibler la page choisie (par défaut, la dernière page du document)
  const targetPageIdx =
    pageIndex < 0 ? Math.max(0, pages.length - 1) : Math.min(pageIndex, pages.length - 1);
  const page = pages[targetPageIdx];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // 2. Préparer l'image de la signature (en PNG transparent)
  const pngDataUrl = await ensurePngSignature(signatureDataUrl);
  const sigBytes = base64ToUint8Array(pngDataUrl);
  let pngImage;
  try {
    pngImage = await pdfDoc.embedPng(sigBytes);
  } catch (_) {
    // Si déjà JPEG ou autre format accepté
    try {
      pngImage = await pdfDoc.embedJpg(sigBytes);
    } catch (err) {
      console.warn("Impossible d'incorporer l'image de signature dans le PDF:", err);
    }
  }

  // 3. Incruster UNIQUEMENT l'image de signature manuscrite transparente (pure signature, sans gros cadre ni texte masquant)
  if (pngImage) {
    const maxImgWidth = 145; // Dimensions naturelles d'une signature sur document A4 (72 dpi)
    const maxImgHeight = 55;
    const dims = pngImage.scaleToFit(maxImgWidth, maxImgHeight);

    // Conversion des pourcentages (0-100) en coordonnées PDF
    // En PDF, l'origine (0,0) est en BAS À GAUCHE
    const targetX = Math.max(
      15,
      Math.min(pageWidth - dims.width - 15, (xPercent / 100) * pageWidth - dims.width / 2)
    );

    // yPercent part du haut de la page -> pdfY = pageHeight - (yPercent / 100 * pageHeight) - dims.height / 2
    const targetY = Math.max(
      15,
      Math.min(
        pageHeight - dims.height - 15,
        pageHeight - (yPercent / 100) * pageHeight - dims.height / 2
      )
    );

    page.drawImage(pngImage, {
      x: targetX,
      y: targetY,
      width: dims.width,
      height: dims.height,
    });
  }

  // 4. Sauvegarder le document PDF modifié
  const modifiedBytes = await pdfDoc.save();
  return `data:application/pdf;base64,${uint8ArrayToBase64(modifiedBytes)}`;
}
