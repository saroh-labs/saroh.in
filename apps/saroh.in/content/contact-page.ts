import type { ContactKindId, ContactTopicId } from "@/lib/contact-message";

import { SAROH_CONTACT_EMAIL } from "./contact";
import type { OpenOnly } from "./launch-words";

/**
 * /contact, from the design "Saroh Marketing Site V2 - Contact" (DEC-137):
 * the message form, the ways to reach Saroh, the registered office and
 * "Before you write".
 *
 * The design's copy is kept wherever the product backs it; the ledger
 * (`MARKETING_CLAIMS.md` §14) has a row for every claim and says what was
 * left out. The address is the one every Saroh page gives
 * (`content/contact.ts`, DEC-101), not the design's. A company fact that
 * isn't in `content/company.ts` is not drawn.
 *
 * Client-safe: the form reads its words from here, so nothing in this file
 * may import a server module.
 */

export interface ContactTopic {
    id: ContactTopicId;
    /** The chip's words. */
    label: string;
    /** The message box's placeholder while this topic is chosen. */
    hint: string;
}

/** A question answered before someone writes. */
export interface BeforeItem extends OpenOnly {
    q: string;
    a: string;
}

/** The topic a fresh form, and "Send another message", start on. */
export const FIRST_TOPIC: ContactTopicId = "question";

export const CONTACT_PAGE = {
    href: "/contact",
    /** The footer's name for the page. */
    name: "Contact",
    /** What the page is, in one line (`/llms.txt`). */
    line: "Write to the Saroh team, and the other ways to reach it.",
    seo: {
        title: "Contact us: questions, help and ideas · Saroh",
        socialTitle: "Contact Saroh",
        description:
            "Contact the Saroh team with a question before you sign up, something not working or an idea, and a person replies within one working day.",
    },

    eyebrow: "Contact",
    title: "Talk to a person, not a bot.",
    lead: "A question before you sign up, something not working, or an idea for what we should build next: write to us. A real person reads every message and replies within one working day.",

    form: {
        title: "Send us a message",
        note: "All fields are needed, unless marked optional.",
        topicLabel: "What's it about?",
        topics: [
            {
                id: "question",
                label: "A question before signing up",
                hint: "e.g. Can I take bookings for two branches?",
            },
            {
                id: "help",
                label: "Help with my account",
                hint: "Tell us your business name and what you were trying to do.",
            },
            {
                id: "bug",
                label: "Something's not working",
                hint: "What did you click, and what did you see? A screenshot helps.",
            },
            {
                id: "other",
                label: "Partnerships or press",
                hint: "Tell us who you are and what you have in mind.",
            },
        ] satisfies ContactTopic[] as readonly ContactTopic[],
        nameLabel: "Your name",
        emailLabel: "Email",
        kindLabel: "Your business",
        optional: "(optional)",
        kindNone: "Choose one",
        /** The waitlist's kinds (the API stores the id), as this form names them. */
        kinds: [
            { id: "salon", label: "Salon or beauty" },
            { id: "gym", label: "Gym or studio" },
            { id: "clinic", label: "Clinic or dentist" },
            { id: "coach", label: "Dietician or coach" },
            { id: "food", label: "Bakery or food" },
            { id: "shop", label: "Shop" },
            { id: "creator", label: "Creator selling online" },
            { id: "other", label: "Something else" },
        ] satisfies { id: ContactKindId; label: string }[] as readonly {
            id: ContactKindId;
            label: string;
        }[],
        messageLabel: "Message",
        /** One line at a time, the first that applies. */
        errors: {
            name: "Add your name.",
            email: "Check your email address. We need it to reply.",
            message: "Write a short message, even one line.",
        },
        submit: "Send message",
        sending: "Sending…",
        orEmail: "Or email",
        /** A send that didn't go: said plainly, with the address to write to. */
        failed: "We couldn't send your message just now. Nothing was sent. Try again in a minute, or email",
        rateLimited: "Too many messages from here. Try again later, or email",
    },

    done: {
        title: (firstName: string) => `Thanks, ${firstName}. We've got it.`,
        /** Before the address they gave. */
        replyTo: "We'll reply to",
        /** Straight after it: the reply time the owner promises (CT2). */
        replyBy: "within one working day",
        /** Then. */
        urgent: `If it's urgent, email ${SAROH_CONTACT_EMAIL} with "Urgent" at the start of the subject.`,
        again: "Send another message",
    },

    help: {
        title: "Need help with your account?",
        body: "Step-by-step guides for setup, payments, bookings and your site. Often faster than waiting for a reply.",
        href: "/help",
    },
    changelog: {
        title: "Something not working?",
        body: "Check the changelog first, since we may have just fixed it. If not, tell us what you clicked and what you saw.",
        href: "/changelog",
    },

    ways: {
        title: "Other ways to reach us",
        email: "Email",
        phone: "Phone",
        /** Saroh's accounts this card lists, by `content/social.ts`'s label, in the design's order. */
        social: ["Instagram", "LinkedIn", "X"],
    },

    office: { title: "Registered office" },

    before: {
        title: "Before you write",
        items: [
            {
                q: "A customer paid me. Where's the money?",
                a: "Payments go to your own Razorpay or Cashfree account, and they pay out on their own schedule. Saroh never holds your money, so ask them about payouts.",
            },
        ] satisfies BeforeItem[] as readonly BeforeItem[],
    },
} as const;

/**
 * How an account is written beside its network's name: "@sarohlabs" where
 * the address is a handle, else the address without "https://www."
 * ("linkedin.com/company/saroh").
 */
export function socialText(href: string): string {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    const handle = /^\/@?([A-Za-z0-9_.]+)$/.exec(path)?.[1];
    return handle ? `@${handle}` : `${host}${path}`;
}
