import { formatNumber } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";
import { minorOf, totalWords } from "@/lib/home/remind-all";

import type {
    ReminderPreview,
    ReminderRow,
    ReminderSendResult,
} from "./remind-all";
import type { Invoice } from "./service";
import { billedTo, lateBy, leftCents } from "./status";

/**
 * Remind many, by channel (DEC-173, U12 #1124, INVBulkSend and
 * INVBulkSendPhone, with INVShareB's one-look summary heading step 2): the
 * three steps' words and groups, pure so each is tested without a page.
 *
 * 1. **Pick who:** the owed invoices shown, each ticked to start.
 * 2. **How each one goes:** Remind many's preview (`POST
 *    invoices/reminders/preview`, U5 #1117) grouped as "Email, sent for
 *    you", "WhatsApp, one tap each" and "Can't reach now", with why.
 * 3. **Send:** the emails held ten seconds with Undo, then WhatsApp opened
 *    for each in turn, and a tally at the end.
 *
 * Amounts only where the API or the list sent them (DEC-098). The API takes
 * at most {@link REMIND_MANY_MAX} invoices a call, so a longer pick goes in
 * several calls (`chunks`).
 */

/** The API's own cap on one Remind many call (`BULK_REMINDER_MAX`). */
export const REMIND_MANY_MAX = 100;

/** The key the emails' ten-second hold is kept under. */
export const REMIND_MANY_KEY = "invoice-reminders:many";

/** One invoice in step 1. */
export interface PickRow {
    invoiceId: string;
    name: string;
    number: string | null;
    lateDays: number;
    /** What is left to pay, in minor units. */
    amountMinor: number;
    currency: string;
}

/** An invoice a reminder can go for: issued and owed, and not an order's. */
export function remindable(
    i: Pick<Invoice, "standing" | "kind" | "source" | "order">,
): boolean {
    if (i.kind === "CREDIT_NOTE") return false;
    if (i.order || i.source === "ORDER") return false;
    return i.standing === "OVERDUE" || i.standing === "ISSUED";
}

/** Step 1's rows: the remindable ones, the latest first, as the board lists them. */
export function pickRowsOf(
    invoices: readonly Invoice[],
    now: Date = new Date(),
): PickRow[] {
    return invoices
        .filter(remindable)
        .map((i) => ({
            invoiceId: i.id,
            name: billedTo(i).name,
            number: i.number,
            lateDays: lateBy(i, now),
            amountMinor: leftCents(i),
            currency: i.currency,
        }))
        .sort((a, b) => b.lateDays - a.lateDays);
}

/** "₹13,440", or "₹480 + $40" across currencies; null with nothing to add. */
export function sumWords(
    rows: readonly Pick<PickRow, "amountMinor" | "currency">[],
): string | null {
    const by = new Map<string, number>();
    for (const r of rows) {
        by.set(r.currency, (by.get(r.currency) ?? 0) + r.amountMinor);
    }
    return totalWords({
        totals: Array.from(by).map(([currency, amountMinor]) => ({
            currency,
            amountMinor,
        })),
    });
}

/** "7 overdue shown. Ticked: 6 · ₹13,440." */
export function pickLine(
    shown: readonly PickRow[],
    ticked: readonly PickRow[],
): string {
    const overdue = shown.every((r) => r.lateDays > 0);
    const head = `${formatCount(shown.length)} ${overdue ? "overdue " : ""}shown.`;
    const money = sumWords(ticked);
    return `${head} Ticked: ${formatCount(ticked.length)}${money ? ` · ${money}` : ""}.`;
}

const formatCount = (n: number) => formatNumber(n);

/** "13 days late", or "Not due yet" for one picked before it is late. */
export function lateLine(lateDays: number): string {
    return lateDays > 0 ? `${count(lateDays, "day")} late` : "Not due yet";
}

/** The ids in calls of at most `size`, in order. */
export function chunks<T>(ids: readonly T[], size = REMIND_MANY_MAX): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < ids.length; i += size) {
        out.push(ids.slice(i, i + size));
    }
    return out;
}

/** Several previews (one per call) read as one. */
export function joinPreviews(
    parts: readonly ReminderPreview[],
): ReminderPreview {
    return {
        invoices: parts.flatMap((p) => p.invoices),
        message: parts.find((p) => p.message)?.message ?? null,
    };
}

/** Several sends read as one. */
export function joinResults(
    parts: readonly ReminderSendResult[],
): ReminderSendResult {
    return { invoices: parts.flatMap((p) => p.invoices) };
}

