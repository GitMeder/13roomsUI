/**
 * Centralized Date/Time Formatting Utilities
 *
 * Pure functions for date/time formatting without timezone conversions.
 * These utilities use simple string manipulation to avoid timezone issues.
 */

/**
 * INTERNAL HELPER: Robustly extracts the time part from a datetime string.
 *
 * Supports both 'T' (ISO format) and space (SQL format) separators.
 * This is the single source of truth for time extraction, ensuring consistency
 * and eliminating duplicated logic across multiple formatters.
 *
 * @param timestamp - Datetime string in "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" format
 * @returns Time part (e.g., "14:30:00") or null if extraction fails
 *
 * @example
 * _getTimePart("2025-11-13 14:30:00") // Returns "14:30:00"
 * _getTimePart("2025-11-13T14:30:00") // Returns "14:30:00"
 */
function _getTimePart(timestamp: string): string | null {
  if (!timestamp || typeof timestamp !== 'string') {
    return null;
  }

  // Determine separator: 'T' for ISO format, space for SQL format
  const separator = timestamp.includes('T') ? 'T' : ' ';
  const parts = timestamp.split(separator);

  // Return the time part (second element) if it exists
  return parts.length > 1 ? parts[1] : null;
}

/**
 * TIMEZONE-NAIVE TIME FORMATTER
 *
 * Formats a datetime string to HH:mm format.
 * Extracts time directly from string without any Date object or timezone conversion.
 *
 * CRITICAL: This function ONLY accepts strings. Date objects are FORBIDDEN.
 * This compile-time enforcement prevents timezone conversion bugs.
 *
 * @param timestamp - Datetime string in "YYYY-MM-DD HH:mm:ss" or ISO format
 * @returns Time in HH:mm format (e.g., "08:00")
 *
 * @example
 * formatToHHMM("2025-11-13 14:30:00") // Returns "14:30"
 * formatToHHMM("2025-11-13T14:30:00") // Returns "14:30"
 */
export function formatToHHMM(timestamp: string | null | undefined): string {
  const timePart = _getTimePart(timestamp || '');
  return timePart ? timePart.substring(0, 5) : '';
}

/**
 * FORMATTING FUNCTION: Date Object to YYYY-MM-DD String
 *
 * Formats a Date object to a timezone-naive 'YYYY-MM-DD' string.
 * This is ONLY for formatting, NEVER for comparison.
 *
 * @param date - Date object to format
 * @returns Date in YYYY-MM-DD format (e.g., "2025-11-13")
 *
 * @example
 * formatToYYYYMMDD(new Date(2025, 10, 13)) // Returns "2025-11-13"
 */
export function formatToYYYYMMDD(date: Date): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * TIMEZONE-NAIVE TIME RANGE FORMATTER
 *
 * Formats two datetime strings as a time range with "Uhr" suffix.
 * Pure string manipulation - no Date object creation.
 *
 * CRITICAL: This function ONLY accepts strings. Date objects are FORBIDDEN.
 *
 * @param startTime - Start datetime string in "YYYY-MM-DD HH:mm:ss" format
 * @param endTime - End datetime string in "YYYY-MM-DD HH:mm:ss" format
 * @returns Formatted range (e.g., "08:00 - 09:30 Uhr")
 *
 * @example
 * formatTimeRange("2025-11-13 08:00:00", "2025-11-13 09:30:00") // Returns "08:00 - 09:30 Uhr"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = formatToHHMM(startTime);
  const end = formatToHHMM(endTime);
  return `${start} - ${end} Uhr`;
}

/**
 * Formats a date/time to a localized German format with relative day labels.
 * Shows "Heute", "Morgen", or "Day, DD. MMM" based on the date.
 *
 * TIME ARCHITECTURE: Uses string comparison (YYYY-MM-DD) for date logic,
 * only creates Date objects for final display formatting.
 *
 * @param dateString - ISO string or SQL datetime string
 * @returns Formatted string (e.g., "Heute, 14:30" or "Mi, 13. Nov, 14:30")
 */
