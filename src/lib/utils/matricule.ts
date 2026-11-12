/**
 * Utilitaire de gestion des formats et séquences de matricules d'entreprise.
 */

/**
 * Calcule l'acronyme officiel (initiales) d'une entreprise à partir de son nom ou de son slug.
 * Exemples :
 * - "e-biznis" -> "EB"
 * - "Technozi" -> "TECH"
 * - "Welj Express" -> "WE"
 * - "Cabinet Expert Comptable" -> "CEC"
 */
export function getOrganizationAcronym(name?: string | null, slug?: string | null): string {
  const text = (name || slug || "").trim();
  if (!text) return "EMP";

  const parts = text.split(/[\s\-_.]+/).filter((p) => p.length > 0);

  if (parts.length >= 2) {
    const initials = parts.map((p) => p[0]).join("").toUpperCase();
    if (initials.length >= 2 && initials.length <= 4) {
      return initials;
    }
  }

  const clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (clean.length <= 4) return clean || "EMP";
  return clean.slice(0, 4) || "EMP";
}

/**
 * Calcule le code trigramme ou code court (3-4 lettres) à partir du nom d'entreprise.
 * Exemples :
 * - "e-biznis" -> "EBIZ"
 * - "Technozi" -> "TECH"
 * - "Welj Express" -> "WELJ"
 */
export function getOrganizationTrigram(name?: string | null, slug?: string | null): string {
  const text = (name || slug || "").trim();
  if (!text) return "EMP";

  const parts = text.split(/[\s\-_.]+/).filter((p) => p.length > 0);
  if (parts.length >= 2 && parts[0].length === 1 && parts[1]) {
    // Cas spécial comme e-biznis -> EBIZ
    const combined = (parts[0] + parts[1]).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return combined.slice(0, 4);
  }

  const clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(0, 4) || "EMP";
}

/**
 * Calcule la dénomination nettoyée (majuscules, tirets) pour un matricule avec nom complet.
 * Exemples :
 * - "e-biznis" -> "E-BIZNIS"
 * - "Technozi" -> "TECHNOZI"
 */
export function getOrganizationCleanName(name?: string | null, slug?: string | null): string {
  const text = (name || slug || "").trim();
  if (!text) return "ENTREPRISE";
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 16)
      .replace(/-+$/g, "") || "ENTREPRISE"
  );
}

export interface MatriculeFormatOption {
  id: string;
  label: string;
  preview: string;
  description: string;
}

/**
 * Normalise d'éventuels anciens formats basés sur les succursales vers
 * des formats indépendants des succursales (basés uniquement sur l'entreprise).
 */
export function normalizeMatriculeFormat(format?: string | null): string {
  switch (format) {
    case "FULLNAME_SEQ":
    case "FULLNAME_BRANCH_SEQ":
    case "INITIALS_BRANCH_SEQ":
      return "FULLNAME_SEQ";
    case "INITIALS_SEQ":
      return "INITIALS_SEQ";
    case "TRIGRAM_SEQ":
    case "TRIGRAM_BRANCH_SEQ":
      return "TRIGRAM_SEQ";
    case "INITIALS_YEAR_SEQ":
      return "INITIALS_YEAR_SEQ";
    case "CUSTOM":
      return "CUSTOM";
    default:
      return "FULLNAME_SEQ";
  }
}

/**
 * Génère dynamiquement la liste des formats de matricules possibles selon le nom de l'entreprise.
 */
