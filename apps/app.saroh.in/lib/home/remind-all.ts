import { formatMoney } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";
import type {
    ReminderPreview,
    ReminderRow,
    ReminderSendResult,
} from "@/lib/invoices/remind-all";
import type { ReminderWhyCode } from "@/lib/invoices/reminder-why";
import { reminderWhy, suppressedWhy } from "@/lib/invoices/reminder-why";

import type { GroupLine } from "./group-words";

/**
 * What Remind all says (DEC-171, Home plan U8, boards `HARemindD`,
 * `HARemindUndoD`, `HPSheets`): the sheet's lines, the button, the bills
 * group's line while the reminders wait their ten seconds and after, and
 * the toasts, read from Remind many's answer (`POST invoices/reminders`,
 * U5 #1117). Pure, so it is tested without a page. Money only where the
 * API sent it (DEC-098).
 */

/** Why a bill isn't reminded this time, as the sheet groups them. */
export type RemindAllSkip =
    /** Sent or reminded in the last 3 days, or already today. */
    | "RECENT"
    /** No email and no phone to reach them. */
    | "NO_WAY"
    /** No email provider connected, and no phone. */
    | "NO_PROVIDER"
    /** No email to send to, but a phone: the business opens WhatsApp. */
    | "WHATSAPP"
    /** An autopay charge is under way on it. */
    | "AUTOPAY"
    /** Paid, cancelled or no longer this business's to chase. */
    | "NOT_OVERDUE"
    /** The send itself was refused. */
    | "FAILED";

export interface RemindAllBill {
    invoiceId: string;
    number: string | null;
    name: string | null;
    /** What is left to pay, in minor units; null without `payment:read`. */
    amountMinor: number | null;
    currency: string;
    lateDays: number;
}

export interface RemindAllSkipped extends RemindAllBill {
    reason: RemindAllSkip;
    /** Why exactly (`reminder-why.ts`): what the sheet branches on. */
    why: ReminderWhyCode;
    /** "Reminded yesterday", "No email or phone to reach them". */
    words: string;
}

/** The sheet's read: who gets a reminder, who is skipped, the words. */
export interface RemindAllPreview {
    going: RemindAllBill[];
    skipped: RemindAllSkipped[];
    /** How many different people the reminders go to. */
    people: number;
    totals: { currency: string; amountMinor: number }[] | null;
    /** The reminder the first of them gets, in words, one paragraph a line. */
    message: string | null;
    /** Overdue bills past the 100 listed. */
    more: number;
}

/** What came back from Send. */
export interface RemindAllResult {
    sent: { invoiceId: string; name: string | null }[];
    skipped: {
        invoiceId: string;
        name: string | null;
        reason: RemindAllSkip;
        why?: ReminderWhyCode;
        words: string;
    }[];
}

/** "1125.50" (a Decimal string) as 112550; null when absent. */
export function minorOf(amount: string | undefined): number | null {
    if (amount === undefined) return null;
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
    if (!m) return null;
    const [, sign, whole, cents = ""] = m as unknown as [
        string,
        string,
        string,
        string | undefined,
    ];
    const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
    return sign ? -minor : minor;
}

function billOf(row: ReminderRow): RemindAllBill {
    return {
        invoiceId: row.invoiceId,
        number: row.number ?? null,
        name: row.name ?? null,
        amountMinor: minorOf(row.leftToPay),
        currency: row.currency ?? "INR",
        lateDays: row.lateDays ?? 0,
    };
}

/** Remind all's group for each reason (`reminder-why.ts`). */
const SKIP_OF: Record<ReminderWhyCode, RemindAllSkip> = {
    REMINDED_TODAY: "RECENT",
    REMINDED_RECENTLY: "RECENT",
    EMAIL_NOT_CONNECTED: "WHATSAPP",
    EMAIL_OFF: "WHATSAPP",
    NO_EMAIL: "WHATSAPP",
    AUTOPAY: "AUTOPAY",
    UNREACHABLE_NOT_CONNECTED: "NO_PROVIDER",
    UNREACHABLE_EMAIL_OFF: "NO_WAY",
    UNREACHABLE: "NO_WAY",
    PAID: "NOT_OVERDUE",
    DRAFT: "NOT_OVERDUE",
    ORDER: "NOT_OVERDUE",
    NOT_OWED: "NOT_OVERDUE",
};

/**
 * Why one row isn't reminded, and its words; null when it goes. The
 * words are Remind many's (one wording, review #30); a WhatsApp one adds
 * where to send it from, since Remind all sends no WhatsApp.
 */
export function skipOf(
    row: ReminderRow,
): { reason: RemindAllSkip; why: ReminderWhyCode; words: string } | null {
    const why = reminderWhy(row);
    if (!why) return null;
    const reason = SKIP_OF[why.code];
    return {
        reason,
        why: why.code,
        words:
            reason === "WHATSAPP"
                ? `${why.words} · WhatsApp from the bill`
                : why.words,
    };
}