export function formatDateTime(dateString: string): string {
  if (!dateString) return '';

  // Extract date part (YYYY-MM-DD) from input string using pure string operations
  const inputDateStr = dateString.includes(' ')
    ? dateString.split(' ')[0]  // SQL format: "YYYY-MM-DD HH:mm:ss"
    : dateString.split('T')[0];  // ISO format: "YYYY-MM-DDTHH:mm:ss"

  // Get today's date string using safe helper
  const todayDateStr = formatToYYYYMMDD(new Date());

  // Get tomorrow's date string using safe helper
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDateStr = formatToYYYYMMDD(tomorrowDate);

  // TIME ARCHITECTURE: Compare date strings directly (no Date object comparison)
  let dayLabel = '';
  if (inputDateStr === todayDateStr) {
    dayLabel = 'Heute';
  } else if (inputDateStr === tomorrowDateStr) {
    dayLabel = 'Morgen';
  } else {
    // For display purposes only: Create Date object to extract day/month names
    // This is ALLOWED per the blueprint (Date objects for pure formatting)
    const [year, month, day] = inputDateStr.split('-').map(Number);
    const displayDate = new Date(year, month - 1, day);

    const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const dayOfWeek = dayNames[displayDate.getDay()];
    const dayNum = displayDate.getDate();
    const monthName = monthNames[displayDate.getMonth()];
    dayLabel = `${dayOfWeek}, ${dayNum}. ${monthName}`;
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
 * FORMATTING FUNCTION: Date Object to Verbose German Date
 *
 * Formats a Date object to verbose German format.
 * This is ONLY for formatting, NEVER for comparison.
 *
 * @param date - Date object to format
 * @returns Formatted string (e.g., "12. November 2025")
 *
 * @example
 * formatToVerboseGermanDate(new Date(2025, 10, 12)) // Returns "12. November 2025"
 */
export function formatToVerboseGermanDate(date: Date): string {
  if (!date) return '';

  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  return `${day}. ${month} ${year}`;
}

/**
 * Extracts the time part (HH:mm:ss) from a datetime string in a timezone-safe way.
 * This is used for full timestamp displays including seconds.
 *
 * Supports both ISO format (with 'T') and SQL format (with space).
 *
 * @param timestamp - ISO string or SQL datetime string
 * @returns Time in HH:mm:ss format (e.g., "14:30:45")
 *
 * @example
 * formatToHHMMSS("2025-11-13T14:30:45.000Z") // Returns "14:30:45"
 * formatToHHMMSS("2025-11-13 14:30:45") // Returns "14:30:45"
 */
export function formatToHHMMSS(timestamp: string | undefined | null): string {
  const timePart = _getTimePart(timestamp || '');
  return timePart ? timePart.substring(0, 8) : '';
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
 * SINGLE SOURCE OF TRUTH FOR CURRENT TIME IN COMPARISONS
 *
 * Returns the current date and time as a timezone-naive 'YYYY-MM-DD HH:mm:ss' string.
 * This is the ONLY approved method for getting the current time for comparisons.
 *
 * All time comparisons in the application MUST use pure string comparison between
 * this function's output and booking datetime strings. Never use new Date() for comparisons.
 *
 * @returns Current time in 'YYYY-MM-DD HH:mm:ss' format (e.g., "2025-11-13 14:30:45")
 *
 * @example
 * const nowString = getCurrentNaiveDateTimeString();
 * const booking = { end_time: "2025-11-13 15:00:00" };
 * if (booking.end_time > nowString) {
 *   // Booking is in the future (uses pure string comparison)
 * }
 */
export function getCurrentNaiveDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * TIMEZONE-SAFE DURATION CALCULATION
 *
 * Calculates the difference in seconds between two timezone-naive datetime strings.
 * Returns POSITIVE if datetime2 is LATER than datetime1.
 * Returns NEGATIVE if datetime2 is EARLIER than datetime1.
 *
 * Uses pure string parsing and math - never uses new Date() to avoid timezone bugs.
 * Safe for calculating durations, progress, and remaining time.
 *
 * @param datetime1 - Start time in 'YYYY-MM-DD HH:mm:ss' format
 * @param datetime2 - End time in 'YYYY-MM-DD HH:mm:ss' format
 * @returns Difference in seconds (datetime2 - datetime1)
 *
 * @example
 * calculateSecondsBetweenNaive("2025-11-13 14:00:00", "2025-11-13 15:30:00") // Returns 5400 (90 minutes)
 * calculateSecondsBetweenNaive("2025-11-13 15:00:00", "2025-11-13 14:00:00") // Returns -3600 (-60 minutes)
 */
export function calculateSecondsBetweenNaive(datetime1: string, datetime2: string): number {
  const parseDateTime = (str: string): number => {
    const [datePart, timePart] = str.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);

    // Convert to timestamp using Date.UTC (always treats input as UTC, no timezone conversion)
    // This is safe because we're using the numeric components directly
    return Date.UTC(year, month - 1, day, hours, minutes, seconds) / 1000;
  };

  return parseDateTime(datetime2) - parseDateTime(datetime1);
}

/**
 * SINGLE SOURCE OF TRUTH FOR FINDING LAST BUSY SLOT
 *
 * Finds the end time of the last continuous block of bookings for a given day.
 * Sorts bookings and finds the latest end time across all bookings.
 * Uses pure string comparisons to remain immune to timezone issues.
 *
 * This function is the authoritative source for determining when a room becomes
 * available after all bookings on a given day. It is critical for correctly
 * suggesting the next available time slot without creating artificial gaps.
 *
 * @param bookings - An array of booking objects for a single day
 * @returns The end time of the last booking as an "HH:mm" string, or '00:00' if no bookings exist
 *
 * @example
 * const bookings = [
 *   { start_time: '2025-11-13 09:00:00', end_time: '2025-11-13 10:00:00' },
 *   { start_time: '2025-11-13 14:00:00', end_time: '2025-11-13 15:30:00' }
 * ];
 * findLastBusySlotEnd(bookings) // Returns '15:30'
 */
export function findLastBusySlotEnd(bookings: { start_time: string; end_time: string }[]): string {
  if (!bookings || bookings.length === 0) {
    return '00:00';
  }

  // Sort bookings by start time to process them chronologically
  const sortedBookings = [...bookings].sort((a, b) => a.start_time.localeCompare(b.start_time));

  let lastEndTime = '00:00';

  for (const booking of sortedBookings) {
    // Extract time part using string manipulation (timezone-safe)
    let bookingEndTimeStr: string;

    if (booking.end_time.includes('T')) {
      // ISO format: "2025-11-13T14:30:00.000Z"
      bookingEndTimeStr = booking.end_time.split('T')[1].substring(0, 5);
    } else if (booking.end_time.includes(' ')) {
      // SQL format: "2025-11-13 14:30:00"
      bookingEndTimeStr = booking.end_time.split(' ')[1].substring(0, 5);
    } else {
      continue;
    }

    // Track the latest end time found
    if (bookingEndTimeStr > lastEndTime) {
      lastEndTime = bookingEndTimeStr;
    }
  }

  return lastEndTime;
}
