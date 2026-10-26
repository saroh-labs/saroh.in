import type { Para } from "../td-parts";

/**
 * The refund policy generator's words (design RefundPolicy*.dc.html,
 * generator genC/refund.py): each answer adds one short paragraph, in the
 * business's own voice, about what the business itself does. It always
 * says what happens to a damaged or wrong item. A gap ("[your WhatsApp or
 * email]") stays marked until it's filled. Pure, so the tests pin the
 * boards' Gulmohar Handlooms sample to the letter. Not legal advice.
 */

export const SELLS = [
    { value: "products", label: "Products" },
    { value: "services", label: "Services" },
    { value: "both", label: "Both" },
] as const;
export const DAYS = [
    { value: "0", label: "No returns" },
    { value: "7", label: "7 days" },
    { value: "15", label: "15 days" },
    { value: "30", label: "30 days" },
] as const;
export const BACKS = [
    { value: "refund", label: "Refund to how they paid" },
    { value: "credit", label: "Store credit" },
    { value: "exchange", label: "Exchange only" },
] as const;
export const WITHINS = [
    { value: "3", label: "3 working days" },
    { value: "7", label: "7 working days" },
    { value: "14", label: "14 working days" },
] as const;
export const SHIPS = [
    { value: "customer", label: "The customer" },
    { value: "us", label: "We do" },
] as const;
export const UNHAPPY = [
    { value: "redo", label: "Redo it free" },
    { value: "refund", label: "Refund" },
    { value: "neither", label: "Neither" },
] as const;

type V<T extends readonly { value: string }[]> = T[number]["value"];

export interface RefundAnswers {
    name: string;
    sell: V<typeof SELLS>;
    days: V<typeof DAYS>;
    unused: boolean;
    back: V<typeof BACKS>;
    within: V<typeof WITHINS>;
    ship: V<typeof SHIPS>;
    unhappy: V<typeof UNHAPPY>;
    not: string;
    /** 10 digits, already checked, or "". */
    wa: string;
    email: string;
}

const CONTACT_GAP = "[your WhatsApp or email]";

