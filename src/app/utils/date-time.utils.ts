/**
 * Centralized Date/Time Formatting Utilities
 *
 * Pure functions for date/time formatting without timezone conversions.
 * These utilities use simple string manipulation to avoid timezone issues.
 */

/**
 * Formats a date/time string or Date object to HH:mm format.
 * Extracts time directly from ISO string without timezone conversion.
 *
 * @param dateString - ISO string, SQL datetime string, or Date object
 * @returns Time in HH:mm format (e.g., "08:00")
 */
export function formatToHHMM(dateString: string | Date | null | undefined): string {
  if (!dateString) {
    return '';
  }

  const isoString = (dateString instanceof Date) ? dateString.toISOString() : dateString;

  if (isoString.includes('T')) {
    const timePart = isoString.split('T')[1];
    if (timePart) {
      return timePart.substring(0, 5);
    }
  } else if (isoString.includes(' ')) {
    const timePart = isoString.split(' ')[1];
    if (timePart) {
      return timePart.substring(0, 5);
    }
  }

  return '';
}

/**
 * Formats a Date object to YYYY-MM-DD format.
 *
 * @param date - Date object to format
 * @returns Date in YYYY-MM-DD format (e.g., "2025-11-12")
 */
export function formatToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats two time strings as a range with "Uhr" suffix.
 *
 * @param startTime - Start time in any format
 * @param endTime - End time in any format
 * @returns Formatted range (e.g., "08:00 - 09:30 Uhr")
 */
export function formatTimeRange(startTime: string | Date, endTime: string | Date): string {
  const start = formatToHHMM(startTime);
  const end = formatToHHMM(endTime);
  return `${start} - ${end} Uhr`;
}

/**
 * Formats a date/time to a localized German format with relative day labels.
 * Shows "Heute", "Morgen", or "Day, DD. MMM" based on the date.
 *
 * @param dateString - ISO string or SQL datetime string
 * @returns Formatted string (e.g., "Heute, 14:30" or "Mi, 13. Nov, 14:30")
 */
export function formatDateTime(dateString: string): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateStr = date.toDateString();
  const todayStr = today.toDateString();
  const tomorrowStr = tomorrow.toDateString();

  let dayLabel = '';
  if (dateStr === todayStr) {
    dayLabel = 'Heute';
  } else if (dateStr === tomorrowStr) {
    dayLabel = 'Morgen';
  } else {
    const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const dayOfWeek = dayNames[date.getDay()];
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    dayLabel = `${dayOfWeek}, ${day}. ${month}`;
  }

  const time = formatToHHMM(dateString);
  return `${dayLabel}, ${time}`;
}

/**
 * Formats a date to German date format (DD.MM.YYYY).
 *
 * @param date - Date object to format
 * @returns Date in DD.MM.YYYY format (e.g., "12.11.2025")
 */
export function formatToGermanDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Formats a date to a more verbose German format.
 *
 * @param date - Date object or string to format
 * @returns Formatted string (e.g., "12. November 2025")
 */
export function formatToVerboseGermanDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();

  return `${day}. ${month} ${year}`;
}
