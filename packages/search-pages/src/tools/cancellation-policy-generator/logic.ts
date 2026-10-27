import type { Para } from "../td-parts";

/**
 * The cancellation policy generator's words (design
 * CancellationPolicy*.dc.html, generator genC/cancel.py): the business's
 * own rules for cancelling, deposits and late arrivals, for its website
 * and as one WhatsApp message. Answers that clash are said where they're
 * picked. Pure, so the tests pin the boards' Rye Studio sample to the
 * letter. Not legal advice.
 */

export const NOTICES = [
    { value: "2", label: "2 hours" },
    { value: "12", label: "12 hours" },
    { value: "24", label: "24 hours" },
    { value: "48", label: "48 hours" },
] as const;
export const DEPOSITS = [
    { value: "none", label: "No deposit" },
    { value: "25", label: "25%" },
    { value: "50", label: "50%" },
    { value: "full", label: "Full price" },
] as const;
export const LATES = [
    { value: "kept", label: "Deposit kept" },
    { value: "due", label: "Full price due" },
    { value: "nothing", label: "Nothing kept" },
] as const;
export const AFTERS = [
    { value: "shorter", label: "Shorter service, full price" },
    { value: "noshow", label: "Counts as not coming" },
] as const;
export const MOVES = [
    { value: "free", label: "Free, same notice as cancelling" },
    { value: "once", label: "Once free, then like a late cancel" },
] as const;
export const FORMATS = [
    { value: "web", label: "For your website" },
    { value: "wa", label: "For WhatsApp" },
] as const;

type V<T extends readonly { value: string }[]> = T[number]["value"];

export interface CancelAnswers {
    name: string;
    notice: V<typeof NOTICES>;
    deposit: V<typeof DEPOSITS>;
    late: V<typeof LATES>;
    /** Minutes, as typed; "" leaves the running-late rule out. */
    grace: string;
    after: V<typeof AFTERS>;
    move: V<typeof MOVES>;
    how: string;
}

/** No deposit, yet the deposit is kept: nothing to keep. */
export const clashes = (a: CancelAnswers) =>
    a.deposit === "none" && a.late === "kept";

const sentence = (s: string) => {
    const t = s.trim();
    return !t || /[.!?]$/.test(t) ? t : `${t}.`;
};
const minutes = (g: string) => {
    const n = Number(g.replace(/\D/g, ""));
    return g.trim() && n > 0 ? n : null;
};

/** What happens on a late cancel or a no-show, in the website's words. */
function lateWords(a: CancelAnswers): string {
    if (clashes(a)) return "[pick what happens]";
    if (a.late === "due") return "the full price of the booking is due.";
    if (a.late === "nothing") return "there's nothing to pay.";
    return a.deposit === "full"
        ? "we keep what you paid."
        : "we keep the deposit.";
}

export function policyTitle(a: CancelAnswers): string {
    return `Cancellation policy, ${a.name.trim() || "[your business]"}`;
}

export function policy(a: CancelAnswers): Para[] {
    const h = `${a.notice} hours`;
    const how = sentence(a.how);
    const out: Para[] = [
        {
            head: "Cancelling or moving.",
            text:
                (a.move === "free"
                    ? `You can cancel or move your booking for free up to ${h} before it starts.`
                    : `You can cancel for free up to ${h} before your booking starts. You can move it once with the same notice; after that, moving counts as a late cancel.`) +
                (how ? ` ${how}` : ""),
        },
    ];
    if (a.deposit !== "none")
        out.push({
            head: "Deposit.",
            text:
                a.deposit === "full"
                    ? "You pay the full price when you book."
                    : `We take a ${a.deposit}% deposit when you book. It counts towards your bill.`,
        });
    out.push({
        head: "Late cancels and no-shows.",
        text: `If you cancel within ${h} of your booking, or don't come, ${lateWords(a)}`,
    });
    const g = minutes(a.grace);
    if (g)
        out.push({
            head: "Running late.",
            text:
                a.after === "shorter"
                    ? `We wait ${g} minutes. After that we may shorten your service so the next person isn't kept waiting, and the full price still applies.`
                    : `We wait ${g} minutes. After that we count it as not coming, and the rule above applies.`,
        });
    if (a.deposit !== "none")
        out.push({
            head: "Your money back.",
            text: `Cancel in time and your ${a.deposit === "full" ? "payment" : "deposit"} comes back to the way you paid.`,
        });
    return out;
}

/** The same rules in one message, to send with each booking. */
export function whatsappVersion(a: CancelAnswers): string {
    const name = a.name.trim() || "[your business]";
    const h = `${a.notice} hours`;
    const parts = [
        a.move === "free"
            ? `${name}'s cancellation policy: you can cancel or move for free up to ${h} before.`
            : `${name}'s cancellation policy: you can cancel for free up to ${h} before, and move once with the same notice.`,
    ];
    const late = `Inside ${h}, or if you don't come,`;
    if (clashes(a)) parts.push(`${late} [pick what happens].`);
    else if (a.late === "due") parts.push(`${late} the full price is due.`);
    else if (a.late === "nothing")
        parts.push(`${late} there's nothing to pay.`);
    else
        parts.push(
            a.deposit === "full"
                ? `${late} we keep what you paid.`
                : `${late} we keep your ${a.deposit}% deposit.`,
        );
    const g = minutes(a.grace);
    if (g)
        parts.push(
            a.after === "shorter"
                ? `We wait ${g} minutes for late arrivals; after that your service may be shorter, at full price.`
                : `We wait ${g} minutes for late arrivals; after that it counts as not coming.`,
        );
    return parts.join(" ");
}

export function policyText(a: CancelAnswers, updated: string): string {
    return [
        policyTitle(a),
        updated,
        ...policy(a).map((p) => (p.head ? `${p.head} ${p.text}` : p.text)),
    ].join("\n\n");
}

export const WORDS = {
    form: "Your cancellation rules",
    name: "Business name",
    notice: "Free to cancel or move until",
    noticeHint: "Before the booking starts.",
    deposit: "Deposit at booking",
    depositHint: "It counts towards their bill.",
    late: "Cancelled late, or didn't come",
    clash: "You take no deposit, so there's nothing to keep. Pick Full price due or Nothing kept, or ask for a deposit.",
    grace: "You wait for late arrivals",
    after: "After that",
    move: "Moving a booking",
    how: "How they cancel",
    howHint: "Said in the policy, so nobody has to ask.",
    show: "Show it",
    waLabel: "WhatsApp version",
    chars: (n: number) =>
        `${n} characters: short enough to send with every booking confirmation.`,
    dueNoDeposit:
        "With no deposit, you can only collect this if they pay you. A deposit is easier to keep than a bill to chase.",
    empty: "Answer the questions and your policy is written here, for your website and for WhatsApp.",
    gate: "Get both versions to copy or download",
    gateButton: "Email it",
    gateAfter:
        "Comes as website text, the short WhatsApp version and a PDF for the counter.",
    copyWeb: "Copy website text",
    copyWa: "Copy WhatsApp version",
    copied: "✓ Copied",
    print: "Print or save as PDF",
} as const;