export function getMatriculeFormatOptions(
  companyName?: string | null,
  sampleSeq = "001"
): MatriculeFormatOption[] {
  const initials = getOrganizationAcronym(companyName);
  const trigram = getOrganizationTrigram(companyName);
  const cleanName = getOrganizationCleanName(companyName);
  const currentYear = new Date().getFullYear();

  return [
    {
      id: "FULLNAME_SEQ",
      label: `Nom du business + N° séquentiel (Recommandé)`,
      preview: `${cleanName}-${sampleSeq}`,
      description: `Composé du nom de l'entreprise (${cleanName}) suivi d'un numéro qui s'incrémente à chaque enregistrement, indépendant des succursales.`,
    },
    {
      id: "INITIALS_SEQ",
      label: `Initiales du business + N° séquentiel (Format court)`,
      preview: `${initials}-${sampleSeq}`,
      description: `Format court composé des initiales de l'entreprise (${initials}) et du numéro séquentiel unique.`,
    },
    {
      id: "TRIGRAM_SEQ",
      label: `Code abrégé (${trigram}) + N° séquentiel`,
      preview: `${trigram}-${sampleSeq}`,
      description: `Utilise les premières lettres du business (${trigram}) suivies du numéro séquentiel unique.`,
    },
    {
      id: "INITIALS_YEAR_SEQ",
      label: `Initiales + Année (${currentYear}) + N° séquentiel`,
      preview: `${initials}-${currentYear}-${sampleSeq}`,
      description: `Intègre le millésime annuel pour un archivage chronologique immédiat.`,
    },
    {
      id: "CUSTOM",
      label: `Préfixe personnalisé libre + N° séquentiel`,
      preview: `VOTRECODE-${sampleSeq}`,
      description: `Définissez un préfixe sur-mesure propre à la charte de votre organisation.`,
    },
  ];
}

/**
 * Calcule le prochain numéro séquentiel disponible pour une entreprise.
 * Analyse les matricules existants et retourne le prochain entier incrémentiel (ex: 1 -> "001", 2 -> "002").
 * Garantit qu'aucun doublon ne sera proposé au sein de la même organisation.
 */
export function getNextMatriculeSequence(
  existingMatricules: Array<string | null | undefined>
): string {
  const usedNumbers = new Set<number>();
  let maxSequential = 0;

  for (const m of existingMatricules) {
    if (!m) continue;
    const match = m.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        usedNumbers.add(num);
        if (num > maxSequential) {
          maxSequential = num;
        }
      }
    }
  }

  // Si des numéros séquentiels ordonnés existent (ex: 1, 2, 3...)
  // on continue après le max (ex: max + 1)
  if (maxSequential > 0 && maxSequential < 500 && usedNumbers.has(1)) {
    let nextSeq = maxSequential + 1;
    while (usedNumbers.has(nextSeq)) {
      nextSeq++;
    }
    return String(nextSeq).padStart(3, "0");
  }

  // Sinon, premier entier disponible >= 1 non encore utilisé
  let nextSeq = 1;
  while (usedNumbers.has(nextSeq)) {
    nextSeq++;
  }

  return String(nextSeq).padStart(3, "0");
}

/**
 * Génère le matricule officiel en respectant le format sélectionné par l'entreprise
 * (nom du business + numéro séquentiel incrémentiel).
 */
export function generateEmployeeMatricule(
  orgNameOrSlug?: string | null,
  digits?: string | number | null,
  format?: string | null,
  customPrefix?: string | null
): string {
  const initials = getOrganizationAcronym(orgNameOrSlug);
  const trigram = getOrganizationTrigram(orgNameOrSlug);
  const cleanName = getOrganizationCleanName(orgNameOrSlug);

  const numPart =
    digits !== undefined && digits !== null && String(digits).trim() !== ""
      ? String(digits).padStart(3, "0")
      : "001";

  const selectedFormat = normalizeMatriculeFormat(format);

  switch (selectedFormat) {
    case "INITIALS_SEQ":
      return `${initials}-${numPart}`;
    case "TRIGRAM_SEQ":
      return `${trigram}-${numPart}`;
    case "INITIALS_YEAR_SEQ":
      return `${initials}-${new Date().getFullYear()}-${numPart}`;
    case "CUSTOM": {
      const pfx = (customPrefix || cleanName).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase() || cleanName;
      return `${pfx}-${numPart}`;
    }
    case "FULLNAME_SEQ":
    default:
      return `${cleanName}-${numPart}`;
  }
}
