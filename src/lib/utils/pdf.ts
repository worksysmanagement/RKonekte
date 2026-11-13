import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function generateLeaveRequestPdfBlob(
  element: HTMLElement,
  fileName: string
): Promise<{ blob: Blob; file: File; dataUrl: string }> {
  // Capture high-res canvas (2x DPI)
  const canvas = await html2canvas(element, {
    scale: 2, // 2x DPI for ultra-crisp typography & signatures
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: 1200,
    onclone: (clonedDoc, clonedElement) => {
      // 1. Remove all outer shadows, outer borders, and outer rounded corners to eliminate all side traces
      clonedElement.style.boxShadow = "none";
      clonedElement.style.filter = "none";
      clonedElement.style.border = "none";
      clonedElement.style.borderRadius = "0px";
      clonedElement.style.backgroundColor = "#ffffff";
      clonedElement.style.width = "820px";
      clonedElement.style.maxWidth = "820px";
      clonedElement.style.minWidth = "820px";
      clonedElement.style.padding = "20px 28px";
      clonedElement.style.margin = "0 auto";

      // 2. Force 100% solid navy blue headers with white text (#062653)
      const navyHeaders = clonedDoc.querySelectorAll<HTMLElement>(
        '[data-pdf-navy-header="true"], .bg-\\[\\#062653\\]'
      );
      navyHeaders.forEach((el) => {
        el.style.backgroundColor = "#062653";
        el.style.color = "#ffffff";
        el.style.setProperty("background-color", "#062653", "important");
        el.style.setProperty("color", "#ffffff", "important");
      });

      // 3. Force Section III signatures container to strict 2 columns side-by-side
      const sigContainers = clonedDoc.querySelectorAll<HTMLElement>(
        '[data-pdf-signatures="true"]'
      );
      sigContainers.forEach((el) => {
        el.style.display = "grid";
        el.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        el.style.gap = "16px";
        el.style.setProperty("display", "grid", "important");
        el.style.setProperty("grid-template-columns", "repeat(2, minmax(0, 1fr))", "important");
      });

      // 4. Force table rows to keep multi-column structure without collapsing
      const grid2Els = clonedDoc.querySelectorAll<HTMLElement>(".grid-cols-2");
      grid2Els.forEach((el) => {
        el.style.display = "grid";
        el.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
        el.style.setProperty("display", "grid", "important");
        el.style.setProperty("grid-template-columns", "repeat(2, minmax(0, 1fr))", "important");
      });

      const grid3Els = clonedDoc.querySelectorAll<HTMLElement>(".grid-cols-3");
      grid3Els.forEach((el) => {
        el.style.display = "grid";
        el.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
        el.style.setProperty("display", "grid", "important");
        el.style.setProperty("grid-template-columns", "repeat(3, minmax(0, 1fr))", "important");
      });

      // 5. Remove any drop shadows from all child elements in the document
      const shadowed = clonedDoc.querySelectorAll<HTMLElement>(
        ".shadow-2xl, .shadow-xl, .shadow-lg, .shadow-md, .shadow-sm, .shadow-xs, .shadow-2xs, .shadow"
      );
      shadowed.forEach((el) => {
        el.style.boxShadow = "none";
      });
    },
  });

  const imgData = canvas.toDataURL("image/png");

  // Standard A4: 210mm x 297mm
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const contentHeight = (canvas.height * availableWidth) / canvas.width;

  if (contentHeight <= availableHeight) {
    pdf.addImage(imgData, "PNG", margin, margin, availableWidth, contentHeight);
  } else {
    // If it exceeds one page slightly, scale to fit single A4 cleanly
    const scale = availableHeight / contentHeight;
    const finalWidth = availableWidth * scale;
    const finalHeight = contentHeight * scale;
    const xOffset = (pageWidth - finalWidth) / 2;
    const yOffset = (pageHeight - finalHeight) / 2;
    pdf.addImage(imgData, "PNG", xOffset, yOffset, finalWidth, finalHeight);
  }

  const blob = pdf.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });
  return { blob, file, dataUrl: imgData };
}