/** One row of step 2, with what it says under the name. */
export interface WayRow {
    invoiceId: string;
    name: string;
    number: string | null;
    amountMinor: number | null;
    currency: string;
    /** Email: the address. WhatsApp: why not email. Can't reach: why. */
    note: string;
    /** WhatsApp: the phone (E.164). */
    phone?: string;
    /** Can't reach: when the next reminder may go. */
    retryAt?: string;
    /** Can't reach: it waits (one a day), rather than has no way at all. */
    waits?: boolean;
}

export interface Ways {
    email: WayRow[];
    whatsapp: WayRow[];
    cantReach: WayRow[];
    /** Some went to WhatsApp only because no email of the business's own is connected. */
    noProvider: boolean;
}

/** Why a WhatsApp one isn't emailed, as the board says it. */
export function whatsappWhy(row: Pick<ReminderRow, "reason">): string {
    switch (row.reason) {
        case "EMAIL_OFF":
            return "Turned off email from you";
        case "NO_EMAIL_PROVIDER":
            return "Email not connected";
        default:
            return "No email";
    }
}

/** Why one can't be reached now; null when it goes. */
export function cantReachWhy(row: ReminderRow): string | null {
    switch (row.way) {
        case "EMAIL":
        case "WHATSAPP":
            return null;
        case "WAIT":
            return row.reason === "REMINDED_RECENTLY"
                ? (row.lastWords ?? "Reminded in the last few days")
                : "Reminded today. Next one tomorrow (one a day).";
        case "NONE":
            switch (row.reason) {
                case "AUTOPAY_PENDING":
                    return "Autopay is taking it now";
                case "UNREACHABLE":
                    return row.emailBlocked === "NO_EMAIL_PROVIDER"
                        ? "No phone, and email isn't connected"
                        : row.emailBlocked === "EMAIL_OFF"
                          ? "Turned off email from you, and no phone"
                          : "No email or phone";
                case "PAID":
                    return "Paid already";
                case "DRAFT":
                    return "Not issued yet";
                case "ORDER":
                    return "Belongs to an order: remind from the order";
                default:
                    return "Not owed any more";
            }
    }
}

function wayRowOf(row: ReminderRow, note: string): WayRow {
    return {
        invoiceId: row.invoiceId,
        name: row.name ?? row.number ?? "A customer",
        number: row.number ?? null,
        amountMinor: minorOf(row.leftToPay),
        currency: row.currency ?? "INR",
        note,
    };
}

/** Step 2's groups, from Remind many's preview, in the order it was picked. */
export function waysOf(preview: ReminderPreview): Ways {
    const ways: Ways = {
        email: [],
        whatsapp: [],
        cantReach: [],
        noProvider: false,
    };
    for (const row of preview.invoices) {
        // Never this business's: not named back.
        if (row.reason === "NOT_FOUND") continue;
        if (row.reason === "NO_EMAIL_PROVIDER") ways.noProvider = true;
        if (row.emailBlocked === "NO_EMAIL_PROVIDER") ways.noProvider = true;
        if (row.way === "EMAIL") {
            ways.email.push(wayRowOf(row, row.email ?? "By email"));
            continue;
        }
        if (row.way === "WHATSAPP" && row.phone) {
            ways.whatsapp.push({
                ...wayRowOf(row, whatsappWhy(row)),
                phone: row.phone,
            });
            continue;
        }
        ways.cantReach.push({
            ...wayRowOf(row, cantReachWhy(row) ?? "No email or phone"),
            ...(row.retryAt ? { retryAt: row.retryAt } : {}),
            waits: row.way === "WAIT",
        });
    }
    return ways;
}

/** Step 2's button: "Send 3 emails, then WhatsApp 2", "Send 3 emails", "WhatsApp 2". */
export function sendLabel(ways: Pick<Ways, "email" | "whatsapp">): string {
    const e = ways.email.length;
    const w = ways.whatsapp.length;
    if (e > 0 && w > 0) return `Send ${count(e, "email")}, then WhatsApp ${w}`;
    if (e > 0) return `Send ${count(e, "email")}`;
    if (w > 0) return `WhatsApp ${w}`;
    return "Nothing to send";
}

/**
 * Step 2's head, INVShareB's one look: "6 invoices · ₹13,440", then one
 * sentence of how it goes.
 */
