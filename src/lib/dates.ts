const SPANISH_LOCALE = 'es';
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const shortMonthFormatter = new Intl.DateTimeFormat(SPANISH_LOCALE, {
  month: 'short',
});
const longMonthFormatter = new Intl.DateTimeFormat(SPANISH_LOCALE, {
  month: 'long',
});
const timeFormatter = new Intl.DateTimeFormat(SPANISH_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const timeWithSecondsFormatter = new Intl.DateTimeFormat(SPANISH_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid time value');
  }
}

function shortMonth(date: Date): string {
  return shortMonthFormatter.format(date).replace(/\.$/, '');
}

/** Spanish date and time equivalent to a medium local date plus short time. */
export function formatSpanishDateTime(date: Date): string {
  assertValidDate(date);
  return `${date.getDate()} ${shortMonth(date)} ${date.getFullYear()}, ${formatTime(date)}`;
}

/** Local 24-hour clock including seconds. */
export function formatTimeWithSeconds(date: Date): string {
  assertValidDate(date);
  return timeWithSecondsFormatter.format(date);
}

/** Short Spanish chart label such as "4 ago". */
export function formatShortDayMonth(date: Date): string {
  assertValidDate(date);
  return `${date.getDate()} ${shortMonth(date)}`;
}

/** Compact, natural Spanish date and time for inbox metadata. */
export function formatSpanishDateTimeCompact(date: Date): string {
  return formatSpanishDateTime(date);
}

/** Local 24-hour clock without seconds. */
export function formatTime(date: Date): string {
  assertValidDate(date);
  return timeFormatter.format(date);
}

/** Long Spanish date such as "4 de agosto de 2026". */
export function formatLongSpanishDate(date: Date): string {
  assertValidDate(date);
  return `${date.getDate()} de ${longMonthFormatter.format(date)} de ${date.getFullYear()}`;
}

/** Stable key built from local calendar components, never UTC components. */
export function formatLocalDateKey(date: Date): string {
  assertValidDate(date);
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local timestamp suitable for filenames: YYYYMMDD-HHmmss. */
export function formatLocalFilenameTimestamp(date: Date): string {
  assertValidDate(date);
  return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Parse a YYYY-MM-DD value as local midnight rather than UTC midnight. */
export function parseLocalDate(dateOnly: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return new Date(Number.NaN);

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

/** Difference in whole hours, truncated toward zero like date-fns. */
export function differenceInWholeHours(later: Date, earlier: Date): number {
  return Math.trunc((later.getTime() - earlier.getTime()) / HOUR_MS);
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isToday(date: Date, now = new Date()): boolean {
  return isSameLocalDay(date, now);
}

export function isYesterday(date: Date, now = new Date()): boolean {
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );
  return isSameLocalDay(date, yesterday);
}

interface RelativeTimeOptions {
  addSuffix?: boolean;
  now?: Date;
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function relativeDistance(absMilliseconds: number): {
  phrase: string;
  approximate: boolean;
} {
  const seconds = absMilliseconds / SECOND_MS;
  if (seconds < 30) return { phrase: 'menos de un minuto', approximate: false };
  if (seconds < 90) return { phrase: '1 minuto', approximate: false };

  const minutes = absMilliseconds / MINUTE_MS;
  if (minutes < 44.5) {
    return {
      phrase: plural(Math.round(minutes), 'minuto', 'minutos'),
      approximate: false,
    };
  }
  if (minutes < 89.5) {
    return { phrase: 'alrededor de 1 hora', approximate: true };
  }

  const hours = absMilliseconds / HOUR_MS;
  if (hours < 24) {
    return {
      phrase: `alrededor de ${plural(Math.round(hours), 'hora', 'horas')}`,
      approximate: true,
    };
  }
  if (hours < 42) return { phrase: '1 día', approximate: false };

  const days = absMilliseconds / DAY_MS;
  if (days < 30) {
    return {
      phrase: plural(Math.round(days), 'día', 'días'),
      approximate: false,
    };
  }
  if (days < 45) {
    return { phrase: 'alrededor de 1 mes', approximate: true };
  }
  if (days < 320) {
    return {
      phrase: plural(Math.round(days / 30), 'mes', 'meses'),
      approximate: false,
    };
  }
  if (days < 548) {
    return { phrase: 'alrededor de 1 año', approximate: true };
  }

  return {
    phrase: `alrededor de ${plural(Math.round(days / 365), 'año', 'años')}`,
    approximate: true,
  };
}

/** Human-readable Spanish distance from `now`, optionally with a time suffix. */
export function formatRelativeTime(
  date: Date,
  { addSuffix = false, now = new Date() }: RelativeTimeOptions = {}
): string {
  assertValidDate(date);
  assertValidDate(now);

  const difference = date.getTime() - now.getTime();
  const { phrase, approximate } = relativeDistance(Math.abs(difference));
  if (!addSuffix) return phrase;
  if (difference <= 0) return `hace ${phrase}`;
  if (approximate)
    return `en aproximadamente ${phrase.replace('alrededor de ', '')}`;
  return `en ${phrase}`;
}
