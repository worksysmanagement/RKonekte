"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, X } from "lucide-react";

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  userName?: string;
  userEmail?: string;
  isLoggingOut?: boolean;
}

export function LogoutConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  userName,
  userEmail,
  isLoggingOut = false,
}: LogoutConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoggingOut) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoggingOut, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isLoggingOut) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#DCE2EA] overflow-hidden p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isLoggingOut}
          aria-label="Fermer"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#64748B] hover:text-[#263445] hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-2xs">
            <LogOut className="w-5 h-5" />
          </div>

          <div className="space-y-1.5">
            <h3
              id="logout-confirm-title"
              className="text-base font-bold text-[#062653] tracking-tight"
            >
              Confirmer la déconnexion
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Voulez-vous vraiment vous déconnecter de votre session RKonekte ?
            </p>
            {(userName || userEmail) && (
              <div className="mt-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-[#263445]">
                <span className="font-bold block truncate">{userName || "Compte actif"}</span>
                {userEmail && <span className="text-[#64748B] block truncate">{userEmail}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingOut}
            className="flex-1 h-10 px-4 rounded-xl border border-[#DCE2EA] bg-white hover:bg-slate-50 text-xs font-semibold text-[#263445] transition-colors cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="flex-1 h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center"
          >
            {isLoggingOut ? "Déconnexion..." : "Se déconnecter"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