/** Different people: one name is one person; a bill with none is its own. */
function peopleIn(bills: readonly RemindAllBill[]): number {
    return new Set(
        bills.map((b) => {
            const name = b.name?.trim().toLowerCase() ?? "";
            return name.length > 0 ? name : `bill:${b.invoiceId}`;
        }),
    ).size;
}

/**
 * Remind many's preview as the sheet reads it: email ones go, everyone
 * else is skipped with why. `more` is the overdue bills past the 100 sent.
 */
export function fromPreview(
    preview: ReminderPreview,
    more = 0,
): RemindAllPreview {
    const going: RemindAllBill[] = [];
    const skipped: RemindAllSkipped[] = [];
    for (const row of preview.invoices) {
        // Never this business's: not named back.
        if (row.reason === "NOT_FOUND") continue;
        const skip = skipOf(row);
        if (skip) skipped.push({ ...billOf(row), ...skip });
        else going.push(billOf(row));
    }
    const money = going.every((b) => b.amountMinor !== null);
    const by = new Map<string, number>();
    for (const b of going) {
        by.set(b.currency, (by.get(b.currency) ?? 0) + (b.amountMinor ?? 0));
    }
    return {
        going,
        skipped,
        people: peopleIn(going),
        totals:
            money && going.length > 0
                ? Array.from(by).map(([currency, amountMinor]) => ({
                      currency,
                      amountMinor,
                  }))
                : null,
        message: preview.message,
        more: Math.max(0, more),
    };
}

/** Send's answer: who was emailed, and who wasn't after all, and why. */
export function fromResult(result: ReminderSendResult): RemindAllResult {
    const out: RemindAllResult = { sent: [], skipped: [] };
    for (const row of result.invoices) {
        const name = row.reason === "NOT_FOUND" ? null : (row.name ?? null);
        if (row.outcome === "EMAILED") {
            out.sent.push({ invoiceId: row.invoiceId, name });
            continue;
        }
        if (row.outcome === "SUPPRESSED") {
            const off = suppressedWhy();
            out.skipped.push({
                invoiceId: row.invoiceId,
                name,
                reason: "NO_WAY",
                why: off.code,
                words: off.words,
            });
            continue;
        }
        if (row.outcome === "FAILED" && row.way !== "WAIT") {
            out.skipped.push({
                invoiceId: row.invoiceId,
                name,
                reason: "FAILED",
                words: row.message ?? "Couldn't send this one",
            });
            continue;
        }
        const skip = skipOf(row) ?? {
            reason: "FAILED" as const,
            words: "Couldn't send this one",
        };
        out.skipped.push({ invoiceId: row.invoiceId, name, ...skip });
    }
    return out;
}

/** Where an email provider is connected. */
export const PROVIDERS_HREF = "/settings/providers";

/** Remind all's state on the bills group's line. */
export interface RemindAllState {
    phase: "held" | "sent";
    /** How many different people the reminders go to. */
    people: number;
    /** Skipped when they were picked, and why. */
    skipped: number;
    reasons: RemindAllSkip[];
    /** How many went, once sent. */
    sent?: number;
}

/** What Remind all sends, as the sheet picked it. */
export interface RemindAllPick {
    invoiceIds: string[];
    /** Wait anyone heard from in these last days, read again at Send. */
    quietDays?: number;
    people: number;
    skipped: number;
    reasons: RemindAllSkip[];
}

/** The key Remind all's hold is kept under among Home's done rows. */
export const REMIND_ALL_KEY = "remind-all:BILLS";

/** "₹23,730", or "₹23,730 + $40" across currencies; null without money. */
export function totalWords(preview: Pick<RemindAllPreview, "totals">) {
    const totals = (preview.totals ?? []).filter((t) => t.amountMinor > 0);
    if (totals.length === 0) return null;
    return totals
        .map((t) => formatMoney(t.amountMinor, t.currency))
        .join(" + ");
}

/** "7 people owe ₹23,730 on overdue bills." */
export function introWords(preview: RemindAllPreview): string {
    const who = count(preview.people, "person", "people");
    const money = totalWords(preview);
    const bills = plural(
        preview.going.length,
        "an overdue bill",
        "overdue bills",
    );
    if (!money) {
        return `${who} ${plural(preview.people, "has", "have")} ${bills} to remind.`;
    }
    return `${who} ${plural(preview.people, "owes", "owe")} ${money} on ${bills}.`;
}

/** "Late 29 days". */
export function lateWords(days: number): string {
    return `Late ${count(Math.max(1, days), "day")}`;
}