export async function generateSalaryRevisionPdfBlob(
  element: HTMLElement,
  fileName: string
): Promise<{ blob: Blob; file: File; dataUrl: string }> {
  // Capture high-res canvas (2x DPI)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: 1000,
    onclone: (clonedDoc, clonedElement) => {
      clonedElement.style.boxShadow = "none";
      clonedElement.style.filter = "none";
      clonedElement.style.border = "none";
      clonedElement.style.borderRadius = "0px";
      clonedElement.style.backgroundColor = "#ffffff";
      clonedElement.style.width = "800px";
      clonedElement.style.maxWidth = "800px";
      clonedElement.style.minWidth = "800px";
      clonedElement.style.padding = "36px 44px";
      clonedElement.style.margin = "0 auto";
    },
  });

  const imgData = canvas.toDataURL("image/png");

  // Standard A4: 210mm x 297mm
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 8;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const contentHeight = (canvas.height * availableWidth) / canvas.width;

  if (contentHeight <= availableHeight) {
    pdf.addImage(imgData, "PNG", margin, margin, availableWidth, contentHeight);
  } else {
    const scale = availableHeight / contentHeight;
    const finalWidth = availableWidth * scale;
    const finalHeight = contentHeight * scale;
    const xOffset = (pageWidth - finalWidth) / 2;
    const yOffset = (pageHeight - finalHeight) / 2;
    pdf.addImage(imgData, "PNG", xOffset, yOffset, finalWidth, finalHeight);
  }

  const blob = pdf.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });
  return { blob, file, dataUrl: imgData };
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Nettoie un titre de document en nom de fichier lisible avec des espaces normaux
 * (sans remplacer les espaces, apostrophes ou accents par des "_").
 */