export function waysHead(ways: Ways): { title: string; line: string } {
    const all = [...ways.email, ...ways.whatsapp, ...ways.cantReach];
    const known = all.every((r) => r.amountMinor !== null);
    const money = known
        ? sumWords(
              all.map((r) => ({
                  amountMinor: r.amountMinor ?? 0,
                  currency: r.currency,
              })),
          )
        : null;
    const title = `${count(all.length, "invoice")}${money ? ` · ${money}` : ""}`;
    const parts: string[] = [];
    const e = ways.email.length;
    const w = ways.whatsapp.length;
    const c = ways.cantReach.length;
    if (e > 0) parts.push(`${e} ${plural(e, "goes", "go")} by email now.`);
    if (w > 0) {
        const who =
            w === 1 ? firstName(ways.whatsapp[0]?.name ?? "") : `${w} people`;
        parts.push(
            e > 0
                ? `WhatsApp opens for ${who} after, one tap each.`
                : `WhatsApp opens for ${who}, one tap each.`,
        );
    }
    if (c > 0) {
        parts.push(
            c === 1
                ? `${firstName(ways.cantReach[0]?.name ?? "")} can't be reached now.`
                : `${c} can't be reached now.`,
        );
    }
    return {
        title,
        line: parts.length > 0 ? parts.join(" ") : "No one to remind.",
    };
}

/** "Vivek" from "Vivek Nair". */
export function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
}

/** "Nikhil, Anjali, Arjun", or "Nikhil, Anjali and 4 more". */
export function names(list: readonly string[], max = 3): string {
    const first = list.map(firstName);
    if (first.length <= max) return first.join(", ");
    return `${first.slice(0, max).join(", ")} and ${first.length - max} more`;
}

/** How the emails stand in step 3. */
export type EmailPhase =
    | { phase: "none" }
    | { phase: "held"; names: string[] }
    | {
          phase: "sent";
          emailed: string[];
          /** Refused as they went, with why. */
          failed: { name: string; words: string }[];
          /** Reminded since, elsewhere: they wait. */
          waits: string[];
      }
    | { phase: "undone" }
    | { phase: "failed" };

/** What the send answered, sorted for the tally. */
export function emailOutcome(
    result: ReminderSendResult,
): Extract<EmailPhase, { phase: "sent" }> {
    const out: Extract<EmailPhase, { phase: "sent" }> = {
        phase: "sent",
        emailed: [],
        failed: [],
        waits: [],
    };
    for (const row of result.invoices) {
        if (row.reason === "NOT_FOUND") continue;
        const name = row.name ?? row.number ?? "A customer";
        if (row.outcome === "EMAILED") out.emailed.push(name);
        else if (row.way === "WAIT") out.waits.push(name);
        else if (row.outcome === "SUPPRESSED") {
            out.failed.push({ name, words: "Turned off email from you" });
        } else if (row.outcome === "FAILED") {
            out.failed.push({
                name,
                words: row.message ?? "Couldn't send this one",
            });
        }
    }
    return out;
}

/** The tally at the end: each line a count, its words, and who. */
export interface TallyLine {
    key: "emailed" | "whatsapp" | "skipped" | "waits" | "cantReach" | "failed";
    count: number;
    words: string;
    who: string;
}

export interface Tally {
    emailed: string[];
    whatsapp: string[];
    skipped: string[];
    waits: string[];
    cantReach: string[];
    failed: string[];
}

export function tallyLines(t: Tally): TallyLine[] {
    const lines: TallyLine[] = [
        {
            key: "emailed",
            count: t.emailed.length,
            words: "emailed",
            who: names(t.emailed),
        },
        {
            key: "whatsapp",
            count: t.whatsapp.length,
            words: "shared on WhatsApp",
            who: names(t.whatsapp),
        },
        {
            key: "waits",
            count: t.waits.length,
            words: plural(
                t.waits.length,
                "waits until tomorrow",
                "wait until tomorrow",
            ),
            who: names(t.waits),
        },
        {
            key: "skipped",
            count: t.skipped.length,
            words: "skipped",
            who: names(t.skipped),
        },
        {
            key: "cantReach",
            count: t.cantReach.length,
            words: "can't be reached",
            who: names(t.cantReach),
        },
        {
            key: "failed",
            count: t.failed.length,
            words: plural(
                t.failed.length,
                "email didn't go",
                "emails didn't go",
            ),
            who: names(t.failed),
        },
    ];
    return lines.filter((l) => l.count > 0);
}

/** "1 emailed · 1 shared on WhatsApp · 1 waits until tomorrow". */
export function tallyLine(t: Tally): string {
    const lines = tallyLines(t);
    if (lines.length === 0) return "No reminders went.";
    return lines.map((l) => `${l.count} ${l.words}`).join(" · ");
}

/** How one invoice was reminded here, for its row: "Reminded today · by email". */
export type RemindedBy = "email" | "whatsapp";

export function remindedWords(by: RemindedBy): string {
    return by === "email"
        ? "Reminded today · by email"
        : "Reminded today · on WhatsApp";
}

/** "Remind all 10". */
export function remindAllLabel(n: number): string {
    return `Remind all ${n}`;
}