const SKIP_WORDS: Record<RemindAllSkip, string> = {
    RECENT: "reminded in the last 3 days",
    NO_WAY: "no way to reach them",
    NO_PROVIDER: "no way to reach them",
    WHATSAPP: "no email, so WhatsApp from the bill",
    AUTOPAY: "autopay is taking it",
    NOT_OVERDUE: "no longer overdue",
    FAILED: "couldn't be sent",
};

/** Why they were skipped, each reason once, in the board's words. */
export function skipReasons(reasons: readonly RemindAllSkip[]): string {
    const words: string[] = [];
    for (const r of reasons) {
        const w = SKIP_WORDS[r];
        if (!words.includes(w)) words.push(w);
    }
    return words.join(", or ");
}

/** "3 skipped · reminded in the last 3 days, or no way to reach them". */
export function skippedHeading(preview: RemindAllPreview): string | null {
    const n = preview.skipped.length;
    if (n === 0) return null;
    return `${n} skipped · ${skipReasons(preview.skipped.map((s) => s.reason))}`;
}

/** "Send 7 reminders". */
export function sendLabel(n: number): string {
    return `Send ${count(n, "reminder")}`;
}

/**
 * How it goes, said as it is: by the business's own email. Saroh sends no
 * WhatsApp (DEC-173): anyone with only a phone is listed as skipped, to
 * remind from their bill.
 */
export function channelNote(preview: RemindAllPreview): string {
    const whatsapp = preview.skipped.some((s) => s.reason === "WHATSAPP");
    return whatsapp
        ? "By email from your own address. Each person sees only their own bill. Anyone with only a phone number is below, to remind on WhatsApp from their bill."
        : "By email from your own address. Each person sees only their own bill.";
}

/** Nobody to remind: why, and what would change it. */
export function noneWords(preview: RemindAllPreview): {
    title: string;
    body: string;
    /** "Connect an email provider", when that is what's missing. */
    connect: boolean;
} {
    // On the reason's code, never its words (review #30).
    const noProvider =
        preview.skipped.length > 0 &&
        preview.skipped.every(
            (s) =>
                s.why === "EMAIL_NOT_CONNECTED" ||
                s.why === "UNREACHABLE_NOT_CONNECTED",
        );
    if (noProvider) {
        return {
            title: "Reminders go from your own email",
            body: "Connect an email provider in Settings › Providers to send them.",
            connect: true,
        };
    }
    return {
        title: "No one to remind right now",
        body:
            preview.skipped.length > 0
                ? `Everyone with an overdue bill was ${skipReasons(preview.skipped.map((s) => s.reason))}.`
                : "Nothing is overdue.",
        connect: false,
    };
}

/** The toast while it waits: "7 reminders go out in 10 seconds. 3 skipped." */
export function heldToast(going: number, skipped: number): string {
    const out = `${count(going, "reminder")} ${plural(going, "goes", "go")} out in 10 seconds.`;
    return skipped > 0 ? `${out} ${skipped} skipped.` : out;
}

/**
 * The bills group's line while the reminders wait (`HARemindUndoD`):
 * the title stays, the line under it says who they go to, and the tag
 * says "Sending".
 */
export function heldLine(
    line: GroupLine,
    held: {
        people: number;
        skipped: number;
        reasons: readonly RemindAllSkip[];
    },
): GroupLine {
    const to = `Reminders going to ${count(held.people, "person", "people")}`;
    return {
        title: line.title,
        sub:
            held.skipped > 0
                ? `${to} · ${held.skipped} skipped: ${skipReasons(held.reasons)}`
                : to,
        tag: { label: "Sending", tone: "info" },
    };
}

/** The bills group's line once they went: "Reminded 7 people today". */
export function sentLine(line: GroupLine, sent: number): GroupLine {
    return {
        title: line.title,
        sub:
            sent > 0
                ? `${count(sent, "reminder")} sent today`
                : "No reminders went",
        tag: line.tag,
    };
}

/** What the toast says once the send came back. */
export function resultWords(result: RemindAllResult): {
    title: string;
    body?: string;
} {
    const sent = result.sent.length;
    const title =
        sent > 0 ? `${count(sent, "reminder")} sent` : "No reminders were sent";
    if (result.skipped.length === 0) return { title };
    const named = result.skipped
        .slice(0, 3)
        .map((s) => `${s.name ?? "A bill"} (${s.words.toLowerCase()})`);
    const rest = result.skipped.length - named.length;
    return {
        title,
        body: `Skipped: ${named.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}.`,
    };
}

/** The bills group's line, as Remind all leaves it: waiting, sent, or as it was. */
export function remindLine(
    line: GroupLine,
    remind: RemindAllState | undefined,
): GroupLine {
    if (!remind) return line;
    return remind.phase === "held"
        ? heldLine(line, remind)
        : sentLine(line, remind.sent ?? 0);
}
