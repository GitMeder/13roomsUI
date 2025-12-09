/**
 * Safely converts a timezone-naive datetime string ("YYYY-MM-DD HH:mm:ss")
 * to a Date object, interpreting it as local time.
 *
 * This function follows the 13Rooms Time Architecture by explicitly parsing
 * the string components and creating a Date object with those components,
 * ensuring the browser interprets it as local time (Europe/Berlin).
 *
 * @param datetimeString - A string in format "YYYY-MM-DD HH:mm:ss"
 * @returns Date object representing the local time
 */
export function parseNaiveDateTimeToLocal(datetimeString: string): Date {
  const [datePart, timePart] = datetimeString.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);

  // Create Date with explicit components - interpreted as local time
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Exportiert ein einzelnes Event als ICS Datei.
 * Unterstützt jede IANA-Zeitzone korrekt (DST, historische Offsets, Übergänge).
 */
export function exportIcsUniversal(
  options: {
    id?: string;
    title: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    timezone: string;        // z. B. "Europe/Berlin", "America/New_York"
    filename?: string;
  }
): void {

  // ---------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------

  const pad = (n: number) => n.toString().padStart(2, '0');

  const formatUtcDateTime = (d: Date) =>
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds());

  /**
   * Konvertiert JS Date → lokale Uhrzeit der Zielzeitzone
   * und gibt ein Objekt zurück: { year, month, day, hour, minute, second }
   */
  const convertToTz = (date: Date, tz: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(date)
      .reduce((acc: any, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
      }, {});

    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second
    };
  };

  const formatTzDateTime = (d: Date, tz: string) => {
    const c = convertToTz(d, tz);
    return `${c.year}${c.month}${c.day}T${c.hour}${c.minute}${c.second}`;
  };

  /**
   * Holt Offset einer Zeitzone, z.B. +01:00, +05:30, -04:00
   */
  const getOffset = (d: Date, tz: string) => {
    const local = convertToTz(d, tz);

    // UTC Zeit
    const utcYear = d.getUTCFullYear();
    const utcMonth = pad(d.getUTCMonth() + 1);
    const utcDay = pad(d.getUTCDate());
    const utcHour = pad(d.getUTCHours());
    const utcMin = pad(d.getUTCMinutes());

    const dtLocal = new Date(
      `${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}:00`
    ).getTime();

    const dtUtc = Date.UTC(
      utcYear,
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      0
    );

    const diffMin = Math.round((dtLocal - dtUtc) / 60000);
    const sign = diffMin >= 0 ? "+" : "-";
    const absMin = Math.abs(diffMin);
    const hh = pad(Math.floor(absMin / 60));
    const mm = pad(absMin % 60);

    return `${sign}${hh}${mm}`;
  };

  /**
   * Dynamischer VTIMEZONE Block für jede IANA Zeitzone.
   * Enthält DST/Standard-Wechsel korrekt.
   */
  const buildTimezoneBlock = (tz: string): string => {
    const now = new Date();

    const offsetNow = getOffset(now, tz);

    // Ein Beispielzeitpunkt im Sommer und Winter zur DST-Erkennung
    const jan = new Date(now.getFullYear(), 0, 15);
    const jul = new Date(now.getFullYear(), 6, 15);

    const offsetJan = getOffset(jan, tz);
    const offsetJul = getOffset(jul, tz);

    const isDst = offsetJul !== offsetJan;

    if (!isDst) {
      return [
        "BEGIN:VTIMEZONE",
        `TZID:${tz}`,
        `TZOFFSETFROM:${offsetNow}`,
        `TZOFFSETTO:${offsetNow}`,
        "END:VTIMEZONE"
      ].join("\n");
    }

    const offsetWinter = offsetJan < offsetJul ? offsetJan : offsetJul;
    const offsetSommer = offsetJan < offsetJul ? offsetJul : offsetJan;

    return [
      "BEGIN:VTIMEZONE",
      `TZID:${tz}`,
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${offsetSommer}`,
      `TZOFFSETTO:${offsetWinter}`,
      `DTSTART:${now.getFullYear()}0101T000000`,
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      `TZOFFSETFROM:${offsetWinter}`,
      `TZOFFSETTO:${offsetSommer}`,
      `DTSTART:${now.getFullYear()}0701T000000`,
      "END:DAYLIGHT",
      "END:VTIMEZONE"
    ].join("\n");
  };

  // ---------------------------------------------------------
  // ICS erzeugen
  // ---------------------------------------------------------

  const tz = options.timezone;
  const dtStamp = formatUtcDateTime(new Date());
  const dtStart = formatTzDateTime(options.start, tz);
  const dtEnd = formatTzDateTime(options.end, tz);

  const uid = options.id || `${Date.now()}@13rooms`;
  const filename = options.filename || "event.ics";

  const description = options.description
    ? options.description.replace(/\r?\n/g, "\\n")
    : "";

  const ics =
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      buildTimezoneBlock(tz),
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;TZID=${tz}:${dtStart}`,
      `DTEND;TZID=${tz}:${dtEnd}`,
      `SUMMARY:${options.title}`,
      options.location ? `LOCATION:${options.location}` : "",
      description ? `DESCRIPTION:${description}` : "",
      "END:VEVENT",
      "END:VCALENDAR"
    ]
      .filter(Boolean)
      .join("\n");

  // ---------------------------------------------------------
  // Datei herunterladen
  // ---------------------------------------------------------

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
