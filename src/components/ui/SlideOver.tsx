"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "2xl";
  side?: "left" | "right";
}

export function SlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  width = "xl",
  side = "right",
}: SlideOverProps) {
  const [mounted, setMounted] = useState(false);

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

  const widthClass =
    {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
    }[width] || "max-w-xl";

  const isLeft = side === "left";

  const content = (
    <div className="fixed inset-0 z-[9999] overflow-hidden no-print">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in-overlay cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container (aligned to left or right) */}
      <div
        className={`fixed inset-y-0 ${
          isLeft ? "left-0 pr-6 sm:pr-10" : "right-0 pl-6 sm:pl-10"
        } max-w-full flex pointer-events-none`}
      >
        <div
          className={`w-screen ${widthClass} bg-white shadow-2xl flex flex-col h-full pointer-events-auto ${
            isLeft
              ? "animate-slide-in-left border-r border-[#DCE2EA]"
              : "animate-slide-in-right border-l border-[#DCE2EA]"
          } z-10`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#DCE2EA] flex items-start justify-between bg-white shrink-0">
            <div className="flex items-start gap-3">
              {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
              <div>
                <h3 className="text-base font-bold text-[#062653] tracking-tight">{title}</h3>
                {subtitle && <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1 -mt-1 text-slate-400 hover:text-[#062653] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
