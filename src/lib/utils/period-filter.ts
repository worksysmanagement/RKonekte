export type PeriodMode = "all" | "day" | "month" | "year";

export interface PeriodFilter {
  mode: PeriodMode;
  date?: string;  // YYYY-MM-DD when mode === "day"
  month?: string; // YYYY-MM when mode === "month"
  year?: string;  // YYYY when mode === "year"
  label: string;
}

const HAITI_TIMEZONE = "America/Port-au-Prince";

export interface HaitiDateParts {
  year: string;
  month: string;
  day: string;
  yearMonth: string;
  ymd: string;
}

export function getHaitiDateParts(timestampMs: number): HaitiDateParts {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: HAITI_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestampMs));

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) {
      return {
        year,
        month,
        day,
        yearMonth: `${year}-${month}`,
        ymd: `${year}-${month}-${day}`,
      };
    }
  } catch (_) {}

  const d = new Date(timestampMs);
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return {
    year,
    month,
    day,
    yearMonth: `${year}-${month}`,
    ymd: `${year}-${month}-${day}`,
  };
}

const FRENCH_MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function formatPeriodLabel(filter: Omit<PeriodFilter, "label">): string {
  if (filter.mode === "day" && filter.date) {
    const [y, m, d] = filter.date.split("-").map(Number);
    if (y && m && d) {
      const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return utc.toLocaleDateString("fr-FR", {
        timeZone: "UTC",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
    return filter.date;
  }

  if (filter.mode === "month" && filter.month) {
    const [y, m] = filter.month.split("-").map(Number);
    if (y && m >= 1 && m <= 12) {
      return `${FRENCH_MONTHS[m - 1]} ${y}`;
    }
    return filter.month;
  }

  if (filter.mode === "year" && filter.year) {
    return `Année ${filter.year}`;
  }

  return "Toutes les périodes";
}

export function resolvePeriodFilter(
  raw?: {
    period?: string | null;
    date?: string | null;
    month?: string | null;
    year?: string | null;
  },
  nowMs: number = Date.now()
): PeriodFilter {
  const today = getHaitiDateParts(nowMs);
  const rawPeriod = (raw?.period || "all").toLowerCase().trim();
  const mode: PeriodMode =
    rawPeriod === "day" || rawPeriod === "month" || rawPeriod === "year"
      ? rawPeriod
      : "all";

  if (mode === "day") {
    const candidate = (raw?.date || "").trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : today.ymd;
    return {
      mode,
      date,
      label: formatPeriodLabel({ mode, date }),
    };
  }

  if (mode === "month") {
    const rawMonth = (raw?.month || "").trim();
    const rawYear = (raw?.year || "").trim();
    let month = today.yearMonth;

    if (/^\d{4}-\d{2}$/.test(rawMonth)) {
      month = rawMonth;
    } else if (/^\d{4}$/.test(rawYear) && /^\d{1,2}$/.test(rawMonth)) {
      const mNum = Math.min(12, Math.max(1, Number(rawMonth)));
      month = `${rawYear}-${String(mNum).padStart(2, "0")}`;
    }

    return {
      mode,
      month,
      label: formatPeriodLabel({ mode, month }),
    };
  }

  if (mode === "year") {
    const candidate = (raw?.year || "").trim();
    const year = /^\d{4}$/.test(candidate) ? candidate : today.year;
    return {
      mode,
      year,
      label: formatPeriodLabel({ mode, year }),
    };
  }

  return {
    mode: "all",
    label: formatPeriodLabel({ mode: "all" }),
  };
}

export function isTimestampInPeriod(
  timestampMs: number | null | undefined,
  filter: PeriodFilter
): boolean {
  if (filter.mode === "all") return true;
  if (timestampMs == null || !Number.isFinite(timestampMs)) return false;

  const parts = getHaitiDateParts(timestampMs);
  if (filter.mode === "day") return parts.ymd === filter.date;
  if (filter.mode === "month") return parts.yearMonth === filter.month;
  if (filter.mode === "year") return parts.year === filter.year;
  return true;
}
