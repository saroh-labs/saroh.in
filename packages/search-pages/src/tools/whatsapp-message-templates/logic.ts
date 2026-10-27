/**
 * The WhatsApp message templates (design WhatsappTemplates*.dc.html,
 * generator genC/wa.py): four messages the owner sends themselves, filled
 * from one set of details. A detail left empty stays in the message as
 * "[what it is]", so a gap is never sent unseen. Pure, so the tests pin
 * the boards' samples to the letter.
 */

export const FIELDS = {
    biz: { label: "Your business", gap: "your business", eg: "Rye Studio" },
    name: {
        label: "Customer's first name",
        gap: "first name",
        eg: "Priya",
    },
    what: {
        label: "What they booked",
        gap: "what they booked",
        eg: "Haircut and blow-dry",
    },
    when: {
        label: "Date and time",
        gap: "date and time",
        eg: "Sat 1 Nov, 11:30 am",
    },
    amount: { label: "Amount due", gap: "amount", eg: "2,415" },
    visit: { label: "For the visit on", gap: "visit date", eg: "25 Oct" },
    upi: {
        label: "Your UPI ID",
        gap: "your UPI ID",
        eg: "saroh-sample-upi-id@okaxis",
    },
    order: { label: "Their order", gap: "their order", eg: "Chocolate cake" },
    collect: {
        label: "Ready to collect",
        gap: "when to collect",
        eg: "today after 5 pm",
    },
} as const;

export type Key = keyof typeof FIELDS;
export type Details = Partial<Record<Key, string>>;

export const TEMPLATES = [
    {
        value: "booking",
        label: "Booking confirmation",
        fields: ["biz", "name", "what", "when"],
    },
    {
        value: "payment",
        label: "Payment reminder",
        fields: ["biz", "name", "amount", "visit", "upi"],
    },
    {
        value: "ready",
        label: "Order ready",
        fields: ["biz", "name", "order", "collect"],
    },
    {
        value: "thanks",
        label: "Thank-you",
        fields: ["biz", "name", "what"],
    },
] as const satisfies readonly {
    value: string;
    label: string;
    fields: readonly Key[];
}[];

export type Template = (typeof TEMPLATES)[number]["value"];

/** "2415" or "₹2,415" → "₹2,415"; the owner's own grouping is kept. */
const money = (v: string) => `₹${v.replace(/^₹\s*/, "")}`;

/** The message, with "[gap]" for each detail left empty. */
export function message(t: Template, d: Details): string {
    const f = (k: Key) => {
        const v = d[k]?.trim();
        if (!v) return `[${FIELDS[k].gap}]`;
        return k === "amount" ? money(v) : v;
    };
    switch (t) {
        case "booking":
            return `Hi ${f("name")}, your ${f("what")} at ${f("biz")} is booked for ${f("when")}. Reply here if you need to change it. See you then.`;
        case "payment":
            return `Hi ${f("name")}, a gentle reminder that ${f("amount")} for your visit on ${f("visit")} is still due. You can pay by UPI to ${f("upi")}. Thank you, ${f("biz")}.`;
        case "ready":
            return `Hi ${f("name")}, your ${f("order")} from ${f("biz")} is ready. You can collect it ${f("collect")}. Reply here if you need it kept for later.`;
        case "thanks":
            return `Hi ${f("name")}, thank you for coming to ${f("biz")} for your ${f("what")}. We hope you love it. Reply here whenever you'd like to book again.`;
    }
}

/** The details a template asks for that are still empty, by label. */
export function emptyFields(t: Template, d: Details): string[] {
    const tpl = TEMPLATES.find((x) => x.value === t);
    return (tpl?.fields ?? [])
        .filter((k) => !d[k]?.trim())
        .map((k) => FIELDS[k].label);
}

/** The note under a message with gaps, or null when it has none or is all gaps. */
export function gapNote(t: Template, d: Details): string | null {
    const empty = emptyFields(t, d);
    const all = TEMPLATES.find((x) => x.value === t)?.fields.length ?? 0;
    if (empty.length === 0) return null;
    if (empty.length === all) return WORDS.allEmpty;
    if (empty.length === 1)
        return `${empty[0]} is still empty. Fill it in, or the message goes with a gap.`;
    return `${empty[0]} and ${empty.length - 1} more are still empty. Fill them in, or the message goes with gaps.`;
}

/** Every template, filled, for the full set behind the email. */
export const allMessages = (d: Details) =>
    TEMPLATES.map((t) => ({ label: t.label, text: message(t.value, d) }));

export const WORDS = {
    form: "Your message details",
    pick: "Message",
    number: "Customer's WhatsApp number",
    numberHint: "Only to open the chat with them. Leave it empty to just copy.",
    yours: "Your message",
    copy: "Copy message",
    copied: "✓ Copied",
    copiedLine: "On your clipboard. Paste it into any chat.",
    open: "Open in WhatsApp",
    openTo: (to: string) =>
        `Open in WhatsApp starts a chat with ${to}, message typed in. You press send.`,
    openPick:
        "Open in WhatsApp lets you pick the chat, message typed in. You press send.",
    allEmpty: "Fill in your details and the brackets fill themselves.",
    gate: "Get all the templates as a PDF, with your details in",
    gateButton: "Email it",
    sentLine: "All four messages are below, with your details in.",
    copyAll: "Copy all four",
    copiedAll: "✓ Copied all four",
    print: "Print or save as PDF",
} as const;
