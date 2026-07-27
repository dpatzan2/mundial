export const APP_TIMEZONE = "America/Guatemala";
export const APP_LOCALE = "es-GT";
export const APP_TIMEZONE_LABEL = "GT";

/** Interpreta fechas del fixture como hora local de Guatemala cuando no traen zona. */
export function parseAppDateTime(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (/[zZ]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized)) {
    return new Date(normalized);
  }
  return new Date(`${normalized}-06:00`);
}

/** Valor para <input type="datetime-local"> en hora de Guatemala; inverso de parseAppDateTime. */
export function toAppDateTimeInput(date: Date | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T");
}

export function formatAppDateTime(date: Date) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function atAppDay22Hours(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;

  const appDay22Hours = parseAppDateTime(
    `${value("year")}-${value("month")}-${value("day")}T22:00:00`,
  );
  if (!appDay22Hours) {
    throw new Error("Could not build app 22:00 date");
  }
  return appDay22Hours;
}

export function formatAppTime(date: Date) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatTimeZoneLabel(timeLabel: string | null | undefined) {
  if (!timeLabel) return null;
  if (/\b(GT|CA|Centroamerica|Centroamérica)\b/i.test(timeLabel)) {
    return timeLabel;
  }
  return `${timeLabel} ${APP_TIMEZONE_LABEL}`;
}

export function formatAppDate(date: Date) {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatAppDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const WEEKDAY_SHORT_BY_EN: Record<string, string> = {
  Sun: "DOM",
  Mon: "LUN",
  Tue: "MAR",
  Wed: "MIE",
  Thu: "JUE",
  Fri: "VIE",
  Sat: "SAB",
};

const MONTH_SHORT_BY_EN: Record<string, string> = {
  Jan: "ENE",
  Feb: "FEB",
  Mar: "MAR",
  Apr: "ABR",
  May: "MAY",
  Jun: "JUN",
  Jul: "JUL",
  Aug: "AGO",
  Sep: "SEP",
  Oct: "OCT",
  Nov: "NOV",
  Dec: "DIC",
};

export type CarouselDayParts = {
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  isToday: boolean;
};

/** Partes cortas para el carrusel de fechas (LUN/23/JUL); evita depender de abreviaturas es-GT (varian por ICU). */
export function formatCarouselDayParts(date: Date, now: Date = new Date()): CarouselDayParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(date);

  const value = (type: "weekday" | "day" | "month") =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekdayShort: WEEKDAY_SHORT_BY_EN[value("weekday")] ?? value("weekday").toUpperCase(),
    dayNumber: value("day"),
    monthShort: MONTH_SHORT_BY_EN[value("month")] ?? value("month").toUpperCase(),
    isToday: formatAppDateKey(date) === formatAppDateKey(now),
  };
}

/** Etiquetas legibles desde kickoffAt; si no hay, usa las del fixture. */
export function matchScheduleLabels(
  kickoffAt: Date | null | undefined,
  dateLabel: string | null | undefined,
  timeLabel: string | null | undefined,
) {
  if (!kickoffAt) {
    return { dateLabel: dateLabel ?? null, timeLabel: formatTimeZoneLabel(timeLabel) };
  }

  return {
    dateLabel: formatAppDate(kickoffAt),
    timeLabel: formatTimeZoneLabel(formatAppTime(kickoffAt)),
  };
}
