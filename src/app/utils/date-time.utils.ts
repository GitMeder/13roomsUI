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

/**
 * Extracts the time part (HH:mm:ss) from an ISO-like timestamp string in a timezone-safe way.
 * This is used for full timestamp displays including seconds.
 * Example: "2025-11-13T14:30:45.000Z" -> "14:30:45"
 *
 * @param timestamp - ISO string or SQL datetime string
 * @returns Time in HH:mm:ss format (e.g., "14:30:45")
 */
export function formatToHHMMSS(timestamp: string | undefined | null): string {
  if (!timestamp || !timestamp.includes('T')) {
    return '';
  }
  const timePart = timestamp.split('T')[1];
  if (!timePart) {
    return '';
  }
  // Extract HH:mm:ss (first 8 characters of time part)
  return timePart.substring(0, 8);
}

/**
 * Formats a full timestamp to German format without timezone conversion.
 * Uses pure string manipulation to extract date and time parts.
 * Example: "2025-11-13T14:30:45.000Z" -> "13. November 2025, 14:30:45"
 *
 * @param timestamp - ISO string or SQL datetime string
 * @returns Formatted timestamp string (e.g., "13. November 2025, 14:30:45")
 */
export function formatFullTimestamp(timestamp: string | undefined | null): string {
  if (!timestamp) {
    return '';
  }

  // Extract date part using Date object (safe for date only, not time)
  const date = new Date(timestamp);
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  // Extract time using pure string manipulation (timezone-safe)
  const time = formatToHHMMSS(timestamp);

  return `${day}. ${month} ${year}, ${time}`;
}

/**
 * Formats a timestamp to DD.MM.YYYY HH:mm:ss format without timezone conversion.
 * Uses pure string manipulation for the time part to avoid timezone bugs.
 * Example: "2025-11-13T14:30:45.000Z" -> "13.11.2025, 14:30:45"
 *
 * @param timestamp - ISO string or SQL datetime string
 * @returns Formatted timestamp string (e.g., "13.11.2025, 14:30:45")
 */
export function formatTimestampShort(timestamp: string | undefined | null): string {
  if (!timestamp) {
    return '';
  }

  // Extract date part using Date object
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  // Extract time using pure string manipulation (timezone-safe)
  const time = formatToHHMMSS(timestamp);

  return `${day}.${month}.${year}, ${time}`;
}

/**
 * Calculates relative time from a timestamp using UTC-based logic.
 * This function is immune to browser timezone issues by performing all calculations in UTC.
 * Example: "2025-11-13T14:30:45.000Z" -> "vor 5 Minuten"
 *
 * @param timestamp - ISO string or SQL datetime string
 * @returns Relative time string in German (e.g., "vor 5 Minuten", "gerade eben")
 */
export function getRelativeTime(timestamp: string | undefined | null): string {
  if (!timestamp) {
    return '';
  }

  // Step 1: Create Date objects. The input string is UTC from the DB.
  const eventTime = new Date(timestamp);
  const now = new Date();

  // Step 2: Get the UTC time in milliseconds for both. Crucially, this IGNORES the local timezone offset.
  const diffInMs = now.getTime() - eventTime.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);

  if (diffInSeconds < 60) {
    return 'gerade eben';
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `vor ${diffInMinutes} ${diffInMinutes === 1 ? 'Minute' : 'Minuten'}`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `vor ${diffInHours} ${diffInHours === 1 ? 'Stunde' : 'Stunden'}`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  return `vor ${diffInDays} ${diffInDays === 1 ? 'Tag' : 'Tagen'}`;
}

/**
 * Calculates the difference in minutes between two "HH:mm" time strings.
 * Uses pure integer math to remain timezone-immune.
 * Assumes both times are on the same day (time2 should be later than time1).
 *
 * @param time1 - Start time in HH:mm format (e.g., "14:30")
 * @param time2 - End time in HH:mm format (e.g., "16:45")
 * @returns Difference in minutes (always positive via Math.abs)
 */
export function calculateMinutesBetweenTimes(time1: string, time2: string): number {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  const totalMinutes1 = h1 * 60 + m1;
  const totalMinutes2 = h2 * 60 + m2;
  return Math.abs(totalMinutes2 - totalMinutes1);
}

/**
 * SINGLE SOURCE OF TRUTH FOR TIME DIFFERENCE CALCULATIONS
 *
 * Calculates difference in seconds between now and a future/past timezone-naive datetime string.
 * This is the ONLY function that should be used for all time-based status and duration logic.
 *
 * Returns a POSITIVE number if the string represents a time in the FUTURE.
 * Returns a NEGATIVE number if the string represents a time in the PAST.
 * Returns 0 if the input is null/undefined or invalid.
 *
 * CRUCIALLY: Both 'now' and the parsed string are interpreted in the user's local timezone.
 * This ensures "What You See Is What You Get" - no timezone conversions.
 *
 * @param naiveDateTimeString - Timezone-naive datetime string in format "YYYY-MM-DD HH:mm:ss"
 * @returns Difference in seconds (positive = future, negative = past)
 *
 * @example
 * // If current time is 14:00:00
 * getTimeDifferenceInSeconds("2025-11-13 14:35:00") // Returns 2100 (35 minutes = 2100 seconds in the future)
 * getTimeDifferenceInSeconds("2025-11-13 13:30:00") // Returns -1800 (30 minutes = -1800 seconds in the past)
 */
export function getTimeDifferenceInSeconds(naiveDateTimeString: string | undefined | null): number {
  if (!naiveDateTimeString) {
    return 0;
  }

  // Create Date objects. CRUCIALLY, both 'now' and the parsed string are in the user's local timezone.
  // Since the backend sends timezone-naive strings (e.g., "2025-11-13 14:35:00"),
  // the Date constructor interprets them as local time, not UTC.
  const eventTime = new Date(naiveDateTimeString);
  const now = new Date();

  // Calculate difference in milliseconds, then convert to seconds
  // Positive = event is in the future, Negative = event is in the past
  return (eventTime.getTime() - now.getTime()) / 1000;
}
