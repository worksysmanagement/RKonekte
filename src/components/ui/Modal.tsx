"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Maximize2, Minimize2 } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  allowMaximize?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "xl",
  allowMaximize = false,
  isMaximized: controlledMaximized,
  onToggleMaximize,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [internalMaximized, setInternalMaximized] = useState(false);

  const isMaximized =
    controlledMaximized !== undefined ? controlledMaximized : internalMaximized;

  const toggleMaximize = () => {
    if (onToggleMaximize) {
      onToggleMaximize();
    } else {
      setInternalMaximized((prev) => !prev);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow || "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  // Harmonisation standardisée : les modales usuelles (défaut, md, lg, xl)
  // ont une largeur confortable identique de 576px (max-w-xl) pour garantir
  // une expérience frontend uniforme sur l'ensemble du système RKonekte.
  const maxWidthClass =
    {
      sm: "max-w-md",
      md: "max-w-xl",
      lg: "max-w-xl",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
      "3xl": "max-w-3xl",
      "4xl": "max-w-4xl",
      "5xl": "max-w-5xl",
      full: "max-w-none w-full",
    }[maxWidth] || "max-w-xl";

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${
        isMaximized ? "p-0" : "p-3 sm:p-4"
      } bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150 select-none cursor-pointer`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline-title"
    >
      <div
        className={`relative ${
          isMaximized
            ? "fixed inset-0 w-full h-full max-w-none rounded-none flex flex-col"
            : `w-full ${maxWidthClass} rounded-2xl`
        } bg-white shadow-2xl overflow-hidden border border-slate-100/90 select-text cursor-default animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <h3
            id="modal-headline-title"
            className="text-base sm:text-lg font-bold text-[#062653] tracking-tight truncate pr-4"
          >
            {title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {allowMaximize && (
              <button
                type="button"
                onClick={toggleMaximize}
                className="text-slate-400 hover:text-slate-700 rounded-xl p-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
                title={isMaximized ? "Restaurer la taille normale" : "Maximiser / Plein écran"}
                aria-label={isMaximized ? "Restaurer la taille normale" : "Maximiser la fenêtre"}
              >
                {isMaximized ? (
                  <Minimize2 className="w-5 h-5 text-[#062653]" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-slate-500 hover:text-[#062653]" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 rounded-xl p-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fermer la boîte de dialogue"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          className={`${
            isMaximized
              ? "flex-1 p-4 sm:p-6 overflow-hidden flex flex-col min-h-0"
              : "p-5 sm:p-6 max-h-[82vh] overflow-y-auto"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