export function sanitizePdfFileName(
  rawTitle?: string | null,
  extension: string = "pdf",
  fallback: string = "Document d'autorisation"
): string {
  const extClean = extension.replace(/^\.+/, "").trim();
  const baseInput = (rawTitle || "").trim();
  const withoutExt = extClean
    ? baseInput.replace(new RegExp(`\\.${extClean}$`, "i"), "")
    : baseInput.replace(/\.(pdf|docx?)$/i, "");

  let cleaned = withoutExt
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");

  if (!cleaned) {
    cleaned = fallback;
  }

  if (cleaned.length > 100) {
    const sliced = cleaned.slice(0, 100);
    const lastSpace = sliced.lastIndexOf(" ");
    cleaned = (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim();
  }

  return extClean ? `${cleaned}.${extClean}` : cleaned;
}

/**
 * Formate un titre lisible pour l'en-tête d'aperçu PDF en supprimant les "_"
 * hérités d'anciens noms de fichiers et en privilégiant le titre d'origine complet.
 */
export function formatPdfDisplayTitle(
  fileName?: string | null,
  description?: string | null
): string {
  const rawFile = (fileName || "").trim();
  const withoutExt = rawFile.replace(/\.(pdf|docx?)$/i, "");
  const cleanedFromFile = withoutExt
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const desc = (description || "").trim();
  if (desc && !desc.includes("_") && rawFile.includes("_")) {
    const normalizeAscii = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const fileTokens = normalizeAscii(cleanedFromFile)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    const normDesc = normalizeAscii(desc);

    if (
      fileTokens.length >= 2 &&
      fileTokens.slice(0, 3).every((tok) => normDesc.includes(tok))
    ) {
      return desc;
    }
  }

  return cleanedFromFile || desc || "Document officiel";
}

/**
 * Imprime directement un document PDF (Blob, URL ou DataURL base64)
 * de façon compatible et réactive sans bloquer l'interface ni imprimer la page web.
 */
export function printPdfDocument(pdfUrlOrBlob: string | Blob, title: string = "Document PDF") {
  if (typeof window === "undefined") return;

  try {
    let blobUrl = "";
    let shouldRevoke = false;

    if (typeof pdfUrlOrBlob === "string") {
      if (pdfUrlOrBlob.startsWith("data:")) {
        const blob = dataUrlToPdfBlob(pdfUrlOrBlob);
        blobUrl = URL.createObjectURL(blob);
        shouldRevoke = true;
      } else {
        blobUrl = pdfUrlOrBlob;
      }
    } else if (pdfUrlOrBlob instanceof Blob) {
      blobUrl = URL.createObjectURL(pdfUrlOrBlob);
      shouldRevoke = true;
    } else {
      blobUrl = String(pdfUrlOrBlob);
    }

    const cleanTitle = formatPdfDisplayTitle(title) || "Document PDF";
    const escapedTitle = cleanTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Ouvrir un onglet / fenêtre dédié exclusivement au document PDF avec déclenchement d'impression natif
    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="fr" style="height:100%;margin:0;padding:0;overflow:hidden;">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapedTitle}</title>
            <style>
              @page { size: A4 portrait; margin: 0; }
              html, body {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: #525659;
              }
              iframe {
                width: 100%;
                height: 100%;
                border: none;
                display: block;
                background-color: #ffffff;
              }
              @media print {
                html, body {
                  background-color: #ffffff;
                  width: 210mm;
                  height: 297mm;
                }
                iframe {
                  width: 100%;
                  height: 100%;
                }
              }
            </style>
          </head>
          <body>
            <iframe id="pdfPrintFrame" src="${blobUrl}" type="application/pdf" width="100%" height="100%"></iframe>
            <script>
              const frame = document.getElementById('pdfPrintFrame');
              let printed = false;
              function doPrint() {
                if (printed) return;
                printed = true;
                try {
                  frame.contentWindow.focus();
                  frame.contentWindow.print();
                } catch (e) {
                  try {
                    window.focus();
                    window.print();
                  } catch (_) {}
                }
              }
              frame.onload = function() {
                setTimeout(doPrint, 500);
              };
              // Déclencheur de sécurité si le plugin PDF ne déclenche pas onload
              setTimeout(doPrint, 1500);
            </script>
          </body>
        </html>
      `);
      printWin.document.close();
    } else {
      // Si la fenêtre pop-up a été interceptée, ouvrir le lien blob directement
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    if (shouldRevoke) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 300000); // 5 minutes
    }
  } catch (err) {
    console.error("Erreur lors du lancement de l'impression PDF:", err);
  }
}

/**
 * Convertit une URL de données (data:application/pdf;base64) en Blob PDF natif.
 */
export function dataUrlToPdfBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const base64Data = parts[1] || parts[0];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

/**
 * Ouvre un document PDF (Blob, URL ou DataURL base64) en plein écran dans un nouvel onglet
 * de manière 100% compatible avec les restrictions de sécurité Chromium/Edge/Firefox
 * (qui bloquent la navigation directe vers les URLs data:application/pdf).
 */
export function openPdfFullscreen(pdfUrlOrBlob: string | Blob, title: string = "Document PDF") {
  if (typeof window === "undefined") return;

  try {
    let blobUrl = "";
    let shouldRevoke = false;

    if (typeof pdfUrlOrBlob === "string") {
      if (pdfUrlOrBlob.startsWith("data:")) {
        const blob = dataUrlToPdfBlob(pdfUrlOrBlob);
        blobUrl = URL.createObjectURL(blob);
        shouldRevoke = true;
      } else {
        blobUrl = pdfUrlOrBlob;
      }
    } else {
      blobUrl = URL.createObjectURL(pdfUrlOrBlob);
      shouldRevoke = true;
    }

    const cleanTitle = formatPdfDisplayTitle(title) || "Document PDF";
    const escapedTitle = cleanTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 1. Essayer d'ouvrir un nouvel onglet avec document HTML dédié
    const newWindow = window.open("", "_blank");

    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="fr" style="height:100%;margin:0;padding:0;overflow:hidden;">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapedTitle}</title>
            <style>
              html, body {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                background-color: #323639;
                overflow: hidden;
              }
              iframe, embed, object {
                width: 100%;
                height: 100%;
                border: none;
                display: block;
              }
            </style>
          </head>
          <body>
            <iframe
              src="${blobUrl}"
              type="application/pdf"
              width="100%"
              height="100%"
              allow="fullscreen"
              title="${escapedTitle}"
            ></iframe>
          </body>
        </html>
      `);
      newWindow.document.close();
    } else {
      // 2. Si le bloqueur a intercepté, simuler un clic avec target="_blank" sur l'URL Blob (jamais bloquée)
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Révoquer l'URL blob après 15 minutes pour libérer la mémoire du navigateur sans couper l'onglet
    if (shouldRevoke) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 900000);
    }
  } catch (err) {
    console.error("Erreur lors de l'ouverture du PDF en plein écran:", err);
  }
}

/**
 * Télécharge un document PDF (Blob, URL ou DataURL base64) de manière sécurisée
 * sans risquer d'excéder la limite de taille d'URL de données de Chromium.
 */
export function downloadPdfDocument(pdfUrlOrBlob: string | Blob, fileName: string) {
  if (typeof window === "undefined") return;

  try {
    const cleanFileName = sanitizePdfFileName(fileName, "pdf", "Document officiel");
    if (typeof pdfUrlOrBlob === "string" && pdfUrlOrBlob.startsWith("data:")) {
      const blob = dataUrlToPdfBlob(pdfUrlOrBlob);
      downloadPdfBlob(blob, cleanFileName);
    } else if (pdfUrlOrBlob instanceof Blob) {
      downloadPdfBlob(pdfUrlOrBlob, cleanFileName);
    } else {
      const a = document.createElement("a");
      a.href = pdfUrlOrBlob;
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    console.error("Erreur lors du téléchargement du PDF:", err);
  }
}
