"use client";

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Table,
  Minus,
  Calendar,
  Undo2,
  Redo2,
  Eraser,
  Save,
  Download,
  FileText,
  FileDown,
  Printer,
  RotateCcw,
  CheckCircle2,
  Type,
  Palette,
  Highlighter,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Clock,
  Building2,
  User,
  SlidersHorizontal,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { showSystemToast } from "@/components/ui/SystemToast";
import { printPdfDocument } from "@/lib/utils/pdf";

export interface WordDocumentEditorRef {
  generatePdfDataUrl: () => Promise<{ dataUrl: string; fileName: string; fileSize: string }>;
  getTitle: () => string;
  getContentHtml: () => string;
  getPlainText: () => string;
  saveDraft: () => void;
  resetDocument: () => void;
}

interface WordDocumentEditorProps {
  companyName?: string;
  companyLogo?: string | null;
  employeeName?: string;
  employeeRole?: string;
  employeeNumber?: string;
  branch?: string;
  onContentChange?: (html: string, plainText: string, wordCount: number) => void;
  onTitleChange?: (title: string) => void;
  initialTitle?: string;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "rkonekte_signature_word_draft";

export const WordDocumentEditor = forwardRef<WordDocumentEditorRef, WordDocumentEditorProps>(
  (
    {
      companyName = "e-biznis",
      companyLogo = null,
      employeeName = "Collaborateur",
      employeeRole = "Collaborateur",
      employeeNumber = "COLLAB",
      branch = "",
      onContentChange,
      onTitleChange,
      initialTitle = "",
      storageKey = DEFAULT_STORAGE_KEY,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const paperRef = useRef<HTMLDivElement | null>(null);

    const [documentTitle, setDocumentTitle] = useState(
      initialTitle || "Demande d'autorisation de dépense et d'engagement de fonds"
    );
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(100);
    const [selectedFont, setSelectedFont] = useState<string>("Calibri, sans-serif");
    const [showFontPicker, setShowFontPicker] = useState<boolean>(false);
    const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
    const [showHighlightPicker, setShowHighlightPicker] = useState<boolean>(false);
    const [showOptionsSidebar, setShowOptionsSidebar] = useState<boolean>(false);
    const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
    const [hasUnsavedDraft, setHasUnsavedDraft] = useState<boolean>(false);

    // Track active states of formatting buttons (Gras, Italique, Alignements...)
    const [editorFormatState, setEditorFormatState] = useState({
      bold: false,
      italic: false,
      underline: false,
      strikeThrough: false,
      justifyLeft: false,
      justifyCenter: false,
      justifyRight: false,
      justifyFull: false,
      insertUnorderedList: false,
      insertOrderedList: false,
    });

    const AVAILABLE_FONTS = [
      { label: "Calibri (Standard)", value: "Calibri, sans-serif" },
      { label: "Arial", value: "Arial, sans-serif" },
      { label: "Times New Roman", value: "'Times New Roman', serif" },
      { label: "Georgia", value: "Georgia, serif" },
      { label: "Courier New", value: "'Courier New', monospace" },
      { label: "Inter", value: "Inter, sans-serif" },
      { label: "Verdana", value: "Verdana, sans-serif" },
      { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
    ];

    // Close popups on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-font-picker]")) {
          setShowFontPicker(false);
        }
        if (!target.closest("[data-color-picker]")) {
          setShowColorPicker(false);
        }
        if (!target.closest("[data-highlight-picker]")) {
          setShowHighlightPicker(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Shortcuts: Escape to close sidebar, Ctrl+S to save draft
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && showOptionsSidebar) {
          setShowOptionsSidebar(false);
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveDraft(true);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showOptionsSidebar, documentTitle, storageKey]);

    // Formatted current date string
    const todayFormatted = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const currentYear = new Date().getFullYear();

    // Default template builders
    const getExpenseTemplate = () => `
      <p><strong>DESTINATAIRE :</strong> Direction Générale / Direction Financière</p>
      <p><strong>EXPÉDITEUR :</strong> ${employeeName} (${employeeRole} — ${branch})</p>
      <p><strong>DATE :</strong> ${todayFormatted}</p>
      <hr style="border: 0; border-top: 1.5px solid #cbd5e1; margin: 16px 0;" />
      <p><strong>OBJET : Demande d'autorisation de dépense et d'engagement de fonds</strong></p>
      <p><br></p>
      <p>Monsieur le Directeur,</p>
      <p>Par la présente, je sollicite respectueusement votre autorisation préalable pour l'engagement de la dépense suivante, indispensable à la poursuite et à l'efficacité opérationnelle de notre service :</p>
      <p><br></p>
      <table style="width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 11pt;">
        <thead>
          <tr style="background-color: #062653; color: #ffffff;">
            <th style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left;">Désignation / Fourniture / Service</th>
            <th style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: center; width: 90px;">Quantité</th>
            <th style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; width: 130px;">P.U. Estimé</th>
            <th style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; width: 140px;">Total Estimé</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px;">Matériel bureautique / Licences logicielles</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: center;">1 lot</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: right;">—</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: right; font-weight: bold;">—</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px;">Prestation d'assistance / Intervention technique</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: center;">1 forfait</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: right;">—</td>
            <td style="border: 1px solid #cbd5e1; padding: 9px 12px; text-align: right; font-weight: bold;">—</td>
          </tr>
          <tr style="background-color: #f8fafc; font-weight: bold;">
            <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; color: #062653;">TOTAL GÉNÉRAL ESTIMÉ :</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: right; color: #062653;">À valider</td>
          </tr>
        </tbody>
      </table>
      <p><br></p>
      <p><strong>Justification du besoin & bénéfices attendus :</strong></p>
      <p>Cette dépense s'inscrit directement dans les priorités du service afin d'assurer la continuité des livrables sans interruption de service.</p>
      <p><br></p>
      <p>Comptant sur votre bienveillance et restant à votre entière disposition pour tout complément d'information, je vous prie d'agréer, Monsieur le Directeur, l'expression de mes salutations distinguées.</p>
    `;

    // Initialize content from storage or start blank
    useEffect(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.html && editorRef.current) {
            // Si le brouillon sauvegardé correspondait à l'ancien gabarit pré-rempli, le purger
            if (
              parsed.html.includes("Matériel bureautique / Licences logicielles") ||
              parsed.html.includes("Prestation d'assistance / Intervention technique")
            ) {
              localStorage.removeItem(storageKey);
            } else {
              editorRef.current.innerHTML = parsed.html;
              if (parsed.title) setDocumentTitle(parsed.title);
              updateCounters();
              setHasUnsavedDraft(false);
              return;
            }
          }
        }
      } catch (_) {}

      // Document complètement vierge à l'arrivée
      if (editorRef.current) {
        editorRef.current.innerHTML = "<p><br></p>";
        updateCounters();
      }
    }, [storageKey]);

    // Track word and char counts
    const updateCounters = () => {
      if (!editorRef.current) return;
      const text = editorRef.current.innerText || "";
      const trimmed = text.trim();
      const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      setWordCount(words);
      setCharCount(text.length);

      if (onContentChange) {
        onContentChange(editorRef.current.innerHTML, text, words);
      }
    };

    // Auto-save debounced to localStorage
    useEffect(() => {
      const timer = setTimeout(() => {
        saveDraft(false);
      }, 2000);
      return () => clearTimeout(timer);
    }, [documentTitle, wordCount, charCount]);

    const saveDraft = (showToast = true) => {
      if (!editorRef.current) return;
      const html = editorRef.current.innerHTML;
      const now = new Date();
      const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      const payload = {
        title: documentTitle,
        html,
        updatedAt: now.toISOString(),
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
        if (showToast) {
          setLastSavedTime(timeStr);
          showSystemToast(`Brouillon enregistré avec succès à ${timeStr} !`);
        }
        setHasUnsavedDraft(false);
      } catch (err) {
        if (showToast) {
          showSystemToast("Impossible d'enregistrer le brouillon localement.", "error");
        }
      }
    };

    const resetDocument = () => {
      if (
        !confirm(
          "Voulez-vous réinitialiser le document actuel ? Toutes les modifications non enregistrées seront effacées."
        )
      ) {
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch (_) {}
      if (editorRef.current) {
        editorRef.current.innerHTML = "<p><br></p>";
        setDocumentTitle(initialTitle || "");
        updateCounters();
        setLastSavedTime(null);
        setHasUnsavedDraft(false);
        showSystemToast("Document réinitialisé (vierge).");
      }
    };

    // Query and update button active states (Gras, Italique, Alignements...)
    const updateActiveStates = () => {
      if (typeof document === "undefined") return;
      try {
        setEditorFormatState({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"),
          strikeThrough: document.queryCommandState("strikeThrough"),
          justifyLeft: document.queryCommandState("justifyLeft"),
          justifyCenter: document.queryCommandState("justifyCenter"),
          justifyRight: document.queryCommandState("justifyRight"),
          justifyFull: document.queryCommandState("justifyFull"),
          insertUnorderedList: document.queryCommandState("insertUnorderedList"),
          insertOrderedList: document.queryCommandState("insertOrderedList"),
        });
      } catch (_) {}
    };

    // Ensure editor has active selection / caret before formatting
    const ensureFocusInEditor = () => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current.contains(sel.anchorNode)) {
        editorRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    };

    // Insert arbitrary HTML at current caret position or append cleanly
    const insertHtmlAtCaret = (html: string) => {
      ensureFocusInEditor();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const el = document.createElement("div");
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node: ChildNode | null = null;
        let lastNode: ChildNode | null = null;
        while ((node = el.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        if (lastNode) {
          const newRange = range.cloneRange();
          newRange.setStartAfter(lastNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      } else if (editorRef.current) {
        editorRef.current.innerHTML += html;
      }
      updateCounters();
      updateActiveStates();
    };

    // Apply selected font family to selected text or whole editor
    const applyFont = (fontValue: string) => {
      setSelectedFont(fontValue);
      setShowFontPicker(false);
      ensureFocusInEditor();

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        document.execCommand("styleWithCSS", false, "true");
        document.execCommand("fontName", false, fontValue);

        // Standardize any <font face="..."> to <span style="font-family: ...">
        if (editorRef.current) {
          const fontTags = editorRef.current.querySelectorAll("font[face]");
          fontTags.forEach((el) => {
            const face = el.getAttribute("face");
            const span = document.createElement("span");
            span.style.fontFamily = face || fontValue;
            span.innerHTML = el.innerHTML;
            el.parentNode?.replaceChild(span, el);
          });
        }
      } else if (editorRef.current) {
        editorRef.current.style.fontFamily = fontValue;
      }
      updateCounters();
      updateActiveStates();
    };

    // Text formatting actions via execCommand with cross-browser compatibility
    const format = (command: string, value: string | undefined = undefined) => {
      ensureFocusInEditor();
      if (command === "hiliteColor") {
        if (!document.execCommand("hiliteColor", false, value)) {
          document.execCommand("backColor", false, value);
        }
      } else {
        document.execCommand(command, false, value);
      }
      updateCounters();
      updateActiveStates();
    };

    // Clear formatting
    const clearFormatting = () => {
      ensureFocusInEditor();
      document.execCommand("removeFormat", false);
      document.execCommand("unlink", false);
      updateCounters();
      updateActiveStates();
    };

    const insertTable = () => {
      const tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt;">
          <thead>
            <tr style="background-color: #062653; color: #ffffff;">
              <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left;">Article / Désignation</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center; width: 100px;">Quantité</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right; width: 140px;">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Élément 1</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center;">1</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">0,00</td>
            </tr>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px;">Élément 2</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center;">1</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">0,00</td>
            </tr>
          </tbody>
        </table>
        <p><br></p>
      `;
      insertHtmlAtCaret(tableHtml);
    };

    const insertDateStamp = () => {
      insertHtmlAtCaret(`<strong>${todayFormatted}</strong> `);
    };

    const insertDivider = () => {
      insertHtmlAtCaret(`<hr style="border: 0; border-top: 1.5px solid #cbd5e1; margin: 16px 0;" /><p><br></p>`);
    };

    // Download document as Microsoft Word (.doc)
    const exportToWordDoc = () => {
      if (!editorRef.current) return;
      const contentHtml = editorRef.current.innerHTML;
      const sanitizedFileName = (documentTitle || "Document_Autorisation")
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .substring(0, 50);

      const header = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office'
              xmlns:w='urn:schemas-microsoft-com:office:word'
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${documentTitle}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 2.5cm 2cm 2.5cm 2cm;
            }
            body {
              font-family: Calibri, Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.5;
              color: #1e293b;
            }
            h1, h2, h3 { color: #062653; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin: 14px 0; }
            th { background-color: #062653; color: white; padding: 8px 10px; border: 1px solid #94a3b8; }
            td { padding: 8px 10px; border: 1px solid #cbd5e1; }
            hr { border: 0; border-top: 1.5px solid #cbd5e1; margin: 16px 0; }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 16px 0; color: #062653; text-transform: uppercase;">
              OBJET : ${documentTitle}
            </h3>
            ${contentHtml}
          </div>

          <div style="margin-top: 48px; border-top: 1px solid #cbd5e1; padding-top: 20px;">
            <table style="width: 100%; border: none;">
              <tr>
                <td style="width: 50%; border: 1px solid #e2e8f0; padding: 12px; vertical-align: top;">
                  <div style="font-size: 9pt; font-weight: bold; color: #64748b; text-transform: uppercase;">Demandeur :</div>
                  <div style="font-weight: bold; color: #062653; margin-top: 4px;">${employeeName}</div>
                  <div style="font-size: 9pt; color: #64748b;">${employeeRole} (${employeeNumber})</div>
                </td>
                <td style="width: 50%; border: 1px dashed #cbd5e1; padding: 12px; vertical-align: top; background-color: #ffffff; min-height: 120px;">
                  <div style="font-size: 9pt; font-weight: bold; color: #062653; text-transform: uppercase;">Signature de l'Administration :</div>
                  <div style="height: 70px;">&nbsp;</div>
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `;

      const blob = new Blob([header], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizedFileName}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSystemToast(`Document Word exporté avec succès ("${sanitizedFileName}.doc") !`);
    };

    // Generate high-resolution PDF Blob & DataUrl
    const generatePdf = async (): Promise<{ blob: Blob; dataUrl: string; fileName: string; fileSize: string }> => {
      if (!paperRef.current) {
        throw new Error("Feuille introuvable.");
      }

      const paperEl = paperRef.current;
      const sanitizedFileName = (documentTitle || "Document_Autorisation")
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .substring(0, 50);
      const finalFileName = `${sanitizedFileName}.pdf`;

      // Render high-res canvas at 2x scale
      const canvas = await html2canvas(paperEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 1200,
        onclone: (clonedDoc, clonedEl) => {
          clonedEl.style.boxShadow = "none";
          clonedEl.style.border = "none";
          clonedEl.style.borderRadius = "0px";
          clonedEl.style.width = "794px";
          clonedEl.style.maxWidth = "794px";
          clonedEl.style.minWidth = "794px";
          clonedEl.style.padding = "48px 56px";
          clonedEl.style.transform = "none";
        },
      });

      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;

      const contentHeight = (canvas.height * availableWidth) / canvas.width;

      if (contentHeight <= availableHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, availableWidth, contentHeight);
      } else {
        // Multi-page slicing if content is long
        let position = 0;
        let heightLeft = contentHeight;

        while (heightLeft > 0) {
          pdf.addImage(imgData, "PNG", margin, margin - position, availableWidth, contentHeight);
          heightLeft -= availableHeight;
          position += availableHeight;
          if (heightLeft > 0) {
            pdf.addPage();
          }
        }
      }

      const blob = pdf.output("blob");
      const dataUrl = pdf.output("datauristring");
      const sizeBytes = blob.size;
      const fileSize =
        sizeBytes < 1024 * 1024
          ? (sizeBytes / 1024).toFixed(1) + " Ko"
          : (sizeBytes / (1024 * 1024)).toFixed(2) + " Mo";

      return { blob, dataUrl, fileName: finalFileName, fileSize };
    };

    // Download PDF directly for user
    const downloadPdf = async () => {
      setIsExportingPdf(true);
      try {
        const { blob, fileName } = await generatePdf();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSystemToast(`Document PDF téléchargé avec succès ("${fileName}") !`);
      } catch (err) {
        console.error("Erreur téléchargement PDF:", err);
        showSystemToast("Erreur lors de la génération du PDF.", "error");
      } finally {
        setIsExportingPdf(false);
      }
    };

    // Browser Print Preview using high-definition PDF
    const handlePrint = async () => {
      try {
        const { blob, fileName } = await generatePdf();
        printPdfDocument(blob, fileName);
      } catch (err) {
        console.error("Erreur téléchargement/impression PDF:", err);
        showSystemToast("Erreur lors de la préparation de l'impression.", "error");
      }
    };

    // Expose methods to parent component (EmployeeSignatureAuthView)
    useImperativeHandle(ref, () => ({
      generatePdfDataUrl: async () => {
        const res = await generatePdf();
        return {
          dataUrl: res.dataUrl,
          fileName: res.fileName,
          fileSize: res.fileSize,
        };
      },
      getTitle: () => documentTitle,
      getContentHtml: () => editorRef.current?.innerHTML || "",
      getPlainText: () => editorRef.current?.innerText || "",
      saveDraft: () => saveDraft(true),
      resetDocument,
    }));

    // Color palettes
    const TEXT_COLORS = [
      { label: "Noir texte", value: "#0f172a" },
      { label: "Bleu marine officiel", value: "#062653" },
      { label: "Gris anthracite", value: "#475569" },
      { label: "Bordeaux", value: "#991b1b" },
      { label: "Vert forêt", value: "#065f46" },
      { label: "Orange corporate", value: "#c2410c" },
    ];

    const HIGHLIGHT_COLORS = [
      { label: "Aucun", value: "transparent" },
      { label: "Jaune doux", value: "#fef08a" },
      { label: "Vert menthe", value: "#bbf7d0" },
      { label: "Bleu pastel", value: "#bfdbfe" },
      { label: "Rose clair", value: "#fbcfe8" },
      { label: "Orange doux", value: "#fed7aa" },
    ];

    return (
      <div className="relative border border-slate-300 rounded-2xl bg-slate-100 shadow-md overflow-hidden flex flex-col">
        {/* ========================================================================= */}
        {/* WORD RIBBON TOOLBAR (Gras, Italique, Polices, Alignement, Puces...)        */}
        {/* ========================================================================= */}
        <div className="bg-white border-b border-slate-200 px-3 py-2 flex flex-wrap items-center gap-1.5 text-slate-700 text-xs shadow-2xs select-none">
          {/* 0. BOUTON OPTIONS À GAUCHE AU COIN (Ouvre la sidebar) */}
          <div className="flex items-center border-r border-slate-200 pr-2.5 mr-0.5">
            <button
              type="button"
              onClick={() => setShowOptionsSidebar(true)}
              className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 active:bg-neutral-900 text-white text-xs font-bold rounded-xl transition-all shadow-xs hover:shadow-md active:scale-95 cursor-pointer"
              title="Ouvrir les options du document (Sauvegarde, Téléchargements, Impression...)"
            >
              Options
            </button>
          </div>

          {/* Historique : Undo / Redo */}
          <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("undo");
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Annuler (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("redo");
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
              title="Rétablir (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Menu Police de caractères personnalisée (garde la sélection de texte active) */}
          <div className="relative border-r border-slate-200 pr-2" data-font-picker="true">
            <button
              type="button"
              onMouseDown={(e) => {
                // IMPORTANT: preventDefault empêche le blur de contentEditable afin de garder le texte sélectionné !
                e.preventDefault();
                setShowFontPicker(!showFontPicker);
                setShowColorPicker(false);
                setShowHighlightPicker(false);
              }}
              className="h-8 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              title="Changer la police d'écriture"
            >
              <Type className="w-3.5 h-3.5 text-slate-500" />
              <span className="truncate max-w-[110px]">
                {AVAILABLE_FONTS.find((f) => f.value === selectedFont)?.label || "Calibri"}
              </span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showFontPicker ? "rotate-180" : ""}`} />
            </button>

            {showFontPicker && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Polices de caractères
                </div>
                {AVAILABLE_FONTS.map((font) => (
                  <button
                    key={font.value}
                    type="button"
                    onMouseDown={(e) => {
                      // IMPORTANT: preventDefault pour garder la sélection active au moment du clic
                      e.preventDefault();
                      applyFont(font.value);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between cursor-pointer ${
                      selectedFont === font.value
                        ? "bg-blue-50 text-[#062653] font-bold"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                    style={{ fontFamily: font.value }}
                  >
                    <span>{font.label}</span>
                    {selectedFont === font.value && (
                      <span className="text-blue-600 font-bold text-xs">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Gras, Italique, Souligné, Barré */}
          <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("bold");
              }}
              className={`p-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                editorFormatState.bold
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-extrabold"
                  : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Gras (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("italic");
              }}
              className={`p-1.5 rounded-lg italic transition-all cursor-pointer ${
                editorFormatState.italic
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Italique (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("underline");
              }}
              className={`p-1.5 rounded-lg underline transition-all cursor-pointer ${
                editorFormatState.underline
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Souligné (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("strikeThrough");
              }}
              className={`p-1.5 rounded-lg line-through transition-all cursor-pointer ${
                editorFormatState.strikeThrough
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-800 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Barré"
            >
              <Strikethrough className="w-4 h-4" />
            </button>
          </div>

          {/* Couleur de texte & Surlignage */}
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2 relative">
            {/* Couleur texte */}
            <div className="relative" data-color-picker="true">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowColorPicker(!showColorPicker);
                  setShowHighlightPicker(false);
                  setShowFontPicker(false);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-slate-700 transition-all cursor-pointer"
                title="Couleur du texte"
              >
                <Palette className="w-4 h-4 text-[#062653]" />
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showColorPicker && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 w-44 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider mb-1">
                    Couleur texte
                  </div>
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        format("foreColor", c.value);
                        setShowColorPicker(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-md hover:bg-slate-50 flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: c.value }} />
                      <span className="text-slate-700">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Surlignage */}
            <div className="relative" data-highlight-picker="true">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowHighlightPicker(!showHighlightPicker);
                  setShowColorPicker(false);
                  setShowFontPicker(false);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-slate-700 transition-all cursor-pointer"
                title="Couleur de surlignage"
              >
                <Highlighter className="w-4 h-4 text-amber-500" />
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showHighlightPicker && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 w-40 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider mb-1">
                    Surlignage
                  </div>
                  {HIGHLIGHT_COLORS.map((h) => (
                    <button
                      key={h.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        format("hiliteColor", h.value);
                        setShowHighlightPicker(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-md hover:bg-slate-50 flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <span className="w-3.5 h-3.5 rounded-sm border border-slate-300" style={{ backgroundColor: h.value }} />
                      <span className="text-slate-700">{h.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alignement : Gauche, Centre, Droite, Justifié */}
          <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("justifyLeft");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.justifyLeft
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Aligner à gauche"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("justifyCenter");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.justifyCenter
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Centrer"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("justifyRight");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.justifyRight
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Aligner à droite"
            >
              <AlignRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("justifyFull");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.justifyFull
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Justifier"
            >
              <AlignJustify className="w-4 h-4" />
            </button>
          </div>

          {/* Listes & Retraits */}
          <div className="flex items-center gap-0.5 border-r border-slate-200 pr-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("insertUnorderedList");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.insertUnorderedList
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Liste à puces"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("insertOrderedList");
              }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                editorFormatState.insertOrderedList
                  ? "bg-blue-100 text-[#062653] ring-1 ring-blue-300 font-bold"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
              title="Liste numérotée"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("outdent");
              }}
              className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded-lg text-slate-600 transition-all cursor-pointer"
              title="Diminuer le retrait"
            >
              <Outdent className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                format("indent");
              }}
              className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded-lg text-slate-600 transition-all cursor-pointer"
              title="Augmenter le retrait"
            >
              <Indent className="w-4 h-4" />
            </button>
          </div>

          {/* Insertion : Tableau, Ligne, Date */}
          <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertTable();
              }}
              className="px-2 py-1 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-slate-700 text-xs font-medium cursor-pointer"
              title="Insérer un tableau récapitulatif"
            >
              <Table className="w-3.5 h-3.5 text-blue-600" />
              <span>Tableau</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertDivider();
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
              title="Insérer une ligne de séparation"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertDateStamp();
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
              title="Insérer la date du jour"
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
            </button>
          </div>

          {/* Effacer la mise en forme */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearFormatting();
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            title="Effacer la mise en forme"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TITRE / OBJET DU DOCUMENT MODIFIABLE DIRECTEMENT                           */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#062653] shrink-0">
            Objet du document :
          </span>
          <input
            type="text"
            value={documentTitle}
            onChange={(e) => {
              setDocumentTitle(e.target.value);
              if (onTitleChange) onTitleChange(e.target.value);
            }}
            placeholder="Ex : Demande d'autorisation de dépense pour achat de matériel..."
            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#062653] shadow-2xs"
          />
        </div>

        {/* ========================================================================= */}
        {/* THE WORD A4 PAPER CANVAS (Feuille A4 réaliste sur fond de bureau)          */}
        {/* ========================================================================= */}
        <div className="bg-[#E2E8F0] p-4 sm:p-8 flex justify-center overflow-x-auto min-h-[640px]">
          <div
            ref={paperRef}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease",
            }}
            className="bg-white text-slate-900 shadow-xl border border-slate-300 w-full max-w-[800px] min-h-[1050px] p-8 sm:p-14 flex flex-col justify-between"
          >
            <div>
              {/* 1. OBJET FORMEL SUR LA FEUILLE (Sans barre à gauche) */}
              <div className="mb-6 pb-2.5 border-b border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Objet formel :
                </span>
                <div className="font-bold text-sm text-[#062653] uppercase mt-0.5">
                  {documentTitle || "Demande d'autorisation"}
                </div>
              </div>

              {/* 3. CORPS ÉDITABLE WORD (contentEditable) */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  updateCounters();
                  updateActiveStates();
                }}
                onBlur={updateCounters}
                onKeyUp={() => {
                  updateCounters();
                  updateActiveStates();
                }}
                onMouseUp={updateActiveStates}
                onSelect={updateActiveStates}
                className="outline-hidden text-[11.5pt] leading-relaxed text-slate-800 min-h-[520px] focus:ring-0 select-text"
                style={{
                  fontFamily: selectedFont,
                }}
              />
            </div>

            {/* 4. CADRE OFFICIEL DE SIGNATURES EN BAS DE PAGE (Demandeur & Visa Direction) */}
            <div className="mt-12 pt-6 border-t border-slate-300">
              <div
                data-pdf-signatures="true"
                className="grid grid-cols-2 gap-6 text-xs select-none"
                style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "24px" }}
              >
                {/* Cadre Demandeur */}
                <div className="p-4 rounded-xl border border-slate-300 bg-white shadow-2xs flex flex-col justify-between min-h-[140px]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Demandeur / Rédacteur :
                    </span>
                    <strong className="text-slate-900 font-bold text-sm block">
                      {employeeName}
                    </strong>
                    <span className="text-slate-600 text-[11px] block mt-0.5">
                      {employeeRole} <span className="font-mono text-slate-500">({employeeNumber})</span>
                    </span>
                    <span className="text-slate-400 text-[10px] block mt-1">
                      Succursale : {branch}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="italic">Document certifié</span>
                    <span>{todayFormatted}</span>
                  </div>
                </div>

                {/* Cadre Signature de l'Administration (100% vide et propre pour y apposer la signature) */}
                <div className="flex flex-col justify-between min-h-[140px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Signature de l'Administration :
                  </span>
                  {/* Cadre 100% vide et propre sans aucun texte superposé */}
                  <div className="flex-1 rounded-xl border-2 border-dashed border-slate-300 bg-white shadow-2xs min-h-[110px]" />
                </div>
              </div>

              {/* Pied de page de sécurité */}
              <div className="mt-6 pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400 flex items-center justify-between">
                <span>Système officiel {companyName} • Certification électronique</span>
                <span>Page 1 sur 1</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* WORD BOTTOM STATUS BAR (Compteur de mots, Brouillon, Zoom...)             */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 select-none">
          {/* Mots & Statut */}
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-600">Page 1 sur 1</span>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-700">
              {wordCount} mot{wordCount > 1 ? "s" : ""}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500 font-mono text-[11px]">
              {charCount} caractères
            </span>
          </div>

          {/* Statut brouillon & Zoom */}
          <div className="flex items-center gap-4 flex-wrap">
            {lastSavedTime && (
              <span className="text-emerald-700 font-semibold text-[11px]">
                Brouillon enregistré à {lastSavedTime}
              </span>
            )}

            {/* Zoom controls */}
            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer transition-colors"
                title="Zoom arrière"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-semibold text-[11px] text-slate-700 w-9 text-center">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer transition-colors"
                title="Zoom avant"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SIDEBAR TIROIR LATÉRAL DES OPTIONS (Confiné dans l'area, style Desktop)   */}
        {/* ========================================================================= */}
        {showOptionsSidebar && (
          <div className="absolute inset-0 z-30 overflow-hidden">
            {/* Arrière-plan avec fermeture au clic */}
            <div
              onClick={() => setShowOptionsSidebar(false)}
              className="absolute inset-0 bg-black/25 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
            />

            {/* Tiroir latéral gauche confiné dans le composant */}
            <div className="absolute inset-y-0 left-0 w-72 sm:w-80 bg-white shadow-2xl flex flex-col border-r border-slate-200 z-10 animate-in slide-in-from-left duration-200 select-none">
              {/* En-tête sobre style desktop */}
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Options du document
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOptionsSidebar(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Liste d'options style Menu Desktop (sans fond coloré, texte propre) */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                {/* 1. Sauvegarder brouillon */}
                <button
                  type="button"
                  onClick={() => {
                    saveDraft(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-left transition-colors cursor-pointer group"
                >
                  <Save className="w-4 h-4 text-slate-600 group-hover:text-slate-900 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      Sauvegarder le brouillon
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {lastSavedTime ? `Enregistré à ${lastSavedTime}` : "Enregistre votre saisie en local"}
                    </div>
                  </div>
                </button>

                {/* 2. Télécharger PDF */}
                <button
                  type="button"
                  onClick={() => {
                    downloadPdf();
                  }}
                  disabled={isExportingPdf}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-left transition-colors cursor-pointer group disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-slate-600 group-hover:text-slate-900 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      {isExportingPdf ? "Génération PDF..." : "Télécharger en PDF (A4)"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Document officiel prêt pour signature
                    </div>
                  </div>
                </button>

                {/* 3. Télécharger Word */}
                <button
                  type="button"
                  onClick={() => {
                    exportToWordDoc();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-left transition-colors cursor-pointer group"
                >
                  <FileDown className="w-4 h-4 text-slate-600 group-hover:text-slate-900 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      Télécharger au format Word (.doc)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Fichier éditable sous Microsoft Word
                    </div>
                  </div>
                </button>

                {/* 4. Imprimer */}
                <button
                  type="button"
                  onClick={() => {
                    handlePrint();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-left transition-colors cursor-pointer group"
                >
                  <Printer className="w-4 h-4 text-slate-600 group-hover:text-slate-900 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      Imprimer le document
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Boîte de dialogue d'impression ou PDF
                    </div>
                  </div>
                </button>

                <div className="my-2 border-t border-slate-100" />

                {/* Insérer le modèle type de dépense sur demande */}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      editorRef.current &&
                      (editorRef.current.innerText.trim() === "" ||
                        confirm("Remplacer le contenu par le modèle type de demande d'autorisation de dépense ?"))
                    ) {
                      editorRef.current.innerHTML = getExpenseTemplate();
                      setDocumentTitle("Demande d'autorisation de dépense et d'engagement de fonds");
                      updateCounters();
                      showSystemToast("Modèle type inséré.");
                      setShowOptionsSidebar(false);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-left transition-colors cursor-pointer group"
                >
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                      Insérer le modèle type de dépense
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Charge un exemple structuré si nécessaire
                    </div>
                  </div>
                </button>

                {/* 5. Réinitialiser */}
                <button
                  type="button"
                  onClick={() => {
                    resetDocument();
                    setShowOptionsSidebar(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-rose-50 active:bg-rose-100 text-left transition-colors cursor-pointer group"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500 group-hover:text-rose-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 group-hover:text-rose-600">
                      Réinitialiser le document
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Effacer les modifications et repartir de zéro
                    </div>
                  </div>
                </button>
              </div>

              {/* Pied de page sobre */}
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                <span className="text-[11px]">
                  {wordCount} mots • {charCount} car.
                </span>
                <button
                  type="button"
                  onClick={() => setShowOptionsSidebar(false)}
                  className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

WordDocumentEditor.displayName = "WordDocumentEditor";
