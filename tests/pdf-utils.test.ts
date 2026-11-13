import { describe, it, expect, vi } from "vitest";
import {
  dataUrlToPdfBlob,
  openPdfFullscreen,
  downloadPdfDocument,
  printPdfDocument,
  sanitizePdfFileName,
  formatPdfDisplayTitle,
} from "@/lib/utils/pdf";

describe("PDF Utilities - Fullscreen & Blob Handling", () => {
  const SAMPLE_BASE64_PDF =
    "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFI+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDU1Pj5zdHJlYW0KQVQKL0YxIDI0IFRmCjEwMCA3NTAgVGQKKEF1dG9yaXNhdGlvbiBkZSBTaWduYXR1cmUgUktvbmVrdGUpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE4IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMjE5IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA1L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMzI1CiUlRU9G";

  it("converts a data:application/pdf base64 URL into a valid Blob", () => {
    const blob = dataUrlToPdfBlob(SAMPLE_BASE64_PDF);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(50);
  });

  it("handles openPdfFullscreen without crashing in Node/window environments", () => {
    // In Node (where window is undefined or mockable)
    expect(() => openPdfFullscreen(SAMPLE_BASE64_PDF, "Document Test")).not.toThrow();
  });

  it("handles downloadPdfDocument gracefully without throwing", () => {
    expect(() => downloadPdfDocument(SAMPLE_BASE64_PDF, "Test.pdf")).not.toThrow();
  });

  it("handles printPdfDocument gracefully without throwing", () => {
    expect(() => printPdfDocument(SAMPLE_BASE64_PDF, "Test.pdf")).not.toThrow();
  });

  it("preserves readable spaces, apostrophes and accents without underscores in filenames", () => {
    expect(
      sanitizePdfFileName("Demande d'autorisation de dépense et d'engagement de fonds", "pdf")
    ).toBe("Demande d'autorisation de dépense et d'engagement de fonds.pdf");
    expect(sanitizePdfFileName("Ordre_Virement_2026:test?.pdf", "pdf")).toBe(
      "Ordre Virement 2026 test.pdf"
    );
  });

  it("formats PDF header display titles cleanly without underscores and restores full title when available", () => {
    expect(
      formatPdfDisplayTitle(
        "Demande_d_autorisation_de_d_pense_et_d_engageme.pdf",
        "Demande d'autorisation de dépense et d'engagement de fonds"
      )
    ).toBe("Demande d'autorisation de dépense et d'engagement de fonds");

    expect(formatPdfDisplayTitle("Ordre_Virement_VIR-SOGE-2026-089.pdf")).toBe(
      "Ordre Virement VIR-SOGE-2026-089"
    );
  });
});
