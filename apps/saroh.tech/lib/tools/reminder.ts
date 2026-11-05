import { daysBetween, formatDayMonth, isDate } from "./dates";

export type Tone = "friendly" | "firm" | "final";
export type Channel = "email" | "whatsapp";

export interface ReminderDraft {
    client: string;
    sender: string;
    number: string;
    amount: string;
    wasDue: string;
    payBy: string;
    payLink: string;
    tone: Tone;
    channel: Channel;
}

/** What a template page hands over: only known fields, as text. */
export function applyReminderCarry(carry: unknown): Partial<ReminderDraft> {
    if (!carry || typeof carry !== "object") return {};
    const c = carry as Record<string, unknown>;
    const patch: Partial<ReminderDraft> = {};
    for (const key of ["client", "sender", "number", "amount"] as const) {
        const value = c[key];
        if (typeof value === "string") patch[key] = value;
    }
    return patch;
}

export const daysOverdue = (wasDue: string, today: string) =>
    isDate(wasDue) ? Math.max(0, daysBetween(wasDue, today)) : 0;

const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** What's not filled in yet stays as a [marker], so nothing is invented. */
export function reminderMessage(
    d: ReminderDraft,
    today: string,
): { subject: string; body: string } {
    const client = d.client.trim() || "[first name]";
    const me = d.sender.trim() || "[your name]";
    const inv = d.number.trim() || "[invoice number]";
    const amount = d.amount.trim() || "[amount]";
    const due = formatDayMonth(d.wasDue) || "[due date]";
    const by = formatDayMonth(d.payBy) || "[pay by date]";
    const late = isDate(d.wasDue)
        ? dayWord(daysOverdue(d.wasDue, today))
        : "[days]";
    const link = d.payLink.trim();
    const email = d.channel === "email";

    if (d.tone === "friendly") {
        return email
            ? {
                  subject: `Invoice ${inv}: a friendly reminder`,
                  body: `Hi ${client},\n\nJust a quick reminder that invoice ${inv} for ${amount} was due on ${due}. It may have slipped through${link ? `, so here is the link to pay: ${link}` : "."}\n\nIf you have already paid, thank you, and please ignore this.\n\nBest,\n${me}`,
              }
            : {
                  subject: "",
                  body: `Hi ${client}, quick reminder that invoice ${inv} (${amount}) was due on ${due}.${link ? ` You can pay here: ${link}` : ""} Thanks! ${me}`,
              };
    }
    if (d.tone === "firm") {
        return email
            ? {
                  subject: `Invoice ${inv} is ${late} overdue`,
                  body: `Hi ${client},\n\nInvoice ${inv} for ${amount} was due on ${due} and is now ${late} overdue. Please pay by ${by}${link ? ` using this link: ${link}` : "."}\n\nIf something is holding it up, reply and let me know.\n\nThanks,\n${me}`,
              }
            : {
                  subject: "",
                  body: `Hi ${client}, invoice ${inv} (${amount}) is now ${late} overdue. Could you pay by ${by}?${link ? ` ${link}` : ""} If something is holding it up, just tell me. ${me}`,
              };
    }
    return email
        ? {
              subject: `Final reminder: invoice ${inv}`,
              body: `Hi ${client},\n\nThis is a final reminder that invoice ${inv} for ${amount} is ${late} overdue. Please pay by ${by}. After that, the late fee in our terms will be added.${link ? `\n\nPay here: ${link}` : ""}\n\nRegards,\n${me}`,
          }
        : {
              subject: "",
              body: `Hi ${client}, final reminder: invoice ${inv} (${amount}) is ${late} overdue. Please pay by ${by}, after which the late fee in our terms applies.${link ? ` ${link}` : ""} ${me}`,
          };
}

/** Opens their own app with the message filled in; they pick who and tap send. */
export function openHref(
    channel: Channel,
    message: { subject: string; body: string },
): string {
    return channel === "email"
        ? `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`
        : `https://wa.me/?text=${encodeURIComponent(message.body)}`;
}
