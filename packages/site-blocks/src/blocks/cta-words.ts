/**
 * The closing band's words.
 *
 * A band is a heading, one line and a button. Content may give the heading
 * and the line (`heading`, `text`); every band published before it could
 * holds a button alone, and a lone button on a block of colour asks without
 * saying why. For those the words are composed here, from two things that
 * are certainly true: what the button does (where it goes, read from its
 * own action and address) and whose site it is.
 *
 * NEVER A PROMISE. The composed words say what pressing the button does
 * ("Book a time with Pulse Fitness", "Choose a time that suits you.") and
 * nothing about the business that it did not say itself: no "fast", no
 * "free", no "we reply within a day".
 *
 * Pure, and free of `"use client"`: the band is drawn on the server.
 */
export interface CtaBandWords {
    heading: string;
    /** One line under the heading; null when there is nothing true to add. */
    text: string | null;
}

/** What the band's button does, as far as its own content says. */
export type CtaTarget =
    "book" | "shop" | "contact" | "call" | "whatsapp" | "email" | "other";

interface CtaBandContent {
    label: string;
    href: string;
    action?: { kind?: string } | null;
    /** The band's own heading, when its content gives one. */
    heading?: unknown;
    /** The band's own line, when its content gives one. */
    text?: unknown;
}

/** A written value, trimmed; null for anything else. */
function written(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

/** Where a band's button goes, from its action's kind and its address. */
export function ctaTarget(content: {
    href: string;
    action?: { kind?: string } | null;
}): CtaTarget {
    const href = content.href.trim();
    const kind = content.action?.kind;
    if (kind === "call" || /^tel:/i.test(href)) return "call";
    if (
        kind === "whatsapp" ||
        /^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(href)
    ) {
        return "whatsapp";
    }
    if (kind === "email" || /^mailto:/i.test(href)) return "email";
    // Another site's address says nothing about what is behind it.
    if (!href.startsWith("/") || href.startsWith("//")) return "other";
    // The page's own name: the last part of its path, so a draft
    // preview's "/preview/<token>/book" reads as the booking page too.
    const path = (href.split(/[?#]/)[0] ?? "").toLowerCase();
    const last = path.split("/").filter(Boolean).at(-1);
    if (last === "book") return "book";
    if (last === "shop") return "shop";
    if (last === "contact") return "contact";
    return "other";
}

/**
 * Each target's heading, with the business named and without, and its line.
 * The nameless heading is for a button that already says the name ("Work
 * with Northwind Supply"), which the heading must not say again.
 */
const WORDS: Readonly<
    Record<
        Exclude<CtaTarget, "other">,
        { named: (name: string) => string; plain: string; text: string }
    >
> = {
    book: {
        named: (name) => `Book a time with ${name}`,
        plain: "Book a time",
        text: "Choose a time that suits you.",
    },
    shop: {
        named: (name) => `Order from ${name}`,
        plain: "Browse the shop",
        text: "Take a look at what we have.",
    },
    contact: {
        named: (name) => `Get in touch with ${name}`,
        plain: "Get in touch",
        text: "Ask a question, or tell us what you need.",
    },
    call: {
        named: (name) => `Call ${name}`,
        plain: "Give us a call",
        text: "Talk to us on the phone.",
    },
    whatsapp: {
        named: (name) => `Message ${name} on WhatsApp`,
        plain: "Message us on WhatsApp",
        text: "Send a message to start the conversation.",
    },
    email: {
        named: (name) => `Email ${name}`,
        plain: "Send us an email",
        text: "Write to us with your question.",
    },
};

/**
 * The band's heading and line: the content's own where it gives them, else
 * composed from the button and the business's name.
 *
 * - A heading the content wrote is used as written; so is its line, and a
 *   written heading with no line gets none composed beside it (the author
 *   chose the words).
 * - Otherwise the heading says what the button does, naming the business
 *   unless the button's label already does.
 * - A button that goes somewhere this can't read (a page of the merchant's
 *   own, another site) gets the business's name as its heading and no line:
 *   nothing more is known to be true. With no name either, the heading is
 *   the button's own label.
 */
export function ctaBandWords(
    content: CtaBandContent,
    siteName?: string | null,
): CtaBandWords {
    const ownHeading = written(content.heading);
    const ownText = written(content.text);
    if (ownHeading) return { heading: ownHeading, text: ownText };

    const label = content.label.trim();
    const name = written(siteName);
    const target = ctaTarget(content);
    if (target === "other") {
        return { heading: name ?? label, text: ownText };
    }
    const words = WORDS[target];
    const labelNamesIt =
        name !== null && label.toLowerCase().includes(name.toLowerCase());
    return {
        heading: name && !labelNamesIt ? words.named(name) : words.plain,
        text: ownText ?? words.text,
    };
}
