// ---------------------------------------------------------------------------
// Business Days Utility
// ---------------------------------------------------------------------------
// Counts weekdays (Monday-Friday) between two dates, excluding Brazilian
// public holidays (fixed + Easter-based movable holidays).
// ---------------------------------------------------------------------------

// Fixed Brazilian public holidays (month is 0-indexed)
const FIXED_HOLIDAYS = [
  { month: 0, day: 1 },   // Confraternizacao Universal
  { month: 3, day: 21 },  // Tiradentes
  { month: 4, day: 1 },   // Dia do Trabalho
  { month: 8, day: 7 },   // Independencia
  { month: 9, day: 12 },  // Nossa Senhora Aparecida
  { month: 10, day: 2 },  // Finados
  { month: 10, day: 15 }, // Proclamacao da Republica
  { month: 11, day: 25 }, // Natal
];

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * Get all movable holidays for a given year (based on Easter).
 * - Carnaval: Easter - 47 days (Monday) and Easter - 48 days (Tuesday — optional half day treated as full)
 * - Sexta-feira Santa: Easter - 2 days
 * - Corpus Christi: Easter + 60 days
 */
function movableHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  const offset = (days: number) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + days);
    return d;
  };
  return [
    offset(-48), // Carnaval segunda
    offset(-47), // Carnaval terca
    offset(-2),  // Sexta-feira Santa
    offset(60),  // Corpus Christi
  ];
}

/**
 * Check whether a given date is a Brazilian public holiday.
 */
function isHoliday(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  const year = date.getFullYear();

  // Check fixed holidays
  for (const h of FIXED_HOLIDAYS) {
    if (h.month === m && h.day === d) return true;
  }

  // Check movable holidays
  const movable = movableHolidays(year);
  for (const h of movable) {
    if (h.getMonth() === m && h.getDate() === d) return true;
  }

  return false;
}

/**
 * Check whether a given date falls on a business day (Monday through Friday,
 * excluding Brazilian public holidays).
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;
  return !isHoliday(date);
}

/**
 * Count the number of business days (weekdays, excluding holidays) between two dates.
 *
 * - The `from` date is **exclusive** (counting starts from the next day).
 * - The `to` date is **inclusive**.
 * - If `to` is on or before `from`, the result is 0.
 *
 * @param from - Start date (exclusive).
 * @param to   - End date (inclusive).
 * @returns Number of business days in the range (from, to].
 */
export function countBusinessDays(from: Date, to: Date): number {
  // Normalise to midnight to avoid time-of-day issues
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  if (end <= start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  // Move to the next day (from is exclusive)
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= end) {
    if (isBusinessDay(cursor)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}
