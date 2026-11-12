"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export function SlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  width = "xl",
}: SlideOverProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const widthClass =
    {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
    }[width] || "max-w-xl";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden no-print">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-fade-in-overlay cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container (aligned to the right corner) */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
        <div
          className={`w-screen ${widthClass} bg-white shadow-2xl border-l border-[#DCE2EA] flex flex-col h-full pointer-events-auto animate-slide-in-right z-10`}
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
}
