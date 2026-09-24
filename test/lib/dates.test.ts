import { describe, expect, it } from 'bun:test';
import {
  differenceInWholeHours,
  formatLocalDateKey,
  formatLocalFilenameTimestamp,
  formatLongSpanishDate,
  formatRelativeTime,
  formatShortDayMonth,
  formatSpanishDateTime,
  formatSpanishDateTimeCompact,
  formatTime,
  formatTimeWithSeconds,
  isToday,
  isYesterday,
  parseLocalDate,
} from '@/lib/dates';

const LOCAL_DATE_TIME = new Date(2026, 7, 4, 14, 5, 9);

describe('Spanish display formats', () => {
  it('formats dates in natural Spanish order', () => {
    expect(formatSpanishDateTime(LOCAL_DATE_TIME)).toBe('4 ago 2026, 14:05');
    expect(formatSpanishDateTimeCompact(LOCAL_DATE_TIME)).toBe(
      '4 ago 2026, 14:05'
    );
    expect(formatLongSpanishDate(LOCAL_DATE_TIME)).toBe('4 de agosto de 2026');
    expect(formatShortDayMonth(LOCAL_DATE_TIME)).toBe('4 ago');
  });

  it('formats local 24-hour times with and without seconds', () => {
    expect(formatTime(LOCAL_DATE_TIME)).toBe('14:05');
    expect(formatTimeWithSeconds(LOCAL_DATE_TIME)).toBe('14:05:09');
  });
});

describe('local machine-readable formats', () => {
  it('uses local calendar fields for YYYY-MM-DD', () => {
    const lateLocalDate = new Date(2026, 0, 9, 23, 59, 58);
    expect(formatLocalDateKey(lateLocalDate)).toBe('2026-01-09');
  });

  it('builds filename timestamps from local fields', () => {
    expect(formatLocalFilenameTimestamp(LOCAL_DATE_TIME)).toBe(
      '20260804-140509'
    );
  });
});

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD at local midnight', () => {
    const date = parseLocalDate('2026-08-04');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(4);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  it('returns an invalid date for impossible or non-date-only values', () => {
    expect(parseLocalDate('2026-02-30').getTime()).toBeNaN();
    expect(parseLocalDate('2026-08-04T00:00:00Z').getTime()).toBeNaN();
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0);

  it('formats a past distance with an injected now and suffix', () => {
    const date = new Date(2026, 7, 4, 9, 40, 0);
    expect(formatRelativeTime(date, { addSuffix: true, now })).toBe(
      'hace alrededor de 2 horas'
    );
  });

  it('omits the suffix when requested', () => {
    const date = new Date(2026, 7, 4, 11, 55, 0);
    expect(formatRelativeTime(date, { now })).toBe('5 minutos');
  });

  it('uses natural Spanish for future distances', () => {
    const date = new Date(2026, 7, 4, 12, 5, 0);
    expect(formatRelativeTime(date, { addSuffix: true, now })).toBe(
      'en 5 minutos'
    );
  });
});

describe('calendar comparisons and hour differences', () => {
  const now = new Date(2026, 0, 1, 0, 30, 0);

  it('compares today and yesterday by local calendar day', () => {
    expect(isToday(new Date(2026, 0, 1, 23, 59), now)).toBe(true);
    expect(isYesterday(new Date(2025, 11, 31, 23, 59), now)).toBe(true);
    expect(isYesterday(new Date(2026, 0, 1, 0, 0), now)).toBe(false);
  });

  it('truncates hour differences toward zero', () => {
    const earlier = new Date(2026, 7, 4, 10, 30, 0);
    expect(differenceInWholeHours(new Date(2026, 7, 4, 12, 29), earlier)).toBe(
      1
    );
    expect(differenceInWholeHours(earlier, new Date(2026, 7, 4, 12, 29))).toBe(
      -1
    );
  });
});
