/**
 * The WhatsApp link generator's rules (design WhatsappLink*.dc.html):
 * an Indian mobile number (+91, as Saroh is) and an optional message make
 * a `https://wa.me/91…?text=…` link. Pure, so the tests pin them. The
 * WhatsApp message templates use the same number check.
 */

export type MobileRead =
    | { at: "empty" }
    | { at: "ok"; digits: string }
    | { at: "bad"; problem: string };

const RULE = "A mobile number here has 10 digits and starts with 6, 7, 8 or 9.";

/**
 * A typed Indian mobile number: spaces, dashes and a leading +91, 91 or 0
 * are fine; what's left must be 10 digits starting 6–9.
 */
export function readMobile(value: string): MobileRead {
    let d = value.replace(/\D/g, "");
    if (!d) return { at: "empty" };
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length !== 10)
        return { at: "bad", problem: `${RULE} This one has ${d.length}.` };
    if (!/^[6-9]/.test(d))
        return {
            at: "bad",
            problem: `${RULE} This one starts with ${d[0]}.`,
        };
    return { at: "ok", digits: d };
}

/** 9999999999 → "+91 99999 99999". */
export const showMobile = (digits: string) =>
    `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;

/** The chat link: to the number, with the message typed in when there is one. */
export function waLink(digits: string | null, message: string): string {
    const text = message.trim();
    const to = digits ? `91${digits}` : "";
    return `https://wa.me/${to}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const STARTS = [
    {
        value: "book",
        label: "Book a time",
        message: "Hi, I'd like to book a time this week.",
    },
    {
        value: "order",
        label: "Ask about an order",
        message: "Hi, I'd like to know where my order is.",
    },
    {
        value: "prices",
        label: "Ask for prices",
        message: "Hi, could you send me your prices?",
    },
] as const;

export type Start = (typeof STARTS)[number]["value"];

export const WORDS = {
    form: "Your WhatsApp link",
    number: "Your WhatsApp number",
    message: "Message your customer starts with",
    start: "Start from",
    link: "Your link",
    empty: "Type your WhatsApp number to make the link.",
    copy: "Copy link",
    copied: "✓ Copied",
    copiedLine:
        "On your clipboard. Paste it in your Instagram bio or Google profile.",
    test: "Test it",
    gate: "Get your link to copy",
    gateButton: "Email it",
    sees: "What your customer sees",
    seesLine: "Already typed in their chat with you. They just press send.",
    noMessage: "No message: the chat opens empty, ready for them to type.",
    held: (shown: string) => `Still showing the link for ${shown}.`,
} as const;
