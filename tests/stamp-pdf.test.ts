import { describe, it, expect } from "vitest";
import { stampSignatureOnPdf } from "@/lib/utils/stamp-pdf";
import { SAMPLE_PDF_DATA_URL, SAMPLE_ADMIN_SIGNATURE } from "@/lib/services/signature-auth";

describe("PDF Signature Stamping Utility", () => {
  it("successfully stamps an official signature onto a PDF document", async () => {
    // 1x1 transparent PNG dataURL for reliable node testing
    const samplePng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const stampedPdfDataUrl = await stampSignatureOnPdf({
      pdfDataUrlOrBytes: SAMPLE_PDF_DATA_URL,
      signatureDataUrl: samplePng,
      signerName: "Rodjensky Emmanuel Piton",
      signerRole: "Direction Générale",
      date: "2026-10-24",
      xPercent: 70,
      yPercent: 80,
    });

    expect(stampedPdfDataUrl).toBeDefined();
    expect(stampedPdfDataUrl.startsWith("data:application/pdf;base64,")).toBe(true);
    expect(stampedPdfDataUrl.length).toBeGreaterThan(SAMPLE_PDF_DATA_URL.length);
  });
});
