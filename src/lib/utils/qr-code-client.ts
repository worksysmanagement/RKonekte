"use client";

import QRCode from "qrcode";

function sanitizeFileSlug(text: string): string {
  return (text || "succursale")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "succursale";
}

function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateQrPreviewDataUrl(
  targetUrl: string,
  width = 280
): Promise<string> {
  return QRCode.toDataURL(targetUrl, {
    width,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#031B3A",
      light: "#FFFFFF",
    },
  });
}

export async function generateQrSvgString(
  targetUrl: string,
  width = 512
): Promise<string> {
  return QRCode.toString(targetUrl, {
    type: "svg",
    width,
    margin: 3,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

export async function downloadQrSvg(targetUrl: string, branchName: string) {
  const svgString = await generateQrSvgString(targetUrl, 640);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const slug = sanitizeFileSlug(branchName);
  triggerFileDownload(blob, `qrcode-avis-${slug}.svg`);
}

export async function downloadQrPng(
  targetUrl: string,
  branchName: string,
  companyName?: string
) {
  const width = 1000;
  const height = 1190;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback to raw QR data URL download
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      width: 1000,
      margin: 4,
      errorCorrectionLevel: "H",
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    triggerFileDownload(blob, `qrcode-avis-${sanitizeFileSlug(branchName)}.png`);
    return;
  }

  // Clean white printable sheet background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Subtle top accent bar matching CMS navy branding
  ctx.fillStyle = "#062653";
  ctx.fillRect(0, 0, width, 16);

  // Render crisp high-resolution QR code onto offscreen canvas
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, targetUrl, {
    width: 820,
    margin: 2,
    errorCorrectionLevel: "H",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  const qrX = Math.round((width - qrCanvas.width) / 2);
  ctx.drawImage(qrCanvas, qrX, 72);

  // Print-ready footer text (Company + Branch)
  ctx.textAlign = "center";

  const orgLabel = (companyName || "").trim();
  if (orgLabel) {
    ctx.fillStyle = "#64748B";
    ctx.font = "600 26px sans-serif";
    ctx.fillText(orgLabel.toUpperCase(), width / 2, 955);
  }

  ctx.fillStyle = "#062653";
  ctx.font = "700 38px sans-serif";
  ctx.fillText(`Succursale : ${branchName}`, width / 2, orgLabel ? 1015 : 980);

  ctx.fillStyle = "#475569";
  ctx.font = "500 24px sans-serif";
  ctx.fillText(
    "Scannez ce QR Code pour partager votre expérience",
    width / 2,
    orgLabel ? 1075 : 1045
  );

  // Export PNG blob cleanly
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Échec de la génération de l'image PNG."));
    }, "image/png");
  });

  triggerFileDownload(blob, `qrcode-avis-${sanitizeFileSlug(branchName)}.png`);
}
