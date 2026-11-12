"use client";

import React from "react";

export interface SalaryAdjustmentData {
  id: string;
  employeeName: string;
  employeeNumber: string;
  department?: string;
  branch?: string;
  phone?: string;
  email?: string;
  previousSalary: string;
  newSalary: string;
  currency: string;
  effectiveDate: string;
  reason?: string;
  attributedBy: string;
  createdAt: string;
  signatureDataUrl?: string;
}

interface SalaryRevisionDocumentProps {
  adjustment: SalaryAdjustmentData;
  companyName?: string;
  companyAddress?: string;
  companyContact?: string;
  logoUrl?: string;
}

export const SalaryRevisionDocument = React.forwardRef<
  HTMLDivElement,
  SalaryRevisionDocumentProps
>(function SalaryRevisionDocument(
  {
    adjustment,
    companyName = "E-BIZNIS TECHNOZI S.A.",
    companyAddress = "Siège Social, Delmas & Port-au-Prince, Haïti",
    companyContact = "contact@ebiznis.ht • (+509) 3700-0000 • www.ebiznis.ht",
    logoUrl = "/logo-rkonekte.png",
  },
  ref
) {
  // Compute salary difference and percentage if possible
  const prevNum = parseFloat(adjustment.previousSalary.replace(/[^0-9.-]+/g, "")) || 0;
  const newNum = parseFloat(adjustment.newSalary.replace(/[^0-9.-]+/g, "")) || 0;
  const diff = newNum - prevNum;
  const percent = prevNum > 0 ? Math.round((diff / prevNum) * 100) : 0;
  const diffFormatted = diff > 0 ? `+${diff.toLocaleString("fr-FR")}` : `${diff.toLocaleString("fr-FR")}`;

  return (
    <div
      ref={ref}
      id="salary-revision-pdf-sheet"
      style={{
        width: "800px",
        minHeight: "1080px",
        backgroundColor: "#ffffff",
        color: "#1e293b",
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
        padding: "36px 44px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* 1. TOP HEADER & BRANDING */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        {/* Left: Logo & Corporate Details */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Logo container */}
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "12px",
              backgroundColor: "#062653",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "20px",
              boxShadow: "0 2px 8px rgba(6,38,83,0.15)",
              overflow: "hidden",
            }}
          >
            {/* If logoUrl available, display img, else fallback */}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: "6px" }}
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span style={{ color: "#FF7900" }}>RK</span>
            )}
          </div>

          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#062653", letterSpacing: "-0.3px", textTransform: "uppercase" }}>
              {companyName}
            </div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#FF7900", letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Direction Générale • Ressources Humaines & Paie
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
              {companyAddress}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b" }}>
              {companyContact}
            </div>
          </div>
        </div>

        {/* Right: Reference & Official Status */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              display: "inline-block",
              backgroundColor: "#062653",
              color: "#ffffff",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.5px",
              fontFamily: "monospace",
              marginBottom: "6px",
            }}
          >
            RÉF : {adjustment.id}
          </div>
          <div style={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}>
            Émis le : {adjustment.createdAt || adjustment.effectiveDate}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "4px",
              padding: "3px 8px",
              backgroundColor: "#ECFDF5",
              border: "1px solid #A7F3D0",
              borderRadius: "6px",
              color: "#065F46",
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            ✓ NOTIFICATION OFFICIELLE SIGNÉE
          </div>
        </div>
      </div>

      {/* Decorative Accent Ribbon */}
      <div style={{ height: "4px", display: "flex", width: "100%", marginBottom: "22px", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: "70%", backgroundColor: "#062653" }} />
        <div style={{ width: "30%", backgroundColor: "#FF7900" }} />
      </div>

      {/* 2. DOCUMENT TITLE */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h1
          style={{
            margin: "0 0 4px 0",
            fontSize: "19px",
            fontWeight: 800,
            color: "#062653",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          Notification Officielle de Revalorisation Salariale
        </h1>
        <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
          Avenant contractuel de révision salariale & mise à jour de la grille de rémunération
        </p>
      </div>

      {/* 3. SECTION I: IDENTIFICATION DU COLLABORATEUR */}
      <div style={{ marginBottom: "20px" }}>
        <div
          data-pdf-navy-header="true"
          style={{
            backgroundColor: "#062653",
            color: "#ffffff",
            padding: "7px 14px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
          }}
        >
          I. Bénéficiaire & Affectation Administrative
        </div>
        <div
          style={{
            border: "1px solid #CBD5E1",
            borderTop: "none",
            borderBottomLeftRadius: "8px",
            borderBottomRightRadius: "8px",
            backgroundColor: "#F8FAFC",
            padding: "12px 16px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 20px",
            fontSize: "11px",
          }}
        >
          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Nom & Prénom du Collaborateur
            </span>
            <strong style={{ color: "#062653", fontSize: "13px" }}>{adjustment.employeeName}</strong>
          </div>

          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Matricule RH / Identifiant
            </span>
            <strong style={{ color: "#062653", fontSize: "13px", fontFamily: "monospace" }}>
              N° {adjustment.employeeNumber}
            </strong>
          </div>

          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Succursale d'affectation
            </span>
            <span style={{ color: "#1e293b", fontWeight: 600 }}>
              {adjustment.branch || "Non assignée"}
            </span>
          </div>

          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Département / Direction
            </span>
            <span style={{ color: "#1e293b", fontWeight: 600 }}>
              {adjustment.department || "Direction Générale"}
            </span>
          </div>

          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Téléphone / Contact WhatsApp
            </span>
            <span style={{ color: "#047857", fontWeight: 600, fontFamily: "monospace" }}>
              {adjustment.phone || "Non renseigné"}
            </span>
          </div>

          <div>
            <span style={{ color: "#64748b", display: "block", fontSize: "10px", textTransform: "uppercase", fontWeight: 600 }}>
              Adresse Email Professionnelle
            </span>
            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>
              {adjustment.email || "Non renseigné"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. SECTION II: NOUVELLE GRILLE DE RÉMUNÉRATION */}
      <div style={{ marginBottom: "20px" }}>
        <div
          data-pdf-navy-header="true"
          style={{
            backgroundColor: "#062653",
            color: "#ffffff",
            padding: "7px 14px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
          }}
        >
          II. Décision d'Attribution & Modalités Salariales
        </div>

        {/* Table comparison */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #CBD5E1",
            fontSize: "11px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#F1F5F9", color: "#475569", fontWeight: 700, fontSize: "10px", textTransform: "uppercase" }}>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #CBD5E1" }}>Élément</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #CBD5E1" }}>Ancienne Base</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #CBD5E1", backgroundColor: "#ECFDF5", color: "#065F46" }}>
                Nouvelle Base Attribuée
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #CBD5E1" }}>Revalorisation</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid #CBD5E1" }}>Date d'Effet</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", fontWeight: 700, color: "#062653" }}>
                Salaire Brut Mensuel
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", color: "#64748b", textDecoration: "line-through" }}>
                {adjustment.previousSalary} {adjustment.currency}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #E2E8F0",
                  backgroundColor: "#F0FDF4",
                  color: "#047857",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                {adjustment.newSalary} {adjustment.currency}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", color: "#047857", fontWeight: 700 }}>
                {diff > 0 ? `${diffFormatted} ${adjustment.currency} (${percent > 0 ? `+${percent}%` : ""})` : "Ajustement"}
              </td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #E2E8F0", fontWeight: 700, color: "#062653" }}>
                {adjustment.effectiveDate}
              </td>
            </tr>
            <tr style={{ backgroundColor: "#FAFAFA" }}>
              <td style={{ padding: "8px 12px", color: "#64748b", fontWeight: 600 }}>
                Périodicité & Échéance
              </td>
              <td style={{ padding: "8px 12px", color: "#64748b" }}>Mensuelle</td>
              <td style={{ padding: "8px 12px", backgroundColor: "#F0FDF4", color: "#047857", fontWeight: 600 }}>
                Mensuelle (Terme échu)
              </td>
              <td style={{ padding: "8px 12px", color: "#64748b" }}>Régulier</td>
              <td style={{ padding: "8px 12px", color: "#64748b" }}>Chaque fin de mois</td>
            </tr>
          </tbody>
        </table>

        {/* Large summary badge */}
        <div
          style={{
            backgroundColor: "#ECFDF5",
            border: "1.5px solid #6EE7B7",
            borderRadius: "8px",
            padding: "12px 18px",
            marginTop: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#065F46", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Rémunération Brute Mensuelle Validée
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#047857", marginTop: "2px" }}>
              {adjustment.newSalary} {adjustment.currency}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "10px", color: "#065F46", display: "block" }}>
              Prise d'effet exécutoire :
            </span>
            <strong style={{ fontSize: "13px", color: "#065F46" }}>
              {adjustment.effectiveDate}
            </strong>
          </div>
        </div>
      </div>

      {/* 5. SECTION III: DISPOSITIONS ET FONDEMENT */}
      <div style={{ marginBottom: "22px" }}>
        <div
          data-pdf-navy-header="true"
          style={{
            backgroundColor: "#062653",
            color: "#ffffff",
            padding: "7px 14px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
          }}
        >
          III. Fondement & Dispositions Administratives
        </div>
        <div
          style={{
            border: "1px solid #CBD5E1",
            borderTop: "none",
            borderBottomLeftRadius: "8px",
            borderBottomRightRadius: "8px",
            backgroundColor: "#FFFFFF",
            padding: "12px 16px",
            fontSize: "11px",
            lineHeight: "1.55",
            color: "#334155",
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <strong style={{ color: "#062653" }}>Motif de la décision : </strong>
            <span>{adjustment.reason || "Revalorisation annuelle et appréciation du rendement professionnel."}</span>
          </div>
          <p style={{ margin: 0, fontSize: "10.5px", color: "#64748b" }}>
            Par la présente décision, la Direction Générale confirme que le montant mentionné ci-dessus
            constitue le nouveau salaire de référence du collaborateur. Il s'applique de plein droit à l'établissement
            de toutes les fiches de paie, aux calculs des déductions sociales et fiscales ainsi qu'aux indemnités légales
            à compter de sa date de prise d'effet.
          </p>
        </div>
      </div>

      {/* 6. SECTION IV: SIGNATURES ET APPROBATION OFFICIELLE (BOTTOM OF PAGE) */}
      <div style={{ marginBottom: "24px" }}>
        <div
          data-pdf-navy-header="true"
          style={{
            backgroundColor: "#062653",
            color: "#ffffff",
            padding: "7px 14px",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
          }}
        >
          IV. Approbation & Visa Exécutoire
        </div>

        <div
          style={{
            border: "1px solid #CBD5E1",
            borderTop: "none",
            borderBottomLeftRadius: "8px",
            borderBottomRightRadius: "8px",
            backgroundColor: "#F8FAFC",
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
          }}
        >
          {/* Left: Employee Acknowledgment */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px dashed #CBD5E1",
              borderRadius: "8px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: "150px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#062653", textTransform: "uppercase" }}>
                Pour Prise d'Acte du Collaborateur
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                Mention : « Lu et pris acte »
              </div>
            </div>

            <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "4px", margin: "16px 0 8px 0" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#334155" }}>
                {adjustment.employeeName}
              </div>
              <div style={{ fontSize: "9px", color: "#94a3b8" }}>
                Matricule : {adjustment.employeeNumber}
              </div>
            </div>

            <div style={{ fontSize: "9.5px", color: "#94a3b8" }}>
              Date de notification : {adjustment.effectiveDate}
            </div>
          </div>

          {/* Right: Direction Signature & Corporate Seal */}
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1.5px solid #062653",
              borderRadius: "8px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: "150px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#062653", textTransform: "uppercase" }}>
                Pour la Direction Générale & RH
              </div>
              <div style={{ fontSize: "10px", color: "#FF7900", fontWeight: 700, marginTop: "2px" }}>
                {adjustment.attributedBy || "Direction Générale"}
              </div>
            </div>

            {/* Signature Area */}
            <div
              style={{
                height: "75px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                margin: "4px 0",
              }}
            >
              {/* Background Seal Watermark */}
              <div
                style={{
                  position: "absolute",
                  width: "74px",
                  height: "74px",
                  borderRadius: "50%",
                  border: "2px dashed rgba(6, 38, 83, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontSize: "7px",
                  fontWeight: 800,
                  color: "rgba(6, 38, 83, 0.35)",
                  textTransform: "uppercase",
                  padding: "4px",
                  transform: "rotate(-12deg)",
                  pointerEvents: "none",
                }}
              >
                ★ E-BIZNIS ★<br />SCEAU OFFICIEL<br />DIRECTION
              </div>

              {/* Uploaded Handwritten Signature */}
              {adjustment.signatureDataUrl ? (
                <img
                  src={adjustment.signatureDataUrl}
                  alt="Signature Direction"
                  style={{
                    maxHeight: "70px",
                    maxWidth: "200px",
                    objectFit: "contain",
                    position: "relative",
                    zIndex: 2,
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: "11px",
                    fontStyle: "italic",
                    color: "#062653",
                    fontWeight: 700,
                    fontFamily: "cursive, 'Brush Script MT', sans-serif",
                    zIndex: 2,
                  }}
                >
                  {adjustment.attributedBy || "Direction Générale"}
                </div>
              )}
            </div>

            {/* Bottom info */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                borderTop: "1px solid #E2E8F0",
                paddingTop: "4px",
              }}
            >
              <span style={{ fontSize: "9px", color: "#059669", fontWeight: 700 }}>
                ✓ Signature & Visa Authentifiés
              </span>
              <span style={{ fontSize: "9px", color: "#64748b" }}>
                Fait le {adjustment.createdAt || adjustment.effectiveDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 7. FOOTER & CONFIDENTIALITY */}
      <div
        style={{
          borderTop: "1px solid #CBD5E1",
          paddingTop: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "9px",
          color: "#94a3b8",
        }}
      >
        <div>
          {companyName} • Système Sécurisé RKonekte • Document Réf. {adjustment.id}
        </div>
        <div style={{ textAlign: "right" }}>
          Document officiel confidentiel • Page 1/1 • Émis le {adjustment.createdAt || adjustment.effectiveDate}
        </div>
      </div>
    </div>
  );
});