/** "Sale items, altered blouses, innerwear" → "Sale items, altered blouses and innerwear." */
export function list(text: string): string {
    const parts = text
        .split(/,|\band\b/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (!parts.length) return "";
    const last = parts.pop() ?? "";
    const joined = parts.length ? `${parts.join(", ")} and ${last}` : last;
    return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

const phone = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;

/** How to reach them: "Message us on WhatsApp at … or email …". */
function reach(a: RefundAnswers, what: string): string {
    const email = a.email.trim();
    if (a.wa && email)
        return `Message us on WhatsApp at ${phone(a.wa)} or email ${email} ${what}`;
    if (a.wa) return `Message us on WhatsApp at ${phone(a.wa)} ${what}`;
    if (email) return `Email us at ${email} ${what}`;
    return CONTACT_GAP;
}

export function policyTitle(a: RefundAnswers): string {
    const name = a.name.trim() || "[your business]";
    return a.sell === "services"
        ? `Refunds, ${name}`
        : `Returns and refunds, ${name}`;
}

function productParas(a: RefundAnswers): Para[] {
    const not = list(a.not);
    if (a.days === "0") {
        return [
            {
                head: "No returns.",
                text: "We don't take back items you've changed your mind about, so please check sizes and colours before you order.",
            },
            {
                head: "Damaged or wrong item.",
                text: `If an item arrives damaged or isn't what you ordered, tell us within 2 days of it reaching you, with a photo. We'll replace it, or refund it to the way you paid if we can't.`,
            },
            {
                head: "How to tell us.",
                text: reach(a, "with your order number."),
            },
        ];
    }
    const out: Para[] = [
        {
            head: "Returns.",
            text: `You can return an item within ${a.days} days of it reaching you${a.unused ? ", if it is unused and has its tags on" : ""}.`,
        },
    ];
    if (not) out.push({ head: "What we can't take back.", text: not });
    out.push({
        head: "How to ask.",
        text: reach(
            a,
            "with your order number. We'll tell you where to send it.",
        ),
    });
    const days = `${a.within} working days`;
    if (a.back === "refund")
        out.push({
            head: "Your refund.",
            text: `Once the item reaches us and we've checked it, we refund it to the way you paid, within ${days}. Your bank or UPI app may take a few more days to show it.`,
        });
    else if (a.back === "credit")
        out.push({
            head: "Store credit.",
            text: `Once the item reaches us and we've checked it, we give you store credit for what you paid, within ${days}. We don't give money back for returns.`,
        });
    else
        out.push({
            head: "Exchanges.",
            text: "Once the item reaches us and we've checked it, we exchange it for another size, colour or item of the same price. We don't give money back for returns.",
        });
    out.push({
        head: "Sending it back.",
        text:
            a.ship === "customer"
                ? "You pay to send it back. If the item arrived damaged or isn't what you ordered, we pay, and we may ask for a photo first."
                : "We pay to send it back. If the item arrived damaged or isn't what you ordered, we may ask for a photo first.",
    });
    return out;
}

function serviceParas(a: RefundAnswers, withContact: boolean): Para[] {
    const out: Para[] = [
        {
            head: "If you're not happy.",
            text:
                a.unhappy === "redo"
                    ? "Tell us within 3 days of your appointment and we'll put it right at no charge."
                    : a.unhappy === "refund"
                      ? `Tell us within 3 days of your appointment and we'll refund it to the way you paid, within ${a.within} working days.`
                      : "Tell us within 3 days of your appointment and we'll talk it through with you.",
        },
        {
            head: "Refunds.",
            text:
                a.unhappy === "refund"
                    ? "Money paid for a booking you cancelled in time comes back to the way you paid."
                    : "Money paid for a service you've had isn't refunded. Money paid for a booking you cancelled in time comes back to the way you paid.",
        },
    ];
    if (withContact) {
        const c = reach(a, "").trim();
        out.push({
            head: "How to tell us.",
            text: c === CONTACT_GAP ? c : `${c}.`,
        });
    }
    return out;
}

/** The policy's paragraphs, in the order the boards write them. */
export function policy(a: RefundAnswers): Para[] {
    if (a.sell === "products") return productParas(a);
    if (a.sell === "services") return serviceParas(a, true);
    return [...productParas(a), ...serviceParas(a, false)];
}

/** The policy as plain text, to copy: title, date, a paragraph a rule. */
export function policyText(a: RefundAnswers, updated: string): string {
    return [
        policyTitle(a),
        updated,
        ...policy(a).map((p) => (p.head ? `${p.head} ${p.text}` : p.text)),
    ].join("\n\n");
}

/** "Last updated 26 October 2026". */
export const updatedLine = (d: Date) =>
    `Last updated ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

export const WORDS = {
    form: "Your returns and refunds",
    name: "Business name",
    sell: "What do you sell?",
    days: "Returns accepted within",
    daysHint: "Counted from the day it reaches them.",
    unused: "Only if unused, with tags on",
    back: "Money back as",
    within: "Refund paid within",
    ship: "Who pays to send it back?",
    shipHint: "If an item arrives damaged or wrong, the policy says you pay.",
    unhappy: "If they're unhappy with a service",
    not: "Things you don't take back",
    wa: "WhatsApp for returns",
    email: "Email for returns",
    noContact:
        "Add a WhatsApp number or an email, so customers know where to ask.",
    empty: "Answer the questions and your policy is written here, in plain words.",
    gate: "Get your policy to copy or download",
    gateButton: "Email it",
    gateAfter: "Comes as text to paste into your website, and a PDF to print.",
    copy: "Copy the policy",
    copied: "✓ Copied",
    print: "Print or save as PDF",
} as const;
