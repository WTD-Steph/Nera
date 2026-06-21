// Pure reminder logic, extracted from app/page.tsx so it can be recomputed
// live on the client (see components/DashboardReminders + Mode Jam) instead
// of being frozen into a server snapshot. Thresholds unchanged from the
// original inline implementation.

export type ReminderTone = "warning" | "urgent";
export type Reminder = { text: string; tone: ReminderTone };

/** Time-independent inputs resolved server-side; only the clock varies. */
export type ReminderInputs = {
  lastFeedingMs: number | null;
  lastDiaperMs: number | null;
  /** max(last pump ended, last DBF ended); null if neither. */
  lastBreastEmptyMs: number | null;
  /** Which of the two is the more recent breast-emptying event. */
  breastSource: "DBF" | "pump";
  /** Suppress the pumping reminder while a pump/DBF is ongoing. */
  pumpSuppressed: boolean;
  /** Ongoing stopwatch pumping row, if any. */
  longPump: { id: string; startMs: number } | null;
};

export type Reminders = {
  feeding: Reminder | null;
  diaper: Reminder | null;
  pumping: Reminder | null;
  longPump: { id: string; minsRunning: number } | null;
};

function hm(totalMin: number): { h: number; m: number } {
  return { h: Math.floor(totalMin / 60), m: Math.round(totalMin % 60) };
}

export function computeReminders(
  input: ReminderInputs,
  now: number = Date.now(),
): Reminders {
  const feeding = (() => {
    if (input.lastFeedingMs == null) return null;
    const minsSince = (now - input.lastFeedingMs) / 60000;
    if (minsSince < 240) return null;
    const { h, m } = hm(minsSince);
    return {
      text: `Sudah ${h}j ${m}m belum minum`,
      tone: (minsSince >= 480 ? "urgent" : "warning") as ReminderTone,
    };
  })();

  const diaper = (() => {
    if (input.lastDiaperMs == null) return null;
    const minsSince = (now - input.lastDiaperMs) / 60000;
    if (minsSince < 240) return null;
    const { h, m } = hm(minsSince);
    return {
      text: `Cek diaper — sudah ${h}j ${m}m`,
      tone: (minsSince >= 360 ? "urgent" : "warning") as ReminderTone,
    };
  })();

  const pumping = (() => {
    if (input.lastBreastEmptyMs == null || input.pumpSuppressed) return null;
    const minsSince = (now - input.lastBreastEmptyMs) / 60000;
    if (minsSince < 180) return null;
    const { h, m } = hm(minsSince);
    return {
      text: `Sudah ${h}j ${m}m sejak ${input.breastSource} terakhir — supply maintain tiap 2-3j`,
      tone: (minsSince >= 270 ? "urgent" : "warning") as ReminderTone,
    };
  })();

  const longPump = (() => {
    if (!input.longPump) return null;
    const minsRunning = (now - input.longPump.startMs) / 60000;
    if (minsRunning < 30) return null;
    return { id: input.longPump.id, minsRunning: Math.round(minsRunning) };
  })();

  return { feeding, diaper, pumping, longPump };
}
